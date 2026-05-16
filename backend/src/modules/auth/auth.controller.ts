// src/modules/auth/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/db';
import { getNonce, loginWithWallet, registerUser, refreshAccessToken, logout } from './auth.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

// Step 1: Client minta nonce
// src/modules/auth/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { getNonce, loginWithWallet, registerUser } from './auth.service';
import { logger } from '../../utils/logger';

// Helper: Validasi format Ethereum address
const isEthAddress = (address: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(address);

// ─────────────────────────────────────────────────────────────
// GET /api/auth/nonce/:walletAddress
// ─────────────────────────────────────────────────────────────
export const handleGetNonce = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'walletAddress is required',
        errorCode: 'MISSING_WALLET_ADDRESS'
      });
    }

    if (!isEthAddress(walletAddress)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Ethereum address format',
        errorCode: 'INVALID_ADDRESS_FORMAT'
      });
    }

    logger.info(`[AUTH] Nonce requested for wallet: ${walletAddress.slice(0, 8)}...`, {
      ip: req.ip,
      userAgent: req.get('User-Agent')?.slice(0, 100)
    });

    const result = await getNonce(walletAddress);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error(`[AUTH] getNonce error: ${error.message}`, {
      walletAddress: req.params.walletAddress,
      ip: req.ip,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });

    if (error.message?.includes('database') || error.message?.includes('prisma')) {
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection error. Please try again later.',
        errorCode: 'DATABASE_ERROR'
      });
    }
    if (error.message?.includes('expired')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Nonce expired. Please request a new one.',
        errorCode: 'NONCE_EXPIRED'
      });
    }
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────
export const handleLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, signature } = req.body;

    if (!walletAddress || !signature) {
      return res.status(400).json({ 
        success: false, 
        message: 'walletAddress and signature are required',
        errorCode: 'MISSING_PARAMS'
      });
    }

    if (!isEthAddress(walletAddress)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Ethereum address format',
        errorCode: 'INVALID_ADDRESS_FORMAT'
      });
    }

    logger.info(`[AUTH] Login attempt for wallet: ${walletAddress.slice(0, 8)}...`, {
      ip: req.ip
    });

    const { user, token, refreshToken } = await loginWithWallet(walletAddress, signature);

    // ✅ Tambahkan flag isProfileComplete untuk frontend redirect
    const isProfileComplete = !!(user?.bio || user?.website || user?.avatarUrl);

    return res.status(200).json({
      success: true,
      data: { 
        user, 
        token, 
        refreshToken,
        isProfileComplete  // ✅ Frontend bisa langsung decide redirect
      },
      message: 'Authentication successful',
    });
  } catch (error: any) {
    logger.error(`[AUTH] Login error: ${error.message}`, {
      walletAddress: req.body?.walletAddress?.slice(0, 8) + '...',
      ip: req.ip,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });

    // ── Urutan: Spesifik → Umum ──
    
    // Wallet tidak ditemukan di DB
    if (error.message?.includes('not found') && !error.message?.includes('registered')) {
      return res.status(404).json({ 
        success: false, 
        message: 'Wallet not found. Please request nonce first.',
        errorCode: 'WALLET_NOT_FOUND'
      });
    }
    
    // Wallet belum register (sudah ada tapi isRegistered=false)
    if (error.message?.includes('not registered')) {
      return res.status(404).json({ 
        success: false, 
        message: 'Wallet not registered. Please register first.',
        errorCode: 'WALLET_NOT_REGISTERED'
      });
    }
    
    // Nonce expired
    if (error.message?.includes('Nonce expired')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication nonce expired. Please request a new nonce.',
        errorCode: 'NONCE_EXPIRED'
      });
    }
    
    // Signature invalid (cek case-insensitive)
    if (error.message?.toLowerCase().includes('signature') || 
        error.message?.toLowerCase().includes('invalid')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid signature. Please try signing again.',
        errorCode: 'SIGNATURE_INVALID'
      });
    }
    
    // Unexpected errors → global middleware
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────
export const handleRegister = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, signature, username, email } = req.body;

    if (!walletAddress || !signature) {
      return res.status(400).json({ 
        success: false, 
        message: 'walletAddress and signature are required',
        errorCode: 'MISSING_PARAMS'
      });
    }

    if (!isEthAddress(walletAddress)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Ethereum address format',
        errorCode: 'INVALID_ADDRESS_FORMAT'
      });
    }

    logger.info(`[AUTH] Register attempt for wallet: ${walletAddress.slice(0, 8)}...`, {
      username: username?.slice(0, 20),
      email: email?.slice(0, 30),
      ip: req.ip
    });

    const result = await registerUser(walletAddress, signature, {
      username,
      email,
    });

    // ✅ Tambahkan flag isProfileComplete untuk frontend redirect
    const isProfileComplete = !!(result.user?.bio || result.user?.website || result.user?.avatarUrl);

    return res.status(201).json({
      success: true,
      data: { 
        user: result.user, 
        token: result.token,
        isProfileComplete  // ✅ Frontend bisa langsung decide redirect
      },
      message: 'Registration successful.',
    });
  } catch (error: any) {
    logger.error(`[AUTH] Register error: ${error.message}`, {
      walletAddress: req.body?.walletAddress?.slice(0, 8) + '...',
      username: req.body?.username?.slice(0, 20),
      email: req.body?.email?.slice(0, 30),
      ip: req.ip,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });

    // ── Urutan: Spesifik → Umum ──
    
    // Username validation errors
    if (error.message === 'Username is required') {
      return res.status(400).json({ 
        success: false, 
        message: 'Username is required',
        errorCode: 'USERNAME_REQUIRED'
      });
    }
    if (error.message?.includes('Username must be')) {
      return res.status(400).json({ 
        success: false, 
        message: error.message,
        errorCode: 'USERNAME_INVALID_FORMAT'
      });
    }
    if (error.message?.includes('already taken')) {
      return res.status(409).json({ 
        success: false, 
        message: 'Username is already taken. Please choose another one.',
        errorCode: 'USERNAME_TAKEN'
      });
    }
    
    // Email validation errors
    if (error.message === 'Email is required') {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required',
        errorCode: 'EMAIL_REQUIRED'
      });
    }
    if (error.message?.includes('valid email')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please enter a valid email address',
        errorCode: 'EMAIL_INVALID_FORMAT'
      });
    }
    // Email already registered (spesifik)
    if (error.message?.includes('already registered') && error.message?.includes('email')) {
      return res.status(409).json({ 
        success: false, 
        message: 'Email is already registered. Please use another email.',
        errorCode: 'EMAIL_TAKEN'
      });
    }
    
    // Wallet errors
    if (error.message?.includes('not found') && !error.message?.includes('registered')) {
      return res.status(404).json({ 
        success: false, 
        message: 'Wallet not found. Please request nonce first.',
        errorCode: 'WALLET_NOT_FOUND'
      });
    }
    // Wallet already registered (umum)
    if (error.message?.includes('already registered')) {
      return res.status(409).json({ 
        success: false, 
        message: 'This wallet is already registered. Please login instead.',
        errorCode: 'WALLET_ALREADY_REGISTERED'
      });
    }
    
    // Nonce expired
    if (error.message?.includes('Nonce expired')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication nonce expired. Please request a new nonce.',
        errorCode: 'NONCE_EXPIRED'
      });
    }
    
    // Signature invalid
    if (error.message?.toLowerCase().includes('signature') || 
        error.message?.toLowerCase().includes('invalid')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid signature. Please try signing again.',
        errorCode: 'SIGNATURE_INVALID'
      });
    }
    
    // Unexpected errors → global middleware
    next(error);
  }
};

// Ambil Profil Sendiri (Wajib Pakai Token)
export const handleGetMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        walletAddress: true,
        username: true,
        email: true,
        avatarUrl: true,
        isRegistered: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// Perbarui Access Token menggunakan Refresh Token
export const handleRefreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }

    const result = await refreshAccessToken(refreshToken);

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Token refreshed successfully',
    });
  } catch (error: any) {
    if (error.message?.includes('Invalid') || error.message?.includes('expired')) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token. Please login again.' });
    }
    next(error);
  }
};

export const handleLogout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    // Hapus refreshToken
    await logout(userId);

    // Hapus cookie
    res.clearCookie('session_token', {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict'
    });

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};