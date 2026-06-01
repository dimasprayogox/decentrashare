import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../../../helpers/prisma';
import { documentFactory, folderFactory } from '../../../helpers/factories';
import { given } from '../../../helpers/given';

const prisma = createPrismaMock();
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };
const pinata = { upload: { file: mock() }, groups: { list: mock(), create: mock() }, pin: { delete: mock() } };
const blockchainService = { prepareTransactionData: mock() };

mock.module('../../../../src/config/db', () => ({ prisma }));
mock.module('../../../../src/utils/logger', () => ({ logger }));
mock.module('../../../../src/utils/logger.js', () => ({ logger }));
mock.module('../../../../src/config/pinata', () => ({ pinata }));
mock.module('../../../../src/modules/blockchain/blockchain.service', () => ({ default: blockchainService }));
mock.module('../../../../src/utils/hash', () => ({ generateFileHash: mock(async () => 'hash-1') }));

describe('Feature: document privacy, access, and download behavior', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    Object.values(logger).forEach(fn => fn.mockReset());
    pinata.upload.file.mockReset();
    blockchainService.prepareTransactionData.mockReset();
    globalThis.fetch = mock() as any;
  });

  test('given a private document viewed by a non-owner, when it is serialized, then IPFS and owner-only fields are hidden', async () => {
    const { sanitizeDocument } = await import('../../../../src/modules/document/document.service');
    const doc = documentFactory({ privacy: 'PRIVATE', pendingOnChainUntil: new Date(), cleanupStatus: 'PENDING' });

    const result = sanitizeDocument(doc, 'user-2');

    expect(result.ipfsHash).toBeUndefined();
    expect(result.pendingOnChainUntil).toBeUndefined();
    expect(result.cleanupStatus).toBeUndefined();
  });

  test('given a public document viewed anonymously, when it is serialized, then the blockchain transaction remains visible and IPFS is hidden', async () => {
    const { sanitizeDocument } = await import('../../../../src/modules/document/document.service');

    const result = sanitizeDocument(documentFactory({ privacy: 'PUBLIC', blockchainTx: '0xtx' }));

    expect(result.blockchainTx).toBe('0xtx');
    expect(result.ipfsHash).toBeUndefined();
  });

  test('given an archived document owned by the requester, when access is validated, then the owner can still access it', async () => {
    const { validateDocumentAccess } = await import('../../../../src/modules/document/document.service');
    const doc = documentFactory({ ownerId: 'user-1', isArchived: true });
    prisma.document.findUnique.mockResolvedValue(doc);

    const result = await validateDocumentAccess('doc-1', 'user-1');

    expect(result).toEqual(doc);
  });

  test('given an unknown document id, when access is validated, then a not-found error is raised', async () => {
    const { validateDocumentAccess } = await import('../../../../src/modules/document/document.service');
    prisma.document.findUnique.mockResolvedValue(null);

    await expect(validateDocumentAccess('missing', 'user-1')).rejects.toThrow('Document not found.');
  });

  test('given a private document owned by another user, when access is validated, then access is denied', async () => {
    const { validateDocumentAccess } = await import('../../../../src/modules/document/document.service');
    prisma.document.findUnique.mockResolvedValue(documentFactory({ ownerId: 'owner-1', privacy: 'PRIVATE', sharedWith: [] }));

    await expect(validateDocumentAccess('doc-1', 'user-2')).rejects.toThrow('Access denied. You do not have permission to view this document.');
  });

  test('given a public document owned by another user, when access is validated, then the requester can access it', async () => {
    const { validateDocumentAccess } = await import('../../../../src/modules/document/document.service');
    const doc = documentFactory({ ownerId: 'owner-1', privacy: 'PUBLIC', sharedWith: [] });
    prisma.document.findUnique.mockResolvedValue(doc);

    const result = await validateDocumentAccess('doc-1', 'user-2');

    expect(result).toEqual(doc);
  });

  test('given a document shared directly with a user, when access is validated, then the shared user can access it', async () => {
    const { validateDocumentAccess } = await import('../../../../src/modules/document/document.service');
    const doc = documentFactory({ ownerId: 'owner-1', privacy: 'SPECIFIC_USER', sharedWith: [{ userId: 'user-2' }] });
    prisma.document.findUnique.mockResolvedValue(doc);

    const result = await validateDocumentAccess('doc-1', 'user-2');

    expect(result).toEqual(doc);
  });

  test('given a document inside a folder shared with a user, when access is validated, then folder inheritance grants access', async () => {
    const { validateDocumentAccess } = await import('../../../../src/modules/document/document.service');
    const doc = documentFactory({ ownerId: 'owner-1', privacy: 'SPECIFIC_USER', folderId: 'folder-1', sharedWith: [] });
    prisma.document.findUnique.mockResolvedValue(doc);
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'folder-1', ownerId: 'owner-1', privacy: 'SPECIFIC_USER', sharedWith: [{ userId: 'user-2', role: 'VIEWER' }] }));

    const result = await validateDocumentAccess('doc-1', 'user-2');

    expect(result).toEqual(doc);
  });

  test('given an accessible document, when it is downloaded, then the IPFS gateway stream and file metadata are returned', async () => {
    const { getDocumentStreamForDownload } = await import('../../../../src/modules/document/document.service');
    const body = new ReadableStream();
    prisma.document.findUnique.mockResolvedValue(documentFactory({ ownerId: 'user-1', ipfsHash: 'QmHash', fileName: 'file.pdf' }));
    (globalThis.fetch as any).mockResolvedValue({ ok: true, body });

    const result = await getDocumentStreamForDownload('doc-1', 'user-1');

    expect(globalThis.fetch).toHaveBeenCalledWith('https://gateway.pinata.cloud/ipfs/QmHash');
    expect(result).toEqual({
      stream: body,
      metadata: { fileName: 'file.pdf', mimeType: 'application/pdf', fileSize: 1234 },
    });
  });

  test('given the IPFS gateway fails, when an accessible document is downloaded, then the failure is logged and propagated', async () => {
    const { getDocumentStreamForDownload } = await import('../../../../src/modules/document/document.service');
    prisma.document.findUnique.mockResolvedValue(documentFactory({ ownerId: 'user-1', ipfsHash: 'QmHash' }));
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 502 });

    await expect(getDocumentStreamForDownload('doc-1', 'user-1')).rejects.toThrow('Failed to fetch file from IPFS: 502');
    expect(logger.error).toHaveBeenCalled();
  });

  test('given activity logging fails, when a document download is recorded, then the download flow is not interrupted', async () => {
    const { logDownloadActivity } = await import('../../../../src/modules/document/document.service');
    given.activityLogFails(prisma);

    await expect(logDownloadActivity('user-1', 'doc-1', 'file.pdf', 'QmHash')).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  test('given no documents are selected, when documents are moved, then nothing changes and root privacy is returned', async () => {
    const { moveMultipleDocuments } = await import('../../../../src/modules/document/document.service');
    prisma.document.findMany.mockResolvedValue([]);

    const result = await moveMultipleDocuments(['doc-1'], 'user-1', null);

    expect(result).toEqual({ count: 0, appliedPrivacy: 'PRIVATE', location: 'Root' });
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  test('given selected documents contain duplicate titles, when they are moved together, then the move is rejected', async () => {
    const { moveMultipleDocuments } = await import('../../../../src/modules/document/document.service');
    prisma.document.findMany.mockResolvedValue([
      { id: 'doc-1', title: 'Report', folderId: 'source', ownerId: 'user-1' },
      { id: 'doc-2', title: 'report', folderId: 'source', ownerId: 'user-1' },
    ]);

    await expect(moveMultipleDocuments(['doc-1', 'doc-2'], 'user-1', null)).rejects.toThrow('Document "Report" already exists in this location');
  });

  test('given target folder is editable, when documents are moved there, then target privacy is applied to moved documents', async () => {
    const { moveMultipleDocuments } = await import('../../../../src/modules/document/document.service');
    prisma.folder.findFirst.mockResolvedValue(folderFactory({ id: 'folder-2', privacy: 'PUBLIC' }));
    prisma.document.findMany.mockResolvedValue([{ id: 'doc-1', title: 'Report', folderId: null, ownerId: 'user-1' }]);
    prisma.document.findFirst.mockResolvedValue(null);
    prisma.document.updateMany.mockResolvedValue({ count: 1 });

    const result = await moveMultipleDocuments(['doc-1'], 'user-1', 'folder-2');

    expect(result).toEqual({ count: 1, appliedPrivacy: 'PUBLIC', location: 'Folder' });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['doc-1'] }, isArchived: false },
      data: { folderId: 'folder-2', privacy: 'PUBLIC' },
    });
  });

  test('given an editor moves another owner document, when the document is selected, then the document is rescued to its owner accessible parent', async () => {
    const { moveMultipleDocuments } = await import('../../../../src/modules/document/document.service');
    prisma.folder.findFirst.mockResolvedValue(folderFactory({ id: 'target-b', ownerId: 'user-b', privacy: 'PUBLIC', sharedWith: [] }));
    prisma.document.findMany.mockResolvedValue([{ id: 'doc-a', title: 'A Report', folderId: 'b-folder', ownerId: 'user-a' }]);
    prisma.document.findFirst.mockResolvedValue(null);
    prisma.folder.findUnique
      .mockResolvedValueOnce(folderFactory({ id: 'b-folder', ownerId: 'user-b', parentId: 'a-parent', sharedWith: [] }))
      .mockResolvedValueOnce(folderFactory({ id: 'a-parent', ownerId: 'user-a', privacy: 'PRIVATE', sharedWith: [] }));

    const result = await moveMultipleDocuments(['doc-a'], 'user-b', 'target-b');

    expect(result).toEqual({ count: 1, appliedPrivacy: 'PUBLIC', location: 'Folder' });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-a' },
      data: { folderId: 'a-parent', title: 'A Report', privacy: 'PRIVATE' },
    });
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  test('given a short keyword, when public documents are searched, then no database lookup is performed', async () => {
    const { searchPublicDocuments } = await import('../../../../src/modules/document/document.service');

    const result = await searchPublicDocuments('user-1', 'a');

    expect(result).toEqual([]);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  test('given a valid public search keyword, when documents are searched, then other users public documents are sanitized and returned', async () => {
    const { searchPublicDocuments } = await import('../../../../src/modules/document/document.service');
    given.documentsFound(prisma, [documentFactory({ ownerId: 'owner-2', privacy: 'PUBLIC', ipfsHash: 'hidden' })]);

    const result = await searchPublicDocuments('user-1', 'report', 99);

    expect(result).toHaveLength(1);
    expect(result[0].ipfsHash).toBeUndefined();
    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ privacy: 'PUBLIC', ownerId: { not: 'user-1' }, isArchived: false, deletedAt: null, OR: expect.any(Array) }),
      include: expect.any(Object),
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 30,
    });
  });

  test('given active owned documents, when they are archived, then deletedAt is set and only active owner documents are updated', async () => {
    const { archiveDocuments } = await import('../../../../src/modules/document/document.service');
    prisma.document.updateMany.mockResolvedValue({ count: 2 });

    const result = await archiveDocuments(['doc-1', 'doc-2'], 'user-1');

    expect(result).toEqual({ count: 2 });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['doc-1', 'doc-2'] }, ownerId: 'user-1', isArchived: false },
      data: { isArchived: true, deletedAt: expect.any(Date) },
    });
  });

  test('given archived documents whose original folder is unavailable, when they are restored, then they are moved to root with conflict-safe titles', async () => {
    const { restoreDocuments } = await import('../../../../src/modules/document/document.service');
    prisma.document.findMany
      .mockResolvedValueOnce([{ id: 'doc-1', title: 'Report', folderId: 'archived-folder' }])
      .mockResolvedValueOnce([{ title: 'Report' }]);
    prisma.folder.findMany.mockResolvedValue([]);

    const result = await restoreDocuments(['doc-1'], 'user-1');

    expect(result).toEqual({
      count: 1,
      movedToRootCount: 1,
      renamedCount: 1,
      renamed: [{ id: 'doc-1', originalTitle: 'Report', restoredTitle: 'Report (restore)' }],
    });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: { title: 'Report (restore)', isArchived: false, deletedAt: null, folderId: null },
    });
  });

  test('given archived documents selected for permanent deletion, when destroyed, then audit logs, access rows, and documents are deleted', async () => {
    const { destroyMultipleDocuments } = await import('../../../../src/modules/document/document.service');
    prisma.document.findMany.mockResolvedValue([documentFactory({ id: 'doc-1', title: 'Report', isArchived: true })]);
    prisma.document.deleteMany.mockResolvedValue({ count: 1 });

    const result = await destroyMultipleDocuments(['doc-1'], 'user-1');

    expect(result).toEqual({ count: 1 });
    expect(prisma.activityLog.createMany).toHaveBeenCalled();
    expect(prisma.documentAccess.deleteMany).toHaveBeenCalledWith({ where: { documentId: { in: ['doc-1'] } } });
    expect(prisma.document.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['doc-1'] }, ownerId: 'user-1', isArchived: true } });
  });

  test('given a document title collides in the same folder, when metadata is updated, then duplicate title is rejected', async () => {
    const { updateDocumentMetadata } = await import('../../../../src/modules/document/document.service');
    prisma.document.findFirst
      .mockResolvedValueOnce(documentFactory({ id: 'doc-1', title: 'Old', folderId: null, ownerId: 'user-1' }))
      .mockResolvedValueOnce(documentFactory({ id: 'doc-2', title: 'New Title', folderId: null, ownerId: 'user-1' }));

    await expect(updateDocumentMetadata('doc-1', 'user-1', { title: ' New Title ' })).rejects.toThrow('Document "New Title" already exists in this folder');
  });

  test('given document privacy is changed away from specific users, when privacy is updated, then direct access rows are revoked', async () => {
    const { updateDocumentsPrivacy } = await import('../../../../src/modules/document/document.service');
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    prisma.documentAccess.deleteMany.mockResolvedValue({ count: 3 });

    const result = await updateDocumentsPrivacy('user-1', [{ documentId: 'doc-1', newPrivacy: 'PUBLIC' as any }]);

    expect(result).toEqual([{ documentId: 'doc-1', status: 'updated', newPrivacy: 'PUBLIC', accessRevoked: 3 }]);
    expect(prisma.documentAccess.deleteMany).toHaveBeenCalledWith({ where: { documentId: 'doc-1' } });
  });

  test('given an owner shares a document with another user, when sharing runs, then direct access is granted and privacy becomes specific-user', async () => {
    const { shareDocumentsToUsers } = await import('../../../../src/modules/document/document.service');
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

  test('given the last direct document access is revoked, when revoke runs, then the document becomes private', async () => {
    const { revokeDocumentsAccess } = await import('../../../../src/modules/document/document.service');
    prisma.document.findFirst.mockResolvedValue(documentFactory({ id: 'doc-1', ownerId: 'owner-1', privacy: 'SPECIFIC_USER' }));
    prisma.documentAccess.deleteMany.mockResolvedValue({ count: 1 });
    prisma.documentAccess.count.mockResolvedValue(0);
    prisma.document.update.mockResolvedValue(documentFactory({ id: 'doc-1', privacy: 'PRIVATE' }));

    const result = await revokeDocumentsAccess('owner-1', [{ documentId: 'doc-1', targetUserIds: ['user-2'] }]);

    expect(result).toEqual([{ documentId: 'doc-1', revokedCount: 1, newStatus: 'PRIVATE' }]);
    expect(prisma.document.update).toHaveBeenCalledWith({ where: { id: 'doc-1' }, data: { privacy: 'PRIVATE' } });
  });
});
