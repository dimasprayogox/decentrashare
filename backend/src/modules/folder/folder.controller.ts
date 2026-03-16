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
    const { name } = req.body;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!name) return res.status(400).json({ success: false, message: 'Folder name is required' });

    const folder = await folderService.createFolder(name, userId);

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
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const folders = await folderService.getUserFolders(userId);

    return res.status(200).json({
      success: true,
      data: folders,
    });
  } catch (error) {
    next(error);
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

/**
 * GET /api/documents/root
 * Mengambil file yang tidak berada dalam folder
 */
export const handleGetRootDocuments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const documents = await folderService.getRootDocuments(userId);
    return res.status(200).json({ success: true, data: documents });
  } catch (error) { next(error); }
};

/**
 * PATCH /api/documents/bulk-move
 * Memindahkan banyak dokumen sekaligus
 */
export const handleMoveMultipleDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const { documentIds, targetFolderId } = req.body;
    
    // Gunakan fallback jika salah satu nama field berbeda
    const userId = req.user?.userId || req.user?.id; 

    console.log("DEBUG CONTROLLER:", { userId, targetFolderId }); // Cek di terminal!

    if (!userId) return res.status(401).json({ success: false, message: "User not authenticated" });

    // PASTIKAN URUTANNYA: (documentIds, userId, targetFolderId)
    const result = await folderService.moveMultipleDocuments(
      documentIds, 
      userId, 
      targetFolderId
    );

    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};


export const handleShareFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { shares } = req.body;
    const userId = req.user?.userId;

    const results = await folderService.shareFolderToMultipleUsers(id, userId!, shares);

    // Cek apakah ada yang berhasil
    const anySuccess = results.some(r => r.success);
    
    return res.status(anySuccess ? 201 : 400).json({ 
      success: anySuccess, 
      message: anySuccess ? 'Process completed' : 'No new access granted (users might already have access)', 
      results 
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const handleUpdateMultipleFolderAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // folderId
    const { updates } = req.body; // Mengharapkan array: [{targetUserId: "...", newRole: "..."}]
    const userId = req.user?.userId;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Updates must be a non-empty array of objects' 
      });
    }

    const results = await folderService.updateMultipleFolderAccessRoles(id, userId!, updates);

    return res.status(200).json({
      success: true,
      message: 'Batch update completed',
      results
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/folders/:id/shared-users
 */
export const handleGetSharedUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // Ambil folderId dari URL
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const sharedUsers = await folderService.getSharedUsers(id, userId);

    return res.status(200).json({
      success: true,
      data: sharedUsers,
    });
  } catch (error: any) {
    res.status(403).json({ success: false, message: error.message });
  }
};

export const handleRevokeMultipleFolderAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // folderId
    const { targetUserIds } = req.body; // Array of IDs
    const userId = req.user?.userId;

    if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'targetUserIds must be a non-empty array' 
      });
    }

    const result = await folderService.revokeMultipleFolderAccess(id, userId!, targetUserIds);

    return res.status(200).json({
      success: true,
      ...result
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
    const { id } = req.params;
    const { privacy } = req.body; // PRIVATE, PUBLIC, LINK_ONLY, SPECIFIC_USER
    const userId = req.user?.userId;

    const folder = await folderService.updateFolderPrivacy(id, userId!, privacy);
    
    return res.status(200).json({
      success: true,
      data: {
        id: folder.id,
        privacy: folder.privacy,
        shareLink: folder.shareToken ? `/shared/folder/${folder.shareToken}` : null
      }
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