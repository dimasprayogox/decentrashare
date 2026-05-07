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
    return res.status(200).json({ success: true,  user });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    next(error);
  }
};

// PUT /api/user/me
export const handleUpdateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { username, email, avatarUrl, bio, website } = req.body;
    
    const updated = await userService.updateProfile(userId, {
      username,
      email,
      avatarUrl,
      bio,
      website,
    });

    return res.status(200).json({
      success: true,
       updated,
      message: 'Profile updated successfully',
    });
  } catch (error: any) {
    // Validation errors (400)
    if (error.message?.includes('Username must be') || 
        error.message?.includes('valid email')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    // Conflict errors (409)
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
    
    // Unexpected errors → global middleware
    next(error);
  }
};