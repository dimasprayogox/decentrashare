import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import * as userService from './user.service';


export const handleSearchUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query; // Menangkap ?q=nama_user
    const userId = req.user?.userId;

    if (!q) return res.status(200).json({ success: true, data: [] });

    const users = await userService.searchUsers(q as string, userId!);
    
    return res.status(200).json({ success: true, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};