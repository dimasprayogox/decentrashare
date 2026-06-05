export function ownerSummaryFactory(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    username: 'alice',
    email: 'alice@example.com',
    walletAddress: '0xabc',
    avatarUrl: null,
    ...overrides,
  };
}

export function userFactory(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    walletAddress: '0xabc',
    username: 'alice',
    email: 'alice@example.com',
    role: 'USER',
    storageLimit: 5368709120,
    nonce: 'nonce-1',
    nonceExpiresAt: new Date(Date.now() + 60_000),
    isRegistered: true,
    refreshToken: 'refresh-token',
    pinataGroupId: null,
    avatarUrl: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function folderFactory(overrides: Record<string, any> = {}) {
  const ownerId = overrides.ownerId ?? 'user-1';
  return {
    id: 'folder-1',
    name: 'Folder',
    ownerId,
    parentId: null,
    privacy: 'PRIVATE',
    isArchived: false,
    deletedAt: null,
    owner: ownerSummaryFactory({ id: ownerId }),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function documentFactory(overrides: Record<string, any> = {}) {
  const ownerId = overrides.ownerId ?? 'user-1';
  return {
    id: 'doc-1',
    title: 'Document',
    fileName: 'document.pdf',
    mimeType: 'application/pdf',
    fileSize: 1234,
    ipfsHash: 'QmHash',
    ownerId,
    folderId: null,
    privacy: 'PRIVATE',
    isArchived: false,
    deletedAt: null,
    blockchainTx: null,
    owner: ownerSummaryFactory({ id: ownerId }),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
