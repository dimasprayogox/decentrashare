import { Request, Response, NextFunction } from 'express';
import { getNonce, loginWithWallet, registerUser } from './auth.service';

// Step 1: Client minta nonce
export const handleGetNonce = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress } = req.params;
    const walletRegex = /^0x[a-fA-F0-9]{40}$/;
    
    if (!walletAddress || !walletRegex.test(walletAddress)) {
      res.status(400).json({ success: false, message: 'Wallet tidak valid!' });
      return;
    }

    const nonce = await getNonce(walletAddress);

    res.status(200).json({
      success: true,
      data: {
        nonce,
        // Tampilkan kedua message sesuai kebutuhan
        loginMessage: `Sign this message to authenticate.\nNonce: ${nonce}`,
        registerMessage: `Sign this message to register.\nNonce: ${nonce}`,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Step 2: Client kirim signature
export const handleLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, signature } = req.body;

    if (!walletAddress || !signature) {
      res.status(400).json({ success: false, message: 'walletAddress and signature are required' });
      return;
    }

    const { user, token } = await loginWithWallet(walletAddress, signature);

    res.status(200).json({
      success: true,
      data: { user, token },
      message: 'Authentication successful',
    });
  } catch (error) {
    next(error);
  }
};

export const handleRegister = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, signature, username, email, avatarUrl } = req.body;

    if (!walletAddress || !signature) {
      res.status(400).json({ success: false, message: 'walletAddress and signature are required.' });
      return;
    }

    const result = await registerUser(walletAddress, signature, {
      username,
      email,
      avatarUrl,
    });

    res.status(201).json({
      success: true,
      data: { user: result.user, token: result.token },
      message: 'Registration successful.',
    });
  } catch (error) {
    next(error);
  }
};