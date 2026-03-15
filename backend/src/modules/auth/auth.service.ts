import { prisma } from '../../config/db';
import { verifyMetamaskSignature } from '../../utils/web3';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env'; // pastikan path ini sesuai struktur kamu
import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

const JWT_SECRET = env.JWT_SECRET;
const JWT_REFRESH_SECRET = env.JWT_REFRESH_SECRET;
const JWT_ACCESS_EXPIRES_IN = env.JWT_ACCESS_EXPIRES_IN ?? '150m';
const JWT_REFRESH_EXPIRES_IN = env.JWT_REFRESH_EXPIRES_IN ?? '7d';

/**
 * Step 1: Generate atau update nonce untuk wallet address tertentu
 */
export const getNonce = async (walletAddress: string) => {
  const address = walletAddress.toLowerCase();
  const nonce = crypto.randomBytes(16).toString('hex');
  const nonceExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 menit

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

/**
 * Step 2: Verifikasi signature dan berikan access + refresh token
 */
export const loginWithWallet = async (walletAddress: string, signature: string) => {
  const address = walletAddress.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { walletAddress: address },
  });

  if (!user) throw new Error('User not found. Please request nonce first.');
  if (!user.isRegistered) throw new Error('User not registered. Please register first.');
  
  if (user.nonceExpiresAt && user.nonceExpiresAt < new Date()) {
    throw new Error('Nonce expired. Please request a new nonce.');
  }

  const message = `Sign this message to authenticate.\nNonce: ${user.nonce}`;
  const isValid = verifyMetamaskSignature(address, signature, message);
  
  if (!isValid) {
    logger.warn(`[AUTH] Failed login attempt: Invalid signature for wallet ${address}`);
    throw new Error('Invalid signature');
  }

  // loginWithWallet -> access token
  const accessToken = jwt.sign(
    { userId: user.id, walletAddress: user.walletAddress, role: user.role, type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );

  // loginWithWallet -> refresh token
  const refreshToken = jwt.sign(
    { userId: user.id, walletAddress: user.walletAddress, role: user.role, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );

  // Update Database: Rotasi Nonce dan simpan Refresh Token sekaligus
  const updatedUser = await prisma.user.update({
    where: { walletAddress: address },
    data: {
      nonce: crypto.randomBytes(16).toString('hex'),
      nonceExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      refreshToken,
    },
  });

  logger.info(`[AUTH] Login success for wallet: ${address}`);
  return { user: updatedUser, token: accessToken, refreshToken };
};

/**
 * Registrasi user baru setelah verifikasi signature
 */
export const registerUser = async (
  walletAddress: string,
  signature: string,
  data: { username?: string; email?: string; avatarUrl?: string }
) => {
  const address = walletAddress.toLowerCase();
  const user = await prisma.user.findUnique({ where: { walletAddress: address } });

  if (!user) throw new Error('User not found. Please request nonce first.');
  if (user.isRegistered) throw new Error('User already registered.');
  
  if (user.nonceExpiresAt && user.nonceExpiresAt < new Date()) {
    throw new Error('Nonce expired.');
  }

  const message = `Sign this message to register.\nNonce: ${user.nonce}`;
  const isValid = verifyMetamaskSignature(address, signature, message);
  
  if (!isValid) {
    logger.warn(`[AUTH] Failed registration attempt: Invalid signature for wallet ${address}`);
    throw new Error('Invalid signature');
  }

  // Validasi unik untuk username/email
  if (data.username) {
    const existing = await prisma.user.findUnique({ where: { username: data.username } });
    if (existing) throw new Error('Username taken.');
  }

  const updatedUser = await prisma.user.update({
    where: { walletAddress: address },
    data: {
      ...data,
      nonce: crypto.randomBytes(16).toString('hex'),
      isRegistered: true,
      nonceExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  // registerUser -> access token
  const token = jwt.sign(
    { userId: updatedUser.id, walletAddress: updatedUser.walletAddress, role: updatedUser.role, type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );

  logger.info(`[AUTH] New user registered: ${address}`);
  return { user: updatedUser, token };
};

/**
 * Menghasilkan access token baru menggunakan refresh token yang valid
 */
export const refreshAccessToken = async (refreshToken: string) => {
  // Verifikasi menggunakan Refresh Secret
  const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any;
  
  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

  // Validasi: harus ada di DB, harus cocok, dan tipenya harus 'refresh'
  if (!user || user.refreshToken !== refreshToken || decoded.type !== 'refresh') {
    logger.warn(`[AUTH] Unauthorized refresh attempt for userId: ${decoded?.userId}`);
    throw new Error('Invalid refresh token');
  }

  const accessToken = jwt.sign(
    { userId: user.id, walletAddress: user.walletAddress, role: user.role, type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );

  return { accessToken };
};

/**
 * Menghapus refresh token di database untuk logout
 */
export const logout = async (userId: string) => {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  });
  logger.info(`[AUTH] User logged out: ${userId}`);
};