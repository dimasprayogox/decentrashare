// src/modules/admin/admin.controller.ts
import { Response, NextFunction } from 'express';
import { adminService } from './admin.service';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { logger } from '../../utils/logger';
import { Role } from '@prisma/client';

// GET /api/admin/users
export const handleListUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { query, role, page, limit } = req.query;

    let roleFilter: Role | undefined;
    if (role !== undefined) {
      const upper = String(role).toUpperCase();
      if (upper !== 'USER' && upper !== 'ADMIN') {
        return res.status(400).json({ success: false, message: 'Invalid role filter. Use USER or ADMIN.' });
      }
      roleFilter = upper as Role;
    }

    const result = await adminService.listUsers({
      query: query ? String(query) : undefined,
      role: roleFilter,
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? parseInt(String(limit), 10) : 20,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    logger.error('[AdminController] handleListUsers error', { error: error.message });
    next(error);
  }
};

// GET /api/admin/users/:userId
export const handleGetUserDetail = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const user = await adminService.getUserDetail(userId);
    return res.status(200).json({ success: true, data: user });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    next(error);
  }
};

// PATCH /api/admin/users/:userId/role
export const handleUpdateUserRole = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const adminId = req.user?.userId;
    const { userId } = req.params;
    const { role } = req.body;

    if (!adminId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }
    if (!role || typeof role !== 'string') {
      return res.status(400).json({ success: false, message: 'Role is required' });
    }

    const newRole = role.toUpperCase();
    if (newRole !== 'USER' && newRole !== 'ADMIN') {
      return res.status(400).json({ success: false, message: 'Invalid role. Must be USER or ADMIN.' });
    }

    const updated = await adminService.updateUserRole(adminId, userId, newRole as Role);

    return res.status(200).json({
      success: true,
      message: `User role updated to ${newRole}`,
      data: updated,
    });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (error.message?.includes('cannot change your own')) {
      return res.status(403).json({ success: false, message: error.message });
    }
    if (error.message?.includes('Invalid role')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// PATCH /api/admin/users/:userId/storage-limit
export const handleUpdateStorageLimit = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const adminId = req.user?.userId;
    const { userId } = req.params;
    let { storageLimitBytes, storageLimitGB } = req.body;

    if (!adminId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Terima input dalam bytes atau GB (GB akan dikonversi ke bytes)
    let limitBytes: number;
    if (storageLimitBytes !== undefined && storageLimitBytes !== null) {
      limitBytes = Number(storageLimitBytes);
    } else if (storageLimitGB !== undefined && storageLimitGB !== null) {
      limitBytes = Number(storageLimitGB) * 1024 * 1024 * 1024;
    } else {
      return res.status(400).json({
        success: false,
        message: 'storageLimitBytes or storageLimitGB is required',
      });
    }

    if (!Number.isFinite(limitBytes) || limitBytes < 0) {
      return res.status(400).json({
        success: false,
        message: 'Storage limit must be a non-negative number',
      });
    }

    const updated = await adminService.updateUserStorageLimit(adminId, userId, limitBytes);

    return res.status(200).json({
      success: true,
      message: 'Storage limit updated successfully',
      data: updated,
    });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (error.message?.includes('Storage limit') || error.message?.includes('unlimited storage')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};
