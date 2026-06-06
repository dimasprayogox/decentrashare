import { prisma } from '../../config/db';
import { logger } from '../../utils/logger';
import { prepareFolderArchive, sanitizeDocuments } from '../document/document.service';
import crypto from 'node:crypto';
import { AccessRoleFolder, PrivacyLevel } from '@prisma/client'; // Kuncinya di sini agar tidak undefined

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

  const ownerId = userId;
  let parentOwnerId: string | null = null;
  let parentPrivacy: PrivacyLevel | null = null;

  if (parentId) {
    const parentFolder = await prisma.folder.findUnique({
      where: { id: parentId },
      include: { sharedWith: true }
    });
    const parentAccess = parentFolder?.sharedWith.find(access => access.userId === userId);
    const canCreate = parentFolder?.ownerId === userId || ['EDITOR', 'ADMIN'].includes(parentAccess?.role || '');
    if (!parentFolder) throw new Error('Parent folder not found.');
    if (!canCreate) {
      const error: any = new Error('You only have viewer access to this folder');
      error.status = 403;
      error.errorCode = 'FOLDER_WRITE_FORBIDDEN';
      throw error;
    }
    parentOwnerId = parentFolder.ownerId;
    parentPrivacy = parentFolder.privacy;
  }

  const existingFolder = await prisma.folder.findFirst({
    where: {
      name: {
        equals: folderName,
        mode: 'insensitive'
      },
      ownerId,
      parentId: parentId || null,
      isArchived: false,
      deletedAt: null
    }
  });

  if (existingFolder) {
    throw new Error(`Folder "${folderName}" already exists in this location`);
  }

  const folder = await prisma.folder.create({
    data: {
      name: folderName,
      ownerId,
      parentId: parentId || null,
      privacy: parentId ? parentPrivacy ?? 'SPECIFIC_USER' : 'PRIVATE'
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
    }
  });

  if (parentId) {
    const parentAccess = await prisma.folderAccess.findMany({
      where: { folderId: parentId },
      select: { userId: true, role: true }
    });

    const inheritedAccess = new Map(parentAccess.map(access => [access.userId, access.role]));
    if (parentOwnerId && parentOwnerId !== ownerId) inheritedAccess.set(parentOwnerId, 'EDITOR');
    inheritedAccess.delete(ownerId);

    if (inheritedAccess.size > 0) {
      await prisma.folderAccess.createMany({
        data: Array.from(inheritedAccess.entries()).map(([userId, role]) => ({
          folderId: folder.id,
          userId,
          role
        })),
        skipDuplicates: true
      });
    }
  }

  try {
    await prisma.activityLog.create({
      data: {
        userId,
        action: 'CREATE',
        entityType: 'FOLDER',
        entityId: folder.id,
        entityName: folderName,
        details: `Folder created: ${folderName}`
      }
    });
  } catch (err) {
    logger.error('Failed to log createFolder activity:', err);
  }

  return folder;
};

export const renameFolder = async (
  folderId: string,
  userId: string,
  newName: string
) => {
  const folderName = newName.trim();

  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    include: { sharedWith: { where: { userId }, select: { role: true } } }
  });

  const canRename = folder?.ownerId === userId || folder?.sharedWith.some(access => access.role === 'EDITOR');
  if (!folder || !canRename) {
    throw new Error("Folder not found or unauthorized.");
  }

  const existingFolder = await prisma.folder.findFirst({
    where: {
      name: {
        equals: folderName,
        mode: 'insensitive'
      },
      ownerId: folder.ownerId,
      parentId: folder.parentId,
      id: { not: folderId },
      isArchived: false,
      deletedAt: null
    }
  });

  if (existingFolder) {
    throw new Error(`Folder "${folderName}" already exists in this location`);
  }

  const updatedFolder = await prisma.folder.update({
    where: { id: folderId },
    data: { name: folderName }
  });

  try {
    await prisma.activityLog.create({
      data: {
        userId,
        action: 'RENAME',
        entityType: 'FOLDER',
        entityId: folderId,
        entityName: folderName,
        details: `Folder renamed from ${folder.name} to ${folderName}`
      }
    });
  } catch (err) {
    logger.error('Failed to log renameFolder activity:', err);
  }

  return updatedFolder;
};

export const moveFolder = async (
  folderId: string,
  userId: string,
  targetFolderId: string | null = null
) => {
  return await prisma.$transaction(async (tx) => {
    const folder = await tx.folder.findUnique({
      where: { id: folderId },
      include: { sharedWith: { where: { userId }, select: { role: true } } }
    });

    const canMoveSource = folder?.ownerId === userId || folder?.sharedWith.some(access => access.role === 'EDITOR');
    if (!folder || !canMoveSource || folder.isArchived) {
      throw new Error('Folder not found or unauthorized.');
    }

    if (folderId === targetFolderId) {
      throw new Error('Cannot move a folder into itself.');
    }

    let targetPrivacy: 'PRIVATE' | 'PUBLIC' | 'LINK_ONLY' | 'SPECIFIC_USER' = 'PRIVATE';
    let location = 'Root';
    let inheritedFolderAccess: Array<{ userId: string; role: AccessRoleFolder }> = [];
    let subtreeFolderIds = await getAllDescendantFolderIds(tx, [folderId]);

    if (targetFolderId) {
      const targetFolder = await tx.folder.findUnique({
        where: { id: targetFolderId },
        include: { sharedWith: true }
      });

      const targetUserAccess = targetFolder?.sharedWith.find(access => access.userId === userId);
      const canMoveToTarget = targetFolder?.ownerId === userId || targetUserAccess?.role === 'EDITOR';
      if (!targetFolder || !canMoveToTarget || targetFolder.isArchived) {
        throw new Error('Target folder not found or unauthorized.');
      }

      if (subtreeFolderIds.includes(targetFolderId)) {
        throw new Error('Cannot move a folder into its own subfolder.');
      }

      targetPrivacy = targetFolder.privacy;
      location = targetFolder.name;
      inheritedFolderAccess = buildInheritedFolderAccessEntries(targetFolder.sharedWith, targetFolder.ownerId, folder.ownerId);
    }

    const normalizedTargetFolderId = targetFolderId ?? null;

    if (folder.parentId === normalizedTargetFolderId) {
      throw new Error('Folder is already in this location.');
    }

    const duplicateFolder = await tx.folder.findFirst({
      where: {
        id: { not: folderId },
        ownerId: folder.ownerId,
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

    const relocation = await relocateOwnedContentFromSharedSubtree(tx, { subtreeFolderIds, rootOwnerId: folder.ownerId });
    if (relocation.movedFolderCount > 0 || relocation.movedDocumentCount > 0) {
      subtreeFolderIds = await getAllDescendantFolderIds(tx, [folderId]);
    }

    await tx.folder.updateMany({
      where: { id: { in: subtreeFolderIds } },
      data: { privacy: targetPrivacy }
    });

    const movedFolder = await tx.folder.update({
      where: { id: folderId },
      data: {
        parentId: targetFolderId,
        privacy: targetPrivacy
      }
    });

    const documentsResult = await tx.document.findMany({
      where: {
        folderId: { in: subtreeFolderIds },
        isArchived: false
      },
      select: { id: true, ownerId: true }
    });
    const documents = Array.isArray(documentsResult) ? documentsResult : [];

    const documentIds = documents.map((document: any) => document.id);

    await tx.document.updateMany({
      where: {
        id: { in: documentIds },
        isArchived: false
      },
      data: { privacy: targetPrivacy }
    });

    await tx.folderAccess.deleteMany({
      where: { folderId: { in: subtreeFolderIds } }
    });

    if (documentIds.length > 0) {
      await tx.documentAccess.deleteMany({
        where: { documentId: { in: documentIds } }
      });
    }

    if (targetPrivacy === 'SPECIFIC_USER') {
      if (inheritedFolderAccess.length > 0) {
        await tx.folderAccess.createMany({
          data: subtreeFolderIds.flatMap((folderId: string) =>
            inheritedFolderAccess.map((access) => ({
              folderId,
              userId: access.userId,
              role: access.role
            }))
          ),
          skipDuplicates: true
        });
      }

      if (documentIds.length > 0) {
        const documentAccess = documents.flatMap((document: any) =>
          inheritedFolderAccess
            .filter((access) => access.userId !== document.ownerId)
            .map((access) => ({
              documentId: document.id,
              userId: access.userId
            }))
        );

        if (documentAccess.length > 0) {
          await tx.documentAccess.createMany({
            data: documentAccess,
            skipDuplicates: true
          });
        }
      }
    }

    try {
      await tx.activityLog.create({
        data: {
          userId,
          action: 'MOVE',
          entityType: 'FOLDER',
          entityId: folderId,
          entityName: folder.name,
          details: `Folder moved to ${location}`
        }
      });
    } catch (err) {
      logger.error('Failed to log moveFolder activity:', err);
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
export const downloadFolderArchive = async (folderId: string, userId: string) => {
  return prepareFolderArchive(folderId, userId);
};

const userSummarySelect = {
  id: true,
  username: true,
  email: true,
  walletAddress: true,
  avatarUrl: true
};

const getPublicFolderContributorOwners = async (folderIds: string[]) => {
  const contributorsByFolderId = new Map<string, any[]>();

  for (const folderId of folderIds) {
    const subtreeFolderIds = await getAllDescendantFolderIds(prisma, [folderId]);
    const [folders, documents] = await Promise.all([
      prisma.folder.findMany({
        where: { id: { in: subtreeFolderIds }, isArchived: false, deletedAt: null },
        include: { owner: { select: userSummarySelect } }
      }),
      prisma.document.findMany({
        where: { folderId: { in: subtreeFolderIds }, isArchived: false, deletedAt: null },
        include: { owner: { select: userSummarySelect } }
      })
    ]);

    const contributors = new Map<string, any>();
    folders.forEach((folder: any) => contributors.set(folder.owner.id, folder.owner));
    documents.forEach((document: any) => contributors.set(document.owner.id, document.owner));
    contributorsByFolderId.set(folderId, Array.from(contributors.values()));
  }

  return contributorsByFolderId;
};

export const searchPublicFolders = async (_userId: string, query: string, limit = 12) => {
  const searchQuery = query.trim();
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 30);

  if (searchQuery.length < 2) return [];

  const folders = await prisma.folder.findMany({
    where: {
      privacy: 'PUBLIC',
      isArchived: false,
      deletedAt: null,
      OR: [
        { name: { contains: searchQuery, mode: 'insensitive' } },
        { owner: { username: { contains: searchQuery, mode: 'insensitive' } } },
        { owner: { walletAddress: { contains: searchQuery, mode: 'insensitive' } } }
      ]
    },
    include: {
      owner: {
        select: userSummarySelect
      },
      _count: { select: { documents: true } }
    },
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' }
    ],
    take: safeLimit
  });

  const contributorsByFolderId = await getPublicFolderContributorOwners(folders.map((folder: any) => folder.id));

  return folders.map((folder: any) => ({
    ...folder,
    owners: contributorsByFolderId.get(folder.id) ?? [folder.owner],
    contributors: contributorsByFolderId.get(folder.id) ?? []
  }));
};

export const getPublicFolderContents = async (folderId: string, userId: string) => {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
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
    }
  });

  if (!folder || folder.isArchived || folder.deletedAt) {
    throw new Error('Folder not found.');
  }

  if (folder.privacy !== 'PUBLIC') {
    throw new Error('Folder is not publicly accessible.');
  }

  const [childFolders, documents, breadcrumbs] = await Promise.all([
    prisma.folder.findMany({
      where: {
        parentId: folderId,
        privacy: 'PUBLIC',
        isArchived: false,
        deletedAt: null
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
        },
        _count: { select: { documents: true } }
      },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' }
      ]
    }),
    prisma.document.findMany({
      where: {
        folderId,
        privacy: 'PUBLIC',
        isArchived: false,
        deletedAt: null
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
      ]
    }),
    getPublicFolderBreadcrumbs(folderId)
  ]);

  const contentOwners = new Map<string, any>();
  contentOwners.set(folder.owner.id, folder.owner);
  childFolders.forEach((childFolder: any) => contentOwners.set(childFolder.owner.id, childFolder.owner));
  documents.forEach((document: any) => contentOwners.set(document.owner.id, document.owner));

  return {
    folders: childFolders,
    documents: sanitizeDocuments(documents, userId),
    currentFolder: {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      owner: folder.owner,
      owners: Array.from(contentOwners.values())
    },
    breadcrumbs
  };
};

async function getPublicFolderBreadcrumbs(folderId: string) {
  const path: Array<{ id: string; name: string }> = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const folder = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { id: true, name: true, parentId: true, privacy: true, isArchived: true, deletedAt: true }
    });

    if (!folder || folder.privacy !== 'PUBLIC' || folder.isArchived || folder.deletedAt) break;
    path.unshift({ id: folder.id, name: folder.name });
    currentId = folder.parentId;
  }

  return path;
}

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
type FolderAccessEntry = { userId: string; role: AccessRoleFolder };
type RelocationTargetFolder = {
  id: string;
  ownerId: string;
  parentId: string | null;
  privacy: PrivacyLevel;
  isArchived: boolean;
  deletedAt: Date | null;
  sharedWith: FolderAccessEntry[];
};

function buildInheritedFolderAccessEntries(
  parentAccess: FolderAccessEntry[],
  parentOwnerId: string,
  ownerIdToExclude: string
): FolderAccessEntry[] {
  const inheritedAccess = new Map<string, AccessRoleFolder>();

  parentAccess.forEach((access) => {
    if (access.userId !== ownerIdToExclude) inheritedAccess.set(access.userId, access.role);
  });

  if (parentOwnerId !== ownerIdToExclude) inheritedAccess.set(parentOwnerId, 'EDITOR');

  return Array.from(inheritedAccess.entries()).map(([userId, role]) => ({ userId, role }));
}

export async function getAllDescendantFolderIds(
  tx: any, // Prisma.TransactionClient
  rootFolderIds: string[],
  archivedState: boolean | null = false
): Promise<string[]> {
  const allIds = new Set<string>(rootFolderIds);
  let currentLevelIds = [...rootFolderIds];

  // Breadth-First Search: traverse folder tree level by level
  while (currentLevelIds.length > 0) {
    const childrenResult = await tx.folder.findMany({
      where: {
        parentId: { in: currentLevelIds },
        ...(archivedState === null ? {} : { isArchived: archivedState })
      },
      select: { id: true }
    });
    const children = Array.isArray(childrenResult) ? childrenResult : [];

    const childIds = children.map((c: any) => c.id);
    const newIds = childIds.filter((id: string) => !allIds.has(id));

    if (newIds.length === 0) break; // No more descendants

    // Add new IDs to set and continue to next level
    newIds.forEach((id: string) => allIds.add(id));
    currentLevelIds = childIds;
  }

  return Array.from(allIds);
}

const getUniqueRootFolderName = async (tx: any, ownerId: string, desiredName: string) => {
  let candidate = desiredName;
  let counter = 1;

  while (await tx.folder.findFirst({
    where: {
      ownerId,
      parentId: null,
      isArchived: false,
      deletedAt: null,
      name: { equals: candidate, mode: 'insensitive' }
    },
    select: { id: true }
  })) {
    candidate = `${desiredName} (${counter})`;
    counter += 1;
  }

  return candidate;
};

const getUniqueRootDocumentTitle = async (tx: any, ownerId: string, desiredTitle: string) => {
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
};

const relocateOwnedContentFromSharedSubtree = async (
  tx: any,
  params: { subtreeFolderIds: string[]; rootOwnerId: string; onlyOwnerId?: string }
) => {
  const { subtreeFolderIds, rootOwnerId, onlyOwnerId } = params;
  const ownerFilter = onlyOwnerId ? { ownerId: onlyOwnerId } : { ownerId: { not: rootOwnerId } };

  const foldersToMoveResult = await tx.folder.findMany({
    where: {
      id: { in: subtreeFolderIds },
      isArchived: false,
      ...ownerFilter
    },
    select: { id: true, name: true, ownerId: true, parentId: true }
  });
  const foldersToMove = Array.isArray(foldersToMoveResult) ? foldersToMoveResult : [];

  const allSubtreeFoldersResult = await tx.folder.findMany({
    where: { id: { in: subtreeFolderIds }, isArchived: false },
    select: { id: true, parentId: true, ownerId: true }
  });
  const allSubtreeFolders: Array<{ id: string; parentId: string | null; ownerId: string }> = Array.isArray(allSubtreeFoldersResult)
    ? allSubtreeFoldersResult
    : [];
  const folderById = new Map<string, { id: string; parentId: string | null; ownerId: string }>(
    allSubtreeFolders.map(folder => [folder.id, folder])
  );
  const operationSubtreeIds = new Set(subtreeFolderIds);
  const shouldRescueOwner = (ownerId: string) => onlyOwnerId ? ownerId === onlyOwnerId : ownerId !== rootOwnerId;
  const movedFolderSourceIds = new Set(foldersToMove.map((folder: any) => folder.id));
  const topLevelFolders = foldersToMove.filter((folder: any) => {
    if (!folder.parentId || !operationSubtreeIds.has(folder.parentId)) return true;

    const parent = folderById.get(folder.parentId);
    return !parent || !shouldRescueOwner(parent.ownerId);
  });
  const movedFolderIds: string[] = [];

  const findNearestAccessibleParent = async (folderId: string | null, ownerId: string): Promise<RelocationTargetFolder | null> => {
    let currentFolderId = folderId;

    while (currentFolderId) {
      if (operationSubtreeIds.has(currentFolderId)) {
        currentFolderId = folderById.get(currentFolderId)?.parentId ?? null;
        continue;
      }

      const folder = await tx.folder.findUnique({
        where: { id: currentFolderId },
        include: { sharedWith: true }
      });

      if (!folder) return null;
      if (!folder.isArchived && !folder.deletedAt) {
        if (folder.ownerId === ownerId || folder.sharedWith.some((access: any) => access.userId === ownerId && access.role === 'EDITOR')) {
          return folder;
        }
      }

      currentFolderId = folder.parentId;
    }

    return null;
  };

  const syncRescuedFolderSubtreeAccess = async (folderId: string, ownerId: string, targetParent: any | null) => {
    const rescuedSubtreeIds = await getAllDescendantFolderIds(tx, [folderId]);
    const rescuedDocuments = await tx.document.findMany({
      where: { folderId: { in: rescuedSubtreeIds }, isArchived: false },
      select: { id: true, ownerId: true }
    });
    const rescuedDocumentIds = rescuedDocuments.map((document: any) => document.id);
    const privacy = targetParent?.privacy ?? 'PRIVATE';
    const inheritedAccess = targetParent
      ? buildInheritedFolderAccessEntries(targetParent.sharedWith, targetParent.ownerId, ownerId)
      : [];

    await tx.folder.updateMany({
      where: { id: { in: rescuedSubtreeIds } },
      data: { privacy, shareToken: privacy === 'LINK_ONLY' ? undefined : null }
    });

    await tx.folderAccess.deleteMany({ where: { folderId: { in: rescuedSubtreeIds } } });
    if (rescuedDocumentIds.length > 0) {
      await tx.document.updateMany({
        where: { id: { in: rescuedDocumentIds } },
        data: { privacy }
      });
      await tx.documentAccess.deleteMany({ where: { documentId: { in: rescuedDocumentIds } } });
    }

    if (privacy === 'SPECIFIC_USER' && inheritedAccess.length > 0) {
      await tx.folderAccess.createMany({
        data: rescuedSubtreeIds.flatMap((rescuedFolderId: string) =>
          inheritedAccess.map((access) => ({ folderId: rescuedFolderId, userId: access.userId, role: access.role }))
        ),
        skipDuplicates: true
      });

      const documentAccess = rescuedDocuments.flatMap((document: any) =>
        inheritedAccess
          .filter((access) => access.userId !== document.ownerId)
          .map((access) => ({ documentId: document.id, userId: access.userId }))
      );

      if (documentAccess.length > 0) {
        await tx.documentAccess.createMany({ data: documentAccess, skipDuplicates: true });
      }
    }
  };

  const syncRescuedDocumentAccess = async (documentId: string, ownerId: string, targetParent: any | null) => {
    const privacy = targetParent?.privacy ?? 'PRIVATE';
    const inheritedAccess = targetParent
      ? buildInheritedFolderAccessEntries(targetParent.sharedWith, targetParent.ownerId, ownerId)
      : [];

    await tx.document.update({ where: { id: documentId }, data: { privacy } });
    await tx.documentAccess.deleteMany({ where: { documentId } });

    if (privacy === 'SPECIFIC_USER' && inheritedAccess.length > 0) {
      await tx.documentAccess.createMany({
        data: inheritedAccess.map((access) => ({ documentId, userId: access.userId })),
        skipDuplicates: true
      });
    }
  };

  const rootOwnerFoldersToRescueResult = await tx.folder.findMany({
    where: {
      id: { in: subtreeFolderIds },
      ownerId: rootOwnerId,
      isArchived: false
    },
    select: { id: true, name: true, parentId: true }
  });
  const rootOwnerFoldersToRescue = Array.isArray(rootOwnerFoldersToRescueResult) ? rootOwnerFoldersToRescueResult : [];

  for (const folder of rootOwnerFoldersToRescue) {
    if (!folder.parentId || !movedFolderSourceIds.has(folder.parentId)) continue;

    const targetParent = await findNearestAccessibleParent(folder.parentId, rootOwnerId);
    const newParentId = targetParent?.id ?? null;
    const newName = newParentId
      ? folder.name
      : await getUniqueRootFolderName(tx, rootOwnerId, folder.name);

    await tx.folder.update({
      where: { id: folder.id },
      data: {
        parentId: newParentId,
        name: newName
      }
    });
    await syncRescuedFolderSubtreeAccess(folder.id, rootOwnerId, targetParent);
  }

  const rootOwnerDocumentsToRescueResult = await tx.document.findMany({
    where: {
      folderId: { in: Array.from(movedFolderSourceIds) },
      ownerId: rootOwnerId,
      isArchived: false
    },
    select: { id: true, title: true, folderId: true }
  });
  const rootOwnerDocumentsToRescue = Array.isArray(rootOwnerDocumentsToRescueResult) ? rootOwnerDocumentsToRescueResult : [];

  for (const document of rootOwnerDocumentsToRescue) {
    const targetParent = await findNearestAccessibleParent(document.folderId, rootOwnerId);
    const newFolderId = targetParent?.id ?? null;
    const newTitle = newFolderId
      ? document.title
      : await getUniqueRootDocumentTitle(tx, rootOwnerId, document.title);

    await tx.document.update({
      where: { id: document.id },
      data: {
        folderId: newFolderId,
        title: newTitle
      }
    });
    await syncRescuedDocumentAccess(document.id, rootOwnerId, targetParent);
  }

  for (const folder of topLevelFolders) {
    const targetParent = await findNearestAccessibleParent(folder.parentId, folder.ownerId);
    const newParentId = targetParent?.id ?? null;
    const newName = newParentId
      ? folder.name
      : await getUniqueRootFolderName(tx, folder.ownerId, folder.name);

    await tx.folder.update({
      where: { id: folder.id },
      data: {
        parentId: newParentId,
        name: newName,
        privacy: targetParent?.privacy ?? 'PRIVATE',
        shareToken: null
      }
    });

    const movedSubtreeIds = await getAllDescendantFolderIds(tx, [folder.id]);
    movedFolderIds.push(...movedSubtreeIds);
    await syncRescuedFolderSubtreeAccess(folder.id, folder.ownerId, targetParent);
  }

  const movedFolderSet = new Set(movedFolderIds);
  const documentsToMoveResult = await tx.document.findMany({
    where: {
      folderId: { in: subtreeFolderIds.filter(folderId => !movedFolderSet.has(folderId)) },
      isArchived: false,
      ...ownerFilter
    },
    select: { id: true, title: true, ownerId: true, folderId: true }
  });
  const documentsToMove = Array.isArray(documentsToMoveResult) ? documentsToMoveResult : [];

  for (const document of documentsToMove) {
    const targetParent = await findNearestAccessibleParent(document.folderId, document.ownerId);
    const newFolderId = targetParent?.id ?? null;
    const newTitle = newFolderId
      ? document.title
      : await getUniqueRootDocumentTitle(tx, document.ownerId, document.title);

    await tx.document.update({
      where: { id: document.id },
      data: {
        folderId: newFolderId,
        title: newTitle,
        privacy: targetParent?.privacy ?? 'PRIVATE'
      }
    });
    await syncRescuedDocumentAccess(document.id, document.ownerId, targetParent);
  }

  const movedDocumentIds = documentsToMove.map((document: any) => document.id);
  const documentsInsideMovedFoldersResult = movedFolderIds.length > 0
    ? await tx.document.findMany({
        where: { folderId: { in: movedFolderIds }, isArchived: false },
        select: { id: true }
      })
    : [];
  const documentsInsideMovedFolders = Array.isArray(documentsInsideMovedFoldersResult) ? documentsInsideMovedFoldersResult : [];
  const allMovedDocumentIds = [
    ...movedDocumentIds,
    ...documentsInsideMovedFolders.map((document: any) => document.id)
  ];

  return {
    movedFolderCount: topLevelFolders.length,
    movedDocumentCount: allMovedDocumentIds.length
  };
};

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

export const getArchivedFolderContents = async (userId: string, folderId: string | null = null) => {
  let currentFolder = null;
  let breadcrumbs: Array<{ id: string; name: string }> = [];

  if (folderId) {
    currentFolder = await prisma.folder.findFirst({
      where: {
        id: folderId,
        ownerId: userId,
        isArchived: true
      },
      select: { id: true, name: true, parentId: true }
    });

    if (!currentFolder) {
      throw new Error('Trash folder not found.');
    }

    breadcrumbs = await getFolderPath(folderId);
  }

  const [folders, documents] = await Promise.all([
    prisma.folder.findMany({
      where: {
        ownerId: userId,
        parentId: folderId,
        isArchived: true
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            walletAddress: true,
            avatarUrl: true
          }
        },
        parent: {
          select: {
            id: true,
            name: true
          }
        },
        _count: {
          select: {
            documents: { where: { isArchived: true } }
          }
        }
      },
      orderBy: { deletedAt: 'desc' }
    }),
    prisma.document.findMany({
      where: {
        ownerId: userId,
        isArchived: true,
        ...(folderId
          ? { folderId }
          : {
              OR: [
                { folderId: null },
                { folder: { isArchived: false } }
              ]
            })
      },
      select: {
        id: true,
        title: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        ipfsHash: true,
        fileHash: true,
        blockchainTx: true,
        isOnChain: true,
        pendingOnChainUntil: true,
        cleanupStatus: true,
        folderId: true,
        ownerId: true,
        privacy: true,
        isArchived: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: {
            id: true,
            username: true,
            avatarUrl: true
          }
        },
        folder: { select: { id: true, name: true } }
      },
      orderBy: { deletedAt: 'desc' }
    })
  ]);

  return {
    folders,
    documents,
    currentFolder,
    breadcrumbs
  };
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
      select: { id: true, name: true }
    });

    if (folders.length === 0) {
      return { count: 0, message: 'No valid folders to archive' };
    }

    const validRootFolderIds = folders.map((f: any) => f.id);

    // 2. 🔄 Get ALL descendant folder IDs (recursive)
    let allFolderIdsToArchive = await getAllDescendantFolderIds(tx, validRootFolderIds);
    const relocation = await relocateOwnedContentFromSharedSubtree(tx, { subtreeFolderIds: allFolderIdsToArchive, rootOwnerId: userId });
    if (relocation.movedFolderCount > 0 || relocation.movedDocumentCount > 0) {
      allFolderIdsToArchive = await getAllDescendantFolderIds(tx, validRootFolderIds);
    }

    // 3. Archive ALL folders owned by the actor (parent + owned descendants)
    await tx.folder.updateMany({
      where: { id: { in: allFolderIdsToArchive }, ownerId: userId },
      data: {
        parentId: null,
        isArchived: true,
        deletedAt: new Date()
      }
    });

    // 4. 🔄 Archive ALL actor-owned documents in ALL those folders (cascade)
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
    
    try {
      await tx.activityLog.createMany({
        data: folders.map((f: any) => ({
          userId,
          action: 'ARCHIVE',
          entityType: 'FOLDER',
          entityId: f.id,
          entityName: f.name || 'Unnamed Folder',
          details: `Folder archived: ${f.name || 'Unnamed Folder'}`
        }))
      });
    } catch (err) {
      logger.error('Failed to log archiveFolders activity:', err);
    }

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
      select: { id: true, name: true }
    });

    if (folders.length === 0) {
      return { count: 0, message: 'No valid folders to restore' };
    }

    const validRootFolderIds = folders.map((f: any) => f.id);
    
    // 2. 🔄 Get ALL descendant folder IDs (recursive)
    const allFolderIdsToRestore = await getAllDescendantFolderIds(tx, validRootFolderIds, true);
    
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
    
    try {
      await tx.activityLog.createMany({
        data: folders.map((f: any) => ({
          userId,
          action: 'RESTORE',
          entityType: 'FOLDER',
          entityId: f.id,
          entityName: f.name || 'Unnamed Folder',
          details: `Folder restored: ${f.name || 'Unnamed Folder'}`
        }))
      });
    } catch (err) {
      logger.error('Failed to log restoreFolders activity:', err);
    }

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
      select: { id: true, name: true }
    });

    if (folders.length === 0) {
      return { count: 0, message: 'No valid folders to destroy' };
    }

    const validRootFolderIds = folders.map((f: any) => f.id);
    
    // 2. 🔄 Get ALL descendant folder IDs (recursive)
    let allFolderIdsToDestroy = await getAllDescendantFolderIds(tx, validRootFolderIds, null);
    await relocateOwnedContentFromSharedSubtree(tx, { subtreeFolderIds: allFolderIdsToDestroy, rootOwnerId: userId });
    allFolderIdsToDestroy = await getAllDescendantFolderIds(tx, validRootFolderIds, true);

    const ownedFolderIdsToDestroyResult = await tx.folder.findMany({
      where: { id: { in: allFolderIdsToDestroy }, ownerId: userId, isArchived: true },
      select: { id: true }
    });
    const ownedFolderIdsToDestroy = Array.isArray(ownedFolderIdsToDestroyResult) ? ownedFolderIdsToDestroyResult : [];
    const ownedFolderIdValues = ownedFolderIdsToDestroy.length > 0
      ? ownedFolderIdsToDestroy.map((folder: { id: string }) => folder.id)
      : allFolderIdsToDestroy;

    // 3. Delete all actor-owned folderAccess relations first (foreign key constraint)
    await tx.folderAccess.deleteMany({
      where: { folderId: { in: ownedFolderIdValues } }
    });

    const documentsToDestroy = await tx.document.findMany({
      where: {
        folderId: { in: ownedFolderIdValues },
        ownerId: userId
      },
      select: { id: true }
    });

    const documentIdsToDestroy = documentsToDestroy.map((document: { id: string }) => document.id);

    if (documentIdsToDestroy.length > 0) {
      await tx.documentAccess.deleteMany({
        where: { documentId: { in: documentIdsToDestroy } }
      });

      await tx.document.deleteMany({
        where: {
          id: { in: documentIdsToDestroy },
          ownerId: userId
        }
      });
    }

    // 5. Delete only actor-owned folders (foreign-owned content is rescued before this point)
    await tx.folder.deleteMany({
      where: { id: { in: ownedFolderIdValues }, ownerId: userId }
    });
    
    try {
      await tx.activityLog.createMany({
        data: folders.map((f: any) => ({
          userId,
          action: 'PERMANENT_DELETE',
          entityType: 'FOLDER',
          entityId: f.id,
          entityName: f.name || 'Unnamed Folder',
          details: `Folder permanently deleted: ${f.name || 'Unnamed Folder'}`
        }))
      });
    } catch (err) {
      logger.error('Failed to log destroyFolders activity:', err);
    }

    return { count: validRootFolderIds.length };
  });
};

const getPublicContributorFolderIds = async (userId: string) => {
  const [ownedFolders, ownedDocuments] = await Promise.all([
    prisma.folder.findMany({
      where: { ownerId: userId, isArchived: false, deletedAt: null },
      select: { parentId: true }
    }),
    prisma.document.findMany({
      where: { ownerId: userId, isArchived: false, deletedAt: null, folderId: { not: null } },
      select: { folderId: true }
    })
  ]);

  const folderIdsToInspect = new Set<string>();
  ownedFolders.forEach((folder: { parentId: string | null }) => {
    if (folder.parentId) folderIdsToInspect.add(folder.parentId);
  });
  ownedDocuments.forEach((document: { folderId: string | null }) => {
    if (document.folderId) folderIdsToInspect.add(document.folderId);
  });

  const contributorFolderIds = new Set<string>();
  const inspectedFolderIds = new Set<string>();

  for (const folderId of folderIdsToInspect) {
    let currentFolderId: string | null = folderId;
    let publicAncestorId: string | null = null;

    while (currentFolderId && !inspectedFolderIds.has(currentFolderId)) {
      inspectedFolderIds.add(currentFolderId);
      const folder = await prisma.folder.findUnique({
        where: { id: currentFolderId },
        select: { id: true, parentId: true, ownerId: true, privacy: true, isArchived: true, deletedAt: true }
      });

      if (!folder || folder.isArchived || folder.deletedAt) break;
      if (folder.privacy === 'PUBLIC' && folder.ownerId !== userId) publicAncestorId = folder.id;
      currentFolderId = folder.parentId;
    }

    if (publicAncestorId) contributorFolderIds.add(publicAncestorId);
  }

  return Array.from(contributorFolderIds);
};

export const getUserFolders = async (userId: string, parentId: string | null = null) => {
  const publicContributorFolderIds = parentId ? [] : await getPublicContributorFolderIds(userId);
  const publicFolderAccessConditions = parentId
    ? [{ privacy: 'PUBLIC' }]
    : publicContributorFolderIds.length > 0
      ? [{ id: { in: publicContributorFolderIds } }]
      : [];

  const folders = await prisma.folder.findMany({
    where: {
      parentId: parentId,
      isArchived: false,
      OR: [
        { ownerId: userId },
        { sharedWith: { some: { userId } } },
        { parent: { ownerId: userId } },
        ...publicFolderAccessConditions
      ]
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
      },
      sharedWith: {
        where: { userId },
        select: { role: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return folders.map(folder => {
    const accessRole = folder.ownerId === userId ? undefined : folder.sharedWith[0]?.role;
    const { sharedWith, ...folderData } = folder;
    return {
      ...folderData,
      accessRole
    };
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

      const subtreeDocuments = await tx.document.findMany({
        where: { folderId: { in: subtreeFolderIds }, ownerId },
        select: { id: true }
      });

      for (const target of item.targetUsers) {
        if (target.userId === ownerId) continue;

        const existingAccess = await tx.folderAccess.findUnique({
          where: {
            folderId_userId: { folderId: item.folderId, userId: target.userId }
          },
          select: { role: true }
        });

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

        for (const document of subtreeDocuments) {
          await tx.documentAccess.upsert({
            where: {
              documentId_userId: { documentId: document.id, userId: target.userId }
            },
            update: {},
            create: {
              documentId: document.id,
              userId: target.userId
            }
          });
        }

        const relocation = existingAccess?.role === 'EDITOR' && target.role === 'VIEWER'
          ? await relocateOwnedContentFromSharedSubtree(tx, {
              subtreeFolderIds,
              rootOwnerId: ownerId,
              onlyOwnerId: target.userId
            })
          : { movedFolderCount: 0, movedDocumentCount: 0 };

        folderResults.push({
          userId: target.userId,
          role: target.role,
          status: 'granted',
          ...relocation
        });
      }

      await tx.folder.updateMany({
        where: { id: { in: subtreeFolderIds }, ownerId },
        data: { privacy: 'SPECIFIC_USER' }
      });

      await tx.document.updateMany({
        where: { folderId: { in: subtreeFolderIds }, ownerId },
        data: { privacy: 'SPECIFIC_USER' }
      });

      const targets = await tx.user.findMany({
        where: { id: { in: item.targetUsers.map(u => u.userId) } },
        select: { id: true, username: true, walletAddress: true }
      });

      try {
        await tx.activityLog.create({
          data: {
            userId: ownerId,
            action: 'SHARE',
            entityType: 'FOLDER',
            entityId: item.folderId,
            entityName: folder.name,
            details: JSON.stringify({
              raw: `Folder shared with ${targets.map(t => t.username).join(', ')}`,
              share: {
                users: targets.map(t => ({ id: t.id, username: t.username, wallet: t.walletAddress }))
              }
            })
          }
        });
      } catch (err) {
        logger.error('Failed to log shareFoldersFlexible activity:', err);
      }

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
      const relocations = [];

      for (const targetUserId of item.targetUserIds) {
        relocations.push(await relocateOwnedContentFromSharedSubtree(tx, {
          subtreeFolderIds,
          rootOwnerId: ownerId,
          onlyOwnerId: targetUserId
        }));
      }

      const deleteResult = await tx.folderAccess.deleteMany({
        where: {
          folderId: { in: subtreeFolderIds },
          userId: { in: item.targetUserIds }
        }
      });

      await tx.documentAccess.deleteMany({
        where: {
          document: { folderId: { in: subtreeFolderIds } },
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

      const targets = await tx.user.findMany({
        where: { id: { in: item.targetUserIds } },
        select: { id: true, username: true, walletAddress: true }
      });

      try {
        await tx.activityLog.create({
          data: {
            userId: ownerId,
            action: 'REVOKE',
            entityType: 'FOLDER',
            entityId: item.folderId,
            entityName: folder.name,
            details: JSON.stringify({
              raw: `Access revoked for ${targets.map(t => t.username).join(', ')}`,
              revoke: {
                users: targets.map(t => ({ id: t.id, username: t.username, wallet: t.walletAddress }))
              }
            })
          }
        });
      } catch (err) {
        logger.error('Failed to log revokeFoldersAccess activity:', err);
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
        isArchived: false, // Pastikan foldernya sendiri tidak sedang diarsip
        ownerId: { not: userId }
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
  const getSanitizedFiles = async () => sanitizeDocuments(await getFiles(folderId, userId), userId);

  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    include: { sharedWith: true }
  });

  if (!folder) throw new Error("Folder not found");

  // 1. Jika Folder PUBLIC -> Semua orang bisa lihat
  if (folder.privacy === 'PUBLIC') return await getSanitizedFiles();

  // 2. Jika Folder LINK_ONLY -> Cek apakah tokennya cocok
  if (folder.privacy === 'LINK_ONLY') {
    if (shareToken && folder.shareToken === shareToken) {
      return await getSanitizedFiles();
    }
    throw new Error("Invalid share link");
  }

  // 3. Jika PRIVATE atau SPECIFIC_USER -> Butuh Login (userId)
  if (!userId) throw new Error("Authentication required");

  let currentFolder: typeof folder | null = folder;
  while (currentFolder) {
    const isOwner = currentFolder.ownerId === userId;
    const hasAccess = currentFolder.sharedWith.some(access => access.userId === userId);

    if (isOwner || hasAccess) {
      return await getSanitizedFiles();
    }

    currentFolder = currentFolder.parentId
      ? await prisma.folder.findUnique({
          where: { id: currentFolder.parentId },
          include: { sharedWith: true }
        })
      : null;
  }

  throw new Error("You don't have permission to access this folder");
};

// Fungsi pembantu biar gak ngetik ulang
const getFiles = async (folderId: string, userId?: string) => {
  return await prisma.document.findMany({
    where: {
      folderId,
      isArchived: false,
      OR: [
        { privacy: { not: 'PRIVATE' } },
        ...(userId ? [{ ownerId: userId }, { sharedWith: { some: { userId } } }] : [])
      ]
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
      const shouldRelocateMixedOwnerContent = folder.privacy === 'SPECIFIC_USER'
        && item.newPrivacy !== 'SPECIFIC_USER'
        && item.newPrivacy !== 'PUBLIC';
      const relocation = shouldRelocateMixedOwnerContent
        ? await relocateOwnedContentFromSharedSubtree(tx, { subtreeFolderIds, rootOwnerId: ownerId })
        : { movedFolderCount: 0, movedDocumentCount: 0 };

      const remainingSubtreeFolderIds = await getAllDescendantFolderIds(tx, [item.folderId]);
      const publicCascade = item.newPrivacy === 'PUBLIC';

      const folderUpdate = await tx.folder.updateMany({
        where: publicCascade
          ? { id: { in: remainingSubtreeFolderIds } }
          : { id: { in: remainingSubtreeFolderIds }, ownerId },
        data: { privacy: item.newPrivacy }
      });

      const updatedDocuments = await tx.document.findMany({
        where: publicCascade
          ? { folderId: { in: remainingSubtreeFolderIds } }
          : { folderId: { in: remainingSubtreeFolderIds }, ownerId },
        select: { id: true }
      });

      await tx.document.updateMany({
        where: { id: { in: updatedDocuments.map(document => document.id) } },
        data: { privacy: item.newPrivacy }
      });

      let accessDeleted = 0;
      if (item.newPrivacy !== 'SPECIFIC_USER' && item.newPrivacy !== 'PUBLIC') {
        const deleted = await tx.folderAccess.deleteMany({
          where: { folderId: { in: remainingSubtreeFolderIds } }
        });
        const deletedDocumentAccess = await tx.documentAccess.deleteMany({
          where: { documentId: { in: updatedDocuments.map(document => document.id) } }
        });
        accessDeleted = deleted.count + deletedDocumentAccess.count;
      }

      if (folderUpdate.count > 0) {
        try {
          await tx.activityLog.create({
            data: {
              userId: ownerId,
              action: 'CHANGE_PRIVACY',
              entityType: 'FOLDER',
              entityId: item.folderId,
              entityName: folder.name,
              details: JSON.stringify({
                raw: `Folder privacy changed from ${folder.privacy} to ${item.newPrivacy}`,
                privacy: {
                  from: folder.privacy,
                  to: item.newPrivacy
                }
              })
            }
          });
        } catch (err) {
          logger.error('Failed to log updateFoldersPrivacy activity:', err);
        }
      }

      results.push({
        folderId: item.folderId,
        status: folderUpdate.count > 0 ? 'updated' : 'failed',
        newPrivacy: item.newPrivacy,
        accessRevoked: accessDeleted,
        cascadedFolders: remainingSubtreeFolderIds.length,
        ...relocation
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