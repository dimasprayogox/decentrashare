import { prisma } from '../../config/db';
import { verifyMetamaskSignature } from '../../utils/web3';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { createUserPinGroup } from '../pinata/pinata.service';

const JWT_SECRET = env.JWT_SECRET;
const JWT_REFRESH_SECRET = env.JWT_REFRESH_SECRET;

const JWT_ACCESS_EXPIRES_IN = env.JWT_ACCESS_EXPIRES_IN ?? '15m'; 
const JWT_REFRESH_EXPIRES_IN = env.JWT_REFRESH_EXPIRES_IN ?? '7d';

export const getNonce = async (walletAddress: string) => {
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
      isRegistered: false,
    },
  });

  return {
    nonce: user.nonce,
    loginMessage: `Sign this message to authenticate.\nNonce: ${user.nonce}`,
    registerMessage: `Sign this message to register.\nNonce: ${user.nonce}`,
  };
};

// Helper: serialize user untuk response (convert BigInt ke number, null = unlimited)
const serializeUserForResponse = (user: any) => {
  // Convert BigInt fields ke number, null tetap null
  return {
    ...user,
    storageLimit: user.storageLimit !== undefined && user.storageLimit !== null
      ? Number(user.storageLimit)
      : null,
    nonce: undefined, // Remove nonce dari response
    refreshToken: undefined, // Remove refreshToken dari response
  };
};

export const loginWithWallet = async (walletAddress: string, signature: string) => {
  const address = walletAddress.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { walletAddress: address },
  });

  if (!user) throw new Error('Wallet not found. Please request nonce first.');
  if (!user.isRegistered) throw new Error('Wallet not registered. Please register first.');
  
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
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, walletAddress: user.walletAddress, role: user.role, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
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
    user: serializeUserForResponse(updatedUser), 
    token: accessToken, 
    refreshToken 
  };
};

export const registerUser = async (
  walletAddress: string,
  signature: string,
  data: { username: string; email: string; }
): Promise<{
  user: Omit<User, 'password'>;
  token: string;
  refreshToken: string;
  pinataSetup?: 'in_progress';
}> => {
  const address = walletAddress.toLowerCase();

  // ── Validation ──────────────────────────────────────────────
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

  // ── Wallet Lookup & Nonce Check ────────────────────────────
  const user = await prisma.user.findUnique({ where: { walletAddress: address } });

  if (!user) throw new Error('Wallet not found. Please request nonce first.');
  if (user.isRegistered) throw new Error('This wallet is already registered. Please login instead.');
  
  if (user.nonceExpiresAt && user.nonceExpiresAt < new Date()) {
    throw new Error('Authentication nonce expired. Please request a new nonce.');
  }

  // ── Signature Verification ─────────────────────────────────
  const message = `Sign this message to register.\nNonce: ${user.nonce}`;
  const isValid = verifyMetamaskSignature(address, signature, message);
  
  if (!isValid) {
    logger.warn(`[AUTH] Failed registration attempt: Invalid signature for wallet ${address}`);
    throw new Error('Invalid signature. Please try signing again.'); 
  }

  // ── Username/Email Uniqueness Check ────────────────────────
  const existingUsername = await prisma.user.findFirst({
    where: { 
      username: { equals: username, mode: 'insensitive' },
      id: { not: user.id }
    }
  });
  if (existingUsername) throw new Error('Username is already taken. Please choose another one.');

  const existingEmail = await prisma.user.findFirst({
    where: { 
      email: { equals: email, mode: 'insensitive' },
      id: { not: user.id }
    }
  });
  if (existingEmail) throw new Error('Email is already registered. Please use another email.');

  // ── Generate JWT Tokens ────────────────────────────────────
  const accessToken = jwt.sign(
    { userId: user.id, walletAddress: user.walletAddress, role: user.role, type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES_IN }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, walletAddress: user.walletAddress, role: user.role, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );

  // ── Update User in Database ────────────────────────────────
  const updatedUser = await prisma.user.update({
    where: { walletAddress: address },
    data: {
      username,
      email,
      avatarUrl: null,
      bio: null,
      website: null,
      nonce: crypto.randomBytes(16).toString('hex'),
      isRegistered: true,
      nonceExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      lastActive: new Date(),
      refreshToken,
      preferences: { theme: 'system', emailNotifications: true },
    },
  });

  logger.info(`[AUTH] New user registered: ${address}`);

  // ── Create Pinata Group (AWAITED) ──────────────────────────
  // Create the user's personal Pinata group at registration time so every
  // file they upload later is neatly organized in the Pinata dashboard.
  // We await it (instead of fire-and-forget) so the group is reliably ready
  // before we respond. createUserPinGroup is idempotent and never throws —
  // it returns null on failure, which keeps registration resilient.
  let pinataGroupId: string | null = null;
  try {
    pinataGroupId = await createUserPinGroup(updatedUser.id, updatedUser.username);
    if (pinataGroupId) {
      logger.info(`✅ Pinata group ready for user ${updatedUser.id}: ${pinataGroupId}`);
    } else {
      logger.warn(`⚠️ Pinata group not created for user ${updatedUser.id} (will retry on first upload)`);
    }
  } catch (err: any) {
    // Defensive: createUserPinGroup already swallows errors, but guard anyway
    // so a Pinata outage can never block a successful registration.
    logger.error(`❌ Pinata group creation failed for user ${updatedUser.id}`, {
      error: err?.message,
      username: updatedUser.username
    });
  }

  // ── Return Response ────────────────────────────────────────
  return { 
    user: serializeUserForResponse(updatedUser), 
    token: accessToken, 
    refreshToken,
    pinataSetup: pinataGroupId ? 'ready' : 'pending'
  };
};

export const refreshAccessToken = async (oldRefreshToken: string) => {
  const decoded = jwt.verify(oldRefreshToken, JWT_REFRESH_SECRET) as any;
  
  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

  if (!user || user.refreshToken !== oldRefreshToken || decoded.type !== 'refresh') {
    logger.warn(`[AUTH] Unauthorized / Reuse refresh attempt for userId: ${decoded?.userId}`);
    throw new Error('Invalid or expired refresh token. Please login again.');
  }

  const newAccessToken = jwt.sign(
    { userId: user.id, walletAddress: user.walletAddress, role: user.role, type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );

  const newRefreshToken = jwt.sign(
    { userId: user.id, walletAddress: user.walletAddress, role: user.role, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: newRefreshToken }
  });

  return { 
    token: newAccessToken, 
    refreshToken: newRefreshToken, 
    user: serializeUserForResponse(user) 
  };
};

export const logout = async (userId: string) => {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  });
  logger.info(`[AUTH] User logged out: ${userId}`);
};