import { prisma } from '../../config/db';
import { pinata } from '../../config/pinata';
import { logger } from '../../utils/logger';
import crypto from 'node:crypto';
import { AccessRoleFolder } from '@prisma/client'; // Kuncinya di sini agar tidak undefined

/** * LOGIKA MANAJEMEN FOLDER, PRIVACY, DAN ADMIN (Sesuai kode kamu)
 */
// src/lib/server/services/folder.service.ts

/**
 * LOGIKA MANAJEMEN FOLDER, PRIVACY, DAN ADMIN
 */
export const createFolder = async (
  name: string, 
  userId: string, 
  parentId: string | null = null
) => {
  const folderName = name.trim();

  const existingFolder = await prisma.folder.findFirst({
    where: {
      name: { 
        equals: folderName, 
        mode: 'insensitive' 
      },
      ownerId: userId,
      parentId: parentId || null, 
      isArchived: false,
      deletedAt: null    
    }
  });

  if (existingFolder) {
    throw new Error(`Folder "${folderName}" already exists in this location`);
  }

  return await prisma.folder.create({
    data: { 
      name: folderName, 
      ownerId: userId, 
      parentId: parentId || null 
    }
  });
};

export const renameFolder = async (
  folderId: string,
  userId: string,
  newName: string
) => {
  const folderName = newName.trim();

  const folder = await prisma.folder.findUnique({
    where: { id: folderId }
  });

  if (!folder || folder.ownerId !== userId) {
    throw new Error("Folder not found or unauthorized.");
  }

  const existingFolder = await prisma.folder.findFirst({
    where: {
      name: {
        equals: folderName,
        mode: 'insensitive'
      },
      ownerId: userId,
      parentId: folder.parentId,
      id: { not: folderId },
      isArchived: false,
      deletedAt: null
    }
  });

  if (existingFolder) {
    throw new Error(`Folder "${folderName}" already exists in this location`);
  }

  return await prisma.folder.update({
    where: { id: folderId },
    data: { name: folderName }
  });
};

export const moveFolder = async (
  folderId: string,
  userId: string,
  targetFolderId: string | null = null
) => {
  return await prisma.$transaction(async (tx) => {
    const folder = await tx.folder.findUnique({ where: { id: folderId } });

    if (!folder || folder.ownerId !== userId || folder.isArchived) {
      throw new Error('Folder not found or unauthorized.');
    }

    if (folderId === targetFolderId) {
      throw new Error('Cannot move a folder into itself.');
    }

    let targetPrivacy: 'PRIVATE' | 'PUBLIC' | 'LINK_ONLY' | 'SPECIFIC_USER' = 'PRIVATE';
    let location = 'Root';

    if (targetFolderId) {
      const targetFolder = await tx.folder.findUnique({ where: { id: targetFolderId } });

      if (!targetFolder || targetFolder.ownerId !== userId || targetFolder.isArchived) {
        throw new Error('Target folder not found or unauthorized.');
      }

      const descendantIds = await getAllDescendantFolderIds(tx, [folderId]);
      if (descendantIds.includes(targetFolderId)) {
        throw new Error('Cannot move a folder into its own subfolder.');
      }

      targetPrivacy = targetFolder.privacy;
      location = targetFolder.name;
    }

    const normalizedTargetFolderId = targetFolderId ?? null;

    if (folder.parentId === normalizedTargetFolderId) {
      throw new Error('Folder is already in this location.');
    }

    const duplicateFolder = await tx.folder.findFirst({
      where: {
        id: { not: folderId },
        ownerId: userId,
        parentId: normalizedTargetFolderId,
        isArchived: false,
        deletedAt: null,
        name: {
          equals: folder.name,
          mode: 'insensitive'
        }
      }
    });

    if (duplicateFolder) {
      throw new Error(`Folder "${folder.name}" already exists in this location`);
    }

    const subtreeFolderIds = await getAllDescendantFolderIds(tx, [folderId]);

    await tx.folder.updateMany({
      where: { id: { in: subtreeFolderIds }, ownerId: userId },
      data: { privacy: targetPrivacy }
    });

    const movedFolder = await tx.folder.update({
      where: { id: folderId },
      data: {
        parentId: targetFolderId,
        privacy: targetPrivacy
      }
    });

    await tx.document.updateMany({
      where: {
        folderId: { in: subtreeFolderIds },
        ownerId: userId,
        isArchived: false
      },
      data: { privacy: targetPrivacy }
    });

    if (targetPrivacy !== 'SPECIFIC_USER') {
      await tx.folderAccess.deleteMany({
        where: { folderId: { in: subtreeFolderIds } }
      });

      const documents = await tx.document.findMany({
        where: {
          folderId: { in: subtreeFolderIds },
          ownerId: userId
        },
        select: { id: true }
      });

      const documentIds = documents.map((document: any) => document.id);

      if (documentIds.length > 0) {
        await tx.documentAccess.deleteMany({
          where: { documentId: { in: documentIds } }
        });
      }
    }

    return {
      folder: movedFolder,
      count: subtreeFolderIds.length,
      appliedPrivacy: targetPrivacy,
      location
    };
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
      parent: {
        select: { id: true, name: true, parentId: true }
      },
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

// folder.service.ts
export const getFolderPath = async (folderId: string) => {
  const path = [];
  let currentId = folderId;

  // Lakukan perulangan sampai tidak ada parentId lagi (sampai Root)
  while (currentId) {
    const folder = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { id: true, name: true, parentId: true }
    });

    if (folder) {
      path.unshift({ id: folder.id, name: folder.name }); // Masukkan ke awal array
      currentId = folder.parentId; // Naik ke level atas
    } else {
      break;
    }
  }

  return path;
};

/**
 * Helper: Get ALL descendant folder IDs recursively (BFS approach)
 * Input: ['folder-a'] → Output: ['folder-a', 'folder-b', 'folder-c', ...]
 */
async function getAllDescendantFolderIds(
  tx: any, // Prisma.TransactionClient
  rootFolderIds: string[]
): Promise<string[]> {
  const allIds = new Set<string>(rootFolderIds);
  let currentLevelIds = [...rootFolderIds];
  
  // Breadth-First Search: traverse folder tree level by level
  while (currentLevelIds.length > 0) {
    const children = await tx.folder.findMany({
      where: {
        parentId: { in: currentLevelIds },
        isArchived: false  // ← Only traverse active folders
      },
      select: { id: true }
    });
    
    const childIds = children.map((c: any) => c.id);
    const newIds = childIds.filter((id: string) => !allIds.has(id));
    
    if (newIds.length === 0) break; // No more descendants
    
    // Add new IDs to set and continue to next level
    newIds.forEach((id: string) => allIds.add(id));
    currentLevelIds = childIds;
  }
  
  return Array.from(allIds);
}

export const getArchivedFolders = async (userId: string) => {
  return await prisma.folder.findMany({
    where: {
      ownerId: userId,
      isArchived: true,  // ← Hanya folder yang di-archive
      deletedAt: { not: null }  // ← Safety: pastikan ada timestamp
    },
    include: {
      // ✅ Include owner info (untuk konsistensi dengan documents)
      owner: {
        select: {
          id: true,
          username: true,
          walletAddress: true,
          avatarUrl: true
        }
      },
      // ✅ Include parent folder info (untuk breadcrumb/navigation)
      parent: {
        select: {
          id: true,
          name: true
        }
      },
      // ✅ Include count of documents inside (untuk UI: "5 items in trash")
      _count: {
        select: { 
          documents: { where: { isArchived: true } }  // Hanya hitung docs yang juga di-archive
        }
      }
    },
    orderBy: { 
      deletedAt: 'desc'  // ← Most recently archived first
    }
  });
};

// ✅ SOFT DELETE: Archive folders + ALL descendants (recursive cascade)
export const archiveFolders = async (folderIds: string[], userId: string) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Validate ownership & filter active folders only
    const folders = await tx.folder.findMany({
      where: {
        id: { in: folderIds },
        ownerId: userId,
        isArchived: false
      },
      select: { id: true }
    });

    if (folders.length === 0) {
      return { count: 0, message: 'No valid folders to archive' };
    }

    const validRootFolderIds = folders.map((f: any) => f.id);
    
    // 2. 🔄 Get ALL descendant folder IDs (recursive)
    const allFolderIdsToArchive = await getAllDescendantFolderIds(tx, validRootFolderIds);
    
    // 3. Archive ALL folders (parent + all descendants)
    await tx.folder.updateMany({
      where: { id: { in: allFolderIdsToArchive } },
      data: {
        isArchived: true,
        deletedAt: new Date()
      }
    });
    
    // 4. 🔄 Archive ALL documents in ALL those folders (cascade)
    await tx.document.updateMany({
      where: { 
        folderId: { in: allFolderIdsToArchive },
        ownerId: userId,
        isArchived: false  // ← Only archive active documents
      },
      data: {
        isArchived: true,
        deletedAt: new Date()
      }
    });
    
    // Return count of ROOT folders archived (not total descendants)
    return { count: validRootFolderIds.length };
  });
};

// ✅ RESTORE: Un-archive folders + ALL descendants (recursive cascade)
export const restoreFolders = async (folderIds: string[], userId: string) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Validate ownership & filter archived folders only
    const folders = await tx.folder.findMany({
      where: {
        id: { in: folderIds },
        ownerId: userId,
        isArchived: true  // ← Only restore archived folders
      },
      select: { id: true }
    });

    if (folders.length === 0) {
      return { count: 0, message: 'No valid folders to restore' };
    }

    const validRootFolderIds = folders.map((f: any) => f.id);
    
    // 2. 🔄 Get ALL descendant folder IDs (recursive)
    const allFolderIdsToRestore = await getAllDescendantFolderIds(tx, validRootFolderIds);
    
    // 3. Restore ALL folders
    await tx.folder.updateMany({
      where: { id: { in: allFolderIdsToRestore } },
      data: {
        isArchived: false,
        deletedAt: null
      }
    });
    
    // 4. 🔄 Restore ALL documents in ALL those folders
    await tx.document.updateMany({
      where: { 
        folderId: { in: allFolderIdsToRestore },
        ownerId: userId,
        isArchived: true  // ← Only restore archived documents
      },
      data: {
        isArchived: false,
        deletedAt: null
      }
    });
    
    return { count: validRootFolderIds.length };
  });
};

// ✅ PERMANENT DELETE: Destroy folders + ALL descendants (recursive cascade)
export const destroyFolders = async (folderIds: string[], userId: string) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Validate: only destroy folders that are already archived (safety check)
    const folders = await tx.folder.findMany({
      where: {
        id: { in: folderIds },
        ownerId: userId,
        isArchived: true  // ← Safety: only destroy archived items
      },
      select: { id: true }
    });

    if (folders.length === 0) {
      return { count: 0, message: 'No valid folders to destroy' };
    }

    const validRootFolderIds = folders.map((f: any) => f.id);
    
    // 2. 🔄 Get ALL descendant folder IDs (recursive)
    const allFolderIdsToDestroy = await getAllDescendantFolderIds(tx, validRootFolderIds);
    
    // 3. Delete all folderAccess relations first (foreign key constraint)
    await tx.folderAccess.deleteMany({
      where: { folderId: { in: allFolderIdsToDestroy } }
    });
    
    // 4. 🔄 Delete ALL documents in ALL those folders (cascade hard delete)
    await tx.document.deleteMany({
      where: { 
        folderId: { in: allFolderIdsToDestroy },
        ownerId: userId 
      }
    });
    
    // 5. Delete ALL folders (cascade hard delete)
    await tx.folder.deleteMany({
      where: { id: { in: allFolderIdsToDestroy } }
    });
    
    return { count: validRootFolderIds.length };
  });
};

export const getUserFolders = async (userId: string, parentId: string | null = null) => {
  return await prisma.folder.findMany({
    where: { 
      ownerId: userId,
      parentId: parentId,
      isArchived: false // Pastikan hanya ambil yang aktif
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
      const folder = await tx.folder.findUnique({ where: { id: item.folderId } });
      if (!folder || folder.ownerId !== ownerId) continue;

      const subtreeFolderIds = await getAllDescendantFolderIds(tx, [item.folderId]);
      const folderResults = [];

      for (const target of item.targetUsers) {
        if (target.userId === ownerId) continue;

        for (const folderId of subtreeFolderIds) {
          await tx.folderAccess.upsert({
            where: {
              folderId_userId: { folderId, userId: target.userId }
            },
            update: { role: target.role },
            create: {
              folderId,
              userId: target.userId,
              role: target.role
            }
          });
        }

        folderResults.push({ userId: target.userId, role: target.role, status: 'granted' });
      }

      await tx.folder.updateMany({
        where: { id: { in: subtreeFolderIds }, ownerId },
        data: { privacy: 'SPECIFIC_USER' }
      });

      await tx.document.updateMany({
        where: { folderId: { in: subtreeFolderIds }, ownerId },
        data: { privacy: 'SPECIFIC_USER' }
      });

      finalResults.push({ folderId: item.folderId, sharedWith: folderResults, cascadedFolders: subtreeFolderIds.length });
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
      const folder = await tx.folder.findUnique({ where: { id: item.folderId } });
      if (!folder || folder.ownerId !== ownerId) continue;

      const subtreeFolderIds = await getAllDescendantFolderIds(tx, [item.folderId]);
      const deleteResult = await tx.folderAccess.deleteMany({
        where: {
          folderId: { in: subtreeFolderIds },
          userId: { in: item.targetUserIds }
        }
      });

      const foldersWithAccess = await tx.folderAccess.findMany({
        where: { folderId: { in: subtreeFolderIds } },
        select: { folderId: true },
        distinct: ['folderId']
      });
      const sharedFolderIds = new Set(foldersWithAccess.map((access: any) => access.folderId));
      const privateFolderIds = subtreeFolderIds.filter(folderId => !sharedFolderIds.has(folderId));

      if (privateFolderIds.length > 0) {
        await tx.folder.updateMany({
          where: { id: { in: privateFolderIds }, ownerId },
          data: { privacy: 'PRIVATE' }
        });

        await tx.document.updateMany({
          where: { folderId: { in: privateFolderIds }, ownerId },
          data: { privacy: 'PRIVATE' }
        });
      }

      finalResults.push({
        folderId: item.folderId,
        revokedCount: deleteResult.count,
        cascadedFolders: subtreeFolderIds.length,
        newStatus: privateFolderIds.length === subtreeFolderIds.length ? 'PRIVATE' : 'SPECIFIC_USER'
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
          // Akses folder sudah memberi hak melihat dokumen di dalam folder tersebut.
          documents: {
            where: {
              isArchived: false
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
      const folder = await tx.folder.findFirst({
        where: { id: item.folderId, ownerId }
      });

      if (!folder) {
        results.push({
          folderId: item.folderId,
          status: 'failed',
          newPrivacy: item.newPrivacy,
          accessRevoked: 0
        });
        continue;
      }

      const subtreeFolderIds = await getAllDescendantFolderIds(tx, [item.folderId]);

      const folderUpdate = await tx.folder.updateMany({
        where: { id: { in: subtreeFolderIds }, ownerId },
        data: { privacy: item.newPrivacy }
      });

      await tx.document.updateMany({
        where: { folderId: { in: subtreeFolderIds }, ownerId },
        data: { privacy: item.newPrivacy }
      });

      let accessDeleted = 0;
      if (item.newPrivacy !== 'SPECIFIC_USER') {
        const deleted = await tx.folderAccess.deleteMany({
          where: { folderId: { in: subtreeFolderIds } }
        });
        accessDeleted = deleted.count;
      }

      results.push({
        folderId: item.folderId,
        status: folderUpdate.count > 0 ? 'updated' : 'failed',
        newPrivacy: item.newPrivacy,
        accessRevoked: accessDeleted,
        cascadedFolders: subtreeFolderIds.length
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