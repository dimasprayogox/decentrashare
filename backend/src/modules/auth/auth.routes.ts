import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { handleGetNonce, handleLogin, handleRegister, handleGetMe, handleRefreshToken, handleLogout } from './auth.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();

const nonceLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 menit
  max: 10,
  message: { success: false, message: 'Too many requests, try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 100 * 60 * 1000, // 15 menit
  max: 20,
});

router.get('/nonce/:walletAddress', nonceLimiter, handleGetNonce);
router.post('/login', authLimiter, handleLogin);
router.post('/register', authLimiter, handleRegister); 
router.get('/me', authMiddleware, handleGetMe);
router.post('/refresh', handleRefreshToken)
router.post('/logout', authMiddleware, handleLogout)

export default router;