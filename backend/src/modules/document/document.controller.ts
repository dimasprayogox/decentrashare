import { prisma } from '../../config/db';
import { Response, NextFunction } from 'express';
import { PrivacyLevel } from '@prisma/client';
import { AuthRequest } from '../../middlewares/auth.middleware';
import * as documentService from './document.service';
import blockchainService from '../blockchain/blockchain.service';
import { logger } from '../../utils/logger';
import { Readable } from 'node:stream'; 

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
    const sanitized = documentService.sanitizeDocument(document, userId);

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
// ✅ Updated handlePreviewDocument - fix stream conversion
export const handlePreviewDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id: documentId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // ✅ 1. Validate access
    const document = await documentService.validateDocumentAccess(documentId, userId);

    // ✅ 2. Fetch from Pinata
    const pinataUrl = `https://gateway.pinata.cloud/ipfs/${document.ipfsHash}`;
    const response = await fetch(pinataUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from IPFS: ${response.status}`);
    }

    // ✅ 3. Convert Web ReadableStream to Node.js Readable (untuk .pipe())
    // ⚠️ Ini fix utama: fetch().body is Web Stream, Express needs Node Stream
    const nodeStream = Readable.fromWeb(response.body!);

    // ✅ 4. Set headers for INLINE preview
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.fileName)}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // ✅ 5. Pipe Node stream to Express response
    nodeStream.pipe(res);

    // ✅ 6. Log activity (async, non-blocking)
    documentService.logDownloadActivity(userId, documentId, document.fileName, document.ipfsHash)
      .catch(err => logger.error('Failed to log preview:', err));

  } catch (error: any) {
    // ✅ Handle errors same as before
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
    
    if (res.headersSent) return; // Can't send JSON after headers sent
    res.status(500).json({ success: false, message: 'Failed to preview file' });
  }
};

// ✅ GET /api/documents/:id/download — Return binary file stream
// ✅ Updated handleDownloadDocument - same stream conversion fix
export const handleDownloadDocument = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: documentId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const document = await documentService.validateDocumentAccess(documentId, userId);

    const pinataUrl = `https://gateway.pinata.cloud/ipfs/${document.ipfsHash}`;
    const response = await fetch(pinataUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from IPFS: ${response.status}`);
    }

    // ✅ Convert Web Stream to Node Stream (same fix)
    const nodeStream = Readable.fromWeb(response.body!);

    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.fileName)}"`);
    res.setHeader('Content-Length', document.fileSize);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // ✅ Pipe Node stream
    nodeStream.pipe(res);

    // Log activity (async)
    documentService.logDownloadActivity(userId, documentId, document.fileName, document.ipfsHash)
      .catch(err => logger.error('Failed to log download:', err));

  } catch (error: any) {
    // ... same error handling as before ...
    if (error.message === 'Document not found.') {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    if (error.message.includes('Access denied')) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (error.message.includes('Failed to fetch from IPFS')) {
      return res.status(502).json({ success: false, message: 'Failed to fetch file from storage' });
    }
    
    logger.error('❌ Download error:', { documentId: req.params.id, error: error.message });
    
    if (res.headersSent) {
      return next(error);
    }
    
    res.status(500).json({ success: false, message: 'Failed to download file' });
  }
};

export const handleBulkDownloadDocuments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { documentIds = [], folderIds = [] } = req.body;
    const userId = req.user?.userId;

    // ✅ Validate input
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!Array.isArray(documentIds) || !Array.isArray(folderIds)) {
      return res.status(400).json({ success: false, message: 'documentIds and folderIds must be arrays' });
    }
    if (documentIds.length === 0 && folderIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Select at least one document or folder' });
    }
    if (documentIds.length + folderIds.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 50 items per bulk download'
      });
    }

    // ✅ 1. Get ZIP stream from service
    const { stream, finalize, metadata, summary } = await documentService.bulkDownloadDocuments({ documentIds, folderIds }, userId);

    // ✅ 2. Set headers for ZIP download
    const zipFileName = `decentrashare-export-${new Date().toISOString().slice(0, 10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipFileName)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');

    // ✅ 3. Log bulk download activity (async, non-blocking)
    documentService.logBulkDownloadActivity(userId, [...documentIds, ...folderIds], metadata, summary);

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

    finalize();

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
      folderIds: req.body?.folderIds,
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
    const files = req.files as Express.Multer.File[];
    const { folderId } = req.body;
    const userId = req.user?.userId;

    // ✅ Parse metadata array dari client
    const metadataMap = new Map<string, { title?: string; description?: string }>();
    
    if (req.body.metadata) {
      try {
        const metadataArray = JSON.parse(req.body.metadata);
        if (Array.isArray(metadataArray)) {
          metadataArray.forEach((meta: any) => {
            if (meta.fileName) {
              metadataMap.set(meta.fileName, {
                title: meta.title?.trim(),
                description: meta.description?.trim()
              });
            }
          });
        }
      } catch (e) {
        logger.warn('Failed to parse metadata from client', { error: e });
      }
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files provided. Please upload at least one document.',
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. User context missing.',
      });
    }

    // ✅ FIX 1: Destructure dengan benar (termasuk blockchainPayload & folderId)
    const { 
      results, 
      summary, 
      blockchainPayload,  // ← ✅ Tambahkan ini
      folderId: returnedFolderId  // ← ✅ Gunakan alias untuk menghindari conflict
    } = await documentService.uploadMultipleFiles(
      files, 
      userId, 
      folderId,
      metadataMap
    );

    // ✅ FIX 2: Tentukan HTTP status berdasarkan summary
    let httpStatus = 201; // Created
    let responseMessage = 'File processing completed';
    let isSuccess = true;

    if (summary.error === results.length) {
      // ❌ Semua gagal
      const firstError = results[0];
      httpStatus = firstError?.errorCode === 'FOLDER_WRITE_FORBIDDEN' ? 403 : 400;
      responseMessage = firstError?.errorCode === 'FOLDER_WRITE_FORBIDDEN'
        ? firstError.error || 'You only have viewer access to this folder'
        : 'All uploads failed';
      isSuccess = false;
    } else if (summary.duplicate > 0 && summary.uploaded === 0) {
      // ⚠️ Semua duplicate (bukan error, tapi info)
      httpStatus = 200; // OK
      responseMessage = 'All files already exist in system';
    } else if (summary.duplicate > 0 || summary.error > 0) {
      // 🟡 Partial success: ada yang uploaded + ada duplicate/error
      httpStatus = 207; // Multi-Status (RFC 4918)
      responseMessage = 'Upload completed with some notices';
    }

    // ✅ FIX 3: Build response object secara dinamis
    const responseData: any = {
      success: isSuccess,
      message: responseMessage,
      summary,
      results,
    };

    // ✅ Tambahkan blockchainPayload HANYA jika ada file yang perlu dikonfirmasi on-chain
    if (summary.uploaded > 0 && blockchainPayload && blockchainPayload.length > 0) {
      responseData.blockchainPayload = blockchainPayload;
      responseData.folderId = returnedFolderId;
    }

    // ✅ Return response yang sudah dibangun
    return res.status(httpStatus).json(responseData);
    
  } catch (error: any) {
    // ✅ Handle duplicate TITLE error (beda dengan duplicate CONTENT)
    if (error.errorCode === 'DOCUMENT_TITLE_EXISTS') {
      return res.status(409).json({
        success: false,
        message: error.message,
        errorCode: 'DOCUMENT_TITLE_EXISTS'
      });
    }
    
    // Pass other errors to global handler
    next(error);
  }
};

export const confirmDocumentOnChain = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash, blockNumber } = req.body;
    const userId = req.user?.userId;

    if (!txHash) {
      return res.status(400).json({ success: false, message: "txHash is required" });
    }

    // Verifikasi TX valid (opsional tapi recommended)
    const verification = await blockchainService.verifyTransaction(txHash);
    if (!verification.confirmed) {
      return res.status(400).json({ success: false, message: "Transaction not confirmed yet" });
    }

    // Update database
    const updated = await prisma.document.update({
      where: { id, ownerId: userId },
      data: {
        isOnChain: true,
        blockchainTx: txHash,
      }
    });

    res.json({ success: true, message: "Document recorded on blockchain", data: updated });

  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};
// ✅ TAMBAHKAN di document.controller.ts:

/**
 * POST /api/documents/batch/confirm-complete
 * Update database setelah batch transaction confirmed di blockchain
 */

export const confirmBatchComplete = async (req: AuthRequest, res: Response) => {
  try {
    const { txHash, documentIds } = req.body;
    const userId = req.user?.userId;

    if (!txHash || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'txHash and documentIds array required' 
      });
    }

    logger.info('🔗 Batch confirm request', {
      userId,
      txHash,
      documentIds,
      count: documentIds.length
    });

    // ✅ Update semua dokumen: set isOnChain = true + simpan txHash
    const result = await prisma.$transaction(async (tx) => {
      // 🔍 Debug: Cek dokumen sebelum update
      const docsBefore = await tx.document.findMany({
        where: {
          id: { in: documentIds },
          ownerId: userId
        },
        select: { id: true, isOnChain: true, pendingOnChainUntil: true }
      });
      
      logger.debug('📋 Documents before update', { docsBefore });

      const updateResult = await tx.document.updateMany({
        where: {
          id: { in: documentIds },
          ownerId: userId,  // ✅ Pastikan hanya owner yang bisa update
          isOnChain: false  // ✅ Hanya update yang belum on-chain
        },
        data: {
          isOnChain: true,
          blockchainTx: txHash,
          pendingOnChainUntil: null  // ✅ Clear pending flag
        }
      });

      logger.info('📊 Update result', { 
        count: updateResult.count,
        expected: documentIds.length 
      });

      // 🔍 Debug: Cek dokumen setelah update
      const docsAfter = await tx.document.findMany({
        where: { id: { in: documentIds } },
        select: { id: true, isOnChain: true, blockchainTx: true }
      });
      
      logger.debug('📋 Documents after update', { docsAfter });

      // Log aktivitas batch
      await tx.activityLog.createMany({
        data: documentIds.map(docId => ({
          userId,
          action: 'BLOCKCHAIN_CONFIRM_BATCH',
          entityType: 'DOCUMENT',
          entityId: docId,
          entityName: 'Batch confirmation',
          blockchainTx: txHash,
          details: `Batch of ${documentIds.length} files confirmed on-chain`
        }))
      });

      return updateResult;
    });

    // ⚠️ Warning jika count tidak match
    if (result.count !== documentIds.length) {
      logger.warn('⚠️ Batch confirm partial success', {
        updated: result.count,
        expected: documentIds.length,
        missing: documentIds.filter(id => 
          // Log which IDs weren't updated (simplified)
          true // In production, compare with docsAfter
        )
      });
    }

    return res.json({
      success: true,
      message: `${result.count}/${documentIds.length} file(s) confirmed on blockchain`,
      txHash,
      updatedCount: result.count,
      totalCount: documentIds.length
    });

  } catch (error: any) {
    logger.error('❌ Confirm batch complete failed', { 
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId,
      documentIds: req.body?.documentIds
    });
    return res.status(500).json({ 
      success: false, 
      message: error.message,
      errorCode: 'BATCH_CONFIRM_FAILED'
    });
  }
};

export const triggerBlockchainConfirmation = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;  // ← Single document ID dari URL param
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // 1. Ambil document
    const doc = await prisma.document.findUnique({
      where: { id, ownerId: userId }
    });

    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
    if (doc.isOnChain) return res.status(400).json({ success: false, message: "Already on-chain" });
    
    // 2. Cek TTL: Apakah masih dalam window 24 jam?
    if (doc.pendingOnChainUntil && new Date() > doc.pendingOnChainUntil) {
      return res.status(410).json({ 
        success: false, 
        message: "Confirmation window expired. File has been removed from storage." 
      });
    }

    // 3. Siapkan data blockchain (pakai blockchainService yang sudah ada)
    const blockchainData = blockchainService.prepareTransactionData(
      doc.ipfsHash,
      doc.fileName,
      doc.fileHash
    );

    res.json({
      success: true,
      message: "Ready for blockchain confirmation",
      data: {
        id: doc.id,
        fileName: doc.fileName,
        ipfsHash: doc.ipfsHash,
        fileHash: doc.fileHash,
        blockchainData
      }
    });

  } catch (error: any) {
    console.error("trigger-blockchain error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/documents/batch/trigger-blockchain
 * Prepare batch confirmation data for multiple documents
 */
// controllers/document.controller.ts

/**
 * POST /api/documents/batch/trigger-blockchain
 * Prepare batch confirmation data for multiple documents
 * ✅ ONLY uses blockchainService.filterNewFilesForBatch for on-chain checking
 */
export const triggerBatchBlockchainConfirmation = async (req: AuthRequest, res: Response) => {
  try {
    const { documentIds } = req.body;
    const userId = req.user?.userId;

    // Validasi input
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ success: false, message: "documentIds array required" });
    }
    if (documentIds.length > 10) {
      return res.status(400).json({ success: false, message: "Maximum 10 files per batch (gas safety)" });
    }
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // 1. Ambil dokumen dari DB
    const docs = await prisma.document.findMany({
      where: { id: { in: documentIds }, ownerId: userId }
    });

    if (docs.length === 0) {
      return res.status(404).json({ success: false, message: "No valid documents found" });
    }

    // 2. Siapkan items untuk filtering (hanya yang belum on-chain di DB)
    const items = docs
      .filter(doc => !doc.isOnChain && (!doc.pendingOnChainUntil || new Date() <= doc.pendingOnChainUntil))
      .map(doc => ({
        docId: doc.id,
        cid: doc.ipfsHash,
        fileName: doc.fileName,
        fileHash: doc.fileHash
      }));

    if (items.length === 0) {
      return res.json({
        success: true,
        skipConfirmation: true,
        message: `All ${docs.length} file(s) already confirmed on-chain or expired`
      });
    }

    // 3. ✅ FILTER via contract view function (pindah ke blockchainService)
    const { newItems, skippedCount, message } = await blockchainService.filterNewFilesForBatch(
      items,
      process.env.CONTRACT_ADDRESS
    );

    logger.info('🔍 Batch pre-check result', {
      totalRequested: items.length,
      newItems: newItems.length,
      skipped: skippedCount,
      message
    });

    // 4. Jika semua sudah on-chain, return early
    if (newItems.length === 0) {
      return res.json({
        success: true,
        skipConfirmation: true,
        message: `All ${skippedCount} file(s) already confirmed on-chain`,
        data: { docIds: items.map(i => i.docId) }
      });
    }

    // 5. Prepare batch payload HANYA untuk file baru
    const batchData = blockchainService.prepareBatchTransactionData(newItems);

    res.json({
      success: true,
      message: `Ready to confirm ${newItems.length} new file(s) on blockchain (${skippedCount} skipped)`,
      data: {
        items: batchData.items,
        docIds: newItems.map(item => 
          items.find(i => i.cid === item.cid && i.fileHash === item.fileHash)?.docId
        ).filter(Boolean) as string[],
        contractAddress: batchData.contractAddress,
        abi: batchData.abi,
        functionName: batchData.functionName,
        args: batchData.args,
        skippedCount,
        filterMessage: message
      }
    });

  } catch (error: any) {
    logger.error("❌ batch-trigger error:", {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId,
      documentIds: req.body?.documentIds
    });
    res.status(500).json({ success: false, message: error.message });
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

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid document selection. Please provide an array of IDs.",
        errorCode: 'INVALID_INPUT'
      });
    }

    if (targetFolderId !== null && targetFolderId !== undefined && typeof targetFolderId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'targetFolderId must be a string or null',
        errorCode: 'INVALID_INPUT'
      });
    }

    const result = await documentService.moveMultipleDocuments(documentIds, userId, targetFolderId ?? null);

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
      details: `Privacy level synchronized to ${result.appliedPrivacy}.`,
      data: result
    });
  } catch (error: any) {
    logger.error('❌ Move documents failed:', error);

    if (error.message?.toLowerCase().includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message,
        errorCode: 'DOCUMENT_EXISTS'
      });
    }

    if (error.message?.toLowerCase().includes('not found') || error.message?.toLowerCase().includes('permission')) {
      return res.status(404).json({
        success: false,
        message: error.message,
        errorCode: 'DOCUMENT_NOT_FOUND'
      });
    }

    return res.status(400).json({ success: false, message: error.message });
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

    return res.status(200).json({
      success: true,
      data: documents,  
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

export const handleUpdateDocumentMetadata = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (title === undefined && description === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Provide at least "title" or "description" to update',
        errorCode: 'MISSING_UPDATE_FIELDS'
      });
    }

    const document = await documentService.updateDocumentMetadata(id, userId, {
      title,
      description
    });

    const sanitized = documentService.sanitizeDocument(document, userId);

    return res.status(200).json({
      success: true,
      message: 'Document metadata updated successfully',
      data: sanitized
    });
    
  } catch (error: any) {
    // ✅ TAMBAHKAN: Handle duplicate title error (409 Conflict)
    if (error.errorCode === 'DOCUMENT_TITLE_EXISTS') {
      return res.status(409).json({ 
        success: false, 
        message: error.message,
        errorCode: 'DOCUMENT_TITLE_EXISTS'  // ← Frontend bisa deteksi ini
      });
    }
    
    // Handle not found / unauthorized
    if (error.message?.includes('not found') || error.message?.includes('unauthorized')) {
      return res.status(404).json({ 
        success: false, 
        message: error.message,
        errorCode: 'DOCUMENT_NOT_FOUND'
      });
    }
    
    // Generic error fallback
    return res.status(400).json({ 
      success: false, 
      message: error.message || 'Failed to update document',
      errorCode: 'UPDATE_FAILED'
    });
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
    
    // ✅ Pass userId agar owner bisa lihat blockchainTx miliknya sendiri
    const sanitized = data.map(item => ({
      accessId: item.accessId,
      document: documentService.sanitizeDocument(item.document, userId)  // ← ✅ Tambah userId!
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