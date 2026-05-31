import type { PrismaMock } from './prisma';

export const given = {
  userExists(prisma: PrismaMock, user: any) {
    prisma.user.findUnique.mockResolvedValue(user);
    return user;
  },

  userLookupFails(prisma: PrismaMock, error = new Error('db down')) {
    prisma.user.findMany.mockRejectedValue(error);
    return error;
  },

  folderExists(prisma: PrismaMock, folder: any) {
    prisma.folder.findUnique.mockResolvedValue(folder);
    return folder;
  },

  nextFolderLookups(prisma: PrismaMock, ...folders: any[]) {
    for (const folder of folders) {
      prisma.folder.findUnique.mockResolvedValueOnce(folder);
    }
  },

  foldersFound(prisma: PrismaMock, folders: any[]) {
    prisma.folder.findMany.mockResolvedValue(folders);
    return folders;
  },

  noDuplicateFolder(prisma: PrismaMock) {
    prisma.folder.findFirst.mockResolvedValue(null);
  },

  duplicateFolderExists(prisma: PrismaMock, folder: any) {
    prisma.folder.findFirst.mockResolvedValue(folder);
    return folder;
  },

  documentExists(prisma: PrismaMock, document: any) {
    prisma.document.findUnique.mockResolvedValue(document);
    return document;
  },

  documentsFound(prisma: PrismaMock, documents: any[]) {
    prisma.document.findMany.mockResolvedValue(documents);
    return documents;
  },

  activityLogFails(prisma: PrismaMock, error = new Error('log db down')) {
    prisma.activityLog.create.mockRejectedValue(error);
    return error;
  },

  ipfsGatewayResponds(response: Partial<Response> & { body?: any }) {
    (globalThis.fetch as any).mockResolvedValue(response);
    return response;
  },
};
