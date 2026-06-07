import { prisma } from '../../config/db';
import { getAllDescendantFolderIds } from '../folder/folder.service';
import { pinata } from '../../config/pinata';
import { logger } from '../../utils/logger';
import { Prisma, PrivacyLevel } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { generateFileHash } from '../../utils/hash';
import blockchainService from '../blockchain/blockchain.service';
import { createUserPinGroup } from '../pinata/pinata.service';
import { ZipArchive } from 'archiver';

/**
 * Sanitize document object for API response
 * - ipfsHash: ALWAYS hidden (never exposed to client)
 * - blockchainTx: visible to owner OR if file is PUBLIC/LINK_ONLY
 */
export const sanitizeDocument = (doc: any, currentUserId?: string) => {
  const isPrivate = doc.privacy === 'PRIVATE' || doc.privacy === 'SPECIFIC_USER';
  const isOwner = currentUserId && doc.ownerId === currentUserId;
  
  return {
    id: doc.id,
    title: doc.title,
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    mimeType: doc.mimeType,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    privacy: doc.privacy,
    ownerId: doc.ownerId,
    folderId: doc.folderId,

    ipfsHash: undefined,

    blockchainTx: (currentUserId || !isPrivate) ? doc.blockchainTx : undefined,
    isOnChain: doc.isOnChain,
    pendingOnChainUntil: isOwner ? doc.pendingOnChainUntil : undefined,
    cleanupStatus: isOwner ? doc.cleanupStatus : undefined,

    owner: doc.owner ? {
      id: doc.owner.id,
      username: doc.owner.username,
      walletAddress: doc.owner.walletAddress,
      avatarUrl: doc.owner.avatarUrl
    } : undefined,
    
    folder: doc.folder ? {
      id: doc.folder.id,
      name: doc.folder.name,
      privacy: doc.folder.privacy
    } : undefined,
    
    description: doc.description ?? null,
  };
};

export const sanitizeDocuments = (docs: any[], currentUserId?: string) => {
  return docs.map(doc => sanitizeDocument(doc, currentUserId));
};


const formatTitle = (originalName: string): string => {
  // Hanya mengambil nama file asli tanpa .ekstensi
  return path.parse(originalName).name;
};
/**
 * Validates document access based on ownership, folder inheritance, and direct sharing.
 * Implements a hybrid access control model.
 */
export const validateDocumentAccess = async (documentId: string, userId: string) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      owner: {
        select: {
          id: true,
          username: true,
          walletAddress: true,
          avatarUrl: true
        }
      },
      folder: true,
      sharedWith: true // Check file-level permissions
    }
  });

  if (!document) {
    throw new Error("Document not found.");
  }

  // 1. Owner Access: The creator always has full access, including files in Trash
  if (document.ownerId === userId) {
    return document;
  }

  if (document.isArchived) {
    throw new Error("Document is in trash.");
  }

  if (document.privacy === 'PRIVATE') {
    throw new Error("Access denied. You do not have permission to view this document.");
  }

  // 2. Folder Inheritance: Check if the containing folder or its ancestors grant access
  let hasFolderAccess = false;
  if (document.folderId) {
    try {
      await validateFolderAccess(document.folderId, userId);
      hasFolderAccess = true;
    } catch {
      hasFolderAccess = false;
    }
  }

  if (hasFolderAccess) {
    return document;
  }

  // 3. Direct Document Access: Check specific file sharing or public status
  const hasDirectAccess = document.sharedWith.some(
    (access) => access.userId === userId
  );
  
  if (hasDirectAccess || document.privacy === 'PUBLIC') {
    return document;
  }

  // 4. Unauthorized
  throw new Error("Access denied. You do not have permission to view this document.");
};

export const getDocumentStreamForDownload = async (documentId: string, userId: string) => {
  // ✅ 1. Validate access first (reuse your existing function!)
  const document = await validateDocumentAccess(documentId, userId);
  
  // ✅ 2. Get file from Pinata/IPFS Gateway
  const pinataUrl = `https://gateway.pinata.cloud/ipfs/${document.ipfsHash}`;
  
  try {
    // ✅ 3. Fetch the file as a stream (memory efficient)
    const response = await fetch(pinataUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch file from IPFS: ${response.status}`);
    }
    
    // ✅ 4. Return stream + metadata
    return {
      stream: response.body, // Node.js ReadableStream
      metadata: {
        fileName: document.fileName,
        mimeType: document.mimeType,
        fileSize: document.fileSize
      }
    };
    
  } catch (error: any) {
    logger.error('❌ Error getting document stream for download', {
      documentId,
      ipfsHash: document.ipfsHash,
      error: error.message
    });
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────
// ✅ HELPER: logDownloadActivity — Async logging (non-blocking)
// ─────────────────────────────────────────────────────────────
export const logDownloadActivity = async (
  userId: string,
  documentId: string,
  fileName: string,
  ipfsHash: string
) => {
  try {
    await prisma.activityLog.create({
      data: {
        userId,
        action: 'DOWNLOAD',
        entityType: 'DOCUMENT',
        entityId: documentId,
        entityName: fileName,
        ipfsHash,
        details: `File downloaded: ${fileName}`
      }
    });
  } catch (error: any) {
    // Don't throw — logging failure shouldn't break download
    logger.error('❌ Failed to log download activity', { documentId, error: error.message });
  }
};

type ArchiveDocument = {
  id: string;
  title: string;
  fileName: string;
  ipfsHash: string;
  folderId?: string | null;
  archivePath?: string;
};

type BulkDownloadInput = string[] | {
  documentIds?: string[];
  folderIds?: string[];
};

const sanitizeArchiveSegment = (value: string) =>
  value.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 200) || 'untitled';

const ensureUniqueArchivePath = (filePath: string, usedPaths: Set<string>) => {
  const normalized = filePath.replace(/\\/g, '/');
  if (!usedPaths.has(normalized)) {
    usedPaths.add(normalized);
    return normalized;
  }

  const parts = normalized.split('/');
  const fileName = parts.pop() || 'file';
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : '';
  let counter = 1;
  let candidate = normalized;

  do {
    candidate = [...parts, `${baseName} (${counter})${extension}`].filter(Boolean).join('/');
    counter += 1;
  } while (usedPaths.has(candidate));

  usedPaths.add(candidate);
  return candidate;
};

const validateFolderAccess = async (folderId: string, userId: string, requiredRole?: 'EDITOR') => {
  const createAccessError = (message: string, status = 403, errorCode = 'FOLDER_ACCESS_DENIED') => {
    const error: any = new Error(message);
    error.status = status;
    error.errorCode = errorCode;
    return error;
  };

  let currentFolderId: string | null = folderId;
  let requestedFolder: any = null;

  while (currentFolderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: currentFolderId },
      include: { sharedWith: true }
    });

    if (!folder) {
      throw createAccessError('Folder not found.', 404, 'FOLDER_NOT_FOUND');
    }

    if (!requestedFolder) requestedFolder = folder;

    if (folder.isArchived) {
      throw createAccessError('Folder is in trash.', 410, 'FOLDER_ARCHIVED');
    }

    if (folder.ownerId === userId) {
      return requestedFolder;
    }

    const access = folder.sharedWith.find((access: any) => access.userId === userId);
    if (requiredRole === 'EDITOR') {
      if (['EDITOR', 'ADMIN'].includes(access?.role || '')) return requestedFolder;
      if (access?.role === 'VIEWER') {
        throw createAccessError(
          'You only have viewer access to this folder',
          403,
          'FOLDER_WRITE_FORBIDDEN'
        );
      }
    } else if (access || folder.privacy === 'PUBLIC') {
      return requestedFolder;
    }

    currentFolderId = folder.parentId;
  }

  throw createAccessError('Access denied. You do not have permission to view this folder.');
};

const getDescendantFolders = async (rootFolderIds: string[]) => {
  const allIds = new Set(rootFolderIds);
  let currentLevelIds = [...rootFolderIds];

  while (currentLevelIds.length > 0) {
    const children = await prisma.folder.findMany({
      where: {
        parentId: { in: currentLevelIds },
        isArchived: false
      },
      select: { id: true }
    });

    const newIds = children.map((child: any) => child.id).filter((id: string) => !allIds.has(id));
    if (newIds.length === 0) break;

    newIds.forEach((id: string) => allIds.add(id));
    currentLevelIds = newIds;
  }

  return Array.from(allIds);
};

const buildFolderArchivePaths = (folders: any[], rootFolders: any[]) => {
  const folderMap = new Map(folders.map((folder: any) => [folder.id, folder]));
  const rootIds = new Set(rootFolders.map((folder: any) => folder.id));
  const pathCache = new Map<string, string>();

  const resolvePath = (folderId: string): string => {
    if (pathCache.has(folderId)) return pathCache.get(folderId)!;

    const folder = folderMap.get(folderId);
    if (!folder) return '';

    const name = sanitizeArchiveSegment(folder.name);
    if (rootIds.has(folder.id) || !folder.parentId || !folderMap.has(folder.parentId)) {
      pathCache.set(folderId, name);
      return name;
    }

    const parentPath = resolvePath(folder.parentId);
    const pathValue = parentPath ? `${parentPath}/${name}` : name;
    pathCache.set(folderId, pathValue);
    return pathValue;
  };

  folders.forEach((folder: any) => resolvePath(folder.id));
  return pathCache;
};

export const createDocumentsArchive = async (documents: ArchiveDocument[], emptyFolderPaths: string[] = []) => {
  if (documents.length === 0 && emptyFolderPaths.length === 0) {
    throw new Error('No documents specified for download');
  }

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const usedPaths = new Set<string>();
  let successfullyAdded = 0;
  let fetchFailed = 0;

  archive.on('error', (err: any) => {
    logger.error('❌ ZIP archive error', { error: err.message });
  });

  for (const folderPath of emptyFolderPaths) {
    const safePath = folderPath.split('/').map(sanitizeArchiveSegment).join('/');
    archive.append('', { name: ensureUniqueArchivePath(`${safePath}/.keep`, usedPaths) });
  }

  for (const doc of documents) {
    try {
      const response = await fetch(`https://gateway.pinata.cloud/ipfs/${doc.ipfsHash}`);

      if (!response.ok || !response.body) {
        fetchFailed += 1;
        logger.warn('⚠️ Failed to fetch file for ZIP', {
          documentId: doc.id,
          ipfsHash: doc.ipfsHash,
          status: response?.status
        });
        continue;
      }

      const safeFileName = sanitizeArchiveSegment(doc.fileName);
      const archivePath = ensureUniqueArchivePath(
        doc.archivePath ? `${doc.archivePath}/${safeFileName}` : safeFileName,
        usedPaths
      );

      archive.append(Readable.fromWeb(response.body), { name: archivePath });
      successfullyAdded += 1;
    } catch (error: any) {
      fetchFailed += 1;
      logger.warn('⚠️ Error adding file to ZIP', {
        documentId: doc.id,
        error: error.message
      });
    }
  }

  const finalize = () => archive.finalize();

  const metadata = documents.map(doc => ({
    id: doc.id,
    title: doc.title,
    fileName: doc.fileName,
    ipfsHash: doc.ipfsHash
  }));

  return {
    stream: archive,
    finalize,
    metadata,
    summary: {
      totalRequested: documents.length,
      successfullyAdded,
      accessDenied: 0,
      fetchFailed
    }
  };
};

export const prepareFolderArchive = async (folderId: string, userId: string) => {
  const rootFolder = await validateFolderAccess(folderId, userId);
  const folderIds = await getDescendantFolders([folderId]);
  const folders = await prisma.folder.findMany({
    where: { id: { in: folderIds }, isArchived: false },
    select: { id: true, name: true, parentId: true }
  });
  const folderPaths = buildFolderArchivePaths(folders, [rootFolder]);

  const documents = await prisma.document.findMany({
    where: {
      folderId: { in: folderIds },
      isArchived: false
    },
    select: { id: true, title: true, fileName: true, ipfsHash: true, folderId: true }
  });

  const archiveDocuments = documents.map((doc: any) => ({
    ...doc,
    archivePath: doc.folderId ? folderPaths.get(doc.folderId) : undefined
  }));

  const folderPathsWithFiles = new Set(archiveDocuments.map((doc: any) => doc.archivePath).filter(Boolean));
  const emptyFolderPaths = Array.from(folderPaths.values()).filter((folderPath) => !folderPathsWithFiles.has(folderPath));
  const archive = await createDocumentsArchive(archiveDocuments, emptyFolderPaths);

  return {
    ...archive,
    folderName: rootFolder.name
  };
};

export const bulkDownloadDocuments = async (input: BulkDownloadInput, userId: string) => {
  const documentIds = Array.isArray(input) ? input : input.documentIds ?? [];
  const folderIds = Array.isArray(input) ? [] : input.folderIds ?? [];

  if (documentIds.length === 0 && folderIds.length === 0) {
    throw new Error('No documents specified for download');
  }

  const accessibleDocs: ArchiveDocument[] = [];
  const deniedDocs = [];
  const selectedDocumentIds = new Set<string>();

  for (const docId of documentIds) {
    try {
      const doc = await validateDocumentAccess(docId, userId);
      if (!selectedDocumentIds.has(doc.id)) {
        selectedDocumentIds.add(doc.id);
        accessibleDocs.push(doc);
      }
    } catch (error: any) {
      logger.warn('⚠️ Bulk download: Access denied for document', {
        documentId: docId,
        userId,
        reason: error.message
      });
      deniedDocs.push({ id: docId, reason: error.message });
    }
  }

  const accessibleFolders = [];
  for (const folderId of folderIds) {
    try {
      accessibleFolders.push(await validateFolderAccess(folderId, userId));
    } catch (error: any) {
      logger.warn('⚠️ Bulk download: Access denied for folder', {
        folderId,
        userId,
        reason: error.message
      });
      deniedDocs.push({ id: folderId, reason: error.message });
    }
  }

  const rootFolderIds = accessibleFolders.map((folder: any) => folder.id);
  const emptyFolderPaths: string[] = [];

  if (rootFolderIds.length > 0) {
    const descendantFolderIds = await getDescendantFolders(rootFolderIds);
    const folders = await prisma.folder.findMany({
      where: { id: { in: descendantFolderIds }, isArchived: false },
      select: { id: true, name: true, parentId: true }
    });
    const folderPaths = buildFolderArchivePaths(folders, accessibleFolders);

    const folderDocuments = await prisma.document.findMany({
      where: {
        folderId: { in: descendantFolderIds },
        isArchived: false
      },
      select: { id: true, title: true, fileName: true, ipfsHash: true, folderId: true }
    });

    for (const doc of folderDocuments) {
      if (selectedDocumentIds.has(doc.id)) continue;
      selectedDocumentIds.add(doc.id);
      accessibleDocs.push({
        ...doc,
        archivePath: doc.folderId ? folderPaths.get(doc.folderId) : undefined
      });
    }

    const folderPathsWithFiles = new Set(
      accessibleDocs.map((doc: any) => doc.archivePath).filter(Boolean)
    );
    emptyFolderPaths.push(...Array.from(folderPaths.values()).filter((folderPath) => !folderPathsWithFiles.has(folderPath)));
  }

  if (accessibleDocs.length === 0 && emptyFolderPaths.length === 0) {
    throw new Error('Access denied for all selected documents');
  }

  const archive = await createDocumentsArchive(accessibleDocs, emptyFolderPaths);

  return {
    ...archive,
    folders: accessibleFolders.map(f => ({ id: f.id, name: f.name })),
    summary: {
      ...archive.summary,
      totalRequested: documentIds.length + folderIds.length,
      accessDenied: deniedDocs.length
    }
  };
};

// ─────────────────────────────────────────────────────────────
// ✅ HELPER: logBulkDownloadActivity — Async logging
// ─────────────────────────────────────────────────────────────
export const logBulkDownloadActivity = async (
  userId: string,
  documentIds: string[],
  metadata: Array<{ id: string; title: string; fileName: string; ipfsHash: string }>,
  folders: Array<{ id: string; name: string }>,
  summary: { totalRequested: number; successfullyAdded: number; accessDenied: number }
) => {
  try {
    await prisma.activityLog.create({
      data: {
        userId,
        action: 'BULK_DOWNLOAD',
        entityType: 'DOCUMENT',
        entityId: documentIds[0], // Use first ID as reference
        entityName: `Bulk download: ${metadata.length} files`,
        details: JSON.stringify({
          requestedCount: summary.totalRequested,
          downloadedCount: summary.successfullyAdded,
          deniedCount: summary.accessDenied,
          files: metadata.map(m => ({ id: m.id, name: m.title })),
          folders: folders
        })
      }
    });
    logger.debug('📝 Bulk download activity logged', { 
      userId, 
      documentCount: metadata.length 
    });
  } catch (error: any) {
    // Don't throw — logging failure shouldn't break the download
    logger.error('❌ Failed to log bulk download activity', {
      userId,
      error: error.message
    });
  }
};

// Tambahkan type ini di atas fungsi uploadMultipleFiles
type UploadResultItem = {
  success: boolean;
  fileName: string;
  status: 'uploaded' | 'duplicate' | 'error';  // ← ✅ NEW: Status spesifik
  data?: any;
  error?: string;
  errorCode?: string;  // ← Untuk error handling spesifik di frontend
  pinataInfo?: { groupId: string | null; ipfsHash: string };
  existingDocument?: {  // ← ✅ NEW: Info jika duplicate
    id: string;
    title: string;
    ipfsHash: string;
    fileHash: string;
    createdAt: Date;
  };
};

export const uploadMultipleFiles = async (
  files: Express.Multer.File[],
  userId: string,
  folderId?: string,
  metadataMap?: Map<string, { title?: string; description?: string }>  // ← ✅ Parameter baru
) => {
  const results: UploadResultItem[] = [];

  // ── 0. PRE-FETCH: Get user's Pinata group ID ─────────
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pinataGroupId: true, username: true, storageLimit: true }
  });
  
  const userGroupId = user?.pinataGroupId || null;
  
  if (userGroupId) {
    logger.debug(`[Pinata] Using user's personal group for document uploads`, {
      userId,
      groupId: userGroupId
    });
  } else {
    logger.debug(`[Pinata] No personal group found for user, uploads will be ungrouped`, { userId });
  }

  // ── 0.5. STORAGE QUOTA CHECK ─────────────────────────
  // Pastikan total upload tidak melebihi batas penyimpanan yang ditetapkan admin.
  // storageLimit null = unlimited (mis. ADMIN) → lewati pengecekan.
  if (user && user.storageLimit !== null) {
    const quotaBytes = user.storageLimit ? Number(user.storageLimit) : 5 * 1024 * 1024 * 1024;
    const usage = await prisma.document.aggregate({
      where: { ownerId: userId, isArchived: false, deletedAt: null },
      _sum: { fileSize: true }
    });
    const usedBytes = usage._sum.fileSize ?? 0;
    const incomingBytes = files.reduce((sum, f) => sum + (f.size ?? 0), 0);

    if (usedBytes + incomingBytes > quotaBytes) {
      logger.warn('[Upload] Storage quota exceeded', {
        userId,
        usedBytes,
        incomingBytes,
        quotaBytes
      });

      files.forEach(file => {
        results.push({
          success: false,
          fileName: file.originalname,
          status: 'error',
          error: `Storage quota exceeded. Used ${usedBytes} bytes of ${quotaBytes} bytes, cannot add ${incomingBytes} more bytes.`,
          errorCode: 'STORAGE_QUOTA_EXCEEDED'
        });
        if (fs.existsSync(file.path)) {
          try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
        }
      });

      return {
        results,
        summary: {
          total: results.length,
          uploaded: 0,
          duplicate: 0,
          error: results.length
        },
        blockchainPayload: [],
        folderId
      };
    }
  }

  // ── 1. SECURITY CHECK: Verify folder ownership or editor/admin access ──────────────────────
  let targetPrivacy: PrivacyLevel = 'PRIVATE';
  let folderAccessToInherit: { userId: string }[] = [];
  try {
    if (folderId) {
      const folder = await validateFolderAccess(folderId, userId, 'EDITOR');
      targetPrivacy = folder.privacy;
      folderAccessToInherit = await prisma.folderAccess.findMany({
        where: { folderId },
        select: { userId: true }
      });
      if (folder.ownerId !== userId) folderAccessToInherit.push({ userId: folder.ownerId });
    }
  } catch (error: any) {
    files.forEach(file => {
      results.push({
        success: false,
        fileName: file.originalname,
        status: 'error',
        error: error.message,
        errorCode: error.errorCode || 'FOLDER_WRITE_FORBIDDEN'
      });
      if (fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
      }
    });

    return {
      results,
      summary: {
        total: results.length,
        uploaded: 0,
        duplicate: 0,
        error: results.length
      },
      blockchainPayload: [],
      folderId
    };
  }

  // ── Main upload loop ───────────────────────────────────────────────
  for (const file of files) {
    try {
      const fileHash = await generateFileHash(file.path);

      // ── 2. DUPLICATE CHECK ─────────────
      // ── 2. DUPLICATE CHECK BY CONTENT HASH ─────────────
const existingFile = await prisma.document.findUnique({
  where: { fileHash }
});

// ✅ JANGAN THROW ERROR - Return sebagai "duplicate"
if (existingFile) {
  logger.debug(`[Duplicate] File already exists, skipping upload`, {
    fileName: file.originalname,
    fileHash,
    existingDocId: existingFile.id
  });
  
  results.push({ 
    success: true,  // ← Tetap true karena bukan error sistem
    fileName: file.originalname, 
    status: 'duplicate',  // ← ✅ Status spesifik
    error: 'File content already exists in system',
    errorCode: 'FILE_DUPLICATE',
    existingDocument: {  // ← ✅ Kirim info existing doc ke frontend
      id: existingFile.id,
      title: existingFile.title,
      ipfsHash: existingFile.ipfsHash,
      fileHash: existingFile.fileHash,
      createdAt: existingFile.createdAt
    }
  });
  
  // ✅ Cleanup temp file dan lanjut ke file berikutnya
  if (fs.existsSync(file.path)) {
    try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
  }
  continue;
}
      // ── 3. IPFS UPLOAD (Pinata) ───────
      const fileBuffer = fs.readFileSync(file.path);
      
      const pinataMetadata = {
        name: file.originalname,
        keyvalues: {
          userId,
          contentType: 'document',
          folderPath: folderId ? `folders/${folderId}` : 'root',
          originalName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          uploadedAt: new Date().toISOString(),
        }
      };
      
      const uploadOptions: any = {
        metadata: pinataMetadata,
        cidVersion: 1,
        wrapWithDirectory: false
      };
      
      if (userGroupId) {
        uploadOptions.groupId = userGroupId;
      }
      
      const upload = await pinata.upload.file(
        new File([new Blob([fileBuffer])], file.originalname, { type: file.mimetype }),
        uploadOptions
      );

      const blockchainData = blockchainService.prepareTransactionData(
        upload.IpfsHash,
        file.originalname,
        fileHash
      );

      // ── 5. METADATA PREPARATION ───────────────────────────────────
      const userMeta = metadataMap?.get(file.originalname) || {};
      const finalTitle = userMeta.title?.trim() || formatTitle(file.originalname);
      const finalDescription = userMeta.description?.trim() || null;

      // ✅ ✅ ✅ INLINE DUPLICATE TITLE CHECK (Pattern sama seperti createFolder)
      const duplicateTitle = await prisma.document.findFirst({
        where: {
          title: {
            equals: finalTitle,
            mode: 'insensitive'  // ✅ Case-insensitive, sama seperti folder
          },
          ownerId: userId,
          folderId: folderId || null,  // ✅ Null-safe: root = null
          isArchived: false,  // ✅ Hanya cek document aktif
        }
      });

      if (duplicateTitle) {
        const error: any = new Error(`Document "${finalTitle}" already exists in this folder`);
        error.errorCode = 'DOCUMENT_TITLE_EXISTS';
        error.status = 409;
        throw error;
      }
      
      // ── 6. DATABASE TRANSACTION ───────────────────────────────────
      const newDocument = await prisma.$transaction(async (tx) => {
        const doc = await tx.document.create({
          data: {
            fileName: file.originalname,
            title: finalTitle,
            description: finalDescription, 
            fileSize: file.size,
            mimeType: file.mimetype,
            ipfsHash: upload.IpfsHash,
            fileHash,
            blockchainTx: null,
            isOnChain: false,
            pendingOnChainUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
            cleanupStatus: 'PENDING',
            owner: { connect: { id: userId } }, 
            folder: folderId ? { connect: { id: folderId } } : undefined,
            privacy: targetPrivacy,
          },
        });

        const inheritedDocumentAccess = Array.from(
          new Set([...folderAccessToInherit.map(access => access.userId), userId])
        );

        if (inheritedDocumentAccess.length > 0) {
          await tx.documentAccess.createMany({
            data: inheritedDocumentAccess.map(accessUserId => ({
              documentId: doc.id,
              userId: accessUserId
            })),
            skipDuplicates: true
          });
        }

        return doc;
      });

      results.push({ 
        success: true, 
        fileName: file.originalname, 
        status: 'uploaded', 
        data: {
          ...newDocument,
          blockchainData: blockchainData
        },
        pinataInfo: {
          groupId: userGroupId,
          ipfsHash: upload.IpfsHash,
        }
      });
      
    } catch (error: any) {
      logger.error('❌ Upload failed for file:', { 
        fileName: file.originalname, 
        userId,
        folderId,
        error: error.message,
        stack: error.stack,
        errorCode: error.errorCode
      });
      
      results.push({
        success: false,
        fileName: file.originalname,
        status: 'error',
        error: error.message,
        errorCode: error.errorCode
      });
    } finally {
      // ── 7. CLEANUP ───────────────────────
      if (fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError: any) {
          logger.warn('⚠️ Failed to cleanup temp file:', { path: file.path, error: cleanupError.message });
        }
      }
    }
  }
  
  // ── Log summary ───────────────────────────────────────────────────
  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;
  logger.info(`Document upload batch complete: ${successCount} succeeded, ${failCount} failed`, { 
    userId, 
    folderId,
    pinataGroupId: userGroupId 
  });

  // ── Catat 1 aktivitas upload saja (gabungan untuk single/bulk) ────
  const uploadedDocs = results.filter(r => r.status === 'uploaded' && r.data);
  if (uploadedDocs.length > 0) {
    try {
      const isBulk = uploadedDocs.length > 1;
      const firstDoc = uploadedDocs[0].data;
      await prisma.activityLog.create({
        data: {
          userId,
          action: 'UPLOAD_IPFS',
          entityType: 'DOCUMENT',
          entityId: firstDoc.id,
          entityName: isBulk
            ? `${uploadedDocs.length} files uploaded`
            : firstDoc.title,
          fileHash: isBulk ? null : firstDoc.fileHash,
          ipfsHash: isBulk ? null : firstDoc.ipfsHash,
          blockchainTx: isBulk ? null : firstDoc.blockchainTx,
          details: JSON.stringify({
            uploadedCount: uploadedDocs.length,
            path: folderId ? `folders/${folderId}` : 'root',
            files: uploadedDocs.map(r => ({ id: r.data.id, name: r.data.title })),
          }),
        }
      });
    } catch (logErr: any) {
      logger.error('Failed to log upload activity', { userId, error: logErr.message });
    }
  }

  const summary = {
  total: results.length,
  uploaded: results.filter(r => r.status === 'uploaded').length,
  duplicate: results.filter(r => r.status === 'duplicate').length,
  error: results.filter(r => r.status === 'error').length,
};

  const blockchainPayload = results
  .filter(r => r.status === 'uploaded' && r.data?.blockchainData)
  .map(r => ({
    fileName: r.fileName,
    ipfsHash: r.data.ipfsHash,
    fileHash: r.data.fileHash,
    fileSize: r.data.fileSize.toString(),  // ← String, bukan BigInt
    timestamp: Math.floor(r.data.createdAt.getTime() / 1000).toString(), // ← String
    
    documentId: r.data.id
  }));

logger.info(`Document upload batch complete`, { 
  userId, 
  folderId,
  pinataGroupId: userGroupId,
  summary
});
  
  return { results, summary, blockchainPayload, folderId };
};

export const getRootDocuments = async (userId: string) => {
  return await prisma.document.findMany({
    where: {
      ownerId: userId,
      folderId: null, 
      isArchived: false,
    },
    include: {
      owner: {
        select: {
          id: true,
          username: true,
          email: true,
          walletAddress: true,
          avatarUrl: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
  });
};

function buildDocumentMoveAccessEntries(
  targetFolder: { ownerId: string; sharedWith: Array<{ userId: string }> } | null
): string[] {
  if (!targetFolder) return [];

  const inheritedUserIds = new Set<string>();
  targetFolder.sharedWith.forEach((access) => inheritedUserIds.add(access.userId));
  inheritedUserIds.add(targetFolder.ownerId);

  return Array.from(inheritedUserIds);
}

async function getUniqueRootDocumentTitleForOwner(tx: Prisma.TransactionClient, ownerId: string, desiredTitle: string) {
  let candidate = desiredTitle;
  let counter = 1;

  while (await tx.document.findFirst({
    where: {
      ownerId,
      folderId: null,
      isArchived: false,
      deletedAt: null,
      title: { equals: candidate, mode: 'insensitive' }
    },
    select: { id: true }
  })) {
    candidate = `${desiredTitle} (${counter})`;
    counter += 1;
  }

  return candidate;
}

async function findNearestDocumentOwnerParent(
  tx: Prisma.TransactionClient,
  folderId: string | null,
  ownerId: string
): Promise<{ id: string; ownerId: string; privacy: PrivacyLevel; sharedWith: Array<{ userId: string }> } | null> {
  let currentFolderId = folderId;

  while (currentFolderId) {
    const folder = await tx.folder.findUnique({
      where: { id: currentFolderId },
      include: { sharedWith: true }
    });

    if (!folder) return null;
    if (!folder.isArchived && !folder.deletedAt) {
      const canUseParent = folder.ownerId === ownerId || folder.sharedWith.some((access) => access.userId === ownerId && access.role === 'EDITOR');
      if (canUseParent) return folder;
    }

    currentFolderId = folder.parentId;
  }

  return null;
}

async function syncMovedDocumentAccess(
  tx: Prisma.TransactionClient,
  document: { id: string; ownerId: string },
  targetFolder: { ownerId: string; privacy: PrivacyLevel; sharedWith: Array<{ userId: string }> } | null
) {
  await tx.documentAccess.deleteMany({ where: { documentId: document.id } });

  if (targetFolder?.privacy !== 'SPECIFIC_USER') return;

  const inheritedUserIds = buildDocumentMoveAccessEntries(targetFolder);
  const documentAccess = inheritedUserIds
    .filter((accessUserId) => accessUserId !== document.ownerId)
    .map((userId) => ({ documentId: document.id, userId }));

  if (documentAccess.length > 0) {
    await tx.documentAccess.createMany({
      data: documentAccess,
      skipDuplicates: true
    });
  }
}

export const moveMultipleDocuments = async (
  documentIds: string[], 
  userId: string, 
  targetFolderId: string | null
) => {
  return await prisma.$transaction(async (tx) => {
    let targetPrivacy: PrivacyLevel = 'PRIVATE';
    let targetFolder: { ownerId: string; sharedWith: Array<{ userId: string }> } | null = null;

    if (targetFolderId) {
      const folder = await tx.folder.findFirst({
        where: {
          id: targetFolderId,
          OR: [
            { ownerId: userId },
            { sharedWith: { some: { userId: userId, role: 'EDITOR' } } }
          ]
        },
        include: { sharedWith: true }
      });

      if (!folder) throw new Error("Target folder not found or No Permission.");
      targetPrivacy = folder.privacy;
      targetFolder = folder;
    }

    const documents: Array<{ id: string; title: string; folderId: string | null; ownerId: string }> = await tx.document.findMany({
      where: {
        id: { in: documentIds },
        isArchived: false,
        OR: [
          { ownerId: userId },
          { folder: { sharedWith: { some: { userId, role: 'EDITOR' } } } }
        ]
      },
      select: { id: true, title: true, folderId: true, ownerId: true }
    });

    if (documents.length === 0) {
      return {
        count: 0,
        appliedPrivacy: targetPrivacy,
        location: targetFolderId ? "Folder" : "Root"
      };
    }

    const duplicateSelectedTitle = documents.find((document, index) =>
      documents.some((otherDocument, otherIndex) =>
        otherIndex !== index && otherDocument.title.toLowerCase() === document.title.toLowerCase()
      )
    );

    if (duplicateSelectedTitle) {
      throw new Error(`Document "${duplicateSelectedTitle.title}" already exists in this location`);
    }

    const duplicateDocument = await tx.document.findFirst({
      where: {
        id: { notIn: documents.map((document) => document.id) },
        ownerId: userId,
        folderId: targetFolderId ?? null,
        isArchived: false,
        deletedAt: null,
        OR: documents.map((document) => ({
          title: {
            equals: document.title,
            mode: 'insensitive'
          }
        }))
      },
      select: { title: true }
    });

    if (duplicateDocument) {
      throw new Error(`Document "${duplicateDocument.title}" already exists in this location`);
    }

    const ownedDocuments = documents.filter((document) => document.ownerId === userId);
    const rescueDocuments = documents.filter((document) => document.ownerId !== userId);
    let movedCount = 0;

    if (ownedDocuments.length > 0) {
      const ownedDocumentIds = ownedDocuments.map((document) => document.id);
      const result = await tx.document.updateMany({
        where: {
          id: { in: ownedDocumentIds },
          isArchived: false
        },
        data: {
          folderId: targetFolderId,
          privacy: targetPrivacy
        }
      });
      movedCount += result.count;

      for (const document of ownedDocuments) {
        await syncMovedDocumentAccess(tx, document, targetFolder);
      }
    }

    for (const document of rescueDocuments) {
      const rescueParent = await findNearestDocumentOwnerParent(tx, document.folderId, document.ownerId);
      const rescueFolderId = rescueParent?.id ?? null;
      const rescueTitle = rescueFolderId
        ? document.title
        : await getUniqueRootDocumentTitleForOwner(tx, document.ownerId, document.title);

      await tx.document.update({
        where: { id: document.id },
        data: {
          folderId: rescueFolderId,
          title: rescueTitle,
          privacy: rescueParent?.privacy ?? 'PRIVATE'
        }
      });
      await syncMovedDocumentAccess(tx, document, rescueParent);
      movedCount += 1;
    }

    if (movedCount > 0) {
      const uniqueSourceFolderIds = [...new Set(documents.map(d => d.folderId).filter(Boolean))] as string[];
      const sourceFolders = uniqueSourceFolderIds.length > 0
        ? (await tx.folder.findMany({
            where: { id: { in: uniqueSourceFolderIds } },
            select: { id: true, name: true }
          })) || []
        : [];
      const folderIdToName = new Map<string, string>();
      for (const f of sourceFolders) {
        folderIdToName.set(f.id, f.name);
      }
      const targetFolderName = targetFolderId ? (targetFolder?.name || 'Folder') : 'Root';

      await tx.activityLog.createMany({
        data: documents.map((doc) => {
          const fromName = doc.folderId ? (folderIdToName.get(doc.folderId) || 'Folder') : 'Root';
          return {
            userId,
            action: 'MOVE',
            entityType: 'DOCUMENT',
            entityId: doc.id,
            entityName: doc.title,
            details: JSON.stringify({
              raw: `Document moved to ${targetFolderId ? 'Folder' : 'Root'}`,
              move: {
                from: fromName,
                to: targetFolderName
              }
            })
          };
        })
      });
    }

    return {
      count: movedCount,
      appliedPrivacy: targetPrivacy,
      location: targetFolderId ? "Folder" : "Root" 
    };
  });
};

/**
 * Mengambil semua dokumen milik user yang aktif (tidak diarsip)
 */
export const searchPublicDocuments = async (userId: string, query: string, limit = 12) => {
  const searchQuery = query.trim();
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 30);

  if (searchQuery.length < 2) return [];

  const docs = await prisma.document.findMany({
    where: {
      privacy: 'PUBLIC',
      isArchived: false,
      deletedAt: null,
      OR: [
        { title: { contains: searchQuery, mode: 'insensitive' } },
        { fileName: { contains: searchQuery, mode: 'insensitive' } },
        { description: { contains: searchQuery, mode: 'insensitive' } },
        { mimeType: { contains: searchQuery, mode: 'insensitive' } },
        { owner: { username: { contains: searchQuery, mode: 'insensitive' } } },
        { owner: { walletAddress: { contains: searchQuery, mode: 'insensitive' } } }
      ]
    },
    include: {
      folder: true,
      owner: {
        select: {
          id: true,
          username: true,
          email: true,
          walletAddress: true,
          avatarUrl: true
        }
      }
    },
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' }
    ],
    take: safeLimit
  });

  return sanitizeDocuments(docs, userId);
};

export const getUserDocuments = async (userId: string, folderId: string | null) => {
  if (folderId) {
    await validateFolderAccess(folderId, userId);
  }

  const folder = folderId
    ? await prisma.folder.findUnique({
        where: { id: String(folderId) },
        select: { ownerId: true }
      })
    : null;

  const docs = await prisma.document.findMany({
    where: {
      folderId: folderId ? String(folderId) : null,
      isArchived: false,
      OR: folderId
        ? [
            { ownerId: userId },
            { sharedWith: { some: { userId } } },
            ...(folder?.ownerId === userId ? [{ folder: { ownerId: userId } }] : []),
            { privacy: { in: ['PUBLIC', 'LINK_ONLY'] } }
          ]
        : [{ ownerId: userId }]
    },
    include: {
      folder: true,
      owner: { 
        select: {
          id: true,
          username: true,
          email: true,
          walletAddress: true,
          avatarUrl: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
  });
  
  // ✅ Pass userId sebagai currentUserId
  return sanitizeDocuments(docs, userId);
};

/**
 * Archive banyak dokumen sekaligus (Soft Delete)
 * Ditambah logika: Set privacy ke PRIVATE agar akses orang lain terputus otomatis
 */
export const archiveDocuments = async (documentIds: string[], userId: string) => {
  return await prisma.$transaction(async (tx) => {
    const docs = await tx.document.findMany({
      where: {
        id: { in: documentIds },
        ownerId: userId,
        isArchived: false
      },
      select: { id: true, title: true, fileHash: true, ipfsHash: true, blockchainTx: true }
    });

    if (docs.length === 0) return { count: 0 };

    const result = await tx.document.updateMany({
      where: {
        id: { in: docs.map(d => d.id) }
      },
      data: {
        isArchived: true,
        deletedAt: new Date()
      }
    });

    if (docs.length === 1) {
      const doc = docs[0];
      try {
        await tx.activityLog.create({
          data: {
            userId,
            action: 'ARCHIVE',
            entityType: 'DOCUMENT',
            entityId: doc.id,
            entityName: doc.title,
            fileHash: doc.fileHash,
            ipfsHash: doc.ipfsHash,
            blockchainTx: doc.blockchainTx,
            details: `Document archived: ${doc.title}`
          }
        });
      } catch (err) {
        logger.error('Failed to log archiveDocuments activity:', err);
      }
    } else if (docs.length > 1) {
      try {
        await tx.activityLog.create({
          data: {
            userId,
            action: 'BULK_ARCHIVE',
            entityType: 'MULTIPLE',
            entityId: docs[0].id,
            entityName: `Bulk archive: ${docs.length} files`,
            details: JSON.stringify({
              successCount: docs.length,
              files: docs.map(doc => ({ id: doc.id, name: doc.title }))
            })
          }
        });
      } catch (err) {
        logger.error('Failed to log bulk archiveDocuments activity:', err);
      }
    }

    return result;
  });
};

/**
 * Get all archived documents for the current user (Trash List)
 */
export const getArchivedDocuments = async (userId: string) => {
  return await prisma.document.findMany({
    where: {
      ownerId: userId,
      isArchived: true,
    },
    include: {
      folder: { select: { id: true, name: true } }
    },
    orderBy: { deletedAt: 'desc' }, 
  });
};

/**
 * Restore banyak dokumen sekaligus dari Trash
 */
function getRestoredTitle(title: string, existingTitles: Set<string>): string {
  const normalizedTitle = title.trim().toLowerCase();
  if (!existingTitles.has(normalizedTitle)) {
    existingTitles.add(normalizedTitle);
    return title;
  }

  const restoredTitle = `${title} (restore)`;
  if (!existingTitles.has(restoredTitle.toLowerCase())) {
    existingTitles.add(restoredTitle.toLowerCase());
    return restoredTitle;
  }

  let counter = 2;
  while (existingTitles.has(`${title} (duplicate ${counter})`.toLowerCase())) {
    counter += 1;
  }

  const duplicateTitle = `${title} (duplicate ${counter})`;
  existingTitles.add(duplicateTitle.toLowerCase());
  return duplicateTitle;
}

export const restoreDocuments = async (documentIds: string[], userId: string) => {
  return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const documents = await tx.document.findMany({
      where: {
        id: { in: documentIds },
        ownerId: userId,
        isArchived: true
      },
      select: {
        id: true,
        title: true,
        folderId: true
      }
    });

    if (documents.length === 0) {
      return { count: 0 };
    }

    const folderIds = [...new Set(documents.map(document => document.folderId).filter((folderId): folderId is string => Boolean(folderId)))];
    const activeFolders = folderIds.length > 0
      ? await tx.folder.findMany({
          where: {
            id: { in: folderIds },
            ownerId: userId,
            isArchived: false
          },
          select: { id: true }
        })
      : [];
    const activeFolderIds = new Set(activeFolders.map(folder => folder.id));
    const restoreToOriginalFolderIds = documents
      .filter(document => document.folderId && activeFolderIds.has(document.folderId))
      .map(document => document.id);
    const restoreToRootDocuments = documents
      .filter(document => !document.folderId || !activeFolderIds.has(document.folderId));

    if (restoreToOriginalFolderIds.length > 0) {
      await tx.document.updateMany({
        where: { id: { in: restoreToOriginalFolderIds }, ownerId: userId },
        data: {
          isArchived: false,
          deletedAt: null
        }
      });
    }

    const rootRenamed: Array<{ id: string; originalTitle: string; restoredTitle: string }> = [];
    if (restoreToRootDocuments.length > 0) {
      const existingRootDocuments = await tx.document.findMany({
        where: {
          ownerId: userId,
          folderId: null,
          isArchived: false
        },
        select: { title: true }
      });
      const rootTitles = new Set(existingRootDocuments.map(document => document.title.trim().toLowerCase()));

      for (const document of restoreToRootDocuments) {
        const restoredTitle = getRestoredTitle(document.title, rootTitles);
        if (restoredTitle !== document.title) {
          rootRenamed.push({ id: document.id, originalTitle: document.title, restoredTitle });
        }

        await tx.document.update({
          where: { id: document.id },
          data: {
            title: restoredTitle,
            isArchived: false,
            deletedAt: null,
            folderId: null
          }
        });
      }
    }

    if (documents.length === 1) {
      const doc = documents[0];
      const renamedItem = rootRenamed.find(r => r.id === doc.id);
      const entityName = renamedItem ? renamedItem.restoredTitle : doc.title;
      try {
        await tx.activityLog.create({
          data: {
            userId,
            action: 'RESTORE',
            entityType: 'DOCUMENT',
            entityId: doc.id,
            entityName,
            details: `Document restored: ${entityName}`
          }
        });
      } catch (err) {
        logger.error('Failed to log restoreDocuments activity:', err);
      }
    } else if (documents.length > 1) {
      try {
        await tx.activityLog.create({
          data: {
            userId,
            action: 'BULK_RESTORE',
            entityType: 'MULTIPLE',
            entityId: documents[0].id,
            entityName: `Bulk restore: ${documents.length} files`,
            details: JSON.stringify({
              successCount: documents.length,
              files: documents.map(doc => {
                const renamedItem = rootRenamed.find(r => r.id === doc.id);
                const entityName = renamedItem ? renamedItem.restoredTitle : doc.title;
                return { id: doc.id, name: entityName };
              })
            })
          }
        });
      } catch (err) {
        logger.error('Failed to log bulk restoreDocuments activity:', err);
      }
    }

    return {
      count: documents.length,
      movedToRootCount: restoreToRootDocuments.length,
      renamedCount: rootRenamed.length,
      renamed: rootRenamed
    };
  });
};

/**
 * Permanently delete multiple documents and log their blockchain metadata for audit
 */
export const destroyMultipleDocuments = async (documentIds: string[], userId: string) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Ambil data dokumen (untuk log)
    const docs = await tx.document.findMany({
      where: { id: { in: documentIds }, ownerId: userId, isArchived: true }
    });

    if (docs.length === 0) return { count: 0 };

    // 2. CATAT KE ACTIVITY LOG (Sesuai skema baru)
    if (docs.length === 1) {
      const doc = docs[0];
      try {
        await tx.activityLog.create({
          data: {
            userId: userId,
            action: 'PERMANENT_DELETE',
            entityType: 'DOCUMENT',
            entityId: doc.id,
            entityName: doc.title,
            fileHash: doc.fileHash,
            ipfsHash: doc.ipfsHash,
            blockchainTx: doc.blockchainTx,
            details: 'Document and its access records permanently purged.'
          }
        });
      } catch (err) {
        logger.error('Failed to log destroyMultipleDocuments activity:', err);
      }
    } else if (docs.length > 1) {
      try {
        await tx.activityLog.create({
          data: {
            userId: userId,
            action: 'BULK_PERMANENT_DELETE',
            entityType: 'MULTIPLE',
            entityId: docs[0].id,
            entityName: `Bulk delete: ${docs.length} files`,
            details: JSON.stringify({
              successCount: docs.length,
              files: docs.map(doc => ({ id: doc.id, name: doc.title }))
            })
          }
        });
      } catch (err) {
        logger.error('Failed to log bulk destroyMultipleDocuments activity:', err);
      }
    }

    // --- LANGKAH BARU: BERSIHKAN RELASI ---
    // 3. Hapus semua record akses (Foreign Key) yang terkait dokumen ini
    await tx.documentAccess.deleteMany({
      where: { documentId: { in: documentIds } }
    });

    // 4. SEKARANG BARU HAPUS DOKUMEN UTAMANYA
    const deleteResult = await tx.document.deleteMany({
      where: {
        id: { in: documentIds },
        ownerId: userId,
        isArchived: true
      }
    });

    return { count: deleteResult.count };
  });
};

export const updateDocumentMetadata = async (
  documentId: string, 
  userId: string, 
  updates: { title?: string; description?: string }
) => {
  // 1. Validate document exists and user is owner/editor of containing folder
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId,
      isArchived: false,
      OR: [
        { ownerId: userId },
        { folder: { sharedWith: { some: { userId, role: 'EDITOR' } } } }
      ]
    }
  });

  if (!doc) {
    throw new Error("Document not found or unauthorized.");
  }

  // 2. Prepare update data (only include fields that are provided)
  const updateData: any = {};

   if (updates.title !== undefined) {
    const newTitle = updates.title.trim();
    
    // ✅ Cek duplicate: case-insensitive, exclude archived, exclude current doc
    const duplicateTitle = await prisma.document.findFirst({
      where: {
        title: {
          equals: newTitle,
          mode: 'insensitive'  // ✅ Sama seperti folder
        },
        ownerId: doc.ownerId,
        folderId: doc.folderId,  // ✅ Gunakan folderId dari document yang ada
        isArchived: false,
        id: { not: documentId }  // ✅ Exclude document yang sedang di-edit (penting!)
      }
    });
    
    if (duplicateTitle) {
      const error: any = new Error(`Document "${newTitle}" already exists in this folder`);
      error.errorCode = 'DOCUMENT_TITLE_EXISTS';
      error.status = 409;
      throw error;
    }
    
    updateData.title = newTitle;
  }
  
  if (updates.description !== undefined) {
    // Allow null to clear description, or string to update
    updateData.description = updates.description?.trim() || null;
  }

  // If no valid updates provided, return early
  if (Object.keys(updateData).length === 0) {
    return doc; // No changes needed
  }

  // 3. Update document (updatedAt will auto-update via @updatedAt)
  const updatedDoc = await prisma.document.update({
    where: { id: documentId },
    data: updateData
  });

  try {
    await prisma.activityLog.create({
      data: {
        userId,
        action: updates.title && updates.description !== undefined
          ? 'EDIT_METADATA'
          : updates.title
          ? 'RENAME'
          : 'EDIT_DESCRIPTION',
        entityType: 'DOCUMENT',
        entityId: documentId,
        entityName: updatedDoc.title,
        fileHash: updatedDoc.fileHash,
        ipfsHash: updatedDoc.ipfsHash,
        blockchainTx: updatedDoc.blockchainTx,
        details: JSON.stringify({
          raw: updates.title && updates.description !== undefined
            ? `Document renamed from ${doc.title} to ${updatedDoc.title} and description updated`
            : updates.title
            ? `Document renamed from ${doc.title} to ${updatedDoc.title}`
            : `Document description updated`,
          rename: updates.title ? { from: doc.title, to: updatedDoc.title } : null,
          description: updates.description !== undefined ? { from: doc.description || '', to: updatedDoc.description || '' } : null,
          descriptionUpdated: updates.description !== undefined
        })
      }
    });
  } catch (err) {
    logger.error('Failed to log updateDocumentMetadata activity:', err);
  }

  return updatedDoc;
};

  /**
 * Update Privacy Level Massal untuk Document & Auto-Cleanup (Flexible Bulk Patch)
 * Membersihkan data akses jika status BUKAN 'SPECIFIC_USER'
 */
export const updateDocumentsPrivacy = async (
  ownerId: string,
  updates: { documentId: string; newPrivacy: PrivacyLevel }[]
) => {
  return await prisma.$transaction(async (tx) => {
    const results = [];

    for (const item of updates) {
      // 0. Ambil privasi lama sebelum di-update
      const oldDoc = await tx.document.findUnique({
        where: { id: item.documentId },
        select: { privacy: true }
      });

      // 1. Update status privasi dokumen (hanya jika pemiliknya sesuai)
      const docUpdate = await tx.document.updateMany({
        where: { 
          id: item.documentId, 
          ownerId: ownerId,
          isArchived: false
        },
        data: { privacy: item.newPrivacy }
      });

      // 2. LOGIKA CLEANUP TOTAL:
      // Jika status baru BUKAN 'SPECIFIC_USER', hapus semua akses user agar tidak menumpuk.
      let accessDeleted = 0;
      if (item.newPrivacy !== 'SPECIFIC_USER') {
        const deleted = await tx.documentAccess.deleteMany({
          where: { documentId: item.documentId }
        });
        accessDeleted = deleted.count;
      }

      if (docUpdate.count > 0) {
        const doc = await tx.document.findUnique({
          where: { id: item.documentId },
          select: { title: true, fileHash: true, ipfsHash: true, blockchainTx: true }
        });
        if (doc) {
          await tx.activityLog.create({
            data: {
              userId: ownerId,
              action: 'CHANGE_PRIVACY',
              entityType: 'DOCUMENT',
              entityId: item.documentId,
              entityName: doc.title,
              fileHash: doc.fileHash,
              ipfsHash: doc.ipfsHash,
              blockchainTx: doc.blockchainTx,
              details: JSON.stringify({
                raw: `Document privacy changed from ${oldDoc?.privacy || 'UNKNOWN'} to ${item.newPrivacy}`,
                privacy: {
                  from: oldDoc?.privacy || 'UNKNOWN',
                  to: item.newPrivacy
                }
              })
            }
          });
        }
      }

      results.push({
        documentId: item.documentId,
        status: docUpdate.count > 0 ? 'updated' : 'failed/unauthorized',
        newPrivacy: item.newPrivacy,
        accessRevoked: accessDeleted
      });
    }

    return results;
  });
};


/**
 * Shares multiple documents to multiple users simultaneously
 * Only for users who DO NOT have access yet
 */
export const shareDocumentsToUsers = async (
  ownerId: string,
  shares: { documentId: string; targetUsers: string[] }[] // Langsung array ID User
) => {
  return await prisma.$transaction(async (tx) => {
    const finalResults = [];

    for (const item of shares) {
      // 1. Validasi Kepemilikan Dokumen
      const doc = await tx.document.findFirst({ where: { id: item.documentId, ownerId: ownerId, isArchived: false } });
      if (!doc || doc.ownerId !== ownerId) continue;

      // 2. Loop User yang akan diberi akses
      const docResults = [];
      for (const targetUserId of item.targetUsers) {
        if (targetUserId === ownerId) continue;

        // Pakai upsert dengan update kosong karena tidak ada role
        await tx.documentAccess.upsert({
          where: {
            documentId_userId: { 
              documentId: item.documentId, 
              userId: targetUserId 
            }
          },
          update: {}, // Tidak ada data yang diubah jika sudah ada
          create: { 
            documentId: item.documentId, 
            userId: targetUserId 
          }
        });
        docResults.push({ userId: targetUserId, status: 'granted' });
      }

      // 3. Otomatis set privacy ke SPECIFIC_USER
      await tx.document.update({
        where: { id: item.documentId },
        data: { privacy: 'SPECIFIC_USER' }
      });

      const targets = (await tx.user.findMany({
        where: { id: { in: item.targetUsers } },
        select: { id: true, username: true, walletAddress: true }
      })) || [];

      await tx.activityLog.create({
        data: {
          userId: ownerId,
          action: 'SHARE',
          entityType: 'DOCUMENT',
          entityId: item.documentId,
          entityName: doc.title,
          fileHash: doc.fileHash,
          ipfsHash: doc.ipfsHash,
          blockchainTx: doc.blockchainTx,
          details: JSON.stringify({
            raw: `Document shared with ${targets.map(t => t.username).join(', ')}`,
            privacy: {
              from: doc.privacy,
              to: 'SPECIFIC_USER'
            },
            share: {
              users: targets.map(t => ({ id: t.id, username: t.username, wallet: t.walletAddress }))
            }
          })
        }
      });

      finalResults.push({ documentId: item.documentId, sharedWith: docResults });
    }

    return finalResults;
  });
};


/**
 * Revoke (Delete) access from multiple users for multiple documents
 */
export const revokeDocumentsAccess = async (
  ownerId: string,
  revokes: { documentId: string; targetUserIds: string[] }[]
) => {
  return await prisma.$transaction(async (tx) => {
    const finalResults = [];

    for (const item of revokes) {
      // 1. Validasi Kepemilikan Dokumen (Langsung masukkan ownerId ke query)
      const doc = await tx.document.findFirst({ 
        where: { 
          id: item.documentId, 
          ownerId: ownerId, // Pastikan Bos pemiliknya
          isArchived: false 
        } 
      });

      // Jika dokumen tidak ditemukan atau bukan milik Bos, skip ke dokumen berikutnya
      if (!doc) {
        finalResults.push({ 
          documentId: item.documentId, 
          status: "failed", 
          message: "Document not found or unauthorized" 
        });
        continue;
      }

      // 2. Hapus Akses User dari tabel DocumentAccess
      const deleteResult = await tx.documentAccess.deleteMany({
        where: {
          documentId: item.documentId,
          userId: { in: item.targetUserIds } // Menghapus semua user yang ada di list
        }
      });

      // 3. Check Sisa Akses: Jika sudah tidak ada yang punya akses langsung
      const remainingAccess = await tx.documentAccess.count({
        where: { documentId: item.documentId }
      });

      let updatedPrivacy = doc.privacy;
      if (remainingAccess === 0) {
        // Jika benar-benar kosong, gembok lagi filenya (PRIVATE)
        const updatedDoc = await tx.document.update({
          where: { id: item.documentId },
          data: { privacy: 'PRIVATE' }
        });
        updatedPrivacy = updatedDoc.privacy;
      }

      const targets = (await tx.user.findMany({
        where: { id: { in: item.targetUserIds } },
        select: { id: true, username: true, walletAddress: true }
      })) || [];

      await tx.activityLog.create({
        data: {
          userId: ownerId,
          action: 'REVOKE',
          entityType: 'DOCUMENT',
          entityId: item.documentId,
          entityName: doc.title,
          fileHash: doc.fileHash,
          ipfsHash: doc.ipfsHash,
          blockchainTx: doc.blockchainTx,
          details: JSON.stringify({
            raw: `Document access revoked for ${targets.map(t => t.username).join(', ')}`,
            privacy: {
              from: doc.privacy,
              to: updatedPrivacy
            },
            revoke: {
              users: targets.map(t => ({ id: t.id, username: t.username, wallet: t.walletAddress }))
            }
          })
        }
      });

      finalResults.push({ 
        documentId: item.documentId, 
        revokedCount: deleteResult.count, // Harusnya sekarang > 0
        newStatus: updatedPrivacy
      });
    }

    return finalResults;
  });
};


/**
 * Mengambil daftar user yang memiliki akses ke dokumen (hanya pemilik)
 */
/**
 * Mengambil daftar user yang memiliki akses ke banyak dokumen sekaligus (Hanya Pemilik)
 */
export const getDocumentsSharedUsers = async (documentIds: string[], ownerId: string) => {
  const documents = await prisma.document.findMany({
    where: {
      id: { in: documentIds },
      OR: [
        { ownerId },
        { folder: { ownerId } }
      ]
    },
    select: {
      id: true,
      title: true,
      privacy: true,
      sharedWith: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              walletAddress: true,
              avatarUrl: true,
            },
          },
        },
      },
    }
  });

  // 2. Validasi: Jika jumlah dokumen yang ditemukan tidak sama dengan yang diminta, 
  // berarti ada ID yang salah atau bukan milik Bos (Opsional: bisa dilempar error atau biarkan saja)
  if (documents.length === 0) {
    throw new Error('No valid documents found or unauthorized access.');
  }

  return documents;
};

export const getAllDocumentsForAdmin = async () => {
  return prisma.document.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      owner: {
        select: {
          id: true,
          walletAddress: true,
          username: true,
          email: true,
        },
      },
    },
  })
}

export const getSystemStatsForAdmin = async () => {
  const [totalFiles, totalUsers] = await prisma.$transaction([
    prisma.document.count(),
    prisma.user.count(),
  ])

  return { totalFiles, totalUsers }
}

export const getMyStorageUsage = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { storageLimit: true }
  });

  const result = await prisma.document.aggregate({
    where: {
      ownerId: userId,
      isArchived: false,
      deletedAt: null
    },
    _sum: {
      fileSize: true
    }
  });

  const usedBytes = result._sum.fileSize ?? 0;

  // storageLimit null = unlimited (mis. ADMIN)
  if (user && user.storageLimit === null) {
    return { usedBytes, quotaBytes: null, usagePercent: 0, unlimited: true };
  }

  const quotaBytes = user?.storageLimit ? Number(user.storageLimit) : 5 * 1024 * 1024 * 1024;
  const usagePercent = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0;

  return { usedBytes, quotaBytes, usagePercent, unlimited: false };
}

/**
 * Mengambil daftar dokumen milik orang lain yang dibagikan ke saya (Versi Tanpa Error createdAt)
 */
export const getSharedWithMeDocuments = async (userId: string) => {
  const sharedAccess = await prisma.documentAccess.findMany({
    where: {
      userId: userId,
      document: {
        isArchived: false,
        ownerId: { not: userId }
      }
    },
    include: {
      document: {
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              walletAddress: true,
              avatarUrl: true
            }
          }
        }
      }
    },
  });

  // ✅ Pass userId sebagai currentUserId
  return sharedAccess.map(item => ({
    accessId: item.id,
    document: sanitizeDocument(item.document, userId)  // ← Update di sini
  }));
};

/**
 * Mengambil log aktivitas milik user (Terbaru ke Terlama)
 */
export const getActivityLogs = async (userId: string) => {
  const logs = await prisma.activityLog.findMany({
    where: {
      userId: userId
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 50, // Ambil 50 aktivitas terakhir saja biar ringan
  });

  // Ambil unique blockchainTx
  const txHashes = logs
    .map(log => log.blockchainTx)
    .filter((tx): tx is string => !!tx);

  if (txHashes.length > 0) {
    // Cari dokumen yang punya txHash tersebut
    const documents = await prisma.document.findMany({
      where: {
        ownerId: userId,
        blockchainTx: { in: txHashes }
      },
      select: {
        id: true,
        title: true,
        blockchainTx: true
      }
    });

    // Petakan dokumen ke txHash
    const txToDocs = new Map<string, { id: string; name: string }[]>();
    for (const doc of documents) {
      if (doc.blockchainTx) {
        const list = txToDocs.get(doc.blockchainTx) || [];
        list.push({ id: doc.id, name: doc.title });
        txToDocs.set(doc.blockchainTx, list);
      }
    }

    // Update details log secara dinamis jika belum memiliki array files
    return logs.map(log => {
      if (log.blockchainTx) {
        const docs = txToDocs.get(log.blockchainTx) || [];
        if (docs.length > 0) {
          try {
            let detailsObj: any = {};
            if (log.details) {
              const trimmed = log.details.trim();
              if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                detailsObj = JSON.parse(trimmed);
              } else {
                detailsObj = { raw: log.details };
              }
            }
            // Jika files belum ada atau kosong, update dengan data dokumen dari DB
            if (!detailsObj.files || detailsObj.files.length === 0) {
              detailsObj.files = docs;
              return {
                ...log,
                details: JSON.stringify(detailsObj)
              };
            }
          } catch (e) {
            // Abaikan jika parse gagal
          }
        }
      }
      return log;
    });
  }

  return logs;
};

export const bulkShareItems = async (
  ownerId: string,
  targets: Array<{
    id: string;
    type: 'document' | 'folder';
    newPrivacy: PrivacyLevel;
    users: Array<{ id: string; username: string; role?: 'VIEWER' | 'EDITOR' }>;
  }>
) => {
  return await prisma.$transaction(async (tx) => {
    const logs = [];

    for (const target of targets) {
      if (target.type === 'document') {
        const doc = await tx.document.findFirst({
          where: { id: target.id, ownerId, isArchived: false }
        });
        if (!doc) continue;

        const oldPrivacy = doc.privacy;

        // 1. Update privacy
        await tx.document.update({
          where: { id: target.id },
          data: { privacy: target.newPrivacy }
        });

        // 2. Cleanup if not SPECIFIC_USER
        if (target.newPrivacy !== 'SPECIFIC_USER') {
          await tx.documentAccess.deleteMany({
            where: { documentId: target.id }
          });
        } else if (target.users && target.users.length > 0) {
          // Add users access
          for (const u of target.users) {
            if (u.id === ownerId) continue;
            await tx.documentAccess.upsert({
              where: {
                documentId_userId: { documentId: target.id, userId: u.id }
              },
              update: {},
              create: {
                documentId: target.id,
                userId: u.id
              }
            });
          }
        }

        logs.push({
          id: target.id,
          type: 'document',
          name: doc.title,
          privacy: { from: oldPrivacy, to: target.newPrivacy },
          users: target.users || []
        });

      } else if (target.type === 'folder') {
        const folder = await tx.folder.findFirst({
          where: { id: target.id, ownerId, isArchived: false }
        });
        if (!folder) continue;

        const oldPrivacy = folder.privacy;

        // Get descendant folders
        const subtreeFolderIds = await getAllDescendantFolderIds(tx, [target.id]);
        const subtreeDocuments = await tx.document.findMany({
          where: { folderId: { in: subtreeFolderIds } },
          select: { id: true }
        });

        // 1. Update privacy for folder + subfolders + documents
        await tx.folder.updateMany({
          where: { id: { in: subtreeFolderIds } },
          data: { privacy: target.newPrivacy }
        });
        await tx.document.updateMany({
          where: { folderId: { in: subtreeFolderIds } },
          data: { privacy: target.newPrivacy }
        });

        // 2. Cleanup if not SPECIFIC_USER
        if (target.newPrivacy !== 'SPECIFIC_USER') {
          await tx.folderAccess.deleteMany({
            where: { folderId: { in: subtreeFolderIds } }
          });
          await tx.documentAccess.deleteMany({
            where: { documentId: { in: subtreeDocuments.map(d => d.id) } }
          });
        } else if (target.users && target.users.length > 0) {
          // Add users access to folder + subfolders + documents
          for (const u of target.users) {
            if (u.id === ownerId) continue;
            const role = u.role || 'VIEWER';

            for (const fId of subtreeFolderIds) {
              await tx.folderAccess.upsert({
                where: {
                  folderId_userId: { folderId: fId, userId: u.id }
                },
                update: { role },
                create: {
                  folderId: fId,
                  userId: u.id,
                  role
                }
              });
            }

            for (const doc of subtreeDocuments) {
              await tx.documentAccess.upsert({
                where: {
                  documentId_userId: { documentId: doc.id, userId: u.id }
                },
                update: {},
                create: {
                  documentId: doc.id,
                  userId: u.id
                }
              });
            }
          }
        }

        logs.push({
          id: target.id,
          type: 'folder',
          name: folder.name,
          privacy: { from: oldPrivacy, to: target.newPrivacy },
          users: target.users || []
        });
      }
    }

    if (logs.length > 0) {
      // Create single bulk activity log
      await tx.activityLog.create({
        data: {
          userId: ownerId,
          action: 'BULK_SHARE',
          entityType: 'MULTIPLE',
          entityId: 'BULK',
          entityName: `${logs.length} items shared`,
          details: JSON.stringify({
            raw: `Bulk share completed for ${logs.length} item(s)`,
            bulk: logs
          })
        }
      });
    }

    return { success: true, count: logs.length };
  });
};

export const bulkMoveItems = async (
  ownerId: string,
  targets: Array<{ id: string; type: 'document' | 'folder' }>,
  targetFolderId: string | null
) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch destination folder name
    let targetFolderName = 'Root';
    let targetPrivacy: PrivacyLevel = 'PRIVATE';
    let targetFolder: any = null;

    if (targetFolderId) {
      targetFolder = await tx.folder.findFirst({
        where: {
          id: targetFolderId,
          isArchived: false,
          OR: [
            { ownerId },
            { sharedWith: { some: { userId: ownerId, role: 'EDITOR' } } }
          ]
        },
        include: { sharedWith: true }
      });
      if (!targetFolder) {
        throw new Error('Target folder not found or unauthorized.');
      }
      targetFolderName = targetFolder.name;
      targetPrivacy = targetFolder.privacy;
    }

    const logs = [];

    // 2. Perform moving and collect logs
    for (const target of targets) {
      if (target.type === 'document') {
        const doc = await tx.document.findFirst({
          where: {
            id: target.id,
            isArchived: false,
            OR: [
              { ownerId },
              { folder: { sharedWith: { some: { userId: ownerId, role: 'EDITOR' } } } }
            ]
          }
        });
        if (!doc) continue;

        let sourceFolderName = 'Root';
        if (doc.folderId) {
          const src = await tx.folder.findFirst({ where: { id: doc.folderId }, select: { name: true } });
          if (src) sourceFolderName = src.name;
        }

        await tx.document.update({
          where: { id: target.id },
          data: {
            folderId: targetFolderId,
            privacy: targetPrivacy
          }
        });

        await syncMovedDocumentAccess(tx, doc, targetFolder);

        logs.push({
          id: target.id,
          type: 'document',
          name: doc.title,
          from: sourceFolderName,
          to: targetFolderName,
          privacy: { from: doc.privacy, to: targetPrivacy }
        });

      } else if (target.type === 'folder') {
        const folder = await tx.folder.findFirst({
          where: {
            id: target.id,
            isArchived: false,
            OR: [
              { ownerId },
              { sharedWith: { some: { userId: ownerId, role: 'EDITOR' } } }
            ]
          }
        });
        if (!folder) continue;

        let sourceFolderName = 'Root';
        if (folder.parentId) {
          const src = await tx.folder.findFirst({ where: { id: folder.parentId }, select: { name: true } });
          if (src) sourceFolderName = src.name;
        }

        // Relocate folder
        let subtreeFolderIds = await getAllDescendantFolderIds(tx, [target.id]);
        const subtreeDocuments = await tx.document.findMany({
          where: { folderId: { in: subtreeFolderIds } },
          select: { id: true }
        });

        await tx.folder.updateMany({
          where: { id: { in: subtreeFolderIds } },
          data: { privacy: targetPrivacy }
        });
        await tx.document.updateMany({
          where: { folderId: { in: subtreeFolderIds } },
          data: { privacy: targetPrivacy }
        });

        await tx.folder.update({
          where: { id: target.id },
          data: {
            parentId: targetFolderId,
            privacy: targetPrivacy
          }
        });

        await tx.folderAccess.deleteMany({
          where: { folderId: { in: subtreeFolderIds } }
        });
        if (subtreeDocuments.length > 0) {
          await tx.documentAccess.deleteMany({
            where: { documentId: { in: subtreeDocuments.map(d => d.id) } }
          });
        }

        if (targetPrivacy === 'SPECIFIC_USER' && targetFolder) {
          // Get inherited folder access
          const targetFolderAccess = await tx.folderAccess.findMany({
            where: { folderId: targetFolderId }
          });
          if (targetFolderAccess.length > 0) {
            await tx.folderAccess.createMany({
              data: subtreeFolderIds.flatMap((fId) =>
                targetFolderAccess.map((access) => ({
                  folderId: fId,
                  userId: access.userId,
                  role: access.role
                }))
              ),
              skipDuplicates: true
            });

            const docAccess = subtreeDocuments.flatMap((d) =>
              targetFolderAccess
                .filter((access) => access.userId !== folder.ownerId)
                .map((access) => ({
                  documentId: d.id,
                  userId: access.userId
                }))
            );
            if (docAccess.length > 0) {
              await tx.documentAccess.createMany({
                data: docAccess,
                skipDuplicates: true
              });
            }
          }
        }

        logs.push({
          id: target.id,
          type: 'folder',
          name: folder.name,
          from: sourceFolderName,
          to: targetFolderName,
          privacy: { from: folder.privacy, to: targetPrivacy }
        });
      }
    }

    if (logs.length === 1) {
      const single = logs[0];
      await tx.activityLog.create({
        data: {
          userId: ownerId,
          action: 'MOVE',
          entityType: single.type.toUpperCase() as any,
          entityId: single.id,
          entityName: single.name,
          details: JSON.stringify({
            raw: `${single.type === 'document' ? 'Document' : 'Folder'} moved to ${targetFolderName}`,
            move: {
              from: single.from,
              to: single.to,
              privacy: single.privacy
            }
          })
        }
      });
    } else if (logs.length > 1) {
      await tx.activityLog.create({
        data: {
          userId: ownerId,
          action: 'BULK_MOVE',
          entityType: 'MULTIPLE',
          entityId: 'BULK',
          entityName: `${logs.length} items moved`,
          details: JSON.stringify({
            raw: `Bulk move completed for ${logs.length} item(s)`,
            bulk: logs
          })
        }
      });
    }

    return { success: true, count: logs.length, appliedPrivacy: targetPrivacy, location: targetFolderName };
  });
};