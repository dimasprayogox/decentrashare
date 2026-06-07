// src/jobs/cleanup-orphaned-pins.ts
import { prisma } from '../config/db.js';
import { PinataCleanupService } from '../modules/pinata/pinata.service';
import { logger } from '../utils/logger';

interface CleanupConfig {
  ttlHours: number;
  batchSize: number;
  dryRun: boolean; // Mode testing: tidak benar-benar delete
}

const DEFAULT_CONFIG: CleanupConfig = {
  ttlHours: parseInt(process.env.CLEANUP_TTL_HOURS || '24'),
  batchSize: 10,
  dryRun: process.env.CLEANUP_DRY_RUN === 'true'
};

export const runOrphanedPinCleanup = async (config: CleanupConfig = DEFAULT_CONFIG) => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - config.ttlHours * 60 * 60 * 1000);

  logger.info(`🔍 Searching for orphaned pins (TTL: ${config.ttlHours}h, dryRun: ${config.dryRun})`);

  // 1. Cari dokumen yang expired dan masih PENDING
  const orphanedDocs = await prisma.document.findMany({
    where: {
      isOnChain: false,
      isArchived: false,
      createdAt: { lt: cutoff }
    },
    select: {
      id: true,
      ipfsHash: true,
      fileName: true,
      ownerId: true,
      fileHash: true,
      createdAt: true
    },
    take: config.batchSize
  });

  if (orphanedDocs.length === 0) {
    logger.info('✅ No orphaned pins found');
    return { cleaned: 0, failed: 0 };
  }

  logger.info(`📦 Found ${orphanedDocs.length} orphaned pins to process`);

  const results = { cleaned: 0, failed: 0, skipped: 0 };

  // 2. Proses satu per satu
  for (const doc of orphanedDocs) {
    try {
      if (config.dryRun) {
        logger.info(`[DRY RUN] Would delete expired unconfirmed document: ${doc.ipfsHash} (${doc.fileName})`);
        results.cleaned++;
        continue;
      }

      const archived = await PinataCleanupService.archiveMetadata(doc);
      if (!archived) {
        logger.warn(`⚠️ Metadata archive failed for ${doc.ipfsHash}; deleting expired DB record anyway`);
      }

      const unpinResult = await PinataCleanupService.unpin(doc.ipfsHash);
      if (!unpinResult.success) {
        logger.warn(`⚠️ Pinata unpin failed for ${doc.ipfsHash}; deleting expired DB record anyway`, {
          error: unpinResult.error
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.documentAccess.deleteMany({
          where: { documentId: doc.id }
        });

        await tx.document.delete({
          where: { id: doc.id }
        });
      });

      results.cleaned++;
      logger.info(`✅ Deleted expired unconfirmed document: ${doc.ipfsHash} | ${doc.fileName}`);

    } catch (error: any) {
      results.failed++;
      logger.error(`💥 Unexpected error for ${doc.id}`, {
        error: error.message,
        stack: error.stack
      });
    }
  }

  logger.info(`📊 Cleanup summary: ${results.cleaned} cleaned, ${results.failed} failed, ${results.skipped} skipped`);
  return results;
};