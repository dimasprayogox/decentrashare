import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { handleGetMe, handleUpdateProfile, handleUpdateAvatar } from './user.controller';
import { uploadMiddleware } from '../../middlewares/upload.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

router.get('/me', handleGetMe);
router.put('/me', handleUpdateProfile);
router.patch('/me/avatar', uploadMiddleware.single('avatar'), handleUpdateAvatar);

export default router;