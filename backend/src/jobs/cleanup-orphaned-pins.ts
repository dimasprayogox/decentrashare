// src/jobs/cleanup-orphaned-pins.ts
import { prisma } from '../config/db.js';
import { PinataCleanupService } from '../modules/pinata/pinata.service';
import { logger } from '../utils/logger';
import { CleanupStatus } from '@prisma/client';

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

  logger.info(`🔍 Searching for orphaned pins (TTL: ${config.ttlHours}h, dryRun: ${config.dryRun})`);

  // 1. Cari dokumen yang expired dan masih PENDING
  const orphanedDocs = await prisma.document.findMany({
    where: {
      isOnChain: false,
      pendingOnChainUntil: { lt: now },
      cleanupStatus: 'PENDING',
      ipfsHash: { not: null }
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
      // (Opsional) Archive metadata dulu
      const archived = await PinataCleanupService.archiveMetadata(doc);
      if (!archived) {
        logger.warn(`⚠️ Skipping ${doc.ipfsHash}: failed to archive metadata`);
        results.skipped++;
        continue;
      }

      // Skip jika dryRun
      if (config.dryRun) {
        logger.info(`[DRY RUN] Would unpin: ${doc.ipfsHash} (${doc.fileName})`);
        results.cleaned++;
        continue;
      }

      // 3. Unpin dari Pinata
      const unpinResult = await PinataCleanupService.unpin(doc.ipfsHash);

      if (unpinResult.success) {
        await prisma.$transaction(async (tx) => {
          await tx.documentAccess.deleteMany({
            where: { documentId: doc.id }
          });

          await tx.document.delete({
            where: { id: doc.id }
          });
        });

        results.cleaned++;
        logger.info(`✅ Cleaned: ${doc.ipfsHash} | ${doc.fileName}`);
      } else {
        await prisma.document.update({
          where: { id: doc.id },
          data: {
            cleanupStatus: 'FAILED'
          }
        });

        results.failed++;
        logger.error(`❌ Failed: ${doc.ipfsHash} | ${unpinResult.error}`);
      }

    } catch (error: any) {
      results.failed++;
      logger.error(`💥 Unexpected error for ${doc.id}`, { 
        error: error.message, 
        stack: error.stack 
      });
      
      // Update status FAILED agar tidak diproses ulang terus
      await prisma.document.update({
        where: { id: doc.id },
        data: { cleanupStatus: 'FAILED' }
      });
    }
  }

  logger.info(`📊 Cleanup summary: ${results.cleaned} cleaned, ${results.failed} failed, ${results.skipped} skipped`);
  return results;
};