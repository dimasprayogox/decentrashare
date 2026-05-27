// src/lib/services/storage.service.ts
import { apiClient } from '../apiClient';
import type {
  // Documents
  Document,
  GetDocumentsResponse,
  GetDocumentDetailResponse,
  UploadFilesResponse,
  MoveDocumentsResponse,
  MoveFolderResponse,
  BulkOperationResponse,
  UpdatePrivacyResponse,
  ShareDocumentsResponse,
  RevokeAccessResponse,
  GetSharedUsersResponse,
  GetSharedWithMeResponse,
  GetActivityLogsResponse,
  UpdatePrivacyRequest,
  ShareItemRequest,
  RevokeAccessRequest,
  
  // Folders
  Folder,
  GetFoldersResponse,
  GetFolderPathResponse,
  CreateFolderResponse,
  RenameFolderResponse,
  CreateFolderRequest,
  RenameFolderRequest,
  
  // Admin
  GetSystemStatsResponse,
  
  // Base
  StorageApiResponse,
  StorageErrorResponse,
  PrivacyLevel,
  BlockchainRecordData,
  ShareableUser,
} from '$lib/types/storage';


// ── Helper: Build query string ─────────────────────────────
function buildQueryString(params: Record<string, string | number | null | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      searchParams.append(key, String(value));
    }
  });
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

function formatSharePayload(shares: ShareItemRequest[]) {
  return shares.map(share => {
    if (share.itemType === 'document') {
      // Document: simple userId array (no role)
      return {
        documentId: share.itemId,
        targetUsers: share.targetUsers as string[] // Already string[]
      };
    } else {
      // Folder: support role if needed (future-proof)
      return {
        folderId: share.itemId,
        targetUsers: share.targetUsers // Could be string[] or {userId, role}[]
      };
    }
  });
}

const previewBlobCache = new Map<string, string>(); 

export const storageService = {
  // ═══════════════════════════════════════════════════════
  // DOCUMENTS
  // ═══════════════════════════════════════════════════════
fetchImagePreview: async (documentId: string): Promise<string> => {
    // ✅ Return cached URL jika sudah ada (hindari fetch berulang)
    if (previewBlobCache.has(documentId)) {
      return previewBlobCache.get(documentId)!;
    }

    const blob = await apiClient<Blob>(`/documents/${documentId}/preview`, {
      method: 'GET',
      headers: { 'Accept': 'image/*' }
    }, 'blob');
    
    const blobUrl = URL.createObjectURL(blob);
    
    // ✅ Simpan ke cache
    previewBlobCache.set(documentId, blobUrl);
    
    return blobUrl;
  },

  fetchDocumentPreviewBlob: async (documentId: string, accept = '*/*'): Promise<Blob> => {
    return apiClient<Blob>(`/documents/${documentId}/preview`, {
      method: 'GET',
      headers: { 'Accept': accept }
    }, 'blob');
  },

  // ✅ Cleanup method (opsional tapi recommended)
  cleanupPreviewCache: (documentId?: string) => {
    if (documentId) {
      const url = previewBlobCache.get(documentId);
      if (url) {
        URL.revokeObjectURL(url);
        previewBlobCache.delete(documentId);
      }
    } else {
      // Cleanup semua
      previewBlobCache.forEach(url => {
        try { URL.revokeObjectURL(url); } catch {}
      });
      previewBlobCache.clear();
    }
  },

  searchUsersForShare: async (query: string, options?: { 
  excludeSharedUserIds?: string[];
  limit?: number;
}) => {
  return apiClient<{ 
    success: boolean; 
    data: { 
      users: ShareableUser[]; 
      count: number;
    };
  }>('/users/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      query,
      excludeSharedUserIds: options?.excludeSharedUserIds || [],
      limit: options?.limit || 20
      // currentUserId otomatis dari auth token di backend
    })
  });
},

  // ═══════════════════════════════════════════════════════
  // DOCUMENTS - method lainnya...
  // ═══════════════════════════════════════════════════════
  
  getDocuments: (folderId: string | null = null) => {
    return apiClient<GetDocumentsResponse>(`/documents${buildQueryString({ folderId })}`, {
      method: 'GET'
    });
  },

  /**
   * GET /api/documents/root
   * Get documents at root level only (folderId = null explicitly)
   */
  getRootDocuments: () => {
    return apiClient<GetDocumentsResponse>('/documents/root', { method: 'GET' });
  },

  /**
   * GET /api/documents/:id
   * Get single document detail with access validation
   */
  getDocumentDetail: (documentId: string) => {
    return apiClient<GetDocumentDetailResponse>(`/documents/${documentId}`, {
      method: 'GET'
    });
  },

  // ── Download ──────────────────────────────────────────────

  saveBlob: (blob: Blob, fileName: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  downloadDocument: async (documentId: string, fileName?: string): Promise<{ success: true; fileName: string }> => {
    const blob = await apiClient<Blob>(`/documents/${documentId}/download`, {
      method: 'GET',
      headers: { 'Accept': '*/*' }
    }, 'blob');

    const downloadName = fileName || `decentrashare-download-${documentId}`;
    storageService.saveBlob(blob, downloadName);

    return { success: true, fileName: downloadName };
  },

  downloadFolder: async (folderId: string, folderName?: string): Promise<{ success: true; fileName: string }> => {
    const blob = await apiClient<Blob>(`/folders/${folderId}/download`, {
      method: 'GET',
      headers: { 'Accept': 'application/zip' }
    }, 'blob');

    const downloadName = `${folderName || `folder-${folderId}`}.zip`;
    storageService.saveBlob(blob, downloadName);

    return { success: true, fileName: downloadName };
  },

  bulkDownloadDocuments: async (documentIds: string[]): Promise<{ success: true; fileName: string; documentCount: number }> => {
    return storageService.bulkDownloadItems({ documentIds, folderIds: [] });
  },

  bulkDownloadItems: async ({ documentIds = [], folderIds = [] }: { documentIds?: string[]; folderIds?: string[] }): Promise<{ success: true; fileName: string; documentCount: number }> => {
    const blob = await apiClient<Blob>('/documents/bulk-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/zip' },
      body: JSON.stringify({ documentIds, folderIds })
    }, 'blob');

    const fileName = `decentrashare-export-${new Date().toISOString().slice(0, 10)}.zip`;
    storageService.saveBlob(blob, fileName);

    return { success: true, fileName, documentCount: documentIds.length };
  },


  /**
   * GET /api/documents/shared-with-me
   * Get documents that other users have shared with current user
   */
  getSharedWithMe: () => {
    return apiClient<GetSharedWithMeResponse>('/documents/shared-with-me', {
      method: 'GET'
    });
  },

  /**
   * GET /api/documents/logs?limit=50
   * Get activity logs for current user
   */
  getActivityLogs: (limit: number = 50) => {
    return apiClient<GetActivityLogsResponse>(`/documents/logs${buildQueryString({ limit })}`, {
      method: 'GET'
    });
  },

  // ── Upload ──────────────────────────────────────────────
  
  /**
   * POST /api/documents/upload
   * Upload multiple files (FormData with 'files' field, max 10)
   */
  uploadMultipleFiles: (formData: FormData) => {
    return apiClient<UploadFilesResponse>('/documents/upload', {
      method: 'POST',
      body: formData
      // ❌ Do NOT set Content-Type for FormData - browser handles multipart automatically
    });
  },

  confirmDocumentOnChain: async (
  documentId: string,
  txHash: string,
  blockNumber: number
) => {
  return apiClient<{ success: boolean; data: Document }>(
    `/documents/${documentId}/confirm-onchain`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash, blockNumber })
    }
  );
},

triggerBlockchainConfirmation: async (documentId: string) => {
  return apiClient<{
    success: boolean;
    message: string;
    data: {
      id: string;
      fileName: string;
      ipfsHash: string;
      fileHash: string;
      blockchainData: BlockchainRecordData;
    };
  }>(`/documents/${documentId}/trigger-blockchain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
},

/**
 * POST /api/documents/batch/trigger-blockchain
 * Prepare batch confirmation data for multiple documents
 */
triggerBatchBlockchainConfirmation: async (documentIds: string[]) => {
  return apiClient<BatchTriggerResponse>('/documents/batch/trigger-blockchain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentIds })
  });
},

/**
 * POST /api/documents/batch/confirm-complete
 * Update database after batch transaction confirmed on blockchain
 */
confirmBatchComplete: async (txHash: string, documentIds: string[]) => {
  return apiClient<BatchConfirmCompleteResponse>('/documents/batch/confirm-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash, documentIds })
  });
},

  // ── Bulk Operations ─────────────────────────────────────
  
  // ✅ SOFT DELETE: Archive documents (pindah ke Trash)
  archiveDocuments: async (documentIds: string[]) => {
    const response = await apiClient<{ success: boolean; count: number }>(
      '/documents/archive',  // ← Pastikan endpoint ini exist di backend
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds })
      }
    );
    return response.data;
  },

  // ✅ SOFT DELETE: Archive folders
  archiveFolders: async (folderIds: string[]) => {
    const response = await apiClient<{ success: boolean; count: number }>(
      '/folders/archive',  // ← Pastikan endpoint ini exist di backend
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderIds })
      }
    );
    return response.data;
  },

  // ✅ RESTORE: Un-archive documents (kembali dari Trash)
  restoreDocuments: async (documentIds: string[]) => {
    const response = await apiClient<{ success: boolean; count: number }>(
      '/documents/restore',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds })
      }
    );
    return response.data;
  },

  // ✅ RESTORE: Un-archive folders
  restoreFolders: async (folderIds: string[]) => {
    const response = await apiClient<{ success: boolean; count: number }>(
      '/folders/restore',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderIds })
      }
    );
    return response.data;
  },

  // ✅ PERMANENT DELETE: Hapus permanen dari Trash (hanya untuk archived items)
  destroyDocuments: async (documentIds: string[]) => {
    const response = await apiClient<{ success: boolean; count: number }>(
      '/documents/destroy',  // ← Endpoint untuk hard delete
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds })
      }
    );
    return response.data;
  },

  // ✅ PERMANENT DELETE: Hapus permanen folders dari Trash
  destroyFolders: async (folderIds: string[]) => {
    const response = await apiClient<{ success: boolean; count: number }>(
      '/folders/destroy',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderIds })
      }
    );
    return response.data;
  },

  getArchivedFolders: () => {
    return apiClient<GetFoldersResponse>('/folders/archived', { method: 'GET' });
  },

  getArchivedFolderContents: (folderId: string | null = null) => {
    return apiClient<StorageApiResponse<{
      folders: Folder[];
      documents: Document[];
      currentFolder: { id: string; name: string; parentId: string | null } | null;
      breadcrumbs: Array<{ id: string; name: string }>;
    }>>(`/folders/archived/contents${buildQueryString({ folderId })}`, { method: 'GET' });
  },


  /**
   * GET /api/documents/archived
   * Get archived documents (trash) for current user
   */
  getArchivedDocuments: () => {
    return apiClient<GetDocumentsResponse>('/documents/archived', { method: 'GET' });
  },

  /**
   * PATCH /api/documents/move
   * Move multiple documents to a folder (or root if null)
   */
  moveDocuments: (documentIds: string[], targetFolderId: string | null) => {
    return apiClient<MoveDocumentsResponse>('/documents/move', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentIds, targetFolderId })
    });
  },

  moveFolder: (folderId: string, targetFolderId: string | null) => {
    return apiClient<MoveFolderResponse>('/folders/move', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId, targetFolderId })
    });
  },
// src/lib/services/storage.service.ts

// ─────────────────────────────────────────────────────────────
// 📄 DOCUMENT APIs (Bulk Operations)
// ─────────────────────────────────────────────────────────────

updateDocumentsPrivacy: async (updates: Array<{ documentId: string; newPrivacy: PrivacyLevel }>) => {
  return apiClient<UpdatePrivacyResponse>('/documents/privacy', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates })  // ← { updates: [...] }
  });
},

shareDocuments: async (shares: Array<{ documentId: string; targetUsers: string[] }>) => {
  return apiClient<ShareDocumentsResponse>('/documents/shared', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shares })  // ← { shares: [...] }
  });
},

revokeDocumentAccess: async (revokes: Array<{ documentId: string; targetUserIds: string[] }>) => {
  return apiClient<RevokeAccessResponse>('/documents/shared', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revokes })  // ← { revokes: [...] }
  });
},

getDocumentSharedUsers: async (documentIds: string[]) => {
  return apiClient<GetSharedUsersResponse>('/documents/shared-details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentIds })  // ← { documentIds: [...] }
  });
},

// ─────────────────────────────────────────────────────────────
// 📁 FOLDER APIs (Simple Single-Item Operations)
// ─────────────────────────────────────────────────────────────
updateFolderPrivacy: async (folderId: string, data: { newPrivacy: PrivacyLevel }) => {
  return apiClient<UpdatePrivacyResponse>('/folders/privacy', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      updates: [{ folderId, newPrivacy: data.newPrivacy }]  // ✅ Wrap dalam array
    })
  });
},

shareFolder: async (folderId: string, data: { targetUsers: Array<{ userId: string; role: 'VIEWER' | 'EDITOR' }> }) => {
  return apiClient<ShareDocumentsResponse>('/folders/shared', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      shares: [{ folderId, targetUsers: data.targetUsers }]  // ✅ Wrap dalam array
    })
  });
},

revokeFolderAccess: async (folderId: string, userId: string) => {
  return apiClient<RevokeAccessResponse>('/folders/shared', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revokes: [{ folderId, targetUserIds: [userId] }] 
    })
  });
},

getFolderSharedUsers: async (folderIds: string[]) => {
  return apiClient<GetSharedUsersResponse>('/folders/shared-details', {
    method: 'POST',  // ✅ POST dengan body, bukan GET
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderIds })  
  });
},

  // ── Single Operations ───────────────────────────────────
updateDocumentMetadata: async (
  documentId: string, 
  updates: { title?: string; description?: string }
) => {
  const response = await apiClient<GetDocumentDetailResponse>(
    `/documents/${documentId}/edit`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    }
  );
  return response.data;
},

renameDocument: (documentId: string, newTitle: string) => {
  // Redirect to new function for backward compatibility
  return storageService.updateDocumentMetadata(documentId, { title: newTitle });
},



  // ═══════════════════════════════════════════════════════
  // FOLDERS
  // ═══════════════════════════════════════════════════════
  
  /**
   * GET /api/folders?parentId=xxx
   * Get user's folders, optionally filtered by parent
   */
  getFolders: (parentId: string | null = null) => {
    return apiClient<GetFoldersResponse>(`/folders${buildQueryString({ parentId })}`, {
      method: 'GET'
    });
  },

  /**
   * GET /api/folders/path/:folderId
   * Get breadcrumb path for a folder
   */
  getFolderPath: (folderId: string) => {
    return apiClient<GetFolderPathResponse>(`/folders/path/${folderId}`, {
      method: 'GET'
    });
  },

  /**
   * GET /api/folders/:id
   * Get single folder detail
   */
  getFolderDetail: (folderId: string) => {
    return apiClient<CreateFolderResponse>(`/folders/${folderId}`, {
      method: 'GET'
    });
  },

  /**
   * GET /api/folders/:id/contents
   * Get documents inside a specific folder
   */
  getFolderContents: (folderId: string) => {
    return apiClient<GetDocumentsResponse>(`/folders/${folderId}/contents`, {
      method: 'GET'
    });
  },

  // ── CRUD ────────────────────────────────────────────────
  
  /**
   * POST /api/folders
   * Create a new folder
   */
  createFolder: async (name: string, parentId: string | null = null) => {
    const payload: CreateFolderRequest = { name: name.trim(), parentId };
    
    return await apiClient<CreateFolderResponse | StorageErrorResponse>('/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  /**
   * PATCH /api/folders/:id
   * Rename a folder
   */
renameFolder: async (folderId: string, newName: string) => {
  const response = await apiClient<CreateFolderResponse | StorageErrorResponse>(
    `/folders/${folderId}`,  // ← Endpoint sesuai backend!
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() })  
    }
  );
  return response.data;
},


  // ── Folder Sharing ──────────────────────────────────────
  
  /**
   * GET /api/folders/shared-with-me
   * Get folders that other users have shared with current user
   */
  getSharedFoldersWithMe: () => {
    return apiClient<GetSharedWithMeResponse>('/folders/shared-with-me', {
      method: 'GET'
    });
  },

  /**
   * POST /api/folders/shared
   * Share multiple folders to users
   */
shareFolders: (shares: ShareItemRequest[]) => {
  return apiClient<ShareDocumentsResponse>('/folders/shared', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      shares: shares.map(s => ({
        folderId: s.itemId,
        targetUsers: s.targetUsers 
      }))
    })
  });
},


  // ═══════════════════════════════════════════════════════
  // ADMIN (requireAdmin middleware on backend)
  // ═══════════════════════════════════════════════════════
  
  /**
   * GET /api/documents/admin/all
   * Get all documents in system (admin only)
   */
  getAllDocumentsAdmin: () => {
    return apiClient<GetDocumentsResponse>('/documents/admin/all', { method: 'GET' });
  },

  /**
   * GET /api/documents/admin/stats
   * Get system-wide stats (admin only)
   */
  getSystemStatsAdmin: () => {
    return apiClient<GetSystemStatsResponse>('/documents/admin/stats', { method: 'GET' });
  },

  // ═══════════════════════════════════════════════════════
  // UTILS
  // ═══════════════════════════════════════════════════════
  
  /**
   * DELETE /api/storage/:id
   * Legacy helper: delete single item by ID (folder or document)
   */
  deleteItem: (id: string) => {
    return apiClient<StorageApiResponse>(`/storage/${id}`, { method: 'DELETE' });
  },

  /**
   * Helper: Check if folder name is taken (client-side validation)
   */
  isFolderNameTaken: (folderName: string, existingFolders: Folder[], excludeFolderId?: string): boolean => {
    const normalized = folderName.trim().toLowerCase();
    return existingFolders.some(folder => 
      folder.id !== excludeFolderId && 
      folder.name.toLowerCase() === normalized
    );
  },
};