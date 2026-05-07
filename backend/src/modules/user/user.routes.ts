import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { handleGetMe, handleUpdateProfile } from './user.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

router.get('/me', handleGetMe);
router.put('/me', handleUpdateProfile);

export default router;