import { Response, NextFunction } from 'express';
import { PrivacyLevel } from '@prisma/client';
import { AuthRequest } from '../../middlewares/auth.middleware';
import * as documentService from './document.service';

export const handleUpload = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { title, description } = req.body;
    const file = req.file;
    const userId = req.user?.userId;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided. Please upload a document.',
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. User context missing.',
      });
    }

    const document = await documentService.uploadFileFullFlow(file, {
      title: title || file.originalname,
      description,
      userId,
    });

    return res.status(201).json({
      success: true,
      data: document,
      message: 'Document successfully uploaded to IPFS and recorded on blockchain',
    });
  } catch (error) {
    next(error);
  }
};

export const handleGetMyDocuments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

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
 * PATCH /api/documents/:id/archive
 * Soft delete: arsipkan dokumen
 */
export const handleArchiveDocument = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const document = await documentService.archiveDocument(id, userId);

    return res.status(200).json({
      success: true,
      data: document,
      message: 'Document archived successfully',
    });
  } catch (error: any) {
    if (error.message.includes('Forbidden') || error.message.includes('not found')) {
      return res.status(error.message.includes('Forbidden') ? 403 : 404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * PATCH /api/documents/:id/restore
 * Restore dokumen yang sudah diarsipkan
 */
export const handleRestoreDocument = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const document = await documentService.restoreDocument(id, userId);

    return res.status(200).json({
      success: true,
      data: document,
      message: 'Document restored successfully',
    });
  } catch (error: any) {
    if (error.message.includes('Forbidden') || error.message.includes('not found')) {
      return res.status(error.message.includes('Forbidden') ? 403 : 404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * PATCH /api/documents/:id/privacy
 * Ubah level privasi dokumen
 */
export const handleUpdatePrivacy = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { privacy } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const validPrivacyLevels = Object.values(PrivacyLevel);
    if (!privacy || !validPrivacyLevels.includes(privacy)) {
      return res.status(400).json({
        success: false,
        message: `Invalid privacy level. Valid values: ${validPrivacyLevels.join(', ')}`,
      });
    }

    const document = await documentService.updatePrivacy(id, userId, privacy as PrivacyLevel);

    return res.status(200).json({
      success: true,
      data: document,
      message: `Document privacy updated to "${privacy}"`,
    });
  } catch (error: any) {
    if (error.message.includes('Forbidden') || error.message.includes('not found')) {
      return res.status(error.message.includes('Forbidden') ? 403 : 404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
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