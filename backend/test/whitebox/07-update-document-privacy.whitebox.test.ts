import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../helpers/prisma';
import { documentFactory } from '../helpers/factories';

const prisma = createPrismaMock();
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };

mock.module('../../src/config/db', () => ({ prisma }));
mock.module('../../src/utils/logger', () => ({ logger }));
mock.module('../../src/utils/logger.js', () => ({ logger }));

describe('document.service.ts - 07. updateDocumentsPrivacy() Whitebox Testing', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    Object.values(logger).forEach(fn => fn.mockReset());
  });

  test('Jalur Sukses: update privacy ke PUBLIC (memicu cleanup akses)', async () => {
    const { updateDocumentsPrivacy } = await import('../../src/modules/document/document.service?cache-bust=07');

    prisma.document.findUnique
      .mockResolvedValueOnce({ privacy: 'SPECIFIC_USER' }) // oldDoc
      .mockResolvedValueOnce({ title: 'Report', blockchainTx: '0xtx' }); // doc for log

    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    prisma.documentAccess.deleteMany.mockResolvedValue({ count: 3 });

    const result = await updateDocumentsPrivacy('owner-1', [{ documentId: 'doc-1', newPrivacy: 'PUBLIC' }]);

    expect(result).toEqual([{ documentId: 'doc-1', status: 'updated', newPrivacy: 'PUBLIC', accessRevoked: 3 }]);
    expect(prisma.documentAccess.deleteMany).toHaveBeenCalledWith({ where: { documentId: 'doc-1' } });
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'owner-1',
        action: 'CHANGE_PRIVACY',
        entityId: 'doc-1',
        entityName: 'Report',
        blockchainTx: '0xtx',
      }),
    });
  });

  test('Jalur Sukses: update privacy ke SPECIFIC_USER (tanpa cleanup akses)', async () => {
    const { updateDocumentsPrivacy } = await import('../../src/modules/document/document.service?cache-bust=07');

    prisma.document.findUnique
      .mockResolvedValueOnce({ privacy: 'PRIVATE' }) // oldDoc
      .mockResolvedValueOnce({ title: 'Report', blockchainTx: '0xtx' }); // doc for log

    prisma.document.updateMany.mockResolvedValue({ count: 1 });

    const result = await updateDocumentsPrivacy('owner-1', [{ documentId: 'doc-1', newPrivacy: 'SPECIFIC_USER' }]);

    expect(result).toEqual([{ documentId: 'doc-1', status: 'updated', newPrivacy: 'SPECIFIC_USER', accessRevoked: 0 }]);
    expect(prisma.documentAccess.deleteMany).not.toHaveBeenCalled();
    expect(prisma.activityLog.create).toHaveBeenCalled();
  });

  test('Jalur Gagal: update privacy gagal karena bukan owner / dokumen tidak ditemukan / terarsip', async () => {
    const { updateDocumentsPrivacy } = await import('../../src/modules/document/document.service?cache-bust=07');

    prisma.document.findUnique.mockResolvedValueOnce({ privacy: 'PRIVATE' }); // oldDoc
    prisma.document.updateMany.mockResolvedValue({ count: 0 }); // update failed
    prisma.documentAccess.deleteMany.mockResolvedValue({ count: 0 });

    const result = await updateDocumentsPrivacy('other-user', [{ documentId: 'doc-1', newPrivacy: 'PUBLIC' }]);

    expect(result).toEqual([{ documentId: 'doc-1', status: 'failed/unauthorized', newPrivacy: 'PUBLIC', accessRevoked: 0 }]);
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });
});
