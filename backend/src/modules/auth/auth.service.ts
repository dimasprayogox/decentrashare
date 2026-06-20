import { prisma } from '../../config/db';
import { verifyMetamaskSignature } from '../../utils/web3';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { PinataService } from '../pinata/pinata.service';

// ── Types ────────────────────────────────────────────────────────────────────

type User = {
  id: string;
  walletAddress: string;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  role: string;
  storageLimit: bigint | null;
  nonce: string | null;
  nonceExpiresAt: Date | null;
  refreshToken: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly jwtAccessExpiresIn: string;
  private readonly jwtRefreshExpiresIn: string;
  private readonly pinataService: PinataService;

  constructor() {
    this.jwtSecret = env.JWT_SECRET;
    this.jwtRefreshSecret = env.JWT_REFRESH_SECRET;
    this.jwtAccessExpiresIn = env.JWT_ACCESS_EXPIRES_IN ?? '15m';
    this.jwtRefreshExpiresIn = env.JWT_REFRESH_EXPIRES_IN ?? '7d';
    this.pinataService = new PinataService();
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Serialize user untuk response: remove nonce/refreshToken, convert BigInt.
   */
  private serializeUserForResponse(user: any) {
    return {
      ...user,
      storageLimit:
        user.storageLimit !== undefined && user.storageLimit !== null
          ? Number(user.storageLimit)
          : null,
      nonce: undefined,
      refreshToken: undefined,
    };
  }

  // ── Public Methods ────────────────────────────────────────────────────────

  /**
   * Buat atau perbarui nonce untuk wallet address (langkah pertama auth).
   */
  async getNonce(walletAddress: string) {
    const address = walletAddress.toLowerCase();
    const nonce = crypto.randomBytes(16).toString('hex');
    const nonceExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const user = await prisma.user.upsert({
      where: { walletAddress: address },
      update: { nonce, nonceExpiresAt },
      create: {
        walletAddress: address,
        nonce,
        nonceExpiresAt,
      },
    });

    return {
      nonce: user.nonce,
      loginMessage: `Sign this message to authenticate.\nNonce: ${user.nonce}`,
      registerMessage: `Sign this message to register.\nNonce: ${user.nonce}`,
    };
  }

  /**
   * Login menggunakan wallet address + tanda tangan MetaMask.
   */
  async loginWithWallet(walletAddress: string, signature: string) {
    const address = walletAddress.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { walletAddress: address },
    });

    if (!user) throw new Error('Wallet not found. Please request nonce first.');
    if (!user.username || !user.email) throw new Error('Wallet not registered. Please register first.');

    if (user.nonceExpiresAt && user.nonceExpiresAt < new Date()) {
      throw new Error('Authentication nonce expired. Please request a new nonce.');
    }

    const message = `Sign this message to authenticate.\nNonce: ${user.nonce}`;
    const isValid = verifyMetamaskSignature(address, signature, message);

    if (!isValid) {
      logger.warn(`[AUTH] Failed login attempt: Invalid signature for wallet ${address}`);
      throw new Error('Invalid signature. Please try signing again.');
    }

    const accessToken = jwt.sign(
      { userId: user.id, walletAddress: user.walletAddress, role: user.role, type: 'access' },
      this.jwtSecret,
      { expiresIn: this.jwtAccessExpiresIn as jwt.SignOptions['expiresIn'] }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, walletAddress: user.walletAddress, role: user.role, type: 'refresh' },
      this.jwtRefreshSecret,
      { expiresIn: this.jwtRefreshExpiresIn as jwt.SignOptions['expiresIn'] }
    );

    const updatedUser = await prisma.user.update({
      where: { walletAddress: address },
      data: {
        nonce: crypto.randomBytes(16).toString('hex'),
        nonceExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        refreshToken,
      },
    });

    logger.info(`[AUTH] Login success for wallet: ${address}`);
    return {
      user: this.serializeUserForResponse(updatedUser),
      token: accessToken,
      refreshToken,
    };
  }

  /**
   * Registrasi user baru menggunakan wallet + tanda tangan + data profil.
   */
  async registerUser(
    walletAddress: string,
    signature: string,
    data: { username: string; email: string }
  ): Promise<{
    user: Omit<User, 'password'>;
    token: string;
    refreshToken: string;
    pinataSetup?: 'ready' | 'pending';
  }> {
    const address = walletAddress.toLowerCase();

    if (!data.username?.trim()) {
      throw new Error('Username is required');
    }
    const username = data.username.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      throw new Error('Username must be 3-20 characters (letters, numbers, underscore only)');
    }

    if (!data.email?.trim()) {
      throw new Error('Email is required');
    }
    const email = data.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Please enter a valid email address');
    }

    const user = await prisma.user.findUnique({ where: { walletAddress: address } });

    if (!user) throw new Error('Wallet not found. Please request nonce first.');
    if (user.username || user.email) throw new Error('This wallet is already registered. Please login instead.');

    if (user.nonceExpiresAt && user.nonceExpiresAt < new Date()) {
      throw new Error('Authentication nonce expired. Please request a new nonce.');
    }

    const message = `Sign this message to register.\nNonce: ${user.nonce}`;
    const isValid = verifyMetamaskSignature(address, signature, message);

    if (!isValid) {
      logger.warn(`[AUTH] Failed registration attempt: Invalid signature for wallet ${address}`);
      throw new Error('Invalid signature. Please try signing again.');
    }

    const existingUsername = await prisma.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
        id: { not: user.id },
      },
    });
    if (existingUsername) throw new Error('Username is already taken. Please choose another one.');

    const existingEmail = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        id: { not: user.id },
      },
    });
    if (existingEmail) throw new Error('Email is already registered. Please use another email.');

    const accessToken = jwt.sign(
      { userId: user.id, walletAddress: user.walletAddress, role: user.role, type: 'access' },
      this.jwtSecret,
      { expiresIn: this.jwtAccessExpiresIn }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, walletAddress: user.walletAddress, role: user.role, type: 'refresh' },
      this.jwtRefreshSecret,
      { expiresIn: this.jwtRefreshExpiresIn }
    );

    const updatedUser = await prisma.user.update({
      where: { walletAddress: address },
      data: {
        username,
        email,
        avatarUrl: null,
        bio: null,
        website: null,
        nonce: crypto.randomBytes(16).toString('hex'),
        nonceExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        refreshToken,
      },
    });

    logger.info(`[AUTH] New user registered: ${address}`);

    let pinataGroupId: string | null = null;
    try {
      pinataGroupId = await this.pinataService.createUserPinGroup(updatedUser.id, updatedUser.username!);
      if (pinataGroupId) {
        logger.info(`Pinata group ready for user ${updatedUser.id}: ${pinataGroupId}`);
      } else {
        logger.warn(`Pinata group not created for user ${updatedUser.id} (will retry on first upload)`);
      }
    } catch (err: any) {
      logger.error(`Pinata group creation failed for user ${updatedUser.id}`, {
        error: err?.message,
        username: updatedUser.username,
      });
    }

    return {
      user: this.serializeUserForResponse(updatedUser),
      token: accessToken,
      refreshToken,
      pinataSetup: pinataGroupId ? 'ready' : 'pending',
    };
  }

  /**
   * Refresh access token menggunakan refresh token yang masih valid.
   */
  async refreshAccessToken(oldRefreshToken: string) {
    const decoded = jwt.verify(oldRefreshToken, this.jwtRefreshSecret) as any;

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

    if (!user || user.refreshToken !== oldRefreshToken || decoded.type !== 'refresh') {
      logger.warn(`[AUTH] Unauthorized / Reuse refresh attempt for userId: ${decoded?.userId}`);
      throw new Error('Invalid or expired refresh token. Please login again.');
    }

    const newAccessToken = jwt.sign(
      { userId: user.id, walletAddress: user.walletAddress, role: user.role, type: 'access' },
      this.jwtSecret,
      { expiresIn: this.jwtAccessExpiresIn as jwt.SignOptions['expiresIn'] }
    );

    const newRefreshToken = jwt.sign(
      { userId: user.id, walletAddress: user.walletAddress, role: user.role, type: 'refresh' },
      this.jwtRefreshSecret,
      { expiresIn: this.jwtRefreshExpiresIn as jwt.SignOptions['expiresIn'] }
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken },
    });

    return {
      token: newAccessToken,
      refreshToken: newRefreshToken,
      user: this.serializeUserForResponse(user),
    };
  }

  /**
   * Logout: hapus refresh token dari database.
   */
  async logout(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    logger.info(`[AUTH] User logged out: ${userId}`);
  }
}

// Singleton instance
export const authService = new AuthService();
export default authService;

// ── Backward-compatible named exports ─────────────────────────────────────
// Controller lama mengimport fungsi langsung; alias ini menjaga kompatibilitas.
export const getNonce = (walletAddress: string) => authService.getNonce(walletAddress);
export const loginWithWallet = (walletAddress: string, signature: string) =>
  authService.loginWithWallet(walletAddress, signature);
export const registerUser = (walletAddress: string, signature: string, data: { username: string; email: string }) =>
  authService.registerUser(walletAddress, signature, data);
export const refreshAccessToken = (oldRefreshToken: string) =>
  authService.refreshAccessToken(oldRefreshToken);
export const logout = (userId: string) => authService.logout(userId);