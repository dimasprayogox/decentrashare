import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth.middleware'

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin access only.' })
  }

  next()
}