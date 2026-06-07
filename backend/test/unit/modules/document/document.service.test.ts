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

const mockFs = {
  existsSync: mock(() => true),
  unlinkSync: mock(),
  readFileSync: mock(() => Buffer.from('file-content')),
};
mock.module('fs', () => ({
  default: mockFs
}));

const mockZipArchive = mock(function() {
  return {
    on: mock(),
    append: mock(),
    finalize: mock(),
  };
});
mock.module('archiver', () => ({
  ZipArchive: mockZipArchive
}));

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

  test('given multiple items of mixed types, when bulkMoveItems runs, then all items are relocated inside a transaction', async () => {
    const { bulkMoveItems } = await import('../../../../src/modules/document/document.service');
    prisma.folder.findFirst
      .mockResolvedValueOnce(folderFactory({ id: 'folder-2', privacy: 'PUBLIC' })) // targetFolder check
      .mockResolvedValueOnce(folderFactory({ id: 'folder-sub', parentId: null, ownerId: 'user-1' })); // folder to move check
    prisma.document.findFirst
      .mockResolvedValueOnce(documentFactory({ id: 'doc-1', folderId: null, ownerId: 'user-1', title: 'Doc 1' })); // doc check
    
    prisma.document.findMany.mockResolvedValue([]);
    prisma.folder.findMany.mockResolvedValue([]);
    
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));

    const result = await bulkMoveItems('user-1', [
      { id: 'doc-1', type: 'document' },
      { id: 'folder-sub', type: 'folder' }
    ], 'folder-2');

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(result.appliedPrivacy).toBe('PUBLIC');
    expect(prisma.document.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'doc-1' },
      data: { folderId: 'folder-2', privacy: 'PUBLIC' }
    }));
    expect(prisma.folder.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'folder-sub' },
      data: { parentId: 'folder-2', privacy: 'PUBLIC' }
    }));
  });

  test('given a subfolder containing a foreign document is bulk moved, when the move runs, then the foreign document is rescued to the nearest parent folder', async () => {
    const { bulkMoveItems } = await import('../../../../src/modules/document/document.service');
    
    // Mocks for targetFolder
    prisma.folder.findFirst
      .mockResolvedValueOnce(folderFactory({ id: 'target-folder', ownerId: 'user-a', name: 'Target', privacy: 'PRIVATE', sharedWith: [] })) // targetFolder check
      .mockResolvedValueOnce(folderFactory({ id: 'subfolder-1', ownerId: 'user-a', name: 'Subfolder', parentId: 'parent-folder' })); // folder to move check
      
    prisma.folder.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'parent-folder') return folderFactory({ id: 'parent-folder', ownerId: 'user-b', name: 'Parent', privacy: 'SPECIFIC_USER', sharedWith: [] });
      if (where.id === 'target-folder') return folderFactory({ id: 'target-folder', ownerId: 'user-a', name: 'Target', privacy: 'PRIVATE', sharedWith: [] });
      if (where.id === 'subfolder-1') return folderFactory({ id: 'subfolder-1', ownerId: 'user-a', name: 'Subfolder', parentId: 'parent-folder' });
      return null;
    });

    prisma.folder.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([]);

    prisma.folder.findMany
      .mockResolvedValueOnce([]) // initial descendant check inside bulkMoveItems
      .mockResolvedValueOnce([]) // foldersToMoveResult
      .mockResolvedValueOnce([{ id: 'subfolder-1', parentId: 'parent-folder', ownerId: 'user-a' }]) // allSubtreeFoldersResult
      .mockResolvedValueOnce([]) // rootOwnerFoldersToRescueResult
      .mockResolvedValueOnce([]); // recalculated descendant check children

    prisma.document.findMany
      .mockResolvedValueOnce([]) // rootOwnerDocumentsToRescueResult
      .mockResolvedValueOnce([
        { id: 'doc-1', title: 'Doc', ownerId: 'user-b', folderId: 'subfolder-1' } // documentsToMove check
      ])
      .mockResolvedValueOnce([]); // subtreeDocuments inside bulkMoveItems after recalculation

    prisma.folder.update.mockResolvedValue(folderFactory({ id: 'subfolder-1', parentId: 'target-folder', privacy: 'PRIVATE' }));
    
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));

    const result = await bulkMoveItems('user-a', [
      { id: 'subfolder-1', type: 'folder' }
    ], 'target-folder');

    expect(result.success).toBe(true);
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: {
        folderId: 'parent-folder',
        title: 'Doc',
        privacy: 'SPECIFIC_USER'
      }
    });
  });

  test('given only one document item, when bulkMoveItems runs, then it is logged as a single MOVE action with details', async () => {
    const { bulkMoveItems } = await import('../../../../src/modules/document/document.service');
    prisma.folder.findFirst.mockResolvedValueOnce(folderFactory({ id: 'folder-2', privacy: 'PUBLIC' }));
    prisma.document.findFirst.mockResolvedValueOnce(documentFactory({ id: 'doc-1', folderId: null, ownerId: 'user-1', title: 'Doc 1', privacy: 'PRIVATE' }));
    
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));

    const result = await bulkMoveItems('user-1', [
      { id: 'doc-1', type: 'document' }
    ], 'folder-2');

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(prisma.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'MOVE',
        entityType: 'DOCUMENT',
        entityId: 'doc-1',
        entityName: 'Doc 1',
        details: expect.stringContaining('"privacy":{"from":"PRIVATE","to":"PUBLIC"}')
      })
    }));
  });

  test('given a short keyword, when public documents are searched, then no database lookup is performed', async () => {
    const { searchPublicDocuments } = await import('../../../../src/modules/document/document.service');

    const result = await searchPublicDocuments('user-1', 'a');

    expect(result).toEqual([]);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  test('given a valid public search keyword, when documents are searched, then public documents are sanitized and returned', async () => {
    const { searchPublicDocuments } = await import('../../../../src/modules/document/document.service');
    given.documentsFound(prisma, [documentFactory({ ownerId: 'owner-2', privacy: 'PUBLIC', ipfsHash: 'hidden' })]);

    const result = await searchPublicDocuments('user-1', 'report', 99);

    expect(result).toHaveLength(1);
    expect(result[0].ipfsHash).toBeUndefined();
    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ privacy: 'PUBLIC', isArchived: false, deletedAt: null, OR: expect.any(Array) }),
      include: expect.any(Object),
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 30,
    });
  });

  test('given active owned documents, when they are archived, then deletedAt is set and only active owner documents are updated', async () => {
    const { archiveDocuments } = await import('../../../../src/modules/document/document.service');
    prisma.document.findMany.mockResolvedValue([
      { id: 'doc-1', title: 'Doc 1', fileHash: 'h1', ipfsHash: 'i1', blockchainTx: 'tx1' },
      { id: 'doc-2', title: 'Doc 2', fileHash: 'h2', ipfsHash: 'i2', blockchainTx: 'tx2' }
    ]);
    prisma.document.updateMany.mockResolvedValue({ count: 2 });

    const result = await archiveDocuments(['doc-1', 'doc-2'], 'user-1');

    expect(result).toEqual({ count: 2 });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['doc-1', 'doc-2'] } },
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
    expect(prisma.activityLog.create).toHaveBeenCalled();
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

  // --- uploadMultipleFiles ---

  test('given valid files, when uploadMultipleFiles runs, then it uploads files to Pinata, saves to DB, and returns results', async () => {
    const { uploadMultipleFiles } = await import('../../../../src/modules/document/document.service');
    
    prisma.user.findUnique.mockResolvedValue({ pinataGroupId: 'group-1', username: 'alice', storageLimit: 5368709120 });
    prisma.document.aggregate.mockResolvedValue({ _sum: { fileSize: 0 } }); // Storage quota check: no usage yet
    prisma.document.findUnique.mockResolvedValue(null); // No content duplicates
    prisma.document.findFirst.mockResolvedValue(null); // No title duplicates
    pinata.upload.file.mockResolvedValue({ IpfsHash: 'QmNewDocCID' });
    blockchainService.prepareTransactionData.mockReturnValue({ hash: 'QmNewDocCID', name: 'report.pdf', fileHash: 'hash-1' });
    
    const mockCreatedDoc = documentFactory({ id: 'doc-new', title: 'report', ownerId: 'user-1', ipfsHash: 'QmNewDocCID', fileHash: 'hash-1' });
    prisma.$transaction.mockImplementation(async (cb) => {
      return cb(prisma);
    });
    prisma.document.create.mockResolvedValue(mockCreatedDoc);
    prisma.documentAccess.createMany.mockResolvedValue({ count: 1 });
    prisma.activityLog.create.mockResolvedValue({});

    const files = [
      {
        originalname: 'report.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        path: '/tmp/report.pdf',
      } as any,
    ];

    const result = await uploadMultipleFiles(files, 'user-1');

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].status).toBe('uploaded');
    expect(result.results[0].pinataInfo?.ipfsHash).toBe('QmNewDocCID');
    expect(prisma.document.create).toHaveBeenCalled();
  });

  test('given files with duplicate hash, when uploadMultipleFiles runs, then skips uploading and reports duplicate status', async () => {
    const { uploadMultipleFiles } = await import('../../../../src/modules/document/document.service');

    prisma.user.findUnique.mockResolvedValue({ pinataGroupId: null, storageLimit: 5368709120 });
    prisma.document.aggregate.mockResolvedValue({ _sum: { fileSize: 0 } }); // Storage quota check: no usage yet
    // Simulate duplicate found
    prisma.document.findUnique.mockResolvedValue({
      id: 'doc-existing',
      title: 'report',
      ipfsHash: 'QmExisting',
      fileHash: 'hash-1',
      createdAt: new Date(),
    });

    const files = [
      {
        originalname: 'report.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        path: '/tmp/report.pdf',
      } as any,
    ];

    const result = await uploadMultipleFiles(files, 'user-1');

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].status).toBe('duplicate');
    expect(result.results[0].errorCode).toBe('FILE_DUPLICATE');
    expect(pinata.upload.file).not.toHaveBeenCalled();
  });

  test('given an upload that would exceed the storage quota, when uploadMultipleFiles runs, then it rejects all files without uploading', async () => {
    const { uploadMultipleFiles } = await import('../../../../src/modules/document/document.service');

    // User limited to 1GB, already using ~1GB
    prisma.user.findUnique.mockResolvedValue({ pinataGroupId: null, username: 'alice', storageLimit: 1073741824 });
    prisma.document.aggregate.mockResolvedValue({ _sum: { fileSize: 1000000000 } }); // ~0.93GB used

    const files = [
      {
        originalname: 'big.pdf',
        mimetype: 'application/pdf',
        size: 200000000, // 200MB — pushes total over the 1GB limit
        path: '/tmp/big.pdf',
      } as any,
    ];

    const result = await uploadMultipleFiles(files, 'user-1');

    expect(result.summary).toEqual(expect.objectContaining({ uploaded: 0, error: 1 }));
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].errorCode).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(pinata.upload.file).not.toHaveBeenCalled();
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  test('given a user with unlimited storage (null limit), when uploadMultipleFiles runs, then the quota check is skipped', async () => {
    const { uploadMultipleFiles } = await import('../../../../src/modules/document/document.service');

    // Admin: storageLimit null = unlimited
    prisma.user.findUnique.mockResolvedValue({ pinataGroupId: 'group-1', username: 'admin', storageLimit: null });
    prisma.document.findUnique.mockResolvedValue(null); // no content duplicates
    pinata.upload.file.mockResolvedValue({ IpfsHash: 'QmAdminCID' });
    blockchainService.prepareTransactionData.mockReturnValue({ hash: 'QmAdminCID', name: 'big.pdf', fileHash: 'hash-1' });
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    prisma.document.create.mockResolvedValue(documentFactory({ id: 'doc-admin', ipfsHash: 'QmAdminCID', fileHash: 'hash-1' }));
    prisma.documentAccess.createMany.mockResolvedValue({ count: 1 });
    prisma.activityLog.create.mockResolvedValue({});

    const aggregateSpy = prisma.document.aggregate;

    const files = [
      {
        originalname: 'big.pdf',
        mimetype: 'application/pdf',
        size: 999999999999, // huge — would exceed any normal limit
        path: '/tmp/big.pdf',
      } as any,
    ];

    const result = await uploadMultipleFiles(files, 'admin-1');

    // No quota error, upload proceeds; the quota aggregate query is never run
    expect(result.results[0].errorCode).not.toBe('STORAGE_QUOTA_EXCEEDED');
    expect(aggregateSpy).not.toHaveBeenCalled();
  });

  // --- createDocumentsArchive ---

  test('given documents, when createDocumentsArchive is called, then it downloads files and adds them to ZIP', async () => {
    const { createDocumentsArchive } = await import('../../../../src/modules/document/document.service');
    const body = new ReadableStream();
    (globalThis.fetch as any).mockResolvedValue({ ok: true, body });

    const docs = [{ id: 'doc-1', title: 'Doc', fileName: 'doc.txt', ipfsHash: 'QmHash' }];
    const result = await createDocumentsArchive(docs, ['empty-folder']);

    expect(result.summary.totalRequested).toBe(1);
    expect(result.stream).toBeDefined();
    await result.finalize();
  });

  // --- prepareFolderArchive ---

  test('given a folder, when prepareFolderArchive is called, then it gathers files and creates ZIP', async () => {
    const { prepareFolderArchive } = await import('../../../../src/modules/document/document.service');
    
    // validateFolderAccess mock
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'folder-1', name: 'My Folder', ownerId: 'user-1' }));
    // getDescendantFolders mock
    prisma.folder.findMany
      .mockResolvedValueOnce([{ id: 'folder-1' }]) // getDescendantFolders
      .mockResolvedValueOnce([{ id: 'folder-1', name: 'My Folder', parentId: null }]); // folders query
    
    // documents inside subtree query mock
    prisma.document.findMany.mockResolvedValueOnce([
      { id: 'doc-1', title: 'Doc', fileName: 'doc.txt', ipfsHash: 'QmHash', folderId: 'folder-1' }
    ]);

    // mock fetch for createDocumentsArchive
    const body = new ReadableStream();
    (globalThis.fetch as any).mockResolvedValue({ ok: true, body });

    const result = await prepareFolderArchive('folder-1', 'user-1');
    expect(result.folderName).toBe('My Folder');
    expect(result.metadata).toHaveLength(1);
  });

  // --- bulkDownloadDocuments ---

  test('given document and folder IDs, when bulkDownloadDocuments runs, then it creates archive zip', async () => {
    const { bulkDownloadDocuments } = await import('../../../../src/modules/document/document.service');
    
    // validateDocumentAccess mock
    prisma.document.findUnique.mockResolvedValue(documentFactory({ id: 'doc-1', ipfsHash: 'QmHash', ownerId: 'user-1' }));
    
    // validateFolderAccess mock
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'folder-1', name: 'Folder', ownerId: 'user-1' }));
    prisma.folder.findMany
      .mockResolvedValueOnce([{ id: 'folder-1' }]) // getDescendantFolders
      .mockResolvedValueOnce([{ id: 'folder-1', name: 'Folder', parentId: null }]); // folders list

    prisma.document.findMany.mockResolvedValueOnce([]); // documents list for folder

    // fetch mock
    (globalThis.fetch as any).mockResolvedValue({ ok: true, body: new ReadableStream() });

    const result = await bulkDownloadDocuments({ documentIds: ['doc-1'], folderIds: ['folder-1'] }, 'user-1');
    expect(result.stream).toBeDefined();
    expect(result.summary.totalRequested).toBe(2);
    expect(result.folders).toBeDefined();
    expect(result.folders[0].name).toBe('Folder');
  });

  test('given empty bulk download input, when bulkDownloadDocuments runs, then throws error', async () => {
    const { bulkDownloadDocuments } = await import('../../../../src/modules/document/document.service');

    await expect(bulkDownloadDocuments({ documentIds: [], folderIds: [] }, 'user-1')).rejects.toThrow('No documents specified');
  });

  // --- getRootDocuments ---

  test('given user id, when getRootDocuments runs, then query finds root active documents of user', async () => {
    const { getRootDocuments } = await import('../../../../src/modules/document/document.service');
    const docs = [documentFactory({ id: 'doc-1', ownerId: 'user-1', folderId: null })];
    prisma.document.findMany.mockResolvedValue(docs);

    const result = await getRootDocuments('user-1');
    expect(result).toEqual(docs);
    expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId: 'user-1', folderId: null, isArchived: false },
    }));
  });

  // --- getUserDocuments ---

  test('given user and folder, when getUserDocuments runs, then checks folder access and returns sanitized documents', async () => {
    const { getUserDocuments } = await import('../../../../src/modules/document/document.service');
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'folder-1', ownerId: 'user-1' }));
    prisma.document.findMany.mockResolvedValue([
      documentFactory({ id: 'doc-1', ownerId: 'user-1', folderId: 'folder-1' })
    ]);

    const result = await getUserDocuments('user-1', 'folder-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('doc-1');
  });

  // --- getArchivedDocuments ---

  test('given archived documents, when getArchivedDocuments runs, then query returns trash documents', async () => {
    const { getArchivedDocuments } = await import('../../../../src/modules/document/document.service');
    const docs = [documentFactory({ id: 'doc-1', isArchived: true })];
    prisma.document.findMany.mockResolvedValue(docs);

    const result = await getArchivedDocuments('user-1');
    expect(result).toEqual(docs);
  });

  // --- getMyStorageUsage ---

  test('given documents, when getMyStorageUsage is called, then calculates aggregate storage metrics against the user limit', async () => {
    const { getMyStorageUsage } = await import('../../../../src/modules/document/document.service');
    prisma.user.findUnique.mockResolvedValue({ storageLimit: 5368709120 }); // 5 GB limit
    prisma.document.aggregate.mockResolvedValue({ _sum: { fileSize: 536870912 } }); // 512 MB

    const result = await getMyStorageUsage('user-1');
    expect(result.usedBytes).toBe(536870912);
    expect(result.quotaBytes).toBe(5368709120);
    expect(result.usagePercent).toBe(10); // 512 MB of 5 GB is 10%
  });

  test('given a user with a custom storage limit, when getMyStorageUsage is called, then the quota reflects that limit', async () => {
    const { getMyStorageUsage } = await import('../../../../src/modules/document/document.service');
    prisma.user.findUnique.mockResolvedValue({ storageLimit: 10737418240 }); // 10 GB limit
    prisma.document.aggregate.mockResolvedValue({ _sum: { fileSize: 5368709120 } }); // 5 GB used

    const result = await getMyStorageUsage('user-1');
    expect(result.quotaBytes).toBe(10737418240);
    expect(result.usagePercent).toBe(50); // 5 GB of 10 GB
  });

  test('given a user with a null storage limit (unlimited), when getMyStorageUsage is called, then quota is null and unlimited is true', async () => {
    const { getMyStorageUsage } = await import('../../../../src/modules/document/document.service');
    prisma.user.findUnique.mockResolvedValue({ storageLimit: null }); // unlimited (e.g. ADMIN)
    prisma.document.aggregate.mockResolvedValue({ _sum: { fileSize: 9999999999 } });

    const result = await getMyStorageUsage('user-1');
    expect(result.quotaBytes).toBe(null);
    expect(result.unlimited).toBe(true);
    expect(result.usedBytes).toBe(9999999999);
  });

  // --- getSharedWithMeDocuments ---

  test('given shared documents, when getSharedWithMeDocuments runs, then returns mapped documents', async () => {
    const { getSharedWithMeDocuments } = await import('../../../../src/modules/document/document.service');
    prisma.documentAccess.findMany.mockResolvedValue([
      {
        id: 'access-1',
        document: documentFactory({ id: 'doc-1', ownerId: 'user-2', privacy: 'PUBLIC' }),
      },
    ]);

    const result = await getSharedWithMeDocuments('user-1');
    expect(result).toHaveLength(1);
    expect(result[0].accessId).toBe('access-1');
  });

  // --- getActivityLogs ---

  test('given logs, when getActivityLogs is called, then returns log records', async () => {
    const { getActivityLogs } = await import('../../../../src/modules/document/document.service');
    prisma.activityLog.findMany.mockResolvedValue([{ id: 'log-1', action: 'DOWNLOAD' }]);

    const result = await getActivityLogs('user-1');
    expect(result).toEqual([{ id: 'log-1', action: 'DOWNLOAD' }]);
  });

  // --- getAllDocumentsForAdmin ---

  test('when getAllDocumentsForAdmin is called, then returns all documents', async () => {
    const { getAllDocumentsForAdmin } = await import('../../../../src/modules/document/document.service');
    prisma.document.findMany.mockResolvedValue([documentFactory()]);

    const result = await getAllDocumentsForAdmin();
    expect(result).toHaveLength(1);
  });

  // --- getSystemStatsForAdmin ---

  test('when getSystemStatsForAdmin is called, then returns aggregate counts', async () => {
    const { getSystemStatsForAdmin } = await import('../../../../src/modules/document/document.service');
    prisma.$transaction.mockResolvedValue([10, 5]);

    const result = await getSystemStatsForAdmin();
    expect(result).toEqual({ totalFiles: 10, totalUsers: 5 });
  });
});

