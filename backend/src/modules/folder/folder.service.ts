import { prisma } from '../../config/db';
import { pinata } from '../../config/pinata';
import { logger } from '../../utils/logger';
import crypto from 'node:crypto';
import { AccessRoleFolder } from '@prisma/client'; // Kuncinya di sini agar tidak undefined


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

/**
 * Mengubah nama folder
 */
export const renameFolder = async (folderId: string, userId: string, newName: string) => {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });

  if (!folder || folder.ownerId !== userId) {
    throw new Error("Folder not found or unauthorized.");
  }

  return await prisma.folder.update({
    where: { id: folderId },
    data: { name: newName }
  });
};

/**
 * Mendapatkan detail satu folder (tanpa load semua isi filenya)
 */
export const getFolderDetail = async (folderId: string, userId: string) => {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    include: {
      owner: { select: { username: true, walletAddress: true } },
      _count: { select: { documents: true } }
    }
  });

  if (!folder) throw new Error("Folder not found.");

  // Cek akses (Owner atau Shared User)
  const hasAccess = folder.ownerId === userId || await prisma.folderAccess.findUnique({
    where: { folderId_userId: { folderId, userId } }
  });

  if (!hasAccess && folder.privacy !== 'PUBLIC') {
    throw new Error("Access denied.");
  }

  return folder;
};

/**
 * Menghapus/Mengarsipkan banyak folder sekaligus berdasarkan kondisi isi
 */
export const deleteMultipleFolders = async (folderIds: string[], userId: string) => {
  // 1. Ambil semua folder beserta info jumlah dokumen di dalamnya
  const folders = await prisma.folder.findMany({
    where: {
      id: { in: folderIds },
      ownerId: userId
    },
    include: {
      _count: { select: { documents: true } }
    }
  });

  if (folders.length === 0) throw new Error("Folders not found.");

  // Pisahkan mana yang harus dihapus permanen (kosong) dan mana yang diarsip (ada isi)
  const emptyFolderIds = folders.filter(f => f._count.documents === 0).map(f => f.id);
  const foldersToArchive = folders.filter(f => f._count.documents > 0).map(f => f.id);

  return await prisma.$transaction(async (tx) => {
    // --- AKSI 1: HAPUS PERMANEN FOLDER KOSONG ---
    if (emptyFolderIds.length > 0) {
      await tx.folderAccess.deleteMany({ where: { folderId: { in: emptyFolderIds } } });
      await tx.folder.deleteMany({
        where: { id: { in: emptyFolderIds }, ownerId: userId }
      });
    }

    // --- AKSI 2: ARSIPKAN FOLDER YANG ADA ISINYA ---
    if (foldersToArchive.length > 0) {
      // Arsipkan foldernya
      await tx.folder.updateMany({
        where: { id: { in: foldersToArchive }, ownerId: userId },
        data: {
          isArchived: true,
          deletedAt: new Date()
        }
      });

      // Arsipkan semua dokumen di dalamnya
      await tx.document.updateMany({
        where: { folderId: { in: foldersToArchive }, ownerId: userId },
        data: {
          isArchived: true,
          deletedAt: new Date()
        }
      });
      
      // Catatan: folderId di dokumen TETAP dipertahankan agar saat di menu Arsip,
      // dokumen tersebut masih terlihat berada di dalam foldernya.
    }

    return {
      deletedCount: emptyFolderIds.length,
      archivedCount: foldersToArchive.length
    };
  });
};

/**
 * Mengembalikan folder dan semua dokumen di dalamnya dari arsip
 */
export const restoreMultipleFolders = async (folderIds: string[], userId: string) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Kembalikan Foldernya
    await tx.folder.updateMany({
      where: { id: { in: folderIds }, ownerId: userId },
      data: { isArchived: false, deletedAt: null }
    });

    // 2. Kembalikan semua dokumen yang ada di dalam folder tersebut
    await tx.document.updateMany({
      where: { folderId: { in: folderIds }, ownerId: userId },
      data: { isArchived: false, deletedAt: null }
    });

    return { count: folderIds.length };
  });
};

export const getUserFolders = async (userId: string) => {
  return await prisma.folder.findMany({
    where: { 
      ownerId: userId,
      isArchived: false // Pastikan hanya ambil yang aktif
    },
    orderBy: { createdAt: 'desc' }
  });
};

/**
 * Memindahkan banyak dokumen sekaligus ke folder lain atau ke root
 */
export const moveMultipleDocuments = async (documentIds: string[], userId: string, targetFolderId: string | null) => {
  
  if (!userId) throw new Error("Service Error: userId is required");

  if (targetFolderId) {
    // Cari folder secara manual untuk debug
    const folder = await prisma.folder.findFirst({
      where: { 
        id: targetFolderId,
        ownerId: userId // Harus cocok dengan ID yang login
      }
    });

    if (!folder) {
      // Jika masuk sini, berarti ID folder salah ATAU folder itu punya orang lain
      throw new Error(`Folder tidak ditemukan atau Bos bukan pemilik folder tersebut.`);
    }
  }

  // Lanjutkan update
  return await prisma.document.updateMany({
    where: {
      id: { in: documentIds },
      ownerId: userId
    },
    data: { folderId: targetFolderId }
  });
};
/**
 * Berbagi folder ke banyak user (Hanya untuk user yang BELUM punya akses)
 */
export const shareFolderToMultipleUsers = async (
  folderId: string, 
  ownerId: string, 
  shares: { targetUserId: string, role: AccessRoleFolder }[]
) => {
  // 1. Validasi folder dan kepemilikan
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.ownerId !== ownerId) {
    throw new Error('Folder not found or unauthorized.');
  }

  // --- VALIDASI PRIVACY LEVEL ---
  if (folder.privacy === 'PRIVATE') {
    throw new Error('Cannot share a PRIVATE folder. Please change privacy level to SPECIFIC_USER or LINK_ONLY first.');
  }

  // 2. Eksekusi secara paralel
  const results = await Promise.all(
    shares.map(async (share) => {
      try {
        if (share.targetUserId === ownerId) {
          return { success: false, userId: share.targetUserId, error: "Cannot share with yourself" };
        }

        // --- CEK APAKAH AKSES SUDAH ADA ---
        const existingAccess = await prisma.folderAccess.findUnique({
          where: {
            folderId_userId: { folderId, userId: share.targetUserId },
          },
        });

        if (existingAccess) {
          return { 
            success: false, 
            userId: share.targetUserId, 
            error: "User already has access. Use PATCH to change their role." 
          };
        }

        // Jika belum ada, baru kita CREATE (Bukan Upsert)
        const access = await prisma.folderAccess.create({
          data: { 
            folderId, 
            userId: share.targetUserId, 
            role: share.role 
          },
          include: { user: { select: { username: true } } }
        });

        return { success: true, userId: share.targetUserId, role: share.role, data: access };
      } catch (error: any) {
        return { success: false, userId: share.targetUserId, error: error.message };
      }
    })
  );

  return results;
};

/**
 * Mengambil daftar user yang memiliki akses ke folder (hanya pemilik)
 */
export const getSharedUsers = async (folderId: string, ownerId: string) => {
  // 1. Pastikan folder tersebut memang milik si pemanggil
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
  });

  if (!folder || folder.ownerId !== ownerId) {
    throw new Error('Forbidden. You are not the owner of this folder.');
  }

  // 2. Ambil data akses beserta info usernya
  return await prisma.folderAccess.findMany({
    where: { folderId },
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

/**
 * Update akses banyak user sekaligus (Massal)
 */
export const updateMultipleFolderAccessRoles = async (
  folderId: string, 
  ownerId: string, 
  updates: { targetUserId: string, newRole: AccessRoleFolder }[]
) => {
  // 1. Pastikan folder milik si pengirim
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.ownerId !== ownerId) {
    throw new Error('Unauthorized or folder not found.');
  }

   // --- VALIDASI PRIVACY LEVEL ---
  if (folder.privacy === 'PRIVATE') {
    throw new Error('Cannot share a PRIVATE folder. Please change privacy level to SPECIFIC_USER or LINK_ONLY first.');
  }

  // 2. Eksekusi update secara paralel
  const results = await Promise.all(
    updates.map(async (item) => {
      try {
        const updatedAccess = await prisma.folderAccess.update({
          where: {
            folderId_userId: {
              folderId: folderId,
              userId: item.targetUserId
            }
          },
          data: { role: item.newRole },
          include: { user: { select: { username: true } } }
        });

        return { success: true, userId: item.targetUserId, newRole: item.newRole, username: updatedAccess.user.username };
      } catch (error: any) {
        // Jika ID user tidak ditemukan di daftar shared, kirim error spesifik per user
        return { success: false, userId: item.targetUserId, error: "Access record not found" };
      }
    })
  );

  return results;
};

/**
 * Mencabut akses banyak user sekaligus dari sebuah folder
 */
export const revokeMultipleFolderAccess = async (
  folderId: string, 
  ownerId: string, 
  targetUserIds: string[] // Menerima array ID user
) => {
  // 1. Validasi kepemilikan folder
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.ownerId !== ownerId) {
    throw new Error('Unauthorized or folder not found.');
  }

  // 2. Hapus semua akses yang cocok dengan folderId dan list userId
  const deleteResult = await prisma.folderAccess.deleteMany({
    where: {
      folderId: folderId,
      userId: { in: targetUserIds }
    }
  });

  logger.info(`[REVOKE] Removed ${deleteResult.count} users from folder ${folderId}`);
  
  return {
    count: deleteResult.count,
    message: `Successfully revoked access for ${deleteResult.count} users.`
  };
};


/**
 * Mengambil daftar folder milik orang lain yang dibagikan ke saya
 */
export const getSharedWithMeFolders = async (userId: string) => {
  const sharedAccess = await prisma.folderAccess.findMany({
    where: { userId: userId },
    include: {
      folder: {
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              walletAddress: true,
              avatarUrl: true
            }
          },
          _count: {
            select: { documents: true } // Menghitung jumlah file di dalamnya
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Kita mapping agar struktur datanya lebih enak dibaca oleh Frontend
  return sharedAccess.map(item => ({
    accessId: item.id,
    role: item.role,
    sharedAt: item.createdAt,
    folder: item.folder
  }));
};

export const getFolderContents = async (folderId: string, userId?: string, shareToken?: string) => {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    include: { sharedWith: true }
  });

  if (!folder) throw new Error("Folder not found");

  // 1. Jika Folder PUBLIC -> Semua orang bisa lihat
  if (folder.privacy === 'PUBLIC') return await getFiles(folderId);

  // 2. Jika Folder LINK_ONLY -> Cek apakah tokennya cocok
  if (folder.privacy === 'LINK_ONLY') {
    if (shareToken && folder.shareToken === shareToken) {
      return await getFiles(folderId);
    }
    throw new Error("Invalid share link");
  }

  // 3. Jika PRIVATE atau SPECIFIC_USER -> Butuh Login (userId)
  if (!userId) throw new Error("Authentication required");

  const isOwner = folder.ownerId === userId;
  const hasAccess = folder.sharedWith.some(access => access.userId === userId);

  if (isOwner || hasAccess) {
    return await getFiles(folderId);
  }

  throw new Error("You don't have permission to access this folder");
};

// Fungsi pembantu biar gak ngetik ulang
const getFiles = async (folderId: string) => {
  return await prisma.document.findMany({
    where: { folderId, isArchived: false },
    orderBy: { createdAt: 'desc' }
  });
};

/**
 * Mengubah Privacy Level & Generate Share Token
 */
export const updateFolderPrivacy = async (folderId: string, ownerId: string, privacy: PrivacyLevel) => {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });

  if (!folder || folder.ownerId !== ownerId) throw new Error('Unauthorized');

  // Generate token baru jika pindah ke LINK_ONLY dan belum punya token
  let shareToken = folder.shareToken;
  if (privacy === 'LINK_ONLY' && !shareToken) {
    shareToken = crypto.randomBytes(16).toString('hex');
  } else if (privacy === 'PRIVATE') {
    shareToken = null; // Reset token jika kembali ke private agar link lama mati
  }

  return await prisma.folder.update({
    where: { id: folderId },
    data: { privacy, shareToken }
  });
};

/**
 * Akses Folder Publik lewat Token (Tanpa Login)
 */
export const getPublicFolderByToken = async (shareToken: string) => {
  const folder = await prisma.folder.findUnique({
    where: { shareToken },
    include: {
      owner: { select: { username: true } },
      documents: {
        where: { isArchived: false },
        select: {
          id: true,
          title: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          createdAt: true
          // Jangan tampilkan ipfsHash atau data sensitif jika belum diperlukan
        }
      }
    }
  });

  if (!folder || folder.privacy !== 'LINK_ONLY') {
    throw new Error('This link is invalid or the folder is no longer public.');
  }

  return folder;
};