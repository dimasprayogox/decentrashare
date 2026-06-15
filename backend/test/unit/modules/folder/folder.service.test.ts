import { beforeEach, describe, expect, mock, test, spyOn } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../../../helpers/prisma';
import { documentFactory, folderFactory } from '../../../helpers/factories';
import { given } from '../../../helpers/given';
import blockchainService from '../../../../src/modules/blockchain/blockchain.service';

const prisma = createPrismaMock();
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };
const pinata = {
  unpin: mock(),
  pin: { delete: mock() },
  groups: { list: mock(), create: mock() },
  upload: { file: mock() },
  pins: { list: mock() },
};

spyOn(blockchainService, 'prepareTransactionData');

mock.module('../../../../src/config/db', () => ({ prisma }));
mock.module('../../../../src/utils/logger', () => ({ logger }));
mock.module('../../../../src/utils/logger.js', () => ({ logger }));
mock.module('../../../../src/config/pinata', () => ({ pinata }));
mock.module('../../../../src/utils/hash', () => ({ generateFileHash: mock(async () => 'hash-1') }));

describe('Feature: folder management behavior', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    Object.values(logger).forEach(fn => fn.mockReset());
    pinata.unpin.mockReset();
    pinata.pin.delete.mockReset();
    pinata.groups.list.mockReset();
    pinata.groups.create.mockReset();
    pinata.upload.file.mockReset();
    pinata.pins.list.mockReset();
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

  test('given a parent folder that does not exist, when child folder is created, then error is raised', async () => {
    const { createFolder } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValue(null);

    await expect(createFolder('Child', 'user-1', 'parent-invalid')).rejects.toThrow('Parent folder not found.');
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
    const publicFolder = folderFactory({ id: 'folder-pub', privacy: 'PUBLIC' });
    // First findMany: main search query
    prisma.folder.findMany
      .mockResolvedValueOnce([publicFolder])
      // BFS getAllDescendantFolderIds for contributor lookup: first level children
      .mockResolvedValueOnce([])
      // getPublicFolderContributorOwners: folders inside subtree
      .mockResolvedValueOnce([publicFolder]);
    // getPublicFolderContributorOwners: documents inside subtree
    prisma.document.findMany.mockResolvedValueOnce([]);

    const result = await searchPublicFolders('user-1', 'public', 99);

    expect(result).toHaveLength(1);
    expect(prisma.folder.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        privacy: 'PUBLIC',
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

  test('given a public folder with public children and documents, when contents are requested, then all public items, owner metadata, sanitized documents, and breadcrumbs are returned', async () => {
    const { getPublicFolderContents } = await import('../../../../src/modules/folder/folder.service');
    const owner1 = { id: 'user-1', username: 'alice', email: 'alice@example.com', walletAddress: '0xabc', avatarUrl: null };
    const owner2 = { id: 'user-2', username: 'bob', email: 'bob@example.com', walletAddress: '0xdef', avatarUrl: null };
    // First findUnique: folder with owner
    prisma.folder.findUnique
      .mockResolvedValueOnce(folderFactory({ id: 'folder-1', name: 'Public', privacy: 'PUBLIC', owner: owner1 }))
      // Breadcrumb lookup
      .mockResolvedValueOnce({ id: 'folder-1', name: 'Public', parentId: null, privacy: 'PUBLIC', isArchived: false, deletedAt: null });
    // findMany: child folders with owner
    given.foldersFound(prisma, [folderFactory({ id: 'child-1', privacy: 'PUBLIC', ownerId: 'user-2', owner: owner2 })]);
    // findMany: documents with owner
    given.documentsFound(prisma, [documentFactory({ id: 'doc-1', privacy: 'PUBLIC', ownerId: 'user-2', ipfsHash: 'hidden', owner: owner2 })]);

    const result = await getPublicFolderContents('folder-1', 'user-2');

    expect(result.currentFolder).toEqual(expect.objectContaining({ id: 'folder-1', name: 'Public', parentId: null }));
    expect(result.folders).toHaveLength(1);
    expect(result.documents[0].ipfsHash).toBeUndefined();
    expect(result.breadcrumbs).toEqual([{ id: 'folder-1', name: 'Public' }]);
    expect(prisma.folder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { parentId: 'folder-1', privacy: 'PUBLIC', isArchived: false, deletedAt: null },
    }));
    expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { folderId: 'folder-1', privacy: 'PUBLIC', isArchived: false, deletedAt: null },
    }));
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
      data: { parentId: null, isArchived: true, deletedAt: expect.any(Date) },
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
      data: { parentId: null, isArchived: true, deletedAt: expect.any(Date) },
    });
  });

  test('given user-owned folders and documents are inside another editor owned subfolder, when the editor archives that subfolder, then user content moves to the nearest owner folder', async () => {
    const { archiveFolders } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findMany
      // archiveFolders: validate ownership
      .mockResolvedValueOnce([{ id: 'b-sub' }])
      // getAllDescendantFolderIds BFS level 1
      .mockResolvedValueOnce([{ id: 'b-child' }])
      // getAllDescendantFolderIds BFS level 2
      .mockResolvedValueOnce([{ id: 'a-child-folder' }])
      // getAllDescendantFolderIds BFS level 3 (no more)
      .mockResolvedValueOnce([])
      // relocate: foldersToMove (ownerId !== user-b)
      .mockResolvedValueOnce([{ id: 'a-child-folder', name: 'A Child', ownerId: 'user-a', parentId: 'b-child' }])
      // relocate: allSubtreeFolders
      .mockResolvedValueOnce([
        { id: 'b-sub', ownerId: 'user-b', parentId: 'a-root' },
        { id: 'b-child', ownerId: 'user-b', parentId: 'b-sub' },
        { id: 'a-child-folder', ownerId: 'user-a', parentId: 'b-child' },
      ])
      // relocate: rootOwnerFoldersToRescue (ownerId === user-b inside moved folders)
      .mockResolvedValueOnce([])
      // relocate: rootOwnerDocumentsToRescue (ownerId === user-b inside moved folder sources)
      // --- this is where docs owned by root owner inside moved folder source ids are looked up
      // relocate: documentsToMove (non-root-owner docs in non-moved subtree folders)
      .mockResolvedValueOnce([])
      // relocate: documentsInsideMovedFolders
      .mockResolvedValueOnce([])
      // getAllDescendantFolderIds after relocation (subtree recalculation) - BFS
      .mockResolvedValueOnce([{ id: 'b-child' }])
      .mockResolvedValueOnce([]);
    prisma.folder.findUnique
      // findNearestAccessibleParent for a-child-folder: walk up from b-child
      .mockResolvedValueOnce(folderFactory({ id: 'b-child', ownerId: 'user-b', parentId: 'b-sub', sharedWith: [] }))
      .mockResolvedValueOnce(folderFactory({ id: 'b-sub', ownerId: 'user-b', parentId: 'a-root', sharedWith: [] }))
      .mockResolvedValueOnce(folderFactory({ id: 'a-root', ownerId: 'user-a', privacy: 'PRIVATE', sharedWith: [] }));
    // syncRescuedFolderSubtreeAccess: getAllDescendantFolderIds for rescued folder
    prisma.folder.findMany
      .mockResolvedValueOnce([]); // no children
    // syncRescuedFolderSubtreeAccess: documents in rescued subtree
    prisma.document.findMany
      .mockResolvedValueOnce([])
      // archiveFolders: cascade documents
      .mockResolvedValueOnce([]);

    const result = await archiveFolders(['b-sub'], 'user-b');

    expect(result).toEqual({ count: 1 });
    expect(prisma.folder.update).toHaveBeenCalledWith({
      where: { id: 'a-child-folder' },
      data: { parentId: 'a-root', name: 'A Child', privacy: 'PRIVATE', shareToken: null },
    });
  });

  test('given deeply nested folders of mixed owners, when the subtree is archived, then the foreign nested folders are rescued to the nearest parent of the same owner within the subtree', async () => {
    const { archiveFolders } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findMany
      .mockResolvedValueOnce([{ id: 'b-sub' }]) // archiveFolders: validate ownership
      .mockResolvedValueOnce([{ id: 'a-child-folder' }]) // BFS level 1
      .mockResolvedValueOnce([{ id: 'b-child' }]) // BFS level 2
      .mockResolvedValueOnce([{ id: 'a-nested-folder' }]) // BFS level 3
      .mockResolvedValueOnce([]) // BFS level 4
      .mockResolvedValueOnce([
        { id: 'a-child-folder', name: 'A Child', ownerId: 'user-a', parentId: 'b-sub' },
        { id: 'a-nested-folder', name: 'A Nested', ownerId: 'user-a', parentId: 'b-child' }
      ]) // relocate: foldersToMove
      .mockResolvedValueOnce([
        { id: 'b-sub', ownerId: 'user-b', parentId: 'a-root' },
        { id: 'a-child-folder', ownerId: 'user-a', parentId: 'b-sub' },
        { id: 'b-child', ownerId: 'user-b', parentId: 'a-child-folder' },
        { id: 'a-nested-folder', ownerId: 'user-a', parentId: 'b-child' },
      ]) // relocate: allSubtreeFolders
      .mockResolvedValueOnce([]) // relocate: rootOwnerFoldersToRescue
      .mockResolvedValueOnce([]) // relocate: documentsToMove
      .mockResolvedValueOnce([]) // relocate: documentsInsideMovedFolders
      .mockResolvedValueOnce([{ id: 'b-child' }]) // BFS recalculation level 1
      .mockResolvedValueOnce([]); // BFS recalculation level 2

    prisma.folder.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'b-sub') return folderFactory({ id: 'b-sub', ownerId: 'user-b', parentId: 'a-root', sharedWith: [] });
      if (where.id === 'b-child') return folderFactory({ id: 'b-child', ownerId: 'user-b', parentId: 'a-child-folder', sharedWith: [] });
      if (where.id === 'a-root') return folderFactory({ id: 'a-root', ownerId: 'user-a', privacy: 'PRIVATE', sharedWith: [] });
      if (where.id === 'a-child-folder') return folderFactory({ id: 'a-child-folder', ownerId: 'user-a', parentId: 'b-sub', sharedWith: [] });
      return null;
    });

    prisma.document.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await archiveFolders(['b-sub'], 'user-b');

    expect(result).toEqual({ count: 1 });
    
    // a-child-folder should be rescued to a-root (outside subtree)
    expect(prisma.folder.update).toHaveBeenCalledWith({
      where: { id: 'a-child-folder' },
      data: { parentId: 'a-root', name: 'A Child', privacy: 'PRIVATE', shareToken: null },
    });

    // a-nested-folder should be rescued to a-child-folder (inside subtree, owned by same owner user-a)
    expect(prisma.folder.update).toHaveBeenCalledWith({
      where: { id: 'a-nested-folder' },
      data: { parentId: 'a-child-folder', name: 'A Nested', privacy: 'PRIVATE', shareToken: null },
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

  test('given a subfolder containing a foreign document is moved, when the move runs, then the foreign document is rescued to the nearest parent folder', async () => {
    const { moveFolder } = await import('../../../../src/modules/folder/folder.service');
    
    prisma.folder.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'subfolder-1') return folderFactory({ id: 'subfolder-1', ownerId: 'user-a', name: 'Subfolder', parentId: 'parent-folder' });
      if (where.id === 'target-folder') return folderFactory({ id: 'target-folder', ownerId: 'user-a', name: 'Target', privacy: 'PRIVATE', sharedWith: [] });
      if (where.id === 'parent-folder') return folderFactory({ id: 'parent-folder', ownerId: 'user-b', name: 'Parent', privacy: 'SPECIFIC_USER', sharedWith: [] });
      return null;
    });

    prisma.folder.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'subfolder-1', parentId: 'parent-folder', ownerId: 'user-a' }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    prisma.document.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'doc-1', title: 'Doc', ownerId: 'user-b', folderId: 'subfolder-1' }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    prisma.folder.update.mockResolvedValue(folderFactory({ id: 'subfolder-1', parentId: 'target-folder', privacy: 'PRIVATE' }));

    const result = await moveFolder('subfolder-1', 'user-a', 'target-folder');

    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: {
        folderId: 'parent-folder',
        title: 'Doc',
        privacy: 'SPECIFIC_USER'
      }
    });
  });

  test('given a subfolder containing a foreign document is moved, and the destination is STILL shared with the foreign document\'s owner, when the move runs, then the foreign document is NOT rescued', async () => {
    const { moveFolder } = await import('../../../../src/modules/folder/folder.service');
    
    prisma.folder.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'subfolder-1') return folderFactory({ id: 'subfolder-1', ownerId: 'user-a', name: 'Subfolder', parentId: 'parent-folder' });
      if (where.id === 'target-folder') return folderFactory({ id: 'target-folder', ownerId: 'user-a', name: 'Target', privacy: 'SPECIFIC_USER', sharedWith: [{ userId: 'user-b', role: 'EDITOR' }] });
      if (where.id === 'parent-folder') return folderFactory({ id: 'parent-folder', ownerId: 'user-b', name: 'Parent', privacy: 'SPECIFIC_USER', sharedWith: [] });
      return null;
    });

    prisma.folder.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'subfolder-1', parentId: 'parent-folder', ownerId: 'user-a' }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    prisma.document.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'doc-1', title: 'Doc', ownerId: 'user-b', folderId: 'subfolder-1' }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    prisma.folder.update.mockResolvedValue(folderFactory({ id: 'subfolder-1', parentId: 'target-folder', privacy: 'SPECIFIC_USER' }));

    const result = await moveFolder('subfolder-1', 'user-a', 'target-folder');

    expect(prisma.document.update).not.toHaveBeenCalled();
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

    const result = await updateFoldersPrivacy('owner-1', [{ folderId: 'root', newPrivacy: 'PUBLIC' as any }]);

    expect(result).toEqual([{ folderId: 'root', status: 'updated', newPrivacy: 'PUBLIC', accessRevoked: 0, cascadedFolders: 1, movedFolderCount: 0, movedDocumentCount: 0 }]);
    expect(prisma.folder.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['root'] } }, data: { privacy: 'PUBLIC' } });
    expect(prisma.document.findMany).toHaveBeenCalledWith({ where: { folderId: { in: ['root'] } }, select: { id: true } });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['doc-1'] } }, data: { privacy: 'PUBLIC' } });
    expect(prisma.folderAccess.deleteMany).not.toHaveBeenCalled();
    expect(prisma.documentAccess.deleteMany).not.toHaveBeenCalled();
  });

  test('given a specific-user mixed-owner folder changes to public, when privacy is updated, then mixed-owner content stays in place and becomes public', async () => {
    const { updateFoldersPrivacy } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findFirst.mockResolvedValue(folderFactory({ id: 'root', ownerId: 'owner-1', privacy: 'SPECIFIC_USER' }));
    prisma.folder.findMany
      // First getAllDescendantFolderIds (before relocation check): BFS children
      .mockResolvedValueOnce([{ id: 'foreign-child' }])
      .mockResolvedValueOnce([])
      // Second getAllDescendantFolderIds (after relocation, remainingSubtreeFolderIds): BFS children
      .mockResolvedValueOnce([{ id: 'foreign-child' }])
      .mockResolvedValueOnce([]);
    prisma.folder.updateMany.mockResolvedValue({ count: 2 });
    prisma.document.findMany.mockResolvedValue([{ id: 'owner-doc' }, { id: 'foreign-doc' }]);

    const result = await updateFoldersPrivacy('owner-1', [{ folderId: 'root', newPrivacy: 'PUBLIC' as any }]);

    expect(result).toEqual([{ folderId: 'root', status: 'updated', newPrivacy: 'PUBLIC', accessRevoked: 0, cascadedFolders: 2, movedFolderCount: 0, movedDocumentCount: 0 }]);
    expect(prisma.folder.update).not.toHaveBeenCalled();
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(prisma.folder.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['root', 'foreign-child'] } }, data: { privacy: 'PUBLIC' } });
    expect(prisma.document.findMany).toHaveBeenCalledWith({ where: { folderId: { in: ['root', 'foreign-child'] } }, select: { id: true } });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['owner-doc', 'foreign-doc'] } }, data: { privacy: 'PUBLIC' } });
    expect(prisma.folderAccess.deleteMany).not.toHaveBeenCalled();
    expect(prisma.documentAccess.deleteMany).not.toHaveBeenCalled();
  });

  test('given a specific-user folder containing a foreign-owned subfolder, when privacy changes to link-only, then the foreign subfolder is relocated to its owner root and reset to private', async () => {
    const { updateFoldersPrivacy } = await import('../../../../src/modules/folder/folder.service');
    // Root folder is owned by owner-1 and currently SPECIFIC_USER (shared).
    prisma.folder.findFirst
      // 1) initial root lookup inside updateFoldersPrivacy
      .mockResolvedValueOnce(folderFactory({ id: 'root', name: 'Root', ownerId: 'owner-1', privacy: 'SPECIFIC_USER' }))
      // 2) getUniqueRootFolderName for the relocated foreign folder (no duplicate)
      .mockResolvedValueOnce(null);
    prisma.folder.findMany
      // getAllDescendantFolderIds(['root']) BFS
      .mockResolvedValueOnce([{ id: 'foreign-child' }])
      .mockResolvedValueOnce([])
      // relocate: foldersToMove (ownerId !== owner-1)
      .mockResolvedValueOnce([{ id: 'foreign-child', name: 'Foreign', ownerId: 'user-2', parentId: 'root' }])
      // relocate: allSubtreeFolders
      .mockResolvedValueOnce([
        { id: 'root', parentId: null, ownerId: 'owner-1' },
        { id: 'foreign-child', parentId: 'root', ownerId: 'user-2' },
      ])
      // relocate: rootOwnerFoldersToRescue (owner-1 folders, root has no in-subtree parent → skipped)
      .mockResolvedValueOnce([{ id: 'root', name: 'Root', parentId: null }])
      // topLevel loop: getAllDescendantFolderIds(['foreign-child'])
      .mockResolvedValueOnce([])
      // syncRescuedFolderSubtreeAccess: getAllDescendantFolderIds(['foreign-child'])
      .mockResolvedValueOnce([])
      // remainingSubtreeFolderIds: getAllDescendantFolderIds(['root']) (foreign-child now gone)
      .mockResolvedValueOnce([]);
    prisma.document.findMany
      // relocate: rootOwnerDocumentsToRescue
      .mockResolvedValueOnce([])
      // syncRescuedFolderSubtreeAccess: rescued documents
      .mockResolvedValueOnce([])
      // relocate: documentsToMove
      .mockResolvedValueOnce([])
      // relocate: documentsInsideMovedFolders
      .mockResolvedValueOnce([])
      // updatedDocuments after cascade
      .mockResolvedValueOnce([]);
    prisma.folder.updateMany.mockResolvedValue({ count: 1 });
    prisma.folderAccess.deleteMany.mockResolvedValue({ count: 1 });
    prisma.documentAccess.deleteMany.mockResolvedValue({ count: 0 });

    const result = await updateFoldersPrivacy('owner-1', [{ folderId: 'root', newPrivacy: 'LINK_ONLY' as any }]);

    expect(result[0]).toMatchObject({ folderId: 'root', status: 'updated', newPrivacy: 'LINK_ONLY', movedFolderCount: 1 });
    // Foreign subfolder is detached to the owning user's root and reset to private.
    expect(prisma.folder.update).toHaveBeenCalledWith({
      where: { id: 'foreign-child' },
      data: { parentId: null, name: 'Foreign', privacy: 'PRIVATE', shareToken: null },
    });
    // Owner's own subtree is cascaded to link-only and its share access rows are revoked.
    expect(prisma.folder.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['root'] }, ownerId: 'owner-1' }, data: { privacy: 'LINK_ONLY' } });
    expect(prisma.folderAccess.deleteMany).toHaveBeenCalledWith({ where: { folderId: { in: ['root'] } } });
  });

  test('given an owner document nested inside a foreign-owned subfolder, when privacy changes to link-only, then the document is relocated to the owner nearest folder and not lost to root', async () => {
    const { updateFoldersPrivacy } = await import('../../../../src/modules/folder/folder.service');
    // root (owner-1, SPECIFIC_USER) → foreign-folder (user-2) → owner-doc (owner-1)
    prisma.folder.findFirst
      .mockResolvedValueOnce(folderFactory({ id: 'root', name: 'Root', ownerId: 'owner-1', privacy: 'SPECIFIC_USER' }))
      // getUniqueRootFolderName for foreign-folder (no duplicate)
      .mockResolvedValueOnce(null);
    prisma.folder.findMany
      // getAllDescendantFolderIds(['root']) BFS level 1 + terminator
      .mockResolvedValueOnce([{ id: 'foreign-folder' }])
      .mockResolvedValueOnce([])
      // relocate: foldersToMove (ownerId !== owner-1)
      .mockResolvedValueOnce([{ id: 'foreign-folder', name: 'Foreign', ownerId: 'user-2', parentId: 'root' }])
      // relocate: allSubtreeFolders
      .mockResolvedValueOnce([
        { id: 'root', parentId: null, ownerId: 'owner-1' },
        { id: 'foreign-folder', parentId: 'root', ownerId: 'user-2' },
      ])
      // relocate: rootOwnerFoldersToRescue (root has no in-subtree parent → skipped in loop)
      .mockResolvedValueOnce([{ id: 'root', name: 'Root', parentId: null }])
      // topLevel loop: getAllDescendantFolderIds(['foreign-folder'])
      .mockResolvedValueOnce([])
      // syncRescuedFolderSubtreeAccess: getAllDescendantFolderIds(['foreign-folder'])
      .mockResolvedValueOnce([])
      // remainingSubtreeFolderIds: getAllDescendantFolderIds(['root']) (foreign-folder moved out)
      .mockResolvedValueOnce([]);
    // findNearestAccessibleParent walks up to 'root' which is owner-owned and in-subtree → returned.
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'root', ownerId: 'owner-1', privacy: 'SPECIFIC_USER', sharedWith: [] }));
    prisma.document.findMany
      // relocate: rootOwnerDocumentsToRescue (owner doc inside foreign-folder)
      .mockResolvedValueOnce([{ id: 'owner-doc', title: 'Owner Doc', folderId: 'foreign-folder' }])
      // syncRescuedFolderSubtreeAccess: rescued documents inside foreign-folder
      .mockResolvedValueOnce([])
      // relocate: documentsToMove
      .mockResolvedValueOnce([])
      // relocate: documentsInsideMovedFolders
      .mockResolvedValueOnce([])
      // updatedDocuments after cascade
      .mockResolvedValueOnce([{ id: 'owner-doc' }]);
    prisma.folder.updateMany.mockResolvedValue({ count: 1 });
    prisma.folderAccess.deleteMany.mockResolvedValue({ count: 1 });
    prisma.documentAccess.deleteMany.mockResolvedValue({ count: 0 });

    await updateFoldersPrivacy('owner-1', [{ folderId: 'root', newPrivacy: 'LINK_ONLY' as any }]);

    // The owner doc is reparented to the owner's nearest folder (root), NOT detached to null/root limbo.
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'owner-doc' },
      data: { folderId: 'root', title: 'Owner Doc' },
    });
    // Foreign-owned subfolder still gets evicted to its owner's root.
    expect(prisma.folder.update).toHaveBeenCalledWith({
      where: { id: 'foreign-folder' },
      data: { parentId: null, name: 'Foreign', privacy: 'PRIVATE', shareToken: null },
    });
  });

  // --- downloadFolderArchive ---

  test('given a folder, when downloadFolderArchive is called, then it delegates to prepareFolderArchive', async () => {
    const { downloadFolderArchive } = await import('../../../../src/modules/folder/folder.service');
    
    // We mock the database call inside validateFolderAccess (inside prepareFolderArchive)
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'folder-1', name: 'My Folder', ownerId: 'user-1' }));
    prisma.folder.findMany
      .mockResolvedValueOnce([{ id: 'folder-1' }]) // getDescendantFolders
      .mockResolvedValueOnce([{ id: 'folder-1', name: 'My Folder', parentId: null }]); // folders query
    prisma.document.findMany.mockResolvedValueOnce([]);

    const result = await downloadFolderArchive('folder-1', 'user-1');
    expect(result.folderName).toBe('My Folder');
  });

  // --- getFolderDetail ---

  test('given a valid folder, when getFolderDetail runs, then returns folder metadata', async () => {
    const { getFolderDetail } = await import('../../../../src/modules/folder/folder.service');
    const folder = folderFactory({ id: 'folder-1', ownerId: 'user-1', privacy: 'PRIVATE' });
    prisma.folder.findUnique.mockResolvedValue(folder);

    const result = await getFolderDetail('folder-1', 'user-1');
    expect(result).toEqual(folder);
  });

  test('given a private folder and unauthorized user, when getFolderDetail runs, then throws access denied error', async () => {
    const { getFolderDetail } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'folder-1', ownerId: 'user-1', privacy: 'PRIVATE' }));
    prisma.folderAccess.findUnique.mockResolvedValue(null);

    await expect(getFolderDetail('folder-1', 'user-2')).rejects.toThrow('Access denied.');
  });

  test('given unknown folder id, when getFolderDetail runs, then throws folder not found error', async () => {
    const { getFolderDetail } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValue(null);

    await expect(getFolderDetail('missing-folder', 'user-1')).rejects.toThrow('Folder not found.');
  });

  // --- getFolderPath ---

  test('given a nested folder id, when getFolderPath runs, then returns breadcrumb hierarchy', async () => {
    const { getFolderPath } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique
      .mockResolvedValueOnce({ id: 'child', name: 'Child', parentId: 'parent' })
      .mockResolvedValueOnce({ id: 'parent', name: 'Parent', parentId: null });

    const result = await getFolderPath('child');
    expect(result).toEqual([
      { id: 'parent', name: 'Parent' },
      { id: 'child', name: 'Child' },
    ]);
  });

  // --- getArchivedFolders ---

  test('given archived folders, when getArchivedFolders runs, then returns user\'s archived folders ordered by deletion time', async () => {
    const { getArchivedFolders } = await import('../../../../src/modules/folder/folder.service');
    const folders = [folderFactory({ id: 'archived-1', isArchived: true, deletedAt: new Date() })];
    prisma.folder.findMany.mockResolvedValue(folders);

    const result = await getArchivedFolders('user-1');
    expect(result).toEqual(folders);
    expect(prisma.folder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId: 'user-1', isArchived: true, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
    }));
  });

  // --- getArchivedFolderContents ---

  test('given active trash contents, when getArchivedFolderContents runs, then returns folder breadcrumbs and folder/doc contents', async () => {
    const { getArchivedFolderContents } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findFirst.mockResolvedValue({ id: 'trash-folder', name: 'Trash Folder', parentId: null });
    // getFolderPath mock for breadcrumbs
    prisma.folder.findUnique.mockResolvedValueOnce({ id: 'trash-folder', name: 'Trash Folder', parentId: null });
    prisma.folder.findMany.mockResolvedValueOnce([{ id: 'sub-trash-folder', name: 'Sub' }]);
    prisma.document.findMany.mockResolvedValueOnce([{ id: 'trash-doc', title: 'Trash Doc' }]);

    const result = await getArchivedFolderContents('user-1', 'trash-folder');
    expect(result.currentFolder).toEqual({ id: 'trash-folder', name: 'Trash Folder', parentId: null });
    expect(result.folders).toHaveLength(1);
    expect(result.documents).toHaveLength(1);
    expect(result.breadcrumbs).toEqual([{ id: 'trash-folder', name: 'Trash Folder' }]);
  });

  test('given invalid trash folder id, when getArchivedFolderContents runs, then throws error', async () => {
    const { getArchivedFolderContents } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findFirst.mockResolvedValue(null);

    await expect(getArchivedFolderContents('user-1', 'missing')).rejects.toThrow('Trash folder not found.');
  });

  // --- getUserFolders ---

  test('given folders in directory, when getUserFolders runs, then returns user and shared folders', async () => {
    const { getUserFolders } = await import('../../../../src/modules/folder/folder.service');
    prisma.document.findMany.mockResolvedValueOnce([]); // getPublicContributorFolderIds
    prisma.folder.findMany
      .mockResolvedValueOnce([{ id: 'contributor-folder', parentId: null, ownerId: 'user-2' }]) // getPublicContributorFolderIds
      .mockResolvedValueOnce([
        {
          id: 'folder-1',
          ownerId: 'user-1',
          sharedWith: [],
        },
      ]); // main folders query

    const result = await getUserFolders('user-1', null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('folder-1');
  });

  // --- getSharedWithMeFolders ---

  test('given shared folders, when getSharedWithMeFolders runs, then returns mapped shared folders with documents', async () => {
    const { getSharedWithMeFolders } = await import('../../../../src/modules/folder/folder.service');
    prisma.folderAccess.findMany.mockResolvedValue([
      {
        id: 'access-1',
        role: 'VIEWER',
        createdAt: new Date(),
        folder: {
          id: 'shared-folder',
          owner: { id: 'user-2', username: 'bob' },
          documents: [{ id: 'doc-1', title: 'Doc' }],
        },
      },
    ]);

    const result = await getSharedWithMeFolders('user-1');
    expect(result).toHaveLength(1);
    expect(result[0].accessId).toBe('access-1');
    expect(result[0].folder.id).toBe('shared-folder');
  });

  // --- getFolderContents ---

  test('given public folder, when getFolderContents is called, then returns documents without authentication', async () => {
    const { getFolderContents } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'folder-1', privacy: 'PUBLIC' }));
    prisma.document.findMany.mockResolvedValue([documentFactory({ privacy: 'PUBLIC' })]);

    const result = await getFolderContents('folder-1');
    expect(result).toHaveLength(1);
  });

  test('given link-only folder with valid token, when getFolderContents runs, then returns documents', async () => {
    const { getFolderContents } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'folder-1', privacy: 'LINK_ONLY', shareToken: 'token-123' }));
    prisma.document.findMany.mockResolvedValue([documentFactory({ privacy: 'PUBLIC' })]);

    const result = await getFolderContents('folder-1', undefined, 'token-123');
    expect(result).toHaveLength(1);
  });

  test('given link-only folder with invalid token, when getFolderContents runs, then throws invalid share link error', async () => {
    const { getFolderContents } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'folder-1', privacy: 'LINK_ONLY', shareToken: 'token-123' }));

    await expect(getFolderContents('folder-1', undefined, 'wrong-token')).rejects.toThrow('Invalid share link');
  });

  test('given private folder and no authenticated user, when getFolderContents runs, then throws authentication required', async () => {
    const { getFolderContents } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValue(folderFactory({ id: 'folder-1', privacy: 'PRIVATE' }));

    await expect(getFolderContents('folder-1', undefined)).rejects.toThrow('Authentication required');
  });

  test('given a parent folder owned by user-1, and a child folder owned by user-2 inside it, when checkFolderWriteAccess is called for user-1 on the child folder, then it returns true', async () => {
    const { checkFolderWriteAccess } = await import('../../../../src/modules/folder/folder.service');
    // First query: child folder (owned by user-2, parent is parent-folder)
    prisma.folder.findUnique
      .mockResolvedValueOnce(folderFactory({ id: 'child-folder', ownerId: 'user-2', parentId: 'parent-folder', sharedWith: [] }))
      // Second query: parent folder (owned by user-1)
      .mockResolvedValueOnce(folderFactory({ id: 'parent-folder', ownerId: 'user-1', parentId: null, sharedWith: [] }));

    const result = await checkFolderWriteAccess(prisma, 'child-folder', 'user-1');
    expect(result).toBe(true);
  });

  test('given a parent folder owned by user-1, and a child folder owned by user-2 inside it, when getUserFolders is called for user-1 inside the parent-folder, then the child folder accessRole is mapped to EDITOR', async () => {
    const { getUserFolders } = await import('../../../../src/modules/folder/folder.service');
    
    // We mock checkFolderWriteAccess inside getUserFolders:
    // First query: checkFolderWriteAccess for parent-folder: parent-folder is owned by user-1, returns true
    prisma.folder.findUnique.mockResolvedValueOnce(folderFactory({ id: 'parent-folder', ownerId: 'user-1', parentId: null, sharedWith: [] }));
    
    // getUserFolders:
    prisma.folder.findMany
      .mockResolvedValueOnce([
        {
          id: 'child-folder',
          ownerId: 'user-2',
          sharedWith: [],
        },
      ]); // main folders query

    const result = await getUserFolders('user-1', 'parent-folder');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('child-folder');
    expect(result[0].accessRole).toBe('EDITOR');
  });

  test('given a folder shared with role EDITOR to user-1, when checkFolderWriteAccess is called, then it returns true', async () => {
    const { checkFolderWriteAccess } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValueOnce(folderFactory({
      id: 'folder-1',
      ownerId: 'owner-1',
      parentId: null,
      sharedWith: [{ userId: 'user-1', role: 'EDITOR' }]
    }));

    const result = await checkFolderWriteAccess(prisma, 'folder-1', 'user-1');
    expect(result).toBe(true);
  });

  test('given a folder shared with role VIEWER to user-1, when checkFolderWriteAccess is called, then it returns false', async () => {
    const { checkFolderWriteAccess } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValueOnce(folderFactory({
      id: 'folder-1',
      ownerId: 'owner-1',
      parentId: null,
      sharedWith: [{ userId: 'user-1', role: 'VIEWER' }]
    }));

    const result = await checkFolderWriteAccess(prisma, 'folder-1', 'user-1');
    expect(result).toBe(false);
  });

  test('given a child folder inside a parent folder shared with role VIEWER to user-1, when checkFolderWriteAccess is called, then it returns false', async () => {
    const { checkFolderWriteAccess } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique
      .mockResolvedValueOnce(folderFactory({
        id: 'child-folder',
        ownerId: 'user-2',
        parentId: 'parent-folder',
        sharedWith: []
      }))
      .mockResolvedValueOnce(folderFactory({
        id: 'parent-folder',
        ownerId: 'owner-1',
        parentId: null,
        sharedWith: [{ userId: 'user-1', role: 'VIEWER' }]
      }));

    const result = await checkFolderWriteAccess(prisma, 'child-folder', 'user-1');
    expect(result).toBe(false);
  });

  test('given a parent folder owned by user-1, and a child folder owned by user-2 but archived, when checkFolderWriteAccess is called for user-1, then it returns false', async () => {
    const { checkFolderWriteAccess } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValueOnce(folderFactory({
      id: 'child-folder',
      ownerId: 'user-2',
      parentId: 'parent-folder',
      isArchived: true,
      sharedWith: []
    }));

    const result = await checkFolderWriteAccess(prisma, 'child-folder', 'user-1');
    expect(result).toBe(false);
  });

  test('given a private folder with no sharing, when checkFolderReadAccess is called, then it returns false', async () => {
    const { checkFolderReadAccess } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValueOnce(folderFactory({
      id: 'folder-1',
      ownerId: 'owner-1',
      privacy: 'PRIVATE',
      sharedWith: []
    }));

    const result = await checkFolderReadAccess(prisma, 'folder-1', 'user-2');
    expect(result).toBe(false);
  });

  test('given a private folder nested in a folder owned by user-1, when checkFolderReadAccess is called for user-1, then it returns true', async () => {
    const { checkFolderReadAccess } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique
      .mockResolvedValueOnce(folderFactory({
        id: 'child-folder',
        ownerId: 'user-2',
        parentId: 'parent-folder',
        sharedWith: []
      }))
      .mockResolvedValueOnce(folderFactory({
        id: 'parent-folder',
        ownerId: 'user-1',
        parentId: null,
        sharedWith: []
      }));

    const result = await checkFolderReadAccess(prisma, 'child-folder', 'user-1');
    expect(result).toBe(true);
  });

  test('given a PUBLIC folder, when checkFolderReadAccess is called, then it returns true', async () => {
    const { checkFolderReadAccess } = await import('../../../../src/modules/folder/folder.service');
    prisma.folder.findUnique.mockResolvedValueOnce(folderFactory({
      id: 'folder-1',
      ownerId: 'owner-1',
      privacy: 'PUBLIC',
      sharedWith: []
    }));

    const result = await checkFolderReadAccess(prisma, 'folder-1', 'user-2');
    expect(result).toBe(true);
  });

  test('scenario: user-1 creates parent folder, user-2 creates subfolder, user-1 creates nested folder inside subfolder', async () => {
    const { checkFolderWriteAccess } = await import('../../../../src/modules/folder/folder.service');

    prisma.folder.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'parent-folder') {
        return folderFactory({
          id: 'parent-folder',
          ownerId: 'user-1',
          parentId: null,
          privacy: 'SPECIFIC_USER',
          sharedWith: [{ userId: 'user-2', role: 'EDITOR' }]
        });
      }
      if (where.id === 'subfolder-2') {
        return folderFactory({
          id: 'subfolder-2',
          ownerId: 'user-2',
          parentId: 'parent-folder',
          privacy: 'SPECIFIC_USER',
          sharedWith: []
        });
      }
      if (where.id === 'subfolder-1-nested') {
        return folderFactory({
          id: 'subfolder-1-nested',
          ownerId: 'user-1',
          parentId: 'subfolder-2',
          privacy: 'SPECIFIC_USER',
          sharedWith: []
        });
      }
      return null;
    });

    const canUser2WriteParent = await checkFolderWriteAccess(prisma, 'parent-folder', 'user-2');
    expect(canUser2WriteParent).toBe(true);

    const canUser1WriteSubfolder2 = await checkFolderWriteAccess(prisma, 'subfolder-2', 'user-1');
    expect(canUser1WriteSubfolder2).toBe(true);

    const canUser1WriteSubfolder1Nested = await checkFolderWriteAccess(prisma, 'subfolder-1-nested', 'user-1');
    expect(canUser1WriteSubfolder1Nested).toBe(true);
  });
});


