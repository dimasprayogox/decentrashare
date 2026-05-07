// src/modules/auth/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/db';
import { getNonce, loginWithWallet, registerUser, refreshAccessToken, logout } from './auth.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

// Step 1: Client minta nonce
export const handleGetNonce = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      return res.status(400).json({ success: false, message: 'walletAddress is required' });
    }

    const result = await getNonce(walletAddress);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    // Handle expected errors before passing to global middleware
    if (error.message?.includes('database') || error.message?.includes('prisma')) {
      return res.status(503).json({ success: false, message: 'Database connection error. Please try again later.' });
    }
    next(error);
  }
};

const isEthAddress = (address: string) => /^0x[a-fA-F0-9]{40}$/.test(address);

// Step 2: Client kirim signature (Login)
export const handleLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, signature } = req.body;

    if (!walletAddress || !signature) {
      return res.status(400).json({ success: false, message: 'walletAddress and signature are required' });
    }

    if (!isEthAddress(walletAddress)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Ethereum address format. Address must start with 0x and be 42 characters long.' 
      });
    }

    const { user, token, refreshToken } = await loginWithWallet(walletAddress, signature);

    return res.status(200).json({
      success: true,
      data: { user, token, refreshToken },
      message: 'Authentication successful',
    });
  } catch (error: any) {
    // ── Handle EXPECTED errors with proper JSON response ──
    if (error.message?.includes('not found')) {
      return res.status(404).json({ success: false, message: 'Wallet not found. Please request nonce first.' });
    }
    if (error.message?.includes('not registered')) {
      return res.status(404).json({ success: false, message: 'Wallet not registered. Please register first.' });
    }
    if (error.message?.includes('Nonce expired')) {
      return res.status(401).json({ success: false, message: 'Authentication nonce expired. Please request a new nonce.' });
    }
    if (error.message?.toLowerCase().includes('signature') || error.message?.toLowerCase().includes('invalid')) {
      return res.status(401).json({ success: false, message: 'Invalid signature. Please try signing again.' });
    }
    // Unexpected errors → global middleware
    next(error);
  }
};

// Registrasi User Baru
export const handleRegister = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, signature, username, email } = req.body;

    if (!walletAddress || !signature) {
      return res.status(400).json({ success: false, message: 'walletAddress and signature are required.' });
    }

    if (!isEthAddress(walletAddress)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Ethereum address format.' 
      });
    }

    const result = await registerUser(walletAddress, signature, {
      username,
      email,
    });

    return res.status(201).json({
      success: true,
      data: { user: result.user, token: result.token },
      message: 'Registration successful.',
    });
  } catch (error: any) {
    // Handle expected errors
    if (error.message === 'Username is required') {
      return res.status(400).json({ success: false, message: 'Username is required' });
    }
    // Username format invalid
    if (error.message?.includes('Username must be')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    // Username taken
    if (error.message?.includes('already taken')) {
      return res.status(409).json({ success: false, message: 'Username is already taken. Please choose another one.' });
    }
    
    // Email required
    if (error.message === 'Email is required') {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    // Email format invalid
    if (error.message?.includes('valid email')) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
    }
    // Email already registered
    if (error.message?.includes('already registered') && error.message?.includes('email')) {
      return res.status(409).json({ success: false, message: 'Email is already registered. Please use another email.' });
    }
    if (error.message?.includes('not found')) {
      return res.status(404).json({ success: false, message: 'Wallet not found. Please request nonce first.' });
    }
    if (error.message?.includes('already registered')) {
      return res.status(409).json({ success: false, message: 'This wallet is already registered. Please login instead.' });
    }
    if (error.message?.includes('Nonce expired')) {
      return res.status(401).json({ success: false, message: 'Authentication nonce expired. Please request a new nonce.' });
    }
    if (error.message?.toLowerCase().includes('signature')) {
      return res.status(401).json({ success: false, message: 'Invalid signature. Please try signing again.' });
    }
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

// Logout (Hapus Refresh Token di DB)
export const handleLogout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    await logout(userId);

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};