import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../helpers/prisma';
import { documentFactory } from '../helpers/factories';

const prisma = createPrismaMock();
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };

mock.module('../../src/config/db', () => ({ prisma }));
mock.module('../../src/utils/logger', () => ({ logger }));
mock.module('../../src/utils/logger.js', () => ({ logger }));

describe('shareDocumentsToUsers()', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    Object.values(logger).forEach(fn => fn.mockReset());
  });

  test('Path 1 (Valid): owner membagi dokumen ke user lain (direct access granted, privacy -> SPECIFIC_USER)', async () => {
    const { shareDocumentsToUsers } = await import('../../src/modules/document/document.service?cache-bust=08');
    prisma.document.findFirst.mockResolvedValue(documentFactory({ id: 'doc-1', ownerId: 'owner-1' }));

    const result = await shareDocumentsToUsers('owner-1', [{ documentId: 'doc-1', targetUsers: ['user-2', 'owner-1'] }]);

    expect(result).toEqual([{ documentId: 'doc-1', sharedWith: [{ userId: 'user-2', status: 'granted' }] }]);
    expect(prisma.documentAccess.upsert).toHaveBeenCalledWith({
      where: { documentId_userId: { documentId: 'doc-1', userId: 'user-2' } },
      update: {},
      create: { documentId: 'doc-1', userId: 'user-2' },
    });
    expect(prisma.document.update).toHaveBeenCalledWith({ where: { id: 'doc-1' }, data: { privacy: 'SPECIFIC_USER' } });
  });

  test('Path 2 (Tidak Valid): dokumen tidak ditemukan saat share', async () => {
    const { shareDocumentsToUsers } = await import('../../src/modules/document/document.service?cache-bust=08');
    prisma.document.findFirst.mockResolvedValue(null);

    const result = await shareDocumentsToUsers('owner-1', [{ documentId: 'doc-not-found', targetUsers: ['user-2'] }]);

    expect(result).toEqual([]);
    expect(prisma.documentAccess.upsert).not.toHaveBeenCalled();
  });

  test('Path 3 (Tidak Valid): user bukan owner saat share', async () => {
    const { shareDocumentsToUsers } = await import('../../src/modules/document/document.service?cache-bust=08');
    // Owner dokumen adalah owner-2, tapi yang melakukan share adalah owner-1
    prisma.document.findFirst.mockResolvedValue(documentFactory({ id: 'doc-1', ownerId: 'owner-2' }));

    const result = await shareDocumentsToUsers('owner-1', [{ documentId: 'doc-1', targetUsers: ['user-2'] }]);

    expect(result).toEqual([]);
    expect(prisma.documentAccess.upsert).not.toHaveBeenCalled();
  });

  test('Path 4 (Tidak Valid): daftar target user kosong saat share', async () => {
    const { shareDocumentsToUsers } = await import('../../src/modules/document/document.service?cache-bust=08');
    prisma.document.findFirst.mockResolvedValue(documentFactory({ id: 'doc-1', ownerId: 'owner-1' }));

    const result = await shareDocumentsToUsers('owner-1', [{ documentId: 'doc-1', targetUsers: [] }]);

    expect(result).toEqual([{ documentId: 'doc-1', sharedWith: [] }]);
    expect(prisma.documentAccess.upsert).not.toHaveBeenCalled();
  });

  test('Path 5 (Valid): share dokumen yang aksesnya sudah ada (upsert tetap berjalan)', async () => {
    const { shareDocumentsToUsers } = await import('../../src/modules/document/document.service?cache-bust=08');
    prisma.document.findFirst.mockResolvedValue(documentFactory({ id: 'doc-1', ownerId: 'owner-1' }));

    const result = await shareDocumentsToUsers('owner-1', [{ documentId: 'doc-1', targetUsers: ['user-2'] }]);

    expect(result).toEqual([{ documentId: 'doc-1', sharedWith: [{ userId: 'user-2', status: 'granted' }] }]);
    expect(prisma.documentAccess.upsert).toHaveBeenCalled();
  });
});

describe('revokeDocumentsAccess()', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    Object.values(logger).forEach(fn => fn.mockReset());
  });

  test('Path 1 (Valid): direct access terakhir di-revoke (document -> PRIVATE)', async () => {
    const { revokeDocumentsAccess } = await import('../../src/modules/document/document.service?cache-bust=08');
    prisma.document.findFirst.mockResolvedValue(documentFactory({ id: 'doc-1', ownerId: 'owner-1', privacy: 'SPECIFIC_USER' }));
    prisma.documentAccess.deleteMany.mockResolvedValue({ count: 1 });
    prisma.documentAccess.count.mockResolvedValue(0);
    prisma.document.update.mockResolvedValue(documentFactory({ id: 'doc-1', privacy: 'PRIVATE' }));

    const result = await revokeDocumentsAccess('owner-1', [{ documentId: 'doc-1', targetUserIds: ['user-2'] }]);

    expect(result).toEqual([{ documentId: 'doc-1', revokedCount: 1, newStatus: 'PRIVATE' }]);
    expect(prisma.document.update).toHaveBeenCalledWith({ where: { id: 'doc-1' }, data: { privacy: 'PRIVATE' } });
  });

  test('Path 2 (Tidak Valid): dokumen tidak ditemukan / unauthorized saat revoke', async () => {
    const { revokeDocumentsAccess } = await import('../../src/modules/document/document.service?cache-bust=08');
    prisma.document.findFirst.mockResolvedValue(null);

    const result = await revokeDocumentsAccess('owner-1', [{ documentId: 'doc-not-found', targetUserIds: ['user-2'] }]);

    expect(result).toEqual([{ documentId: 'doc-not-found', status: 'failed', message: 'Document not found or unauthorized' }]);
    expect(prisma.documentAccess.deleteMany).not.toHaveBeenCalled();
  });

  test('Path 3 (Valid): akses tidak ditemukan saat revoke (revokedCount bernilai 0)', async () => {
    const { revokeDocumentsAccess } = await import('../../src/modules/document/document.service?cache-bust=08');
    prisma.document.findFirst.mockResolvedValue(documentFactory({ id: 'doc-1', ownerId: 'owner-1', privacy: 'SPECIFIC_USER' }));
    prisma.documentAccess.deleteMany.mockResolvedValue({ count: 0 });
    prisma.documentAccess.count.mockResolvedValue(1);

    const result = await revokeDocumentsAccess('owner-1', [{ documentId: 'doc-1', targetUserIds: ['user-not-shared'] }]);

    expect(result).toEqual([{ documentId: 'doc-1', revokedCount: 0, newStatus: 'SPECIFIC_USER' }]);
  });
});
