import { prisma } from '../../config/db';
import { pinata } from '../../config/pinata';
import { logger } from '../../utils/logger';
import { PrivacyLevel } from '@prisma/client';
import fs from 'fs';
import { generateFileHash } from '../../utils/hash';
import blockchainService from '../blockchain/blockchain.service';

/**
 * Validates document access based on ownership, folder inheritance, and direct sharing.
 * Implements a hybrid access control model.
 */
export const validateDocumentAccess = async (documentId: string, userId: string) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      folder: {
        include: {
          sharedWith: true // Check folder-level permissions
        }
      },
      sharedWith: true // Check file-level permissions
    }
  });

  if (!document) {
    throw new Error("Document not found.");
  }

  // 1. Owner Access: The creator always has full access
  if (document.ownerId === userId) {
    return document;
  }

  // 2. Folder Inheritance: Check if the parent folder grants access
  if (document.folder) {
    // Public Folder access
    if (document.folder.privacy === 'PUBLIC') {
      return document;
    }

    // Shared Folder access: If user is in the folder's access list
    const hasFolderAccess = document.folder.sharedWith.some(
      (access) => access.userId === userId
    );
    if (hasFolderAccess) {
      return document;
    }
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

export const uploadMultipleFiles = async (
  files: Express.Multer.File[],
  userId: string,
  folderId?: string
) => {
  const results = [];

  // SECURITY CHECK: Pastikan folderId (jika ada) milik user yang sedang login
  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, ownerId: userId }
    });
    if (!folder) {
      throw new Error("Target folder not found or access denied.");
    }
  }

  for (const file of files) {
    try {
      const fileHash = await generateFileHash(file.path);

      // CEK DUPLIKAT
      const existingFile = await prisma.document.findUnique({
        where: { fileHash }
      });

      if (existingFile) {
        throw new Error(`Duplicate detected. File contents already exist in the system.`);
      }

      // UPLOAD IPFS
      const fileBuffer = fs.readFileSync(file.path);
      const blob = new Blob([fileBuffer]);
      const fileToUpload = new File([blob], file.originalname, { type: file.mimetype });
      const upload = await pinata.upload.file(fileToUpload);

      // RECORD BLOCKCHAIN
      const blockchainTx = await blockchainService.recordToBlockchain(
        upload.IpfsHash,
        file.originalname,
        fileHash
      );

      // SAVE DB
      const document = await prisma.document.create({
        data: {
          title: file.originalname,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          ipfsHash: upload.IpfsHash,
          fileHash,
          blockchainTx,
          isOnChain: true,
          ownerId: userId,
          folderId: folderId || null, // Jika null, masuk ke Root
        },
      });

      results.push({ success: true, fileName: file.originalname, data: document });
    } catch (error: any) {
      results.push({ success: false, fileName: file.originalname, error: error.message });
    } finally {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }
  }
  return results;
};

export const getRootDocuments = async (userId: string) => {
  return await prisma.document.findMany({
    where: {
      ownerId: userId,
      folderId: null, // Kuncinya di sini
      isArchived: false,
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Mengambil semua dokumen milik user yang aktif (tidak diarsip)
 */
export const getUserDocuments = async (userId: string) => {
  return await prisma.document.findMany({
    where: {
      ownerId: userId,
      isArchived: false, // Hanya ambil yang belum dihapus/diarsip
    },
    include: {
      folder: true, // Sertakan info folder agar di UI bisa kelihatan foldernya
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

/**
 * Archive banyak dokumen sekaligus (Soft Delete)
 */
export const archiveMultipleDocuments = async (documentIds: string[], userId: string) => {
  return await prisma.document.updateMany({
    where: {
      id: { in: documentIds },
      ownerId: userId,
      isArchived: false
    },
    data: {
      isArchived: true,
      deletedAt: new Date()
    }
  });
};

/**
 * Restore banyak dokumen sekaligus
 */
export const restoreMultipleDocuments = async (documentIds: string[], userId: string) => {
  return await prisma.document.updateMany({
    where: {
      id: { in: documentIds },
      ownerId: userId,
      isArchived: true
    },
    data: {
      isArchived: false,
      deletedAt: null
    }
  });
};

/**
 * Mengubah Judul Dokumen (Rename)
 */
export const renameDocument = async (documentId: string, userId: string, newTitle: string) => {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });

  if (!doc || doc.ownerId !== userId) {
    throw new Error("Document not found or unauthorized.");
  }

  return await prisma.document.update({
    where: { id: documentId },
    data: { title: newTitle }
  });
};

/**
 * Update privasi untuk banyak dokumen sekaligus
 */
export const updateMultipleDocumentsPrivacy = async (
  updates: { documentId: string, privacy: PrivacyLevel, targetUserIds?: string[] }[],
  userId: string
) => {
  return await prisma.$transaction(async (tx) => {
    const results = [];

    for (const item of updates) {
      // 1. Validasi kepemilikan
      const doc = await tx.document.findUnique({ where: { id: item.documentId } });
      if (!doc || doc.ownerId !== userId) continue; 

      // 2. Update Privacy Level
      await tx.document.update({
        where: { id: item.documentId },
        data: { privacy: item.privacy }
      });

      // 3. Jika SPECIFIC_USER, kelola aksesnya
      if (item.privacy === 'SPECIFIC_USER' && item.targetUserIds) {
        // Hapus akses lama jika ingin di-reset, atau biarkan jika ingin menambah
        for (const targetId of item.targetUserIds) {
          await tx.documentAccess.upsert({
            where: {
              documentId_userId: { documentId: item.documentId, userId: targetId }
            },
            update: {}, 
            create: { documentId: item.documentId, userId: targetId }
          });
        }
      }

      results.push(item.documentId);
    }

    return { updatedCount: results.length };
  });
};
/**
 * Berbagi dokumen ke user tertentu berdasarkan username (hanya pemilik)
 */
export const shareToUser = async (
  documentId: string,
  ownerId: string,
  targetUsername: string
) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error('Document not found.');
  }

  if (document.ownerId !== ownerId) {
    throw new Error('Forbidden. You are not the owner of this document.');
  }

  const targetUser = await prisma.user.findUnique({
    where: { username: targetUsername },
  });

  if (!targetUser) {
    throw new Error(`User with username "${targetUsername}" not found.`);
  }

  if (targetUser.id === ownerId) {
    throw new Error('You cannot share a document with yourself.');
  }

  // Cek apakah sudah pernah di-share
  const existingAccess = await prisma.documentAccess.findUnique({
    where: {
      documentId_userId: {
        documentId,
        userId: targetUser.id,
      },
    },
  });

  if (existingAccess) {
    throw new Error(`Document already shared with user "${targetUsername}".`);
  }

  // Pastikan privacy diubah ke SPECIFIC_USER jika belum
  if (document.privacy !== PrivacyLevel.SPECIFIC_USER) {
    await prisma.document.update({
      where: { id: documentId },
      data: { privacy: PrivacyLevel.SPECIFIC_USER },
    });
  }

  const access = await prisma.documentAccess.create({
    data: {
      documentId,
      userId: targetUser.id,
    },
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
  });

  logger.info(`[SHARE] Document ${documentId} shared with user ${targetUsername}`);
  return access;
};

/**
 * Mencabut akses dokumen dari user tertentu (hanya pemilik)
 */
export const revokeAccess = async (
  documentId: string,
  ownerId: string,
  targetUsername: string
) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error('Document not found.');
  }

  if (document.ownerId !== ownerId) {
    throw new Error('Forbidden. You are not the owner of this document.');
  }

  const targetUser = await prisma.user.findUnique({
    where: { username: targetUsername },
  });

  if (!targetUser) {
    throw new Error(`User with username "${targetUsername}" not found.`);
  }

  const existingAccess = await prisma.documentAccess.findUnique({
    where: {
      documentId_userId: {
        documentId,
        userId: targetUser.id,
      },
    },
  });

  if (!existingAccess) {
    throw new Error(`User "${targetUsername}" does not have access to this document.`);
  }

  await prisma.documentAccess.delete({
    where: {
      documentId_userId: {
        documentId,
        userId: targetUser.id,
      },
    },
  });

  logger.info(`[SHARE] Access to document ${documentId} revoked from user ${targetUsername}`);
  return { message: `Access revoked for user "${targetUsername}".` };
};

/**
 * Mengambil daftar user yang memiliki akses ke dokumen (hanya pemilik)
 */
export const getSharedUsers = async (documentId: string, ownerId: string) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error('Document not found.');
  }

  if (document.ownerId !== ownerId) {
    throw new Error('Forbidden. You are not the owner of this document.');
  }

  return await prisma.documentAccess.findMany({
    where: { documentId },
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
  });
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