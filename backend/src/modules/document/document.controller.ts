import { Response, NextFunction } from 'express';
import { PrivacyLevel } from '@prisma/client';
import { AuthRequest } from '../../middlewares/auth.middleware';
import * as documentService from './document.service';


/**
 * GET /api/documents/:id
 * Fetches document details with hybrid access validation
 */
export const handleGetDocumentDetail = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized. Please provide a valid token.' 
      });
    }

    // Execute the hybrid access validation service
    const document = await documentService.validateDocumentAccess(id, userId);

    return res.status(200).json({
      success: true,
      message: 'Document details retrieved successfully.',
      data: document
    });
  } catch (error: any) {
    // Use 403 Forbidden for access denials
    return res.status(403).json({ 
      success: false, 
      message: error.message 
    });
  }
};

export const handleUpload = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const files = req.files as Express.Multer.File[]; // Menggunakan req.files untuk multi-upload
    const { folderId } = req.body;
    const userId = req.user?.userId;

    // 1) Validasi file wajib ada
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files provided. Please upload at least one document.',
      });
    }

    // 2) Validasi user ID
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. User context missing.',
      });
    }

    // 3) Panggil service untuk proses multi-upload (Hash -> IPFS -> Chain -> DB)
    const results = await documentService.uploadMultipleFiles(files, userId, folderId);

    return res.status(201).json({
      success: true,
      message: 'File processing completed',
      results, // Mengembalikan array status per file (sukses/gagal/duplikat)
    });
  } catch (error) {
    next(error);
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

    const documents = await documentService.getRootDocuments(userId);
    return res.status(200).json({ success: true, data: documents });
  } catch (error) { next(error); }
};

/**
 * PATCH /api/documents/bulk-move
 * Memindahkan banyak dokumen sekaligus
 */
export const handleMoveMultipleDocuments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { documentIds, targetFolderId } = req.body; // documentIds: ["uuid1", "uuid2"]
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'documentIds must be a non-empty array' });
    }

    const result = await documentService.moveMultipleDocuments(documentIds, userId, targetFolderId);

    return res.status(200).json({
      success: true,
      message: `Successfully moved ${result.count} documents`,
      data: result
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/documents/me
 * Mengambil daftar dokumen milik user (yang tidak diarsipkan secara default)
 */
export const handleGetMyDocuments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const documents = await documentService.getUserDocuments(userId);

    return res.status(200).json({
      success: true,
      data: documents,
      message: "User documents fetched successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/documents/bulk-archive
 * Mengarsipkan banyak dokumen sekaligus
 */
export const handleArchiveMultipleDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const { documentIds } = req.body;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'documentIds must be a non-empty array' });
    }

    const result = await documentService.archiveMultipleDocuments(documentIds, userId);

    return res.status(200).json({
      success: true,
      message: `Successfully archived ${result.count} documents`,
      data: result
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/documents/bulk-restore
 * Mengembalikan banyak dokumen dari arsip
 */
export const handleRestoreMultipleDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const { documentIds } = req.body;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const result = await documentService.restoreMultipleDocuments(documentIds, userId);

    return res.status(200).json({
      success: true,
      message: `Successfully restored ${result.count} documents`,
      data: result
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * PATCH /api/documents/:id/rename
 * Mengubah judul dokumen
 */
export const handleRenameDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!title) return res.status(400).json({ success: false, message: 'New title is required' });

    const document = await documentService.renameDocument(id, userId, title);

    return res.status(200).json({
      success: true,
      message: 'Document renamed successfully',
      data: document
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const handleUpdateMultipleDocumentsPrivacy = async (req: AuthRequest, res: Response) => {
  try {
    const { updates } = req.body;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!Array.isArray(updates)) return res.status(400).json({ message: 'Format data harus array updates' });

    const result = await documentService.updateMultipleDocumentsPrivacy(updates, userId);

    return res.status(200).json({
      success: true,
      message: `Berhasil memperbarui ${result.updatedCount} dokumen.`,
      data: result
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/documents/:id/share
 * Bagikan dokumen ke user tertentu berdasarkan username
 */
export const handleShareToUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { username } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Target username is required.',
      });
    }

    const access = await documentService.shareToUser(id, userId, username);

    return res.status(201).json({
      success: true,
      data: access,
      message: `Document shared with user "${username}" successfully`,
    });
  } catch (error: any) {
    const status =
      error.message.includes('Forbidden') ? 403 :
      error.message.includes('not found') || error.message.includes('not found') ? 404 :
      error.message.includes('already shared') ? 409 : 400;

    if (status !== 400 || error.message.includes('yourself') || error.message.includes('already shared')) {
      return res.status(status).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * DELETE /api/documents/:id/share
 * Cabut akses dokumen dari user tertentu
 */
export const handleRevokeAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { username } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Target username is required.',
      });
    }

    const result = await documentService.revokeAccess(id, userId, username);

    return res.status(200).json({
      success: true,
      data: result,
      message: `Access revoked from user "${username}" successfully`,
    });
  } catch (error: any) {
    const status =
      error.message.includes('Forbidden') ? 403 :
      error.message.includes('not found') ? 404 : 400;

    return res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * GET /api/documents/:id/share
 * Lihat daftar user yang memiliki akses ke dokumen
 */
export const handleGetSharedUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const sharedUsers = await documentService.getSharedUsers(id, userId);

    return res.status(200).json({
      success: true,
      data: sharedUsers,
      message: 'Shared users fetched successfully',
    });
  } catch (error: any) {
    const status =
      error.message.includes('Forbidden') ? 403 :
      error.message.includes('not found') ? 404 : 500;

    return res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

export const handleGetAllDocumentsAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await documentService.getAllDocumentsForAdmin()
    return res.status(200).json({ success: true, data })
  } catch (error) {
    next(error)
  }
}

export const handleGetSystemStatsAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await documentService.getSystemStatsForAdmin()
    return res.status(200).json({ success: true, data })
  } catch (error) {
    next(error)
  }
}