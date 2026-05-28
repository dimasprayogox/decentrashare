// src/lib/types/storage.d.ts

// ── Base Types ─────────────────────────────────────────────
export type PrivacyLevel = 'PRIVATE' | 'PUBLIC' | 'SPECIFIC_USER';
import type { ContractInterface } from 'ethers'; 

export interface StorageApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errorCode?: string;
}
export interface BlockchainRecordData {
  cid: string;              // IPFS CID
  fileName: string;         // Original filename
  fileHash: string;         // SHA-256 hash
  contractAddress: string;  // Smart contract address
  abi: ContractInterface;                 // Contract ABI (ethers compatible)
  functionName: string;     // 'recordFile'
  args: [string, string, string]; // [cid, fileName, fileHash]
}


export interface BatchBlockchainPayload {
  contractAddress: string;
  abi: ContractInterface;
  functionName: string;
  args: [string[], string[], string[]]; // [cids[], fileNames[], fileHashes[]]
  items: Array<{ cid: string; fileName: string; fileHash: string }>;
  documentIds?: string[]; // Optional: untuk update DB setelah tx sukses
}

export interface BatchConfirmationResponse extends StorageApiResponse {
  message: string;
  summary: {
    total: number;
    uploaded: number;
    duplicate: number;
    error: number;
  };
  results: Array<{
    success: boolean;
    fileName: string;
    status: 'uploaded' | 'duplicate' | 'error';
    data?: any;
    error?: string;
    errorCode?: string;
    pinataInfo?: { groupId: string | null; ipfsHash: string };
    existingDocument?: {
      id: string;
      title: string;
      ipfsHash: string;
      fileHash: string;
      createdAt: string;
    };
  }>;
  blockchainPayload?: Array<{
    fileName: string;
    ipfsHash: string;
    fileHash: string;
    fileSize: string; // BigInt serialized as string
    timestamp: string;
    documentId: string;
  }>;
  folderId?: string | null;
}

export interface BatchTriggerResponse extends StorageApiResponse {
  data: {
    contractAddress: string;
    abi: ContractInterface;
    functionName: string;
    args: [string[], string[], string[]];
    items: Array<{ cid: string; fileName: string; fileHash: string }>;
    docIds: string[];
  };
}

export interface BatchConfirmCompleteResponse extends StorageApiResponse {
  txHash: string;
  updatedCount: number;
}

export interface StorageErrorResponse {
  success: false;
  message: string;
  errorCode?: 
    | 'FOLDER_EXISTS'
    | 'MISSING_NAME'
    | 'FOLDER_NOT_FOUND'
    | 'DOCUMENT_NOT_FOUND'
    | 'ITEM_NOT_FOUND'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'INVALID_PARENT'
    | 'STORAGE_QUOTA_EXCEEDED'
    | 'FILE_TOO_LARGE'
    | 'INVALID_FILE_TYPE'
    | 'NETWORK_ERROR'
    | 'PARSE_ERROR'
    | 'INTERNAL_ERROR';
}

// ── User Types (for nested relations) ──────────────────────
// Union type untuk type safety
export type SharePayload = ShareItemRequest | ShareFolderRequest;

export interface AuthUser {
  id: string;
  username: string;
  walletAddress: string;
  avatarUrl?: string | null;
  email?: string;
}

export interface ShareableUser {
  id: string;
  username: string;
  walletAddress: string;
  avatarUrl?: string | null;
}

// ── Folder Types ───────────────────────────────────────────
export interface Folder {
  id: string;
  name: string;
  ownerId: string;
  parentId: string | null;
  privacy: PrivacyLevel;
  shareToken?: string | null;
  isArchived: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  
  // Optional computed fields (from Prisma includes)
  _count?: { documents: number };
  owner?: Pick<AuthUser, 'id' | 'username' | 'walletAddress' | 'avatarUrl'>;
  parent?: Pick<Folder, 'id' | 'name' | 'parentId'>;
  sharedWith?: FolderAccess[];
}

export interface FolderAccess {
  id: string;
  folderId: string;
  userId: string;
  role: 'VIEWER' | 'EDITOR' | 'ADMIN';
  createdAt: string;
  user?: Pick<AuthUser, 'id' | 'username' | 'walletAddress' | 'avatarUrl'>;
}

// ── Document Types ─────────────────────────────────────────
export interface Document {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  ipfsHash?: string | null;
  fileHash?: string;
  blockchainTx?: string | null;
  isOnChain?: boolean;
  pendingOnChainUntil?: string | null;
  cleanupStatus?: 'PENDING' | 'ARCHIVED' | 'DELETED' | 'FAILED';
  folderId: string | null;
  ownerId: string;
  privacy: PrivacyLevel;
  isArchived: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  
  // Optional computed fields (from Prisma includes)
  owner?: Pick<AuthUser, 'id' | 'username' | 'walletAddress' | 'avatarUrl'>;
  folder?: Pick<Folder, 'id' | 'name'>;
  sharedWith?: DocumentAccess[];
}

export interface DocumentAccess {
  id: string;
  documentId: string;
  userId: string;
  role: 'VIEWER' | 'EDITOR' | 'ADMIN';
  createdAt: string;
  user?: Pick<AuthUser, 'id' | 'username' | 'walletAddress' | 'avatarUrl'>;
}

// ── Activity Log Types ────────────────────────────────────
export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  entityType: 'FOLDER' | 'DOCUMENT';
  entityId: string;
  entityName: string;
  fileHash?: string;
  ipfsHash?: string;
  blockchainTx?: string;
  details?: string;
  createdAt: string;
}

// ── Request Types ──────────────────────────────────────────
export interface CreateFolderRequest {
  name: string;
  parentId?: string | null;
}

export interface RenameFolderRequest {
  name: string;
}

export interface MoveItemsRequest {
  itemIds: string[];
  targetFolderId: string | null;
}

export interface UpdatePrivacyRequest {
  itemId: string;
  itemType: 'folder' | 'document';
  newPrivacy: PrivacyLevel;
}

export interface ShareItemRequest {
  itemId: string;
  itemType: 'folder' | 'document';
  targetUsers: string[] | FolderShareTarget[];  
}

export interface ShareFolderRequest {
  itemId: string;
  itemType: 'folder';
  targetUsers: Array<{ 
    userId: string; 
    role: 'VIEWER' | 'EDITOR' 
  }>;
}

export interface RevokeAccessRequest {
  itemId: string;
  itemType: 'folder' | 'document';
  targetUserIds: string[];
}

export type FolderShareTarget = {
  userId: string;
  role: 'VIEWER' | 'EDITOR';  // AccessRoleFolder enum
};

// Helper type guard
export function isFolderShareTarget(user: any): user is FolderShareTarget {
  return user && typeof user === 'object' && 'role' in user;
}

// ── Response Types: Documents ──────────────────────────────
export interface GetDocumentsResponse extends StorageApiResponse {
  data: Document[];
}

export interface GetDocumentDetailResponse extends StorageApiResponse {
  data: Document;
}

export interface DownloadResponse {
  success: boolean;
  fileName: string;
}

export interface BulkDownloadResponse extends DownloadResponse {
  documentCount: number;
}

// src/lib/types/storage.ts

// ── Response Types: Documents ──────────────────────────────
export interface UploadFilesResponse extends StorageApiResponse {
  message: string;
  results: Array<{
    success: boolean;
    fileName: string;
    data?: {
      id: string;
      fileName: string;
      title: string;
      fileSize: number;
      mimeType: string;
      ipfsHash: string;
      fileHash: string;
      blockchainTx: string | null;
      isOnChain: boolean;
      ownerId: string;
      folderId: string | null;
      privacy: PrivacyLevel;
      createdAt: string;
      updatedAt: string;
      blockchainData?: BlockchainRecordData;
    };
    error?: string;
    pinataInfo?: {
      groupId: string | null;
      ipfsHash: string;
    };
  }>;
}

export interface MoveDocumentsResponse extends StorageApiResponse {
  data: {
    count: number;
    appliedPrivacy: PrivacyLevel;
    location: 'Folder' | 'Root';
  };
}

export interface MoveFolderResponse extends StorageApiResponse {
  details?: string;
  data: {
    folder: Folder;
    count: number;
    appliedPrivacy: PrivacyLevel;
    location: string;
  };
}

export interface BulkOperationResponse extends StorageApiResponse {
  data: { count: number };
}

export interface UpdatePrivacyResponse extends StorageApiResponse {
  data: Array<{
    itemId: string;
    itemType: 'folder' | 'document';
    status: 'updated' | 'failed/unauthorized';
    newPrivacy: PrivacyLevel;
    accessRevoked: number;
  }>;
}

export interface ShareDocumentsResponse extends StorageApiResponse {
  data: Array<{
    itemId: string;
    itemType: 'folder' | 'document';
    sharedWith: Array<{ userId: string; status: 'granted' | 'failed'; error?: string }>;
  }>;
}

export interface RevokeAccessResponse extends StorageApiResponse {
  data: Array<{
    itemId: string;
    itemType: 'folder' | 'document';
    revokedCount: number;
    newStatus: PrivacyLevel;
  }>;
}

export interface GetSharedUsersResponse extends StorageApiResponse {
  data: Array<{
    id: string;
    title: string;
    privacy: PrivacyLevel;
    sharedWith: Array<{
      id: string;
      userId: string;
      user: Pick<AuthUser, 'id' | 'username' | 'walletAddress' | 'avatarUrl'>;
    }>;
  }>;
}

export interface SharedDocumentItem {
  accessId: string;
  document: Document;
}

export interface SharedFolderItem {
  accessId: string;
  role: 'VIEWER' | 'EDITOR' | 'ADMIN';
  sharedAt: string;
  folder: Folder & { documents?: Document[] };
}

export interface GetSharedWithMeResponse extends StorageApiResponse {
  data: SharedDocumentItem[];
}

export interface GetSharedFoldersWithMeResponse extends StorageApiResponse {
  data: SharedFolderItem[];
}

export interface GetActivityLogsResponse extends StorageApiResponse {
  data: ActivityLog[];
}

// ── Response Types: Folders ────────────────────────────────
export interface GetFoldersResponse extends StorageApiResponse {
  data: Folder[];
}

export interface GetFolderPathResponse extends StorageApiResponse {
  data: Array<{ id: string; name: string }>;
}

export interface CreateFolderResponse extends StorageApiResponse {
  data: Folder;
}

export interface RenameFolderResponse extends StorageApiResponse {
  data: Folder;
}

// ── Response Types: Admin ──────────────────────────────────
export interface GetSystemStatsResponse extends StorageApiResponse {
  data: {
    totalFiles: number;
    totalUsers: number;
  };
}

// ── Helper Types ───────────────────────────────────────────
export type FolderListItem = Pick<Folder, 'id' | 'name' | 'parentId' | 'privacy' | 'isArchived' | 'createdAt'> & {
  _count?: { documents: number };
};

export type DocumentListItem = Pick<Document, 'id' | 'title' | 'fileName' | 'fileSize' | 'mimeType' | 'folderId' | 'privacy' | 'isArchived' | 'createdAt'>;

export type BreadcrumbItem = { id: string; name: string };

// ── Union Types for Type Narrowing ─────────────────────────
export type StorageResponse<T> = (T & { success: true }) | StorageErrorResponse;