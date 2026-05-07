// src/modules/auth/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/db';
import { getNonce, loginWithWallet, registerUser, refreshAccessToken, logout } from './auth.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

const isEthAddress = (address: string) => /^0x[a-fA-F0-9]{40}$/.test(address);

// ─────────────────────────────────────────────────────────────
// GET NONCE
// ─────────────────────────────────────────────────────────────
export const handleGetNonce = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'walletAddress is required' 
      });
    }

    if (!isEthAddress(walletAddress)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Ethereum address format' 
      });
    }

    const result = await getNonce(walletAddress);
    return res.status(200).json({ success: true,  result });

  } catch (error: any) {
    // Handle expected errors explicitly
    if (error.message?.includes('database') || error.message?.includes('prisma')) {
      return res.status(503).json({
        success: false,
        message: 'Database connection error. Please try again later.'
      });
    }
    
    // Unexpected errors → pass to global error middleware
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
// LOGIN WITH WALLET
// ─────────────────────────────────────────────────────────────
export const handleLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, signature, nonce } = req.body;

    if (!walletAddress || !signature) {
      return res.status(400).json({ 
        success: false, 
        message: 'walletAddress and signature are required' 
      });
    }

    if (!isEthAddress(walletAddress)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Ethereum address format' 
      });
    }

    const result = await loginWithWallet(walletAddress, signature, nonce);
    return res.status(200).json({
      success: true,
       { user: result.user, token: result.token, refreshToken: result.refreshToken },
      message: 'Authentication successful'
    });

  } catch (error: any) {
    // ── Handle EXPECTED errors (return proper JSON + status) ──
    
    // User not found / not registered
    if (error.message?.includes('not found') || error.message?.includes('not registered')) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not registered. Please register first.'
      });
    }
    
    // Nonce expired
    if (error.message?.includes('Nonce expired')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication nonce expired. Please restart the login process.'
      });
    }
    
    // Invalid signature
    if (error.message?.toLowerCase().includes('signature') || 
        error.message?.toLowerCase().includes('invalid')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid signature. Please try signing again.'
      });
    }

    // ── Unexpected errors → let global middleware handle ──
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
// REGISTER USER
// ─────────────────────────────────────────────────────────────
export const handleRegister = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, signature, username, email, avatarUrl } = req.body;

    if (!walletAddress || !signature) {
      return res.status(400).json({ 
        success: false, 
        message: 'walletAddress and signature are required' 
      });
    }

    if (!isEthAddress(walletAddress)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Ethereum address format' 
      });
    }

    const result = await registerUser(walletAddress, signature, { username, email, avatarUrl });
    return res.status(201).json({
      success: true,
       { user: result.user, token: result.token },
      message: 'Registration successful'
    });

  } catch (error: any) {
    // Handle expected errors
    if (error.message?.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found. Please request nonce first.'
      });
    }
    
    if (error.message?.includes('already registered')) {
      return res.status(409).json({
        success: false,
        message: 'This wallet is already registered. Please login instead.'
      });
    }
    
    if (error.message?.includes('Nonce expired')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication nonce expired. Please try again.'
      });
    }
    
    if (error.message?.toLowerCase().includes('signature')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid signature. Please try signing again.'
      });
    }
    
    if (error.message?.includes('Username') || error.message?.includes('taken')) {
      return res.status(409).json({
        success: false,
        message: 'Username is already taken. Please choose another one.'
      });
    }

    // Unexpected errors
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
// REFRESH TOKEN
// ─────────────────────────────────────────────────────────────
export const handleRefreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Refresh token is required' 
      });
    }

    const result = await refreshAccessToken(refreshToken);
    return res.status(200).json({
      success: true,
       result,
      message: 'Token refreshed successfully'
    });

  } catch (error: any) {
    if (error.message?.includes('Invalid') || error.message?.includes('expired')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token. Please login again.'
      });
    }
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
// LOGOUT & GET ME (unchanged, just ensure error handling)
// ─────────────────────────────────────────────────────────────
export const handleGetMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, walletAddress: true, username: true, email: true,
        avatarUrl: true, isRegistered: true, createdAt: true, updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true,  user });
  } catch (error: any) {
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
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    next(error);
  }
};