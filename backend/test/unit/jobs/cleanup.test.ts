import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../../helpers/prisma';
import { PinataCleanupService } from '../../../src/modules/pinata/pinata.service';

const prisma = createPrismaMock();
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };

const originalUnpin = PinataCleanupService.unpin;
const originalArchiveMetadata = PinataCleanupService.archiveMetadata;

// Mock the static methods of PinataCleanupService directly
PinataCleanupService.unpin = mock() as any;
PinataCleanupService.archiveMetadata = mock() as any;

mock.module('../../../src/config/db.js', () => ({ prisma }));
mock.module('../../../src/config/pinata', () => ({ pinata: {} }));
mock.module('../../../src/utils/logger', () => ({ logger }));
mock.module('../../../src/utils/logger.js', () => ({ logger }));

describe('Jobs: Cleanup Tasks', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    (PinataCleanupService.unpin as any).mockReset();
    (PinataCleanupService.archiveMetadata as any).mockReset();
    Object.values(logger).forEach(fn => fn.mockReset());
  });

  afterAll(() => {
    PinataCleanupService.unpin = originalUnpin;
    PinataCleanupService.archiveMetadata = originalArchiveMetadata;
  });

  describe('runOrphanedPinCleanup', () => {
    test('given no orphaned pins, when job runs, then returns zero cleaned count', async () => {
      const { runOrphanedPinCleanup } = await import('../../../src/jobs/cleanup-orphaned-pins');
      prisma.document.findMany.mockResolvedValue([]);

      const result = await runOrphanedPinCleanup({ ttlHours: 24, batchSize: 10, dryRun: false });

      expect(result).toEqual({ cleaned: 0, failed: 0 });
      expect(prisma.document.findMany).toHaveBeenCalled();
      expect(PinataCleanupService.unpin).not.toHaveBeenCalled();
    });

    test('given orphaned pins, when job runs, then unpins and deletes them from DB', async () => {
      const { runOrphanedPinCleanup } = await import('../../../src/jobs/cleanup-orphaned-pins');
      const mockDocs = [
        { id: 'doc-1', ipfsHash: 'QmHash1', fileName: 'test1.txt', ownerId: 'user-1', fileHash: 'h1', createdAt: new Date() },
        { id: 'doc-2', ipfsHash: 'QmHash2', fileName: 'test2.txt', ownerId: 'user-1', fileHash: 'h2', createdAt: new Date() },
      ];
      prisma.document.findMany.mockResolvedValue(mockDocs);
      PinataCleanupService.archiveMetadata.mockResolvedValue(true);
      PinataCleanupService.unpin.mockResolvedValue({ success: true });
      prisma.documentAccess.deleteMany.mockResolvedValue({ count: 0 });
      prisma.document.delete.mockResolvedValue({});

      const result = await runOrphanedPinCleanup({ ttlHours: 24, batchSize: 10, dryRun: false });

      expect(result).toEqual({ cleaned: 2, failed: 0, skipped: 0 });
      expect(PinataCleanupService.archiveMetadata).toHaveBeenCalledTimes(2);
      expect(PinataCleanupService.unpin).toHaveBeenCalledTimes(2);
      expect(prisma.documentAccess.deleteMany).toHaveBeenCalledTimes(2);
      expect(prisma.document.delete).toHaveBeenCalledTimes(2);
    });

    test('given orphaned pins where unpin or metadata fails, when job runs, then still deletes database record', async () => {
      const { runOrphanedPinCleanup } = await import('../../../src/jobs/cleanup-orphaned-pins');
      const mockDocs = [
        { id: 'doc-1', ipfsHash: 'QmHash1', fileName: 'test1.txt', ownerId: 'user-1', fileHash: 'h1', createdAt: new Date() },
      ];
      prisma.document.findMany.mockResolvedValue(mockDocs);
      PinataCleanupService.archiveMetadata.mockResolvedValue(false);
      PinataCleanupService.unpin.mockResolvedValue({ success: false, error: 'Failed' });
      prisma.documentAccess.deleteMany.mockResolvedValue({ count: 0 });
      prisma.document.delete.mockResolvedValue({});

      const result = await runOrphanedPinCleanup({ ttlHours: 24, batchSize: 10, dryRun: false });

      expect(result).toEqual({ cleaned: 1, failed: 0, skipped: 0 });
      expect(prisma.document.delete).toHaveBeenCalled();
    });
  });

  describe('runExpiredTrashCleanup', () => {
    test('given no expired trash, when job runs, then returns zero deleted count', async () => {
      const { runExpiredTrashCleanup } = await import('../../../src/jobs/cleanup-expired-trash');
      prisma.folder.findMany.mockResolvedValue([]);
      prisma.document.findMany.mockResolvedValue([]);

      const result = await runExpiredTrashCleanup({ retentionDays: 60, batchSize: 100, dryRun: false });

      expect(result).toEqual({ deletedFolders: 0, deletedDocuments: 0 });
      expect(prisma.folder.findMany).toHaveBeenCalled();
      expect(prisma.document.findMany).toHaveBeenCalled();
    });

    test('given expired trash items, when job runs, then permanently deletes them and associated access lists from DB and unpins from Pinata', async () => {
      const { runExpiredTrashCleanup } = await import('../../../src/jobs/cleanup-expired-trash');
      
      const mockExpiredFolders = [
        { id: 'folder-1', name: 'Folder 1', deletedAt: new Date() }
      ];
      const mockExpiredDocs = [
        { id: 'doc-1', title: 'Doc 1', deletedAt: new Date(), ipfsHash: 'QmHashExpired' }
      ];

      // Setup prisma findMany responses
      prisma.folder.findMany
        .mockResolvedValueOnce(mockExpiredFolders) // for expiredFolders
        .mockResolvedValueOnce([]); // for children check in descendant fetch (empty loop termination)
      
      prisma.document.findMany
        .mockResolvedValueOnce(mockExpiredDocs) // for expiredDocuments
        .mockResolvedValueOnce([]); // for folderDocuments check

      prisma.folderAccess.deleteMany.mockResolvedValue({ count: 1 });
      prisma.documentAccess.deleteMany.mockResolvedValue({ count: 1 });
      prisma.document.deleteMany.mockResolvedValue({ count: 1 });
      prisma.folder.deleteMany.mockResolvedValue({ count: 1 });
      PinataCleanupService.unpin.mockResolvedValue({ success: true });

      const result = await runExpiredTrashCleanup({ retentionDays: 60, batchSize: 100, dryRun: false });

      expect(result).toEqual({ deletedFolders: 1, deletedDocuments: 1 });
      expect(prisma.folder.deleteMany).toHaveBeenCalled();
      expect(prisma.document.deleteMany).toHaveBeenCalled();
      expect(PinataCleanupService.unpin).toHaveBeenCalledWith('QmHashExpired');
    });
  });
});
