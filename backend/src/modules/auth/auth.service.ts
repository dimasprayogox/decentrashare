// src/modules/auth/auth.service.ts
import { prisma } from '../../config/db';
import { verifyMetamaskSignature } from '../../utils/web3';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

const JWT_SECRET = env.JWT_SECRET;
const JWT_REFRESH_SECRET = env.JWT_REFRESH_SECRET;
const JWT_ACCESS_EXPIRES_IN = env.JWT_ACCESS_EXPIRES_IN ?? '7d';
const JWT_REFRESH_EXPIRES_IN = env.JWT_REFRESH_EXPIRES_IN ?? '7d';

/**
 * Step 1: Generate atau update nonce untuk wallet address tertentu
 */
export const getNonce = async (walletAddress: string) => {
  const address = walletAddress.toLowerCase();
  const nonce = crypto.randomBytes(16).toString('hex');
  const nonceExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

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

  // ✅ Updated English messages
  if (!user) throw new Error('Wallet not found. Please request nonce first.');
  if (!user.isRegistered) throw new Error('Wallet not registered. Please register first.');
  
  if (user.nonceExpiresAt && user.nonceExpiresAt < new Date()) {
    throw new Error('Authentication nonce expired. Please request a new nonce.');
  }

  const message = `Sign this message to authenticate.\nNonce: ${user.nonce}`;
  const isValid = verifyMetamaskSignature(address, signature, message);
  
  if (!isValid) {
    logger.warn(`[AUTH] Failed login attempt: Invalid signature for wallet ${address}`);
    throw new Error('Invalid signature. Please try signing again.'); // ✅ Updated
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
  return { user: updatedUser, token: accessToken, refreshToken };
};

/**
 * Registrasi user baru setelah verifikasi signature
 */
export const registerUser = async (
  walletAddress: string,
  signature: string,
  data: { username: string; email: string;}
) => {
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
  if (user.isRegistered) throw new Error('This wallet is already registered. Please login instead.');
  
  if (user.nonceExpiresAt && user.nonceExpiresAt < new Date()) {
    throw new Error('Authentication nonce expired. Please request a new nonce.');
  }

  const message = `Sign this message to register.\nNonce: ${user.nonce}`;
  const isValid = verifyMetamaskSignature(address, signature, message);
  
  if (!isValid) {
    logger.warn(`[AUTH] Failed registration attempt: Invalid signature for wallet ${address}`);
    throw new Error('Invalid signature. Please try signing again.'); 
  }

  if (data.username) {
    const existing = await prisma.user.findUnique({ where: { username: data.username } });
    if (existing) throw new Error('Username is already taken. Please choose another one.'); 
  }

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
      preferences: { theme: 'system', emailNotifications: true },
    },
  });

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
  const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any;
  
  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

  if (!user || user.refreshToken !== refreshToken || decoded.type !== 'refresh') {
    logger.warn(`[AUTH] Unauthorized refresh attempt for userId: ${decoded?.userId}`);
    throw new Error('Invalid or expired refresh token. Please login again.'); // ✅ Updated
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