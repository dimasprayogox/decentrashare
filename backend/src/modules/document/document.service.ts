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

  if (document.isArchived) { 
    throw new Error("Document is in trash.");
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

  // 1. SECURITY CHECK: Pastikan folder tujuan milik si Bos
  let targetPrivacy: PrivacyLevel = 'PRIVATE';
  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, ownerId: userId }
    });
    if (!folder) throw new Error("Target folder not found or access denied.");
    
    // File baru otomatis ikut privasi folder (Google Drive Style)
    targetPrivacy = folder.privacy;
  }

  for (const file of files) {
    try {
      const fileHash = await generateFileHash(file.path);

      // 2. CEK DUPLIKAT (Berdasarkan Konten File)
      const existingFile = await prisma.document.findUnique({
        where: { fileHash }
      });
      if (existingFile) throw new Error(`Duplicate detected. This file already exists.`);

      // 3. UPLOAD KE IPFS (Pinata)
      const fileBuffer = fs.readFileSync(file.path);
      const upload = await pinata.upload.file(
        new File([new Blob([fileBuffer])], file.originalname, { type: file.mimetype })
      );

      // 4. RECORD KE BLOCKCHAIN (Kekuatan Utama Decentrashare!)
      const blockchainTx = await blockchainService.recordToBlockchain(
        upload.IpfsHash,
        file.originalname,
        fileHash
      );

      // 5. SAVE KE DB & LOG AKTIVITAS (Pakai Transaction agar aman)
      const newDocument = await prisma.$transaction(async (tx) => {
        const doc = await tx.document.create({
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
            folderId: folderId || null,
            privacy: targetPrivacy, // Sinkronisasi otomatis
          },
        });

        // CATAT KE ACTIVITY LOG
        await tx.activityLog.create({
          data: {
            userId: userId,
            action: "UPLOAD",
            entityType: "DOCUMENT",
            entityId: doc.id,
            entityName: doc.title,
            fileHash: doc.fileHash,
            ipfsHash: doc.ipfsHash,
            blockchainTx: doc.blockchainTx,
            details: `Successfully uploaded to ${folderId ? 'Folder' : 'Root'}.`
          }
        });

        return doc;
      });

      results.push({ success: true, fileName: file.originalname, data: newDocument });
    } catch (error: any) {
      results.push({ success: false, fileName: file.originalname, error: error.message });
    } finally {
      // Bersihkan file sementara di server
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

export const moveMultipleDocuments = async (
  documentIds: string[], 
  userId: string, 
  targetFolderId: string | null
) => {
  return await prisma.$transaction(async (tx) => {
    let targetPrivacy: PrivacyLevel = 'PRIVATE';

    if (targetFolderId) {
      const folder = await tx.folder.findFirst({
        where: {
          id: targetFolderId,
          OR: [
            { ownerId: userId },
            { sharedWith: { some: { userId: userId, role: 'EDITOR' } } }
          ]
        }
      });

      if (!folder) throw new Error("Target folder not found or No Permission.");
      targetPrivacy = folder.privacy;
    }

    // LOG 2: Cek apakah file-file ini sebenarnya ada di DB dan milik Bos
    const checkDocs = await tx.document.findMany({
      where: { id: { in: documentIds }, ownerId: userId }
    });
    const result = await tx.document.updateMany({
      where: {
        id: { in: documentIds },
        ownerId: userId,
        isArchived: false
      },
      data: { 
        folderId: targetFolderId,
        privacy: targetPrivacy 
      }
    });

    return { 
      count: result.count, 
      appliedPrivacy: targetPrivacy,
      location: targetFolderId ? "Folder" : "Root" 
    };
  });
};

/**
 * Mengambil semua dokumen milik user yang aktif (tidak diarsip)
 */
export const getUserDocuments = async (userId: string) => {
  return await prisma.document.findMany({
    where: {
      ownerId: userId,
      isArchived: false,
    },
    include: {
      folder: true, 
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

/**
 * Archive banyak dokumen sekaligus (Soft Delete)
 * Ditambah logika: Set privacy ke PRIVATE agar akses orang lain terputus otomatis
 */
export const archiveDocuments = async (documentIds: string[], userId: string) => {
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
export const restoreDocuments = async (documentIds: string[], userId: string) => {
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
    await tx.activityLog.createMany({
      data: docs.map(doc => ({
        userId: userId,
        action: "PERMANENT_DELETE",
        entityType: "DOCUMENT",
        entityId: doc.id,
        entityName: doc.title,
        fileHash: doc.fileHash,
        ipfsHash: doc.ipfsHash,
        blockchainTx: doc.blockchainTx,
        details: "Document and its access records permanently purged."
      }))
    });

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

/**
 * Mengubah Judul Dokumen (Rename)
 */
export const renameDocument = async (documentId: string, userId: string, newTitle: string) => {
  const doc = await prisma.document.findFirst({ where: { id: documentId, ownerId: userId,
      isArchived: false } });

  if (!doc || doc.ownerId !== userId) {
    throw new Error("Document not found or unauthorized.");
  }

  return await prisma.document.update({
    where: { id: documentId },
    data: { title: newTitle }
  });
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
  // 1. Ambil semua dokumen yang diminta dan pastikan Bos adalah pemiliknya
// 1. Ambil semua dokumen yang ID-nya ada dalam array dan dimiliki oleh Bos
  const documents = await prisma.document.findMany({
    where: {
      id: { in: documentIds }, // Menggunakan operator 'in' untuk mencari banyak ID
      ownerId: ownerId
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

/**
 * Mengambil daftar dokumen milik orang lain yang dibagikan ke saya (Versi Tanpa Error createdAt)
 */
export const getSharedWithMeDocuments = async (userId: string) => {
  const sharedAccess = await prisma.documentAccess.findMany({
    where: { 
      userId: userId,
      document: {
        isArchived: false 
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
    // Kita hapus orderBy createdAt-nya karena kolomnya tidak ada di schema
  });

  return sharedAccess.map(item => ({
    accessId: item.id,
    document: item.document
  }));
};

/**
 * Mengambil log aktivitas milik user (Terbaru ke Terlama)
 */
export const getActivityLogs = async (userId: string) => {
  return await prisma.activityLog.findMany({
    where: {
      userId: userId
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 50, // Ambil 50 aktivitas terakhir saja biar ringan
  });
};