// src/modules/user/user.controller.ts
import { Request, Response, NextFunction } from 'express';
import { userService } from './user.service';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { logger } from '../../utils/logger.js';

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

export const handleUpdateAvatar = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    const file = req.file;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }

    // ✅ Call service
    const updated = await userService.updateAvatar(userId, file);

    // ✅ 1. Log success BEFORE return (audit trail)
    logger.info(`[AVATAR] Successfully updated`, {
      userId,
      fileName: file.originalname,
      fileSize: file.size,
      newAvatarUrl: updated.avatarUrl,
      ip: req.ip
    });

    // ✅ 2. Return response AFTER logging
    return res.status(200).json({
      success: true,
      message: 'Avatar updated successfully to IPFS',
      data: updated,
    });

  } catch (error: any) {
    // ✅ Multer error handling
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Max 2MB for avatars.',
        errorCode: 'FILE_TOO_LARGE'
      });
    }
    
    if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.message?.includes('unexpected field')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid upload. Please use field name "avatar".',
        errorCode: 'INVALID_FIELD_NAME'
      });
    }

    // ✅ Pinata/API errors
    if (error.message?.includes('Pinata API Error')) {
      return res.status(502).json({
        success: false,
        message: 'Failed to upload to IPFS. Please try again.',
        errorCode: 'PINATA_UPLOAD_FAILED'
      });
    }

    // ✅ Log & pass to global handler
    logger.error(`[AVATAR] Update failed: ${error.message}`, {
      userId: req.user?.userId,
      fileName: req.file?.originalname,
      error: error.stack
    });
    
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