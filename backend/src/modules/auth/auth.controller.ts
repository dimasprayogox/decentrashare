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

    const isProfileComplete = !!(user?.bio || user?.website || user?.avatarUrl);

    res.cookie('session_token', token, {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 
    });

    if (refreshToken) {
      res.cookie('refresh_token', refreshToken, {
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 
      });
    }

    // Serialize user untuk response (convert BigInt ke number)
    const serializedUser = {
      ...user,
      storageLimit: user.storageLimit !== null ? Number(user.storageLimit) : null,
    };

    return res.status(200).json({
      success: true,
      data: { 
        user: serializedUser, 
        token, 
        refreshToken,
        isProfileComplete
      },
      message: 'Authentication successful',
    });
  } catch (error: any) {
    logger.error(`[AUTH] Login error: ${error.message}`, {
      walletAddress: req.body?.walletAddress?.slice(0, 8) + '...',
      ip: req.ip,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });

    if (error.message?.includes('not found') && !error.message?.includes('registered')) {
      return res.status(404).json({ 
        success: false, 
        message: 'Wallet not found. Please request nonce first.',
        errorCode: 'WALLET_NOT_FOUND'
      });
    }
    
    if (error.message?.includes('not registered')) {
      return res.status(404).json({ 
        success: false, 
        message: 'Wallet not registered. Please register first.',
        errorCode: 'WALLET_NOT_REGISTERED'
      });
    }
    
    if (error.message?.includes('Nonce expired')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication nonce expired. Please request a new nonce.',
        errorCode: 'NONCE_EXPIRED'
      });
    }

    if (error.message?.toLowerCase().includes('signature') || 
        error.message?.toLowerCase().includes('invalid')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid signature. Please try signing again.',
        errorCode: 'SIGNATURE_INVALID'
      });
    }
    
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────

export const handleRegister = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, signature, username, email } = req.body;

    // ── Basic Validation ─────────────────────────────────────
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

    // ── Call Service ─────────────────────────────────────────
    const result = await registerUser(walletAddress, signature, {
      username,
      email,
    });

    const isProfileComplete = !!(result.user?.bio || result.user?.website || result.user?.avatarUrl);
    const isProduction = process.env.NODE_ENV === 'production';

    // ── Set Secure Cookies ───────────────────────────────────
    res.cookie('session_token', result.token, {
      path: '/',
      secure: isProduction,
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    if (result.refreshToken) {
      res.cookie('refresh_token', result.refreshToken, {
        path: '/',
        secure: isProduction,
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
    }

    // ── Return Success Response ──────────────────────────────
    // Serialize user untuk response (convert BigInt ke number)
    const serializedUser = {
      ...result.user,
      storageLimit: result.user.storageLimit !== null ? Number(result.user.storageLimit) : null,
    };

    return res.status(201).json({
      success: true,
      data: { 
        user: serializedUser, 
        token: result.token,
        refreshToken: result.refreshToken,
        isProfileComplete,
        // ✅ Include Pinata setup status (optional, for frontend awareness)
        pinataSetup: result.pinataSetup
      },
      message: 'Registration successful. Welcome to DecentraShare!',
    });

  } catch (error: any) {
    // ── Structured Error Logging ─────────────────────────────
    logger.error(`[AUTH] Register error: ${error.message}`, {
      walletAddress: req.body?.walletAddress?.slice(0, 8) + '...',
      username: req.body?.username?.slice(0, 20),
      email: req.body?.email?.slice(0, 30),
      ip: req.ip,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });

    // ── Structured Error Responses ───────────────────────────
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
    if (error.message?.includes('already registered') && error.message?.includes('email')) {
      return res.status(409).json({ 
        success: false, 
        message: 'Email is already registered. Please use another email.',
        errorCode: 'EMAIL_TAKEN'
      });
    }
    
    if (error.message?.includes('not found') && !error.message?.includes('registered')) {
      return res.status(404).json({ 
        success: false, 
        message: 'Wallet not found. Please request nonce first.',
        errorCode: 'WALLET_NOT_FOUND'
      });
    }
    if (error.message?.includes('already registered')) {
      return res.status(409).json({ 
        success: false, 
        message: 'This wallet is already registered. Please login instead.',
        errorCode: 'WALLET_ALREADY_REGISTERED'
      });
    }
    
    if (error.message?.includes('Nonce expired')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication nonce expired. Please request a new nonce.',
        errorCode: 'NONCE_EXPIRED'
      });
    }
    
    if (error.message?.toLowerCase().includes('signature') || 
        error.message?.toLowerCase().includes('invalid')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid signature. Please try signing again.',
        errorCode: 'SIGNATURE_INVALID'
      });
    }
    
    // ── Fallback: Pass to global error handler ───────────────
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
        bio: true,
        website: true,
        role: true,
        storageLimit: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Serialize BigInt to number
    const serializedUser = {
      ...user,
      storageLimit: user.storageLimit !== null ? Number(user.storageLimit) : null,
    };

    return res.status(200).json({ success: true, data: serializedUser });
  } catch (error) {
    next(error);
  }
};


export const handleRefreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {

    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Refresh token is missing from cookies',
        errorCode: 'REFRESH_TOKEN_REQUIRED'
      });
    }

    const result = await refreshAccessToken(refreshToken);

    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('session_token', result.token, {
      path: '/',
      secure: isProduction,
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 
    });

    if (result.refreshToken) {
      res.cookie('refresh_token', result.refreshToken, {
        path: '/',
        secure: isProduction,
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        token: result.token,
        refreshToken: result.refreshToken,
        user: result.user
      },
      message: 'Token refreshed successfully',
    });
  } catch (error: any) {
    logger.error(`[AUTH] Refresh token error: ${error.message}`, {
      ip: req.ip,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });

    if (error.message?.includes('Invalid') || error.message?.includes('expired')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired refresh token. Please login again.',
        errorCode: 'INVALID_REFRESH_TOKEN'
      });
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
    
    await logout(userId);

    const cookieOptions = {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict' as const 
    };

    res.clearCookie('session_token', cookieOptions);
    res.clearCookie('refresh_token', cookieOptions);

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};