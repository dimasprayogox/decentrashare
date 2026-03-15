import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { logger } from '../utils/logger'
import { prisma } from '../config/db'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

export interface AuthRequest extends Request {
  user?: {
    userId: string
    walletAddress: string
    role: 'USER' | 'ADMIN'
  }
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Access token is required',
      })
      return
    }

    const token = authHeader.split(' ')[1]

    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string
      walletAddress: string
      role?: 'USER' | 'ADMIN'
      type: 'access' | 'refresh'
    }

    req.user = {
      userId: decoded.userId,
      walletAddress: decoded.walletAddress,
      role: decoded.role ?? 'USER',
    }

    next()
  } catch (error: any) {
    logger.error(`[AUTH_MIDDLEWARE] Access denied: ${error.message} - IP: ${req.ip}`);

    // Cek apakah error disebabkan karena token expired
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please refresh your token.',
        code: 'TOKEN_EXPIRED' // Kode ini membantu frontend melakukan refresh otomatis
      });
    }

    // Penanganan untuk error JWT lainnya (Invalid signature, malformed, dll)
    return res.status(401).json({
      success: false,
      message: 'Invalid access token.',
      code: 'INVALID_TOKEN'
    });
  }
}
