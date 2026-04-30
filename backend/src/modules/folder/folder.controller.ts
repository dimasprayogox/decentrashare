import { Response, NextFunction } from 'express';
import { PrivacyLevel } from '@prisma/client';
import { AuthRequest } from '../../middlewares/auth.middleware';
import * as folderService from './folder.service';

/**
 * POST /api/documents/folders
 * Membuat folder baru
 */
export const handleCreateFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, parentId } = req.body;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!name) return res.status(400).json({ success: false, message: 'Folder name is required' });

    const folder = await folderService.createFolder(name, userId, parentId || null);

    return res.status(201).json({
      success: true,
      data: folder,
      message: 'Folder created successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/documents/folders
 * Mengambil daftar folder milik user
 */
export const handleGetMyFolders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    const { parentId } = req.query;

    const cleanParentId = (parentId === 'null' || !parentId) ? null : String(parentId);

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const folders = await folderService.getUserFolders(userId, cleanParentId);

    return res.status(200).json({
      success: true,
      data: folders,
    });
  } catch (error) {
    next(error);
  }
};

// folder.controller.ts
export const handleGetFolderPath = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const path = await folderService.getFolderPath(id);
    return res.json({ success: true, data: path });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const handleRenameFolder = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const folder = await folderService.renameFolder(id, req.user!.userId, name);
    return res.status(200).json({ success: true, data: folder });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const handleGetFolderDetail = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const folder = await folderService.getFolderDetail(id, req.user!.userId);
    return res.status(200).json({ success: true, data: folder });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/folders
 * Menangani penghapusan folder secara massal dengan logika auto-archive
 */
export const handleDeleteMultipleFolders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { folderIds } = req.body; // Mengharapkan array of strings: ["id1", "id2"]
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (!Array.isArray(folderIds) || folderIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'folderIds must be a non-empty array' 
      });
    }

    const result = await folderService.deleteMultipleFolders(folderIds, userId);

    return res.status(200).json({
      success: true,
      message: 'Operation successful',
      data: {
        permanentlyDeleted: result.deletedCount,
        archived: result.archivedCount
      }
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const handleRestoreFolders = async (req: AuthRequest, res: Response) => {
  try {
    const { folderIds } = req.body;
    const userId = req.user?.userId;

    const result = await folderService.restoreMultipleFolders(folderIds, userId!);
    return res.status(200).json({ success: true, message: `${result.count} folders restored.` });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};


 export const handleShareFolder = async (req: AuthRequest, res: Response) => {
  try {
    const { shares } = req.body;
    const userId = req.user?.userId;

    if (!Array.isArray(shares)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid format. Expected an array of folder shares.' 
      });
    }

    const result = await folderService.shareFoldersFlexible(userId!, shares);

    return res.status(200).json({
      success: true,
      message: 'Folder sharing processed. Privacy levels synchronized.',
      data: result
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};


 export const handleGetFolderSharedUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { folderIds } = req.body;
    const userId = req.user?.userId;

    if (!folderIds || !Array.isArray(folderIds)) {
      return res.status(400).json({ success: false, message: "folderIds must be an array." });
    }

    const data = await folderService.getFoldersSharedUsers(folderIds, userId!);

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved shared users for multiple folders.",
      data
    });
  } catch (error: any) {
    res.status(403).json({ success: false, message: error.message });
  }
};

export const handleRevokeFolderAccess = async (req: AuthRequest, res: Response) => {
  try {
    const { revokes } = req.body;
    const userId = req.user?.userId;

    if (!Array.isArray(revokes)) {
      return res.status(400).json({ success: false, message: 'Invalid format.' });
    }

    const result = await folderService.revokeFoldersAccess(userId!, revokes);

    return res.status(200).json({
      success: true,
      message: 'Folder access revocation complete.',
      data: result
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const handleGetFolderContents = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const documents = await folderService.getFolderContents(id, userId!);
    return res.status(200).json({ success: true, data: documents });
  } catch (error: any) {
    res.status(403).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/folders/shared-with-me
 */
export const handleGetSharedWithMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const folders = await folderService.getSharedWithMeFolders(userId);

    return res.status(200).json({
      success: true,
      data: folders
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};


/**
 * PATCH /api/folders/:id/privacy
 * Mengubah tingkat privasi folder (Butuh Login)
 */
export const handleUpdatePrivacy = async (req: AuthRequest, res: Response) => {
  try {
    const { updates } = req.body;
    const userId = req.user?.userId;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid format. 'updates' must be a non-empty array." 
      });
    }

    const data = await folderService.updateFoldersPrivacy(userId!, updates);

    return res.status(200).json({
      success: true,
      message: "Privacy levels updated successfully.",
      data
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/folders/open/:token
 * Melihat isi folder via Link (TIDAK Butuh Login)
 */
export const handleGetPublicFolder = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const folder = await folderService.getPublicFolderByToken(token);
    
    return res.status(200).json({
      success: true,
      data: folder
    });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
};