import { Response, NextFunction } from 'express';
import { PrivacyLevel } from '@prisma/client';
import { AuthRequest } from '../../middlewares/auth.middleware';
import * as documentService from './document.service';
import { logger } from '../../utils/logger';
import * as archiverModule from 'archiver';
const archiver = (archiverModule as any).default || archiverModule;

/**
 * GET /api/documents/:id
 * Fetches document details with hybrid access validation
 */
// ✅ Update handleGetDocumentDetail:
export const handleGetDocumentDetail = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const document = await documentService.validateDocumentAccess(id, userId);

    // ✅ SANITIZE: Jangan expose ipfsHash untuk private files
    const isPrivate = document.privacy === 'PRIVATE' || document.privacy === 'SPECIFIC_USER';
    
    const sanitized = {
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      privacy: document.privacy,  // ← Frontend butuh ini untuk conditional URL
      ownerId: document.ownerId,
      // ❌ JANGAN include ipfsHash untuk private files!
      ipfsHash: isPrivate ? undefined : document.ipfsHash,  // ← ✅ Hide if private
      // ❌ JANGAN include sensitive fields: fileHash, blockchainTx, description (if sensitive)
    };

    return res.status(200).json({
      success: true,
      message: 'Document details retrieved successfully.',
      data: sanitized  
    });

  } catch (error: any) {
    if (error.message === 'Document not found.') {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    if (error.message === 'Document is in trash.') {
      return res.status(410).json({ success: false, message: 'Document has been archived' });
    }
    if (error.message.includes('Access denied')) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ✅ NEW: handlePreviewDocument — Secure proxy for PRIVATE/SPECIFIC_USER
export const handlePreviewDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id: documentId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // ✅ 1. Validate access (reuse your existing function!)
    const document = await documentService.validateDocumentAccess(documentId, userId);

    // ✅ 2. Fetch from Pinata (use private gateway if available)
    const pinataUrl = `https://gateway.pinata.cloud/ipfs/${document.ipfsHash}`;
    const response = await fetch(pinataUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from IPFS: ${response.status}`);
    }

    // ✅ 3. Set headers for INLINE preview (not download)
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.fileName)}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // ✅ 4. Stream file to client
    response.body?.pipe(res);

    // ✅ 5. Log activity (async, non-blocking)
    documentService.logDownloadActivity(userId, documentId, document.fileName, document.ipfsHash)
      .catch(err => logger.error('Failed to log preview:', err));

  } catch (error: any) {
    // ✅ Handle errors same as other endpoints
    if (error.message === 'Document not found.') {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    if (error.message.includes('Access denied')) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (error.message.includes('Failed to fetch from IPFS')) {
      return res.status(502).json({ success: false, message: 'Failed to load file' });
    }
    logger.error('❌ Preview error:', { documentId: req.params.id, error: error.message });
    res.status(500).json({ success: false, message: 'Failed to preview file' });
  }
};

// ✅ GET /api/documents/:id/download — Return binary file stream
export const handleDownloadDocument = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: documentId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // ✅ 1. Get file stream from service (validates access + fetches from IPFS)
    const { stream, metadata } = await documentService.getDocumentStreamForDownload(documentId, userId);
    
    if (!stream) {
      throw new Error('Failed to get file stream');
    }

    // ✅ 2. Set headers for file download
    res.setHeader('Content-Type', metadata.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(metadata.fileName)}"`);
    res.setHeader('Content-Length', metadata.fileSize);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // ✅ 3. Log download activity (async, non-blocking)
    documentService.logDownloadActivity(userId, documentId, metadata.fileName, '');

    // ✅ 4. Pipe the stream directly to response (memory efficient)
    stream.pipe(res);
    
    // ✅ 5. Handle stream errors
    stream.on('error', (err: any) => {
      logger.error('❌ Stream error during download', { documentId, error: err.message });
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Failed to stream file' });
      } else {
        res.end();
      }
    });

  } catch (error: any) {
    // ✅ Handle known errors with appropriate HTTP status
    if (error.message === 'Document not found.') {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    if (error.message === 'Document is in trash.') {
      return res.status(410).json({ success: false, message: 'Document has been archived' });
    }
    if (error.message.includes('Access denied') || error.message.includes('permission')) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (error.message.includes('Failed to fetch file from IPFS')) {
      return res.status(502).json({ success: false, message: 'Failed to fetch file from storage' });
    }
    
    // ✅ Log and pass unknown errors
    logger.error('❌ Download error:', { 
      documentId: req.params.id, 
      userId: req.user?.userId,
      error: error.message 
    });
    
    // If headers already sent, can't send JSON error
    if (res.headersSent) {
      return next(error);
    }
    
    res.status(500).json({ success: false, message: 'Failed to download file' });
  }
};

export const handleBulkDownloadDocuments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { documentIds } = req.body;
    const userId = req.user?.userId;

    // ✅ Validate input
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'documentIds array is required' });
    }
    if (documentIds.length > 50) {
      return res.status(400).json({ 
        success: false, 
        message: 'Maximum 50 documents per bulk download' 
      });
    }

    // ✅ 1. Get ZIP stream from service
    const { stream, metadata, summary } = await documentService.bulkDownloadDocuments(documentIds, userId);

    // ✅ 2. Set headers for ZIP download
    const zipFileName = `decentrashare-export-${new Date().toISOString().slice(0, 10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipFileName)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');

    // ✅ 3. Log bulk download activity (async, non-blocking)
    documentService.logBulkDownloadActivity(userId, documentIds, metadata, summary);

    // ✅ 4. Pipe ZIP stream to response
    stream.pipe(res);

    // ✅ 5. Handle stream completion
    stream.on('end', () => {
      logger.info('✅ Bulk download completed', {
        userId,
        documentCount: metadata.length,
        summary
      });
    });

    // ✅ 6. Handle stream errors
    stream.on('error', (err: any) => {
      logger.error('❌ ZIP stream error during bulk download', {
        userId,
        error: err.message
      });
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Failed to create download archive' });
      }
    });

  } catch (error: any) {
    // ✅ Handle known errors
    if (error.message === 'No documents specified for download') {
      return res.status(400).json({ success: false, message: 'No documents specified' });
    }
    if (error.message === 'Access denied for all selected documents') {
      return res.status(403).json({ success: false, message: 'Access denied for all selected documents' });
    }
    
    // ✅ Log and handle unknown errors
    logger.error('❌ Bulk download error:', {
      userId: req.user?.userId,
      documentIds: req.body?.documentIds,
      error: error.message,
      stack: error.stack
    });

    if (res.headersSent) {
      return next(error);
    }
    
    res.status(500).json({ success: false, message: 'Failed to prepare bulk download' });
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
export const handleGetRootDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const documents = await documentService.getRootDocuments(userId);
    
    // ✅ SANITIZE before sending to client
    const sanitized = documentService.sanitizeDocuments(documents);
    
    return res.status(200).json({ success: true, data: sanitized });
  } catch (error) { 
    next(error); 
  }
};

export const handleMoveDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const { documentIds, targetFolderId } = req.body;
    const userId = req.user?.userId;

    if (!documentIds || !Array.isArray(documentIds)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid document selection. Please provide an array of IDs." 
      });
    }

    const result = await documentService.moveMultipleDocuments(documentIds, userId!, targetFolderId);

    // Kalo count 0, berarti ada yang gak beres (bukan owner atau ID typo)
    if (result.count === 0) {
      return res.status(403).json({
        success: false,
        message: "Failed to move documents.",
        reason: "Documents not found or you are not the authorized owner."
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: `Successfully moved ${result.count} documents to ${result.location}.`,
      details: `Privacy level synchronized to ${result.appliedPrivacy}.`
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/documents/me
 * Mengambil daftar dokumen milik user (yang tidak diarsipkan secara default)
 */
export const handleGetMyDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    let { folderId } = req.query;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const cleanFolderId = (folderId === 'null' || folderId === 'undefined' || !folderId) 
      ? null 
      : String(folderId);

    const documents = await documentService.getUserDocuments(userId, cleanFolderId);
    
    // ✅ SANITIZE before sending to client
    const sanitized = documentService.sanitizeDocuments(documents);

    return res.status(200).json({
      success: true,
      data: sanitized,  // ← ✅ Sanitized!
      message: "User documents fetched successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const handleArchiveDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const { documentIds } = req.body;
    const userId = req.user?.userId;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide an array of document IDs." 
      });
    }

    const result = await documentService.archiveDocuments(documentIds, userId!);

    return res.status(200).json({
      success: true,
      message: `${result.count} documents moved to Trash.`,
      data: result
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// 1. Handle Get Archived Documents
export const handleGetArchivedDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const archived = await documentService.getArchivedDocuments(userId!);
    
    // ✅ SANITIZE before sending to client
    const sanitized = documentService.sanitizeDocuments(archived);

    return res.status(200).json({
      success: true,
      message: "Archived documents retrieved successfully.",
      data: sanitized  // ← ✅ Sanitized!
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const handleRestoreDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const { documentIds } = req.body;
    const userId = req.user?.userId;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Pilih setidaknya satu dokumen untuk dikembalikan." 
      });
    }

    const result = await documentService.restoreDocuments(documentIds, userId!);

    return res.status(200).json({
      success: true,
      message: `${result.count} dokumen berhasil dikembalikan ke daftar utama.`,
      data: result
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const handlePermanentDelete = async (req: AuthRequest, res: Response) => {
  try {
    const { documentIds } = req.body;
    const userId = req.user?.userId;

    if (!documentIds || !Array.isArray(documentIds)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid input. 'documentIds' must be an array of strings." 
      });
    }

    const result = await documentService.destroyMultipleDocuments(documentIds, userId!);

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        message: "No documents found in trash or you lack permission to delete them."
      });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully purged ${result.count} documents from the system.`,
      details: "Blockchain metadata has been moved to the audit logs for future verification."
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


export const handleUpdateDocumentPrivacy = async (req: AuthRequest, res: Response) => {
  try {
    const { updates } = req.body;
    const userId = req.user?.userId;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid format. 'updates' must be a non-empty array." 
      });
    }

    const data = await documentService.updateDocumentsPrivacy(userId!, updates);

    return res.status(200).json({
      success: true,
      message: "Documents privacy levels updated and cleaned up.",
      data
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const handleShareDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const { shares } = req.body;
    const userId = req.user?.userId;

    if (!Array.isArray(shares)) {
      return res.status(400).json({ success: false, message: 'Invalid format. Expected an array of shares.' });
    }

    const result = await documentService.shareDocumentsToUsers(userId!, shares);

    return res.status(200).json({
      success: true,
      message: 'Processing complete. Documents privacy updated to SPECIFIC_USER.',
      data: result
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const handleRevokeAccess = async (req: AuthRequest, res: Response) => {
  try {
    const { revokes } = req.body;
    const userId = req.user?.userId;

    if (!Array.isArray(revokes)) {
      return res.status(400).json({ success: false, message: 'Invalid format. Expected an array of revokes.' });
    }

    const result = await documentService.revokeDocumentsAccess(userId!, revokes);

    return res.status(200).json({
      success: true,
      message: 'Access revocation complete.',
      data: result
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/documents/:id/share
 * Lihat daftar user yang memiliki akses ke dokumen
 */
export const handleGetSharedUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { documentIds } = req.body; // Pastikan ini array dari Insomnia
    const userId = req.user?.userId;

    if (!Array.isArray(documentIds)) {
      return res.status(400).json({ success: false, message: "documentIds must be an array." });
    }

    const data = await documentService.getDocumentsSharedUsers(documentIds, userId!);

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
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

export const handleGetSharedWithMe = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const data = await documentService.getSharedWithMeDocuments(userId!);
    
    // ✅ SANITIZE nested documents
    const sanitized = data.map(item => ({
      accessId: item.accessId,
      document: documentService.sanitizeDocument(item.document)  // ← ✅ Sanitize nested!
    }));

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved documents shared with you.",
      data: sanitized
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const handleGetActivityLogs = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const logs = await documentService.getActivityLogs(userId);

    return res.status(200).json({
      success: true,
      message: "Activity logs retrieved successfully.",
      data: logs
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};