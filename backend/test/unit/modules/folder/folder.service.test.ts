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

describe('Feature: folder management behavior', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    Object.values(logger).forEach(fn => fn.mockReset());
    pinata.upload.file.mockReset();
    blockchainService.prepareTransactionData.mockReset();
  });

  test('given a new root folder name, when the folder is created, then the name is trimmed and privacy defaults to private', async () => {
    const { createFolder } = await import('../../../../src/modules/folder/folder.service');
    const created = folderFactory({ id: 'folder-new', name: 'Projects' });
    given.noDuplicateFolder(prisma);
    prisma.folder.create.mockResolvedValue(created);

    const result = await createFolder('  Projects  ', 'user-1');

    expect(prisma.folder.findFirst).toHaveBeenCalledWith({
      where: {
        name: { equals: 'Projects', mode: 'insensitive' },
        ownerId: 'user-1',
        parentId: null,
        isArchived: false,
        deletedAt: null,
      },
    });
    expect(prisma.folder.create).toHaveBeenCalledWith({
      data: { name: 'Projects', ownerId: 'user-1', parentId: null, privacy: 'PRIVATE' },
      include: { owner: { select: expect.any(Object) } },
    });
    expect(result).toEqual(created);
  });

  test('given a folder with the same name already exists in a location, when another is created, then duplication is rejected', async () => {
    const { createFolder } = await import('../../../../src/modules/folder/folder.service');
    given.duplicateFolderExists(prisma, folderFactory({ name: 'Projects' }));

    await expect(createFolder('Projects', 'user-1')).rejects.toThrow('Folder "Projects" already exists in this location');
    expect(prisma.folder.create).not.toHaveBeenCalled();
  });

  test('given a viewer on a shared parent folder, when they create a child folder, then write access is denied', async () => {
    const { createFolder } = await import('../../../../src/modules/folder/folder.service');
    given.folderExists(prisma, folderFactory({
      id: 'parent-1',
      ownerId: 'owner-1',
      sharedWith: [{ userId: 'user-1', role: 'VIEWER' }],
    }));

    await expect(createFolder('Child', 'user-1', 'parent-1')).rejects.toThrow('You only have viewer access to this folder');
  });

  test('given an editor creates a child inside a shared folder, when creation succeeds, then inherited access and parent owner editor access are copied', async () => {
    const { createFolder } = await import('../../../../src/modules/folder/folder.service');
    given.folderExists(prisma, folderFactory({
      id: 'parent-1',
      ownerId: 'owner-1',
      sharedWith: [{ userId: 'user-1', role: 'EDITOR' }],
    }));
    given.noDuplicateFolder(prisma);
    prisma.folder.create.mockResolvedValue(folderFactory({ id: 'child-1', name: 'Child', parentId: 'parent-1', privacy: 'SPECIFIC_USER' }));
    prisma.folderAccess.findMany.mockResolvedValue([{ userId: 'viewer-1', role: 'VIEWER' }]);

    const result = await createFolder('Child', 'user-1', 'parent-1');

    expect(result.id).toBe('child-1');
    expect(prisma.folderAccess.createMany).toHaveBeenCalledWith({
      data: [
        { folderId: 'child-1', userId: 'viewer-1', role: 'VIEWER' },
        { folderId: 'child-1', userId: 'owner-1', role: 'EDITOR' },
      ],
      skipDuplicates: true,
    });
  });

  test('given a short keyword, when public folders are searched, then no database lookup is performed', async () => {
    const { searchPublicFolders } = await import('../../../../src/modules/folder/folder.service');

    const result = await searchPublicFolders('user-1', 'a');

    expect(result).toEqual([]);
    expect(prisma.folder.findMany).not.toHaveBeenCalled();
  });

  test('given a valid public search keyword, when folders are searched, then only other users public folders are queried with a safe limit', async () => {
    const { searchPublicFolders } = await import('../../../../src/modules/folder/folder.service');
    given.foldersFound(prisma, [folderFactory({ privacy: 'PUBLIC' })]);

    const result = await searchPublicFolders('user-1', 'public', 99);

    expect(result).toHaveLength(1);
    expect(prisma.folder.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        privacy: 'PUBLIC',
        ownerId: { not: 'user-1' },
        isArchived: false,
        deletedAt: null,
        OR: expect.any(Array),
      }),
      include: expect.any(Object),
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 30,
    });
  });

  test('given a folder is not public, when public folder contents are requested, then access is rejected', async () => {
    const { getPublicFolderContents } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValueOnce(folderFactory({ privacy: 'PRIVATE' }));

    await expect(getPublicFolderContents('folder-1', 'user-2')).rejects.toThrow('Folder is not publicly accessible.');
  });

  test('given a public folder with public children and documents, when contents are requested, then visible children, sanitized documents, and breadcrumbs are returned', async () => {
    const { getPublicFolderContents } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique
      .mockResolvedValueOnce(folderFactory({ id: 'folder-1', name: 'Public', privacy: 'PUBLIC' }))
      .mockResolvedValueOnce({ id: 'folder-1', name: 'Public', parentId: null, privacy: 'PUBLIC', isArchived: false, deletedAt: null });
    given.foldersFound(prisma, [folderFactory({ id: 'child-1', privacy: 'PUBLIC' })]);
    given.documentsFound(prisma, [documentFactory({ id: 'doc-1', privacy: 'PUBLIC', ipfsHash: 'hidden' })]);

    const result = await getPublicFolderContents('folder-1', 'user-2');

    expect(result.currentFolder).toEqual({ id: 'folder-1', name: 'Public', parentId: null });
    expect(result.folders).toHaveLength(1);
    expect(result.documents[0].ipfsHash).toBeUndefined();
    expect(result.breadcrumbs).toEqual([{ id: 'folder-1', name: 'Public' }]);
  });

  test('given no owned active folders match an archive request, when folders are archived, then no cascade is executed', async () => {
    const { archiveFolders } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findMany.mockResolvedValue([]);

    const result = await archiveFolders(['folder-1'], 'user-1');

    expect(result).toEqual({ count: 0, message: 'No valid folders to archive' });
    expect(prisma.folder.updateMany).not.toHaveBeenCalled();
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  test('given an owned active folder with descendants, when it is archived, then folders and documents in the subtree are archived together', async () => {
    const { archiveFolders } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findMany
      .mockResolvedValueOnce([{ id: 'root' }])
      .mockResolvedValueOnce([{ id: 'child' }])
      .mockResolvedValueOnce([]);

    const result = await archiveFolders(['root'], 'user-1');

    expect(result).toEqual({ count: 1 });
    expect(prisma.folder.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['root', 'child'] }, ownerId: 'user-1' },
      data: { isArchived: true, deletedAt: expect.any(Date) },
    });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { folderId: { in: ['root', 'child'] }, ownerId: 'user-1', isArchived: false },
      data: { isArchived: true, deletedAt: expect.any(Date) },
    });
  });

  test('given another owner has content inside an archived shared subtree, when the actor archives their folder, then the other owner content is rescued first', async () => {
    const { archiveFolders } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findMany
      .mockResolvedValueOnce([{ id: 'b-folder' }])
      .mockResolvedValueOnce([{ id: 'a-child' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'a-child', name: 'A Child', ownerId: 'user-a', parentId: 'b-folder' }])
      .mockResolvedValueOnce([
        { id: 'b-folder', ownerId: 'user-b', parentId: 'a-parent' },
        { id: 'a-child', ownerId: 'user-a', parentId: 'b-folder' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.folder.findUnique.mockResolvedValueOnce(folderFactory({
      id: 'a-parent',
      ownerId: 'user-a',
      privacy: 'PRIVATE',
      sharedWith: [],
    }));
    prisma.document.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await archiveFolders(['b-folder'], 'user-b');

    expect(result).toEqual({ count: 1 });
    expect(prisma.folder.update).toHaveBeenCalledWith({
      where: { id: 'a-child' },
      data: { parentId: 'a-parent', name: 'A Child', privacy: 'PRIVATE', shareToken: null },
    });
    expect(prisma.folder.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['b-folder'] }, ownerId: 'user-b' },
      data: { isArchived: true, deletedAt: expect.any(Date) },
    });
  });

  test('given user-owned folders and documents are inside another editor owned subfolder, when the editor archives that subfolder, then user content moves to the nearest owner folder', async () => {
    const { archiveFolders } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findMany
      .mockResolvedValueOnce([{ id: 'b-sub' }])
      .mockResolvedValueOnce([{ id: 'b-child' }])
      .mockResolvedValueOnce([{ id: 'a-child-folder' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'a-child-folder', name: 'A Child', ownerId: 'user-a', parentId: 'b-child' }])
      .mockResolvedValueOnce([
        { id: 'b-sub', ownerId: 'user-b', parentId: 'a-root' },
        { id: 'b-child', ownerId: 'user-b', parentId: 'b-sub' },
        { id: 'a-child-folder', ownerId: 'user-a', parentId: 'b-child' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.folder.findUnique
      .mockResolvedValueOnce(folderFactory({ id: 'a-root', ownerId: 'user-a', privacy: 'PRIVATE', sharedWith: [] }))
      .mockResolvedValueOnce(folderFactory({ id: 'a-root', ownerId: 'user-a', privacy: 'PRIVATE', sharedWith: [] }));
    prisma.document.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'a-doc', title: 'A Doc', ownerId: 'user-a', folderId: 'b-sub' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await archiveFolders(['b-sub'], 'user-b');

    expect(result).toEqual({ count: 1 });
    expect(prisma.folder.update).toHaveBeenCalledWith({
      where: { id: 'a-child-folder' },
      data: { parentId: 'a-root', name: 'A Child', privacy: 'PRIVATE', shareToken: null },
    });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'a-doc' },
      data: { folderId: 'a-root', title: 'A Doc', privacy: 'PRIVATE' },
    });
    expect(prisma.folder.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['b-sub', 'b-child'] }, ownerId: 'user-b' },
      data: { isArchived: true, deletedAt: expect.any(Date) },
    });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { folderId: { in: ['b-sub', 'b-child'] }, ownerId: 'user-b', isArchived: false },
      data: { isArchived: true, deletedAt: expect.any(Date) },
    });
  });

  test('given an owned archived folder with descendants, when it is restored, then folders and documents in the subtree are restored together', async () => {
    const { restoreFolders } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findMany
      .mockResolvedValueOnce([{ id: 'root' }])
      .mockResolvedValueOnce([{ id: 'child' }])
      .mockResolvedValueOnce([]);

    const result = await restoreFolders(['root'], 'user-1');

    expect(result).toEqual({ count: 1 });
    expect(prisma.folder.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['root', 'child'] } },
      data: { isArchived: false, deletedAt: null },
    });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { folderId: { in: ['root', 'child'] }, ownerId: 'user-1', isArchived: true },
      data: { isArchived: false, deletedAt: null },
    });
  });

  test('given an owned archived folder with documents, when it is destroyed, then access rows, documents, and folders are permanently deleted', async () => {
    const { destroyFolders } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findMany
      .mockResolvedValueOnce([{ id: 'root' }])
      .mockResolvedValueOnce([]);
    prisma.document.findMany.mockResolvedValue([{ id: 'doc-1' }]);

    const result = await destroyFolders(['root'], 'user-1');

    expect(result).toEqual({ count: 1 });
    expect(prisma.folderAccess.deleteMany).toHaveBeenCalledWith({ where: { folderId: { in: ['root'] } } });
    expect(prisma.documentAccess.deleteMany).toHaveBeenCalledWith({ where: { documentId: { in: ['doc-1'] } } });
    expect(prisma.document.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['doc-1'] }, ownerId: 'user-1' } });
    expect(prisma.folder.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['root'] }, ownerId: 'user-1' } });
  });

  test('given an owner shares a folder subtree, when flexible sharing runs, then access is cascaded to folders and documents and privacy becomes specific-user', async () => {
    const { shareFoldersFlexible } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'root', ownerId: 'owner-1' }));
    prisma.folder.findMany.mockResolvedValueOnce([]);
    prisma.document.findMany.mockResolvedValue([{ id: 'doc-1' }]);
    prisma.folderAccess.findUnique.mockResolvedValue(null);

    const result = await shareFoldersFlexible('owner-1', [
      { folderId: 'root', targetUsers: [{ userId: 'user-2', role: 'VIEWER' as any }] },
    ]);

    expect(result).toEqual([{ folderId: 'root', sharedWith: [{ userId: 'user-2', role: 'VIEWER', status: 'granted', movedFolderCount: 0, movedDocumentCount: 0 }], cascadedFolders: 1 }]);
    expect(prisma.folderAccess.upsert).toHaveBeenCalledWith({
      where: { folderId_userId: { folderId: 'root', userId: 'user-2' } },
      update: { role: 'VIEWER' },
      create: { folderId: 'root', userId: 'user-2', role: 'VIEWER' },
    });
    expect(prisma.documentAccess.upsert).toHaveBeenCalledWith({
      where: { documentId_userId: { documentId: 'doc-1', userId: 'user-2' } },
      update: {},
      create: { documentId: 'doc-1', userId: 'user-2' },
    });
    expect(prisma.folder.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['root'] }, ownerId: 'owner-1' }, data: { privacy: 'SPECIFIC_USER' } });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({ where: { folderId: { in: ['root'] }, ownerId: 'owner-1' }, data: { privacy: 'SPECIFIC_USER' } });
  });

  test('given all access is revoked from a shared folder subtree, when revoke runs, then folder and document access are removed and privacy returns to private', async () => {
    const { revokeFoldersAccess } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'root', ownerId: 'owner-1' }));
    prisma.folder.findMany.mockResolvedValueOnce([]);
    prisma.folderAccess.deleteMany.mockResolvedValue({ count: 1 });
    prisma.folderAccess.findMany.mockResolvedValue([]);

    const result = await revokeFoldersAccess('owner-1', [{ folderId: 'root', targetUserIds: ['user-2'] }]);

    expect(result).toEqual([{ folderId: 'root', revokedCount: 1, cascadedFolders: 1, newStatus: 'PRIVATE' }]);
    expect(prisma.folderAccess.deleteMany).toHaveBeenCalledWith({
      where: { folderId: { in: ['root'] }, userId: { in: ['user-2'] } },
    });
    expect(prisma.documentAccess.deleteMany).toHaveBeenCalledWith({
      where: { document: { folderId: { in: ['root'] } }, userId: { in: ['user-2'] } },
    });
    expect(prisma.folder.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['root'] }, ownerId: 'owner-1' }, data: { privacy: 'PRIVATE' } });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({ where: { folderId: { in: ['root'] }, ownerId: 'owner-1' }, data: { privacy: 'PRIVATE' } });
  });

  test('given an owner renames a folder to a unique name, when rename runs, then the folder name is trimmed and updated', async () => {
    const { renameFolder } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'folder-1', ownerId: 'user-1', parentId: null, sharedWith: [] }));
    given.noDuplicateFolder(prisma);
    prisma.folder.update.mockResolvedValue(folderFactory({ id: 'folder-1', name: 'Renamed' }));

    const result = await renameFolder('folder-1', 'user-1', ' Renamed ');

    expect(result.name).toBe('Renamed');
    expect(prisma.folder.update).toHaveBeenCalledWith({ where: { id: 'folder-1' }, data: { name: 'Renamed' } });
  });

  test('given a folder name already exists beside the folder being renamed, when rename runs, then duplication is rejected', async () => {
    const { renameFolder } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'folder-1', ownerId: 'user-1', parentId: null, sharedWith: [] }));
    given.duplicateFolderExists(prisma, folderFactory({ id: 'folder-2', name: 'Renamed' }));

    await expect(renameFolder('folder-1', 'user-1', 'Renamed')).rejects.toThrow('Folder "Renamed" already exists in this location');
  });

  test('given a folder is moved into itself, when move runs, then the move is rejected before any update', async () => {
    const { moveFolder } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'folder-1', ownerId: 'user-1', parentId: null, sharedWith: [] }));

    await expect(moveFolder('folder-1', 'user-1', 'folder-1')).rejects.toThrow('Cannot move a folder into itself.');
    expect(prisma.folder.update).not.toHaveBeenCalled();
  });

  test('given a folder is moved to an editable target, when move runs, then subtree privacy and document privacy follow the target', async () => {
    const { moveFolder } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique
      .mockResolvedValueOnce(folderFactory({ id: 'folder-1', ownerId: 'user-1', name: 'Source', parentId: null, sharedWith: [] }))
      .mockResolvedValueOnce(folderFactory({ id: 'target-1', ownerId: 'user-1', name: 'Target', privacy: 'PUBLIC', sharedWith: [] }));
    prisma.folder.findMany.mockResolvedValueOnce([]);
    given.noDuplicateFolder(prisma);
    prisma.document.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'doc-1', ownerId: 'user-1' }]);
    prisma.folder.update.mockResolvedValue(folderFactory({ id: 'folder-1', parentId: 'target-1', privacy: 'PUBLIC' }));

    const result = await moveFolder('folder-1', 'user-1', 'target-1');

    expect(result).toEqual({ folder: expect.objectContaining({ id: 'folder-1' }), count: 1, appliedPrivacy: 'PUBLIC', location: 'Target' });
    expect(prisma.folder.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['folder-1'] } }, data: { privacy: 'PUBLIC' } });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['doc-1'] }, isArchived: false }, data: { privacy: 'PUBLIC' } });
  });

  test('given a link-only folder token is valid, when the folder is opened by token, then the folder and safe document fields are returned', async () => {
    const { getPublicFolderByToken } = await import('../../../../src/modules/folder/folder.service');
    const folder = folderFactory({ id: 'folder-1', privacy: 'LINK_ONLY', shareToken: 'token-1', documents: [{ id: 'doc-1', title: 'Report' }] });
    prisma.folder.findUnique.mockResolvedValue(folder);

    const result = await getPublicFolderByToken('token-1');

    expect(result).toEqual(folder);
    expect(prisma.folder.findUnique).toHaveBeenCalledWith({
      where: { shareToken: 'token-1' },
      include: expect.any(Object),
    });
  });

  test('given folder privacy changes to public, when privacy is updated, then subtree privacy is cascaded and access rows are revoked', async () => {
    const { updateFoldersPrivacy } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findFirst.mockResolvedValue(folderFactory({ id: 'root', ownerId: 'owner-1', privacy: 'PRIVATE' }));
    prisma.folder.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.folder.updateMany.mockResolvedValue({ count: 1 });
    prisma.document.findMany.mockResolvedValue([{ id: 'doc-1' }]);
    prisma.folderAccess.deleteMany.mockResolvedValue({ count: 1 });
    prisma.documentAccess.deleteMany.mockResolvedValue({ count: 2 });

    const result = await updateFoldersPrivacy('owner-1', [{ folderId: 'root', newPrivacy: 'PUBLIC' as any }]);

    expect(result).toEqual([{ folderId: 'root', status: 'updated', newPrivacy: 'PUBLIC', accessRevoked: 3, cascadedFolders: 1, movedFolderCount: 0, movedDocumentCount: 0 }]);
    expect(prisma.folder.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['root'] }, ownerId: 'owner-1' }, data: { privacy: 'PUBLIC' } });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['doc-1'] } }, data: { privacy: 'PUBLIC' } });
  });
});
