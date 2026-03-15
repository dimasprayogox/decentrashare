import { prisma } from '../../config/db';
import { pinata } from '../../config/pinata';
import { logger } from '../../utils/logger';
import { PrivacyLevel } from '@prisma/client';
import fs from 'fs';
import { generateFileHash } from '../../utils/hash';
import blockchainService from '../blockchain/blockchain.service';

export const uploadFileFullFlow = async (
  file: Express.Multer.File,
  metadata: { title: string; description?: string; userId: string }
) => {
  try {
    // 1) Hash file (SHA-256)
    const fileHash = await generateFileHash(file.path);

    // 2) Upload ke Pinata (IPFS)
    const fileBuffer = fs.readFileSync(file.path);
    const blob = new Blob([fileBuffer]);
    const fileToUpload = new File([blob], file.originalname, { type: file.mimetype });

    logger.info(`[IPFS] Uploading file to Pinata: ${file.originalname}`);
    const upload = await pinata.upload.file(fileToUpload);

    // 3) Record ke Blockchain
    logger.info(`[CHAIN] Recording file to blockchain: CID=${upload.IpfsHash}`);
    const blockchainTx = await blockchainService.recordToBlockchain(
      upload.IpfsHash,
      file.originalname,
      fileHash
    );

    // 4) Simpan metadata ke DB
    const document = await prisma.document.create({
      data: {
        title: metadata.title,
        description: metadata.description,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        ipfsHash: upload.IpfsHash,
        fileHash,
        blockchainTx,
        isOnChain: true,
        ownerId: metadata.userId,
      },
    });

    logger.info(`[UPLOAD] Success. CID=${upload.IpfsHash} TX=${blockchainTx}`);
    return document;
  } catch (error) {
    logger.error('[UPLOAD] Full flow error:', error);
    throw error;
  } finally {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  }
};

/**
 * Mengambil daftar dokumen milik user yang belum diarsipkan
 */
export const getUserDocuments = async (userId: string) => {
  return await prisma.document.findMany({
    where: {
      ownerId: userId,
      isArchived: false,
    },
    orderBy: { createdAt: 'desc' },
  });
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