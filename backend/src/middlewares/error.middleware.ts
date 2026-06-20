import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'

export const notFoundMiddleware = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  })
}

export const errorMiddleware = (error: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', error)

  const status = error.status || 500
  const message = error.status ? error.message : 'Internal server error'
  const errorCode = error.errorCode

  res.status(status).json({
    success: false,
    message,
    ...(errorCode && { errorCode }),
    ...(process.env.NODE_ENV === 'development' && { error: error.message }),
  })
}
