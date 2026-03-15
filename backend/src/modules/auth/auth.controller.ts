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
  } catch (error) {
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

    // --- TAMBAHKAN VALIDASI INI ---
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
  } catch (error) {
    next(error);
  }
};

// Registrasi User Baru
export const handleRegister = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, signature, username, email, avatarUrl } = req.body;

    if (!walletAddress || !signature) {
      return res.status(400).json({ success: false, message: 'walletAddress and signature are required.' });
    }

    // --- TAMBAHKAN VALIDASI INI ---
    if (!isEthAddress(walletAddress)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Ethereum address format.' 
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
      message: 'Registration successful.',
    });
  } catch (error) {
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
        isRegistered: true, // Tambahkan ini agar sinkron
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
  } catch (error) {
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