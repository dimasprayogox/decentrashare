// src/modules/user/user.controller.ts
import { Request, Response, NextFunction } from 'express';
import { userService } from './user.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

// GET /api/user/me
export const handleGetMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const user = await userService.getUserById(userId);
    return res.status(200).json({ success: true, data: user });
    
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    next(error);
  }
};

// ✅ HANDLER BARU: PATCH /api/user/me/avatar
// Gunakan PATCH karena kita hanya mengupdate satu field (avatar)
export const handleUpdateAvatar = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    const file = req.file; // Didapat dari middleware multer

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }

    // Panggil service khusus upload ke IPFS Pinata
    const updated = await userService.updateAvatar(userId, file);

    return res.status(200).json({
      success: true,
      message: 'Avatar updated successfully to IPFS',
      data: updated,
    });
  } catch (error: any) {
    next(error);
  }
};

// PUT /api/user/me (Update Text Only)
export const handleUpdateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // ✅ avatarUrl dihilangkan dari sini karena sudah punya handler sendiri
    const { username, email, bio, website } = req.body;
    
    const updated = await userService.updateProfile(userId, {
      username,
      email,
      bio,
      website,
    });

    return res.status(200).json({
      success: true,
      data: updated,
      message: 'Profile updated successfully',
    });
  } catch (error: any) {
    // Validation errors (400)
    if (error.message?.includes('Username must be') || 
        error.message?.includes('valid email')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    // Conflict (409)
    if (error.message?.includes('already taken')) {
      return res.status(409).json({ success: false, message: 'Username is already taken' });
    }
    if (error.message?.includes('already registered')) {
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }
    
    // Not found (404)
    if (error.message?.includes('not found')) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    next(error);
  }
};