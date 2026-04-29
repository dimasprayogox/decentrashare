import { prisma } from '../../config/db';
import { pinata } from '../../config/pinata';
import { logger } from '../../utils/logger';
import crypto from 'node:crypto';
import { AccessRoleFolder } from '@prisma/client'; // Kuncinya di sini agar tidak undefined

/** * LOGIKA MANAJEMEN FOLDER, PRIVACY, DAN ADMIN (Sesuai kode kamu)
 */
export const createFolder = async (name: string, userId: string, parentId: string | null = null) => {
  return await prisma.folder.create({
    data: { name, ownerId: userId, parentId: parentId }
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

export const getUserFolders = async (userId: string, parentId: string | null = null) => {
  return await prisma.folder.findMany({
    where: { 
      ownerId: userId,
      parentId: parentId,
      isArchived: false // Pastikan hanya ambil yang aktif
    },
    orderBy: { createdAt: 'desc' }
  });
};

/**
 * Flexible Folder Sharing: Different folders to different users with specific roles
 */
export const shareFoldersFlexible = async (
  ownerId: string,
  shares: { folderId: string; targetUsers: { userId: string; role: AccessRoleFolder }[] }[]
) => {
  return await prisma.$transaction(async (tx) => {
    const finalResults = [];

    for (const item of shares) {
      // 1. Validasi Kepemilikan Folder
      const folder = await tx.folder.findUnique({ where: { id: item.folderId } });
      if (!folder || folder.ownerId !== ownerId) continue;

      // 2. Loop User yang akan diberi akses ke folder ini
      const folderResults = [];
      for (const target of item.targetUsers) {
        if (target.userId === ownerId) continue;

        // Gunakan upsert: Jika sudah ada update rolenya, jika belum buat baru
        const access = await tx.folderAccess.upsert({
          where: {
            folderId_userId: { folderId: item.folderId, userId: target.userId }
          },
          update: { role: target.role }, 
          create: { 
            folderId: item.folderId, 
            userId: target.userId, 
            role: target.role 
          }
        });
        folderResults.push({ userId: target.userId, role: target.role, status: 'granted' });
      }

      // 3. AUTOMATIC PRIVACY SYNC (Google Drive Style)
      // Saat dishare ke orang tertentu, folder & isinya otomatis jadi SPECIFIC_USER
      await tx.folder.update({
        where: { id: item.folderId },
        data: { privacy: 'SPECIFIC_USER' }
      });

      await tx.document.updateMany({
        where: { folderId: item.folderId, ownerId },
        data: { privacy: 'SPECIFIC_USER' }
      });

      finalResults.push({ folderId: item.folderId, sharedWith: folderResults });
    }

    return finalResults;
  });
};

  /**
 * Mengambil daftar user yang memiliki akses ke banyak folder sekaligus (Hanya Pemilik)
 */
export const getFoldersSharedUsers = async (folderIds: string[], ownerId: string) => {
  const folders = await prisma.folder.findMany({
    where: {
      id: { in: folderIds },
      ownerId: ownerId
    },
    select: {
      id: true,
      name: true,
      privacy: true,
      sharedWith: { // Relasi ke tabel folderAccess
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

  if (folders.length === 0) {
    throw new Error('Folders not found or you are not the owner.');
  }

  return folders;
};

/**
 * Revoke (Delete) access from multiple users for multiple folders
 */
export const revokeFoldersAccess = async (
  ownerId: string,
  revokes: { folderId: string; targetUserIds: string[] }[]
) => {
  return await prisma.$transaction(async (tx) => {
    const finalResults = [];

    for (const item of revokes) {
      // 1. Validasi Kepemilikan Folder
      const folder = await tx.folder.findUnique({ where: { id: item.folderId } });
      if (!folder || folder.ownerId !== ownerId) continue;

      // 2. Hapus Akses User dari tabel FolderAccess
      const deleteResult = await tx.folderAccess.deleteMany({
        where: {
          folderId: item.folderId,
          userId: { in: item.targetUserIds }
        }
      });

      // 3. Check: Jika sudah tidak ada lagi yang punya akses, 
      // kembalikan folder & semua isinya ke PRIVATE (Google Drive Style)
      const remainingAccess = await tx.folderAccess.count({
        where: { folderId: item.folderId }
      });

      if (remainingAccess === 0) {
        // Kunci Foldernya
        await tx.folder.update({
          where: { id: item.folderId },
          data: { privacy: 'PRIVATE' }
        });

        // Kunci semua isinya (Penting untuk keamanan!)
        await tx.document.updateMany({
          where: { folderId: item.folderId, ownerId },
          data: { privacy: 'PRIVATE' }
        });
      }

      finalResults.push({ 
        folderId: item.folderId, 
        revokedCount: deleteResult.count,
        newStatus: remainingAccess === 0 ? 'PRIVATE' : 'SPECIFIC_USER'
      });
    }

    return finalResults;
  });
};

/**
 * Mengambil daftar folder milik orang lain yang dibagikan ke saya (Lengkap dengan Isi Dokumen)
 */
export const getSharedWithMeFolders = async (userId: string) => {
  const sharedAccess = await prisma.folderAccess.findMany({
    where: { 
      userId: userId,
      folder: {
        isArchived: false // Pastikan foldernya sendiri tidak sedang diarsip
      }
    },
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
          // AMBIL SEMUA DOKUMEN DI DALAM FOLDER INI
          documents: {
            where: { 
              isArchived: false,
              OR: [
                { privacy: 'PUBLIC' }, // Lolos jika publik
                { privacy: 'LINK_ONLY' }, // Lolos jika link only
                {
                  AND: [
                    { privacy: 'SPECIFIC_USER' },
                    { 
                      sharedWith: { 
                        some: { userId: userId } // Lolos HANYA jika user terdaftar di file ini
                      } 
                    }
                  ]
                }
              ]
            },
            include: {
              owner: {
                select: {
                  id: true,
                  username: true,
                  avatarUrl: true
                }
              }
            },
            orderBy: { createdAt: 'desc' }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return sharedAccess.map(item => ({
    accessId: item.id,
    role: item.role,
    sharedAt: item.createdAt,
    folder: item.folder // Sekarang di dalam folder ini sudah ada array 'documents'
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
export const updateFoldersPrivacy = async (
  ownerId: string,
  updates: { folderId: string; newPrivacy: PrivacyLevel }[]
) => {
  return await prisma.$transaction(async (tx) => {
    const results = [];

    for (const item of updates) {
      // 1. Update Foldernya
      const folderUpdate = await tx.folder.updateMany({
        where: { id: item.folderId, ownerId: ownerId },
        data: { privacy: item.newPrivacy }
      });

      // 2. Sinkronisasi Dokumen di dalamnya
      await tx.document.updateMany({
        where: { folderId: item.folderId, ownerId: ownerId },
        data: { privacy: item.newPrivacy }
      });

      // 3. LOGIKA CLEANUP TOTAL:
      // Jika status baru BUKAN 'SPECIFIC_USER', hapus semua akses user agar tidak menumpuk.
      let accessDeleted = 0;
      if (item.newPrivacy !== 'SPECIFIC_USER') {
        const deleted = await tx.folderAccess.deleteMany({
          where: { folderId: item.folderId }
        });
        accessDeleted = deleted.count;
      }

      results.push({
        folderId: item.folderId,
        status: folderUpdate.count > 0 ? 'updated' : 'failed',
        newPrivacy: item.newPrivacy,
        accessRevoked: accessDeleted
      });
    }

    return results;
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