import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { PinataCleanupService } from '../modules/pinata/pinata.service';

interface TrashCleanupConfig {
  retentionDays: number;
  batchSize: number;
  dryRun: boolean;
}

const DEFAULT_CONFIG: TrashCleanupConfig = {
  retentionDays: parseInt(process.env.TRASH_RETENTION_DAYS || '60'),
  batchSize: parseInt(process.env.TRASH_CLEANUP_BATCH_SIZE || '100'),
  dryRun: process.env.TRASH_CLEANUP_DRY_RUN === 'true'
};

const getCutoffDate = (retentionDays: number) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  return cutoff;
};

const getAllArchivedDescendantFolderIds = async (rootFolderIds: string[]) => {
  const allIds = new Set(rootFolderIds);
  let currentLevelIds = [...rootFolderIds];

  while (currentLevelIds.length > 0) {
    const children = await prisma.folder.findMany({
      where: {
        parentId: { in: currentLevelIds },
        isArchived: true
      },
      select: { id: true }
    });

    const newIds = children
      .map((folder) => folder.id)
      .filter((id) => !allIds.has(id));

    if (newIds.length === 0) break;
    newIds.forEach((id) => allIds.add(id));
    currentLevelIds = newIds;
  }

  return Array.from(allIds);
};

export const runExpiredTrashCleanup = async (config: TrashCleanupConfig = DEFAULT_CONFIG) => {
  const cutoff = getCutoffDate(config.retentionDays);

  logger.info(`Searching expired trash items (retention: ${config.retentionDays} days, dryRun: ${config.dryRun})`);

  const expiredFolders = await prisma.folder.findMany({
    where: {
      isArchived: true,
      deletedAt: { lte: cutoff }
    },
    select: { id: true, name: true, deletedAt: true },
    orderBy: { deletedAt: 'asc' },
    take: config.batchSize
  });

  const expiredFolderIds = expiredFolders.map((folder) => folder.id);
  const folderIdsToDelete = expiredFolderIds.length > 0
    ? await getAllArchivedDescendantFolderIds(expiredFolderIds)
    : [];
  const remainingBatchSize = Math.max(config.batchSize - folderIdsToDelete.length, 0);

  const expiredDocuments = remainingBatchSize > 0
    ? await prisma.document.findMany({
        where: {
          isArchived: true,
          deletedAt: { lte: cutoff },
          OR: [
            { folderId: null },
            { folderId: { notIn: folderIdsToDelete } }
          ]
        },
        select: { id: true, title: true, deletedAt: true, ipfsHash: true },
        orderBy: { deletedAt: 'asc' },
        take: remainingBatchSize
      })
    : [];

  const folderDocuments = folderIdsToDelete.length > 0
    ? await prisma.document.findMany({
        where: {
          folderId: { in: folderIdsToDelete },
          isArchived: true
        },
        select: { id: true, ipfsHash: true }
      })
    : [];

  if (expiredFolders.length === 0 && expiredDocuments.length === 0) {
    logger.info('No expired trash items found');
    return { deletedFolders: 0, deletedDocuments: 0 };
  }

  const allDocumentIds = [
    ...expiredDocuments.map((doc) => doc.id),
    ...folderDocuments.map((doc) => doc.id)
  ];

  const ipfsHashesToUnpin = [
    ...expiredDocuments.map((doc) => doc.ipfsHash),
    ...folderDocuments.map((doc) => doc.ipfsHash)
  ].filter((hash): hash is string => Boolean(hash));

  if (config.dryRun) {
    logger.info('[DRY RUN] Would permanently delete expired trash items', {
      folders: folderIdsToDelete.length,
      documents: allDocumentIds.length,
      unpins: ipfsHashesToUnpin.length
    });
    return { deletedFolders: folderIdsToDelete.length, deletedDocuments: allDocumentIds.length };
  }

  // Unpin from Pinata
  if (ipfsHashesToUnpin.length > 0) {
    logger.info(`Unpinning ${ipfsHashesToUnpin.length} expired files from Pinata...`);
    await Promise.allSettled(
      ipfsHashesToUnpin.map(async (hash) => {
        try {
          await PinataCleanupService.unpin(hash);
        } catch (err: any) {
          logger.warn(`Failed to unpin ${hash} during trash cleanup: ${err.message}`);
        }
      })
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    if (allDocumentIds.length > 0) {
      await tx.documentAccess.deleteMany({
        where: { documentId: { in: allDocumentIds } }
      });
    }

    if (folderIdsToDelete.length > 0) {
      await tx.folderAccess.deleteMany({
        where: { folderId: { in: folderIdsToDelete } }
      });
    }

    const deletedDocuments = await tx.document.deleteMany({
      where: {
        id: { in: allDocumentIds },
        isArchived: true
      }
    });

    const deletedFolders = await tx.folder.deleteMany({
      where: {
        id: { in: folderIdsToDelete },
        isArchived: true
      }
    });

    return {
      deletedFolders: deletedFolders.count,
      deletedDocuments: deletedDocuments.count
    };
  });

  logger.info('Expired trash cleanup completed', result);
  return result;
};
