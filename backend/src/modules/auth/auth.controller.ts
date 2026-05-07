// src/modules/auth/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/db';
import { getNonce, loginWithWallet, registerUser, refreshAccessToken, logout } from './auth.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

const isEthAddress = (address: string) => /^0x[a-fA-F0-9]{40}$/.test(address);

// Step 1: Get Nonce
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

    const result = await getNonce(walletAddress);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[handleGetNonce] Error:', error.message);
    
    // Handle specific errors before passing to global handler
    if (error.message?.includes('database') || error.message?.includes('prisma')) {
      return res.status(503).json({
        success: false,
        message: 'Database connection error. Please try again later.',
        errorCode: 'DATABASE_ERROR'
      });
    }
    
    next(error); // Pass to global errorHandler
  }
};

// Step 2: Login with Signature
export const handleLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, signature, nonce } = req.body;

    if (!walletAddress || !signature) {
      return res.status(400).json({ 
        success: false, 
        message: 'walletAddress and signature are required',
        errorCode: 'MISSING_PARAMETERS'
      });
    }

    if (!isEthAddress(walletAddress)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Ethereum address format',
        errorCode: 'INVALID_ADDRESS_FORMAT'
      });
    }

    const result = await loginWithWallet(walletAddress, signature, nonce);

    return res.status(200).json({
      success: true,
      data: { 
        user: result.user, 
        token: result.token, 
        refreshToken: result.refreshToken 
      },
      message: 'Authentication successful',
    });
  } catch (error: any) {
    console.error('[handleLogin] Error:', error.message);
    
    // Handle "User not registered" explicitly
    if (error.message?.includes('not registered')) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not registered. Please register first.',
        errorCode: 'WALLET_NOT_REGISTERED'
      });
    }
    
    // Handle signature verification failure
    if (error.message?.toLowerCase().includes('signature') || 
        error.message?.toLowerCase().includes('verify')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid signature. Please try signing again.',
        errorCode: 'SIGNATURE_INVALID'
      });
    }
    
    // Handle nonce mismatch/expired
    if (error.message?.toLowerCase().includes('nonce') || 
        error.message?.toLowerCase().includes('expired')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication nonce expired. Please restart the login process.',
        errorCode: 'NONCE_EXPIRED'
      });
    }
    
    next(error); // Pass unknown errors to global handler
  }
};

// Register New User
export const handleRegister = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, signature, username, email, avatarUrl } = req.body;

    if (!walletAddress || !signature) {
      return res.status(400).json({ 
        success: false, 
        message: 'walletAddress and signature are required',
        errorCode: 'MISSING_PARAMETERS'
      });
    }

    if (!isEthAddress(walletAddress)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Ethereum address format',
        errorCode: 'INVALID_ADDRESS_FORMAT'
      });
    }

    const result = await registerUser(walletAddress, signature, {
      username,
      email,
      avatarUrl,
    });

    return res.status(201).json({
      success: true,
      data: { user: result.user, token: result.token },
      message: 'Registration successful',
    });
  } catch (error: any) {
    console.error('[handleRegister] Error:', error.message);
    
    // Handle "already registered" case
    if (error.message?.includes('already registered') || error.message?.includes('exists')) {
      return res.status(409).json({
        success: false,
        message: 'This wallet is already registered. Please login instead.',
        errorCode: 'WALLET_ALREADY_REGISTERED'
      });
    }
    
    next(error);
  }
};

// Get Current User Profile
export const handleGetMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized',
        errorCode: 'UNAUTHORIZED'
      });
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
      return res.status(404).json({ 
        success: false, 
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND'
      });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (error: any) {
    console.error('[handleGetMe] Error:', error.message);
    next(error);
  }
};

// Refresh Access Token
export const handleRefreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Refresh token is required',
        errorCode: 'MISSING_REFRESH_TOKEN'
      });
    }

    const result = await refreshAccessToken(refreshToken);

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Token refreshed successfully',
    });
  } catch (error: any) {
    console.error('[handleRefreshToken] Error:', error.message);
    
    if (error.message?.includes('expired') || error.message?.includes('invalid')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token. Please login again.',
        errorCode: 'INVALID_REFRESH_TOKEN'
      });
    }
    
    next(error);
  }
};

// Logout
export const handleLogout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized',
        errorCode: 'UNAUTHORIZED'
      });
    }

    await logout(userId);

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    console.error('[handleLogout] Error:', error.message);
    next(error);
  }
};