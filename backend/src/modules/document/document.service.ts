import { prisma } from '../../config/db';
import { pinata } from '../../config/pinata';
import { logger } from '../../utils/logger';
import { PrivacyLevel } from '@prisma/client';
import fs from 'fs';
import { generateFileHash } from '../../utils/hash';
import blockchainService from '../blockchain/blockchain.service';

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

/** * LOGIKA MANAJEMEN FOLDER, PRIVACY, DAN ADMIN (Sesuai kode kamu)
 */
export const createFolder = async (name: string, userId: string) => {
  return await prisma.folder.create({
    data: { name, ownerId: userId }
  });
};

export const getUserFolders = async (userId: string) => {
  return await prisma.folder.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: 'desc' }
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
 * Memindahkan banyak dokumen sekaligus ke folder lain atau ke root
 */
export const moveMultipleDocuments = async (
  documentIds: string[], 
  userId: string, 
  targetFolderId: string | null
) => {
  // 1. Jika pindah ke folder (bukan root), pastikan folder tersebut milik user
  if (targetFolderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: targetFolderId, ownerId: userId }
    });
    if (!folder) throw new Error("Target folder not found or access denied.");
  }

  // 2. Update semua dokumen yang ID-nya ada di dalam array dan dimiliki oleh userId
  const updateResult = await prisma.document.updateMany({
    where: {
      id: { in: documentIds },
      ownerId: userId
    },
    data: {
      folderId: targetFolderId // Bisa UUID atau null
    }
  });

  if (updateResult.count === 0) {
    throw new Error("No documents were moved. Check if you are the owner.");
  }

  return updateResult;
};

/**
 * Soft delete: Arsipkan dokumen (hanya pemilik)
 */
export const archiveDocument = async (documentId: string, userId: string) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error('Document not found.');
  }

  if (document.ownerId !== userId) {
    throw new Error('Forbidden. You are not the owner of this document.');
  }

  if (document.isArchived) {
    throw new Error('Document is already archived.');
  }

  return await prisma.document.update({
    where: { id: documentId },
    data: {
      isArchived: true,
      deletedAt: new Date(),
    },
  });
};

/**
 * Restore dokumen yang sudah diarsipkan (hanya pemilik)
 */
export const restoreDocument = async (documentId: string, userId: string) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error('Document not found.');
  }

  if (document.ownerId !== userId) {
    throw new Error('Forbidden. You are not the owner of this document.');
  }

  if (!document.isArchived) {
    throw new Error('Document is not archived.');
  }

  return await prisma.document.update({
    where: { id: documentId },
    data: {
      isArchived: false,
      deletedAt: null,
    },
  });
};

/**
 * Mengubah level privasi dokumen (hanya pemilik)
 */
export const updatePrivacy = async (
  documentId: string,
  userId: string,
  privacy: PrivacyLevel
) => {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error('Document not found.');
  }

  if (document.ownerId !== userId) {
    throw new Error('Forbidden. You are not the owner of this document.');
  }

  return await prisma.document.update({
    where: { id: documentId },
    data: { privacy },
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