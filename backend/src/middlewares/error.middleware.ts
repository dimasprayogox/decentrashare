import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'

export const notFoundMiddleware = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  })
}

export const errorMiddleware = (error: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', error)

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: error.message }),
  })
}
