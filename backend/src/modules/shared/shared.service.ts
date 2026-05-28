import * as documentService from '../document/document.service';
import * as folderService from '../folder/folder.service';

export const getSharedWithMe = async (userId: string) => {
  const [documents, folders] = await Promise.all([
    documentService.getSharedWithMeDocuments(userId),
    folderService.getSharedWithMeFolders(userId),
  ]);

  return {
    documents,
    folders,
    total: documents.length + folders.length,
  };
};
