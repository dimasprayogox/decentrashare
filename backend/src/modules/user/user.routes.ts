import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { handleGetMe, handleUpdateProfile, handleUpdateAvatar, handleSearchUsersForShare } from './user.controller';
import { uploadMiddleware } from '../../middlewares/upload.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

router.get('/me', handleGetMe);
router.put('/me', handleUpdateProfile);
router.patch('/me/avatar', uploadMiddleware.single('avatar'), handleUpdateAvatar);

router.post('/search', handleSearchUsersForShare);

export default router;