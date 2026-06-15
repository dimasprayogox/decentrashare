import { beforeEach, describe, expect, mock, test, spyOn, afterEach } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../helpers/prisma';
import { documentFactory, folderFactory } from '../helpers/factories';
import { PinataCleanupService } from '../../src/modules/pinata/pinata.service';

const prisma = createPrismaMock();
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };

mock.module('../../src/config/db', () => ({ prisma }));
mock.module('../../src/utils/logger', () => ({ logger }));
mock.module('../../src/utils/logger.js', () => ({ logger }));

describe('document.service.ts - 09. archive/restore/destroy document Whitebox Testing', () => {
  let unpinSpy: any;

  beforeEach(() => {
    resetPrismaMock(prisma);
    Object.values(logger).forEach(fn => fn.mockReset());
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    unpinSpy = spyOn(PinataCleanupService, 'unpin');
  });

  afterEach(() => {
    unpinSpy.mockRestore();
  });

  // --- ARCHIVE DOCUMENTS ---
  describe('archiveDocuments()', () => {
    test('Jalur Sukses: mengarsip satu dokumen (memicu log ARCHIVE)', async () => {
      const { archiveDocuments } = await import('../../src/modules/document/document.service?cache-bust=09');

      prisma.document.findMany.mockResolvedValue([
        documentFactory({ id: 'doc-1', title: 'Doc 1', blockchainTx: 'tx-1' })
      ]);
      prisma.document.updateMany.mockResolvedValue({ count: 1 });

      const result = await archiveDocuments(['doc-1'], 'user-1');

      expect(result).toEqual({ count: 1 });
      expect(prisma.document.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['doc-1'] } },
        data: expect.objectContaining({ isArchived: true, deletedAt: expect.any(Date) })
      });
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'ARCHIVE',
          entityId: 'doc-1',
          entityName: 'Doc 1',
        })
      });
    });

    test('Jalur Sukses: mengarsip banyak dokumen secara massal (memicu log BULK_ARCHIVE)', async () => {
      const { archiveDocuments } = await import('../../src/modules/document/document.service?cache-bust=09');

      prisma.document.findMany.mockResolvedValue([
        documentFactory({ id: 'doc-1', title: 'Doc 1' }),
        documentFactory({ id: 'doc-2', title: 'Doc 2' })
      ]);
      prisma.document.updateMany.mockResolvedValue({ count: 2 });

      const result = await archiveDocuments(['doc-1', 'doc-2'], 'user-1');

      expect(result).toEqual({ count: 2 });
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'BULK_ARCHIVE',
          entityType: 'MULTIPLE',
          entityName: 'Bulk archive: 2 files'
        })
      });
    });

    test('Jalur Gagal/Batas: tidak ada dokumen valid untuk diarsip', async () => {
      const { archiveDocuments } = await import('../../src/modules/document/document.service?cache-bust=09');

      prisma.document.findMany.mockResolvedValue([]);

      const result = await archiveDocuments(['doc-nonexistent'], 'user-1');

      expect(result).toEqual({ count: 0 });
      expect(prisma.document.updateMany).not.toHaveBeenCalled();
      expect(prisma.activityLog.create).not.toHaveBeenCalled();
    });
  });

  // --- RESTORE DOCUMENTS ---
  describe('restoreDocuments()', () => {
    test('Jalur Sukses: memulihkan dokumen ke folder asalnya jika folder tersebut aktif', async () => {
      const { restoreDocuments } = await import('../../src/modules/document/document.service?cache-bust=09');

      prisma.document.findMany.mockResolvedValueOnce([
        documentFactory({ id: 'doc-1', title: 'Doc 1', folderId: 'folder-1' })
      ]);
      prisma.folder.findMany.mockResolvedValueOnce([
        folderFactory({ id: 'folder-1' })
      ]);
      prisma.document.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await restoreDocuments(['doc-1'], 'user-1');

      expect(result.count).toBe(1);
      expect(prisma.document.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['doc-1'] }, ownerId: 'user-1' },
        data: { isArchived: false, deletedAt: null }
      });
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'RESTORE',
          entityName: 'Doc 1'
        })
      });
    });

    test('Jalur Sukses: memulihkan ke root dengan nama baru jika folder asal hilang dan ada tabrakan nama di root', async () => {
      const { restoreDocuments } = await import('../../src/modules/document/document.service?cache-bust=09');

      prisma.document.findMany
        .mockResolvedValueOnce([
          documentFactory({ id: 'doc-1', title: 'Report', folderId: 'archived-folder' })
        ]) // documents to restore
        .mockResolvedValueOnce([
          { title: 'Report' }
        ]); // existingRootDocuments to check conflicts

      prisma.folder.findMany.mockResolvedValueOnce([]); // folder asal sudah di-delete / hilang

      const result = await restoreDocuments(['doc-1'], 'user-1');

      expect(result).toEqual({
        count: 1,
        movedToRootCount: 1,
        renamedCount: 1,
        renamed: [{ id: 'doc-1', originalTitle: 'Report', restoredTitle: 'Report (restore)' }]
      });
      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: {
          title: 'Report (restore)',
          isArchived: false,
          deletedAt: null,
          folderId: null
        }
      });
    });

    test('Jalur Gagal/Batas: tidak ada dokumen untuk dipulihkan', async () => {
      const { restoreDocuments } = await import('../../src/modules/document/document.service?cache-bust=09');

      prisma.document.findMany.mockResolvedValueOnce([]);

      const result = await restoreDocuments(['doc-nonexistent'], 'user-1');

      expect(result).toEqual({ count: 0 });
    });
  });

  // --- DESTROY DOCUMENTS ---
  describe('destroyMultipleDocuments()', () => {
    test('Jalur Sukses: memusnahkan dokumen terarsip (memicu unpin Pinata dan penghapusan database)', async () => {
      const { destroyMultipleDocuments } = await import('../../src/modules/document/document.service?cache-bust=09');

      prisma.document.findMany.mockResolvedValue([
        documentFactory({ id: 'doc-1', title: 'Purge Me', isArchived: true, ipfsHash: 'QmHash123' })
      ]);
      prisma.document.deleteMany.mockResolvedValue({ count: 1 });
      unpinSpy.mockResolvedValue({ success: true, ipfsHash: 'QmHash123', message: 'Unpinned successfully' });

      const result = await destroyMultipleDocuments(['doc-1'], 'user-1');

      expect(result).toEqual({ count: 1 });
      expect(unpinSpy).toHaveBeenCalledWith('QmHash123');
      expect(prisma.documentAccess.deleteMany).toHaveBeenCalledWith({ where: { documentId: { in: ['doc-1'] } } });
      expect(prisma.document.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['doc-1'] }, ownerId: 'user-1', isArchived: true }
      });
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'PERMANENT_DELETE',
          entityName: 'Purge Me'
        })
      });
    });

    test('Jalur Gagal/Batas: tidak ada dokumen terarsip untuk dimusnahkan', async () => {
      const { destroyMultipleDocuments } = await import('../../src/modules/document/document.service?cache-bust=09');

      prisma.document.findMany.mockResolvedValue([]);

      const result = await destroyMultipleDocuments(['doc-nonexistent'], 'user-1');

      expect(result).toEqual({ count: 0 });
      expect(unpinSpy).not.toHaveBeenCalled();
      expect(prisma.document.deleteMany).not.toHaveBeenCalled();
    });
  });
});
