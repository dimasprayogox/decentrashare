import { Router } from 'express';
import { handleGetNonce, handleLogin, handleRegister } from './auth.controller';

const router = Router();

router.get('/nonce/:walletAddress', handleGetNonce);
router.post('/login', handleLogin);
router.post('/register', handleRegister);

export default router;