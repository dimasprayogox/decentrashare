import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { handleGetSharedWithMe } from './shared.controller';

const router = Router();

router.use(authMiddleware);

router.get('/shared-with-me', handleGetSharedWithMe);
router.get('/dibagikan', handleGetSharedWithMe);

export default router;
