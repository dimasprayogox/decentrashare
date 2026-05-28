import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import * as sharedService from './shared.service';

export const handleGetSharedWithMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const data = await sharedService.getSharedWithMe(userId);

    return res.status(200).json({
      success: true,
      message: 'Shared items retrieved successfully.',
      data,
    });
  } catch (error) {
    next(error);
  }
};
