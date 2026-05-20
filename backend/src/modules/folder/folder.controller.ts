import { Response, NextFunction } from 'express';
import { PrivacyLevel } from '@prisma/client';
import { AuthRequest } from '../../middlewares/auth.middleware';
import * as folderService from './folder.service';
import { logger } from '../../utils/logger';

export const handleCreateFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, parentId } = req.body;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!name?.trim()) return res.status(400).json({ 
      success: false, 
      message: 'Folder name is required',
      errorCode: 'MISSING_NAME'
    });

    const folder = await folderService.createFolder(name, userId, parentId || null);

    return res.status(201).json({
      success: true,
      data: folder,
      message: 'Folder created successfully',
    });
    
  } catch (error: any) {
    if (error.message?.toLowerCase().includes('already exists')) {
      return res.status(409).json({ 
        success: false,
        message: error.message,
        errorCode: 'FOLDER_EXISTS' 
      });
    }
    
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
export const handleFolderPath = async (req: Request, res: Response) => {
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
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    if (!name?.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'New folder name is required',
        errorCode: 'MISSING_NAME'
      });
    }

    const folder = await folderService.renameFolder(id, userId, name);
    
    return res.status(200).json({ 
      success: true, 
      data: folder,
      message: 'Folder renamed successfully'
    });
    
  } catch (error: any) {
    if (error.message?.toLowerCase().includes('already exists')) {
      return res.status(409).json({ 
        success: false,
        message: error.message,
        errorCode: 'FOLDER_EXISTS' 
      });
    }
    
    if (error.message?.includes('not found') || error.message?.includes('unauthorized')) {
      return res.status(404).json({ 
        success: false, 
        message: error.message,
        errorCode: 'FOLDER_NOT_FOUND'
      });
    }
    
    return res.status(400).json({ success: false, message: error.message });
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

export const handleGetArchivedFolders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const folders = await folderService.getArchivedFolders(userId);

    return res.status(200).json({
      success: true,
      message: 'Archived folders retrieved successfully',
      data: folders,
      meta: {
        count: folders.length,
        totalItems: folders.reduce((sum, f: any) => sum + (f._count?.documents || 0), 0)  // Total docs in trash
      }
    });
    
  } catch (error: any) {
    logger.error('❌ Get archived folders failed:', error);
    return res.status(400).json({ 
      success: false, 
      message: error.message || 'Failed to retrieve archived folders',
      errorCode: 'GET_ARCHIVED_FAILED'
    });
  }
};

export const handleArchiveFolders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { folderIds } = req.body;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (!Array.isArray(folderIds) || folderIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'folderIds must be a non-empty array',
        errorCode: 'INVALID_INPUT'
      });
    }

    // ✅ Call NEW service function with cascade logic
    const result = await folderService.archiveFolders(folderIds, userId);

    return res.status(200).json({
      success: true,
      count: result.count,
      message: result.count > 0 
        ? `Successfully moved ${result.count} folder(s) to trash` 
        : 'No folders archived',
      data: { archivedCount: result.count }
    });
    
  } catch (error: any) {
    logger.error('❌ Archive folders failed:', error);
    return res.status(400).json({ 
      success: false, 
      message: error.message || 'Failed to archive folders',
      errorCode: 'ARCHIVE_FAILED'
    });
  }
};

// ─────────────────────────────────────────────────────────────
// ✅ NEW: RESTORE - Un-archive with Cascade
// ─────────────────────────────────────────────────────────────
export const handleRestoreFolders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { folderIds } = req.body;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (!Array.isArray(folderIds) || folderIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'folderIds must be a non-empty array',
        errorCode: 'INVALID_INPUT'
      });
    }

    // ✅ Call NEW service function with cascade logic (bukan restoreMultipleFolders legacy)
    const result = await folderService.restoreFolders(folderIds, userId);

    return res.status(200).json({
      success: true,
      count: result.count,
      message: result.count > 0 
        ? `Successfully restored ${result.count} folder(s) and all contents` 
        : 'No folders restored',
      data: { restoredCount: result.count }
    });
    
  } catch (error: any) {
    logger.error('❌ Restore folders failed:', error);
    return res.status(400).json({ 
      success: false, 
      message: error.message || 'Failed to restore folders',
      errorCode: 'RESTORE_FAILED'
    });
  }
};

// ─────────────────────────────────────────────────────────────
// ✅ NEW: PERMANENT DELETE (Destroy) - From Trash Only with Cascade
// ─────────────────────────────────────────────────────────────
export const handleDestroyFolders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { folderIds } = req.body;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (!Array.isArray(folderIds) || folderIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'folderIds must be a non-empty array',
        errorCode: 'INVALID_INPUT'
      });
    }

    // ✅ Call NEW service function with cascade + safety check (only archived items)
    const result = await folderService.destroyFolders(folderIds, userId);

    return res.status(200).json({
      success: true,
      count: result.count,
      message: result.count > 0 
        ? `Successfully permanently deleted ${result.count} folder(s) and all contents` 
        : 'No folders destroyed',
      data: { destroyedCount: result.count }
    });
    
  } catch (error: any) {
    logger.error('❌ Destroy folders failed:', error);
    return res.status(400).json({ 
      success: false, 
      message: error.message || 'Failed to permanently delete folders',
      errorCode: 'DESTROY_FAILED'
    });
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