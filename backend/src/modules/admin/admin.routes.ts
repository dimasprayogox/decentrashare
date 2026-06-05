// src/modules/admin/admin.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/role.middleware';
import {
  handleListUsers,
  handleGetUserDetail,
  handleUpdateUserRole,
  handleUpdateStorageLimit,
} from './admin.controller';

const router = Router();

// Semua route admin wajib login DAN ber-role ADMIN
router.use(authMiddleware);
router.use(requireAdmin);

// User management
router.get('/users', handleListUsers);
router.get('/users/:userId', handleGetUserDetail);

// Update role user lain
router.patch('/users/:userId/role', handleUpdateUserRole);

// Atur batas penyimpanan user
router.patch('/users/:userId/storage-limit', handleUpdateStorageLimit);

export default router;
