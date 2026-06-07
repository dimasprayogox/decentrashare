import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../../../helpers/prisma';
import { userFactory, folderFactory, documentFactory } from '../../../helpers/factories';

const prisma = createPrismaMock();
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };

mock.module('../../../../src/config/db', () => ({ prisma }));
mock.module('../../../../src/utils/logger', () => ({ logger }));
const pinata = {
  unpin: mock(),
  pin: { delete: mock() },
  groups: { list: mock(), create: mock() },
  upload: { file: mock() },
  pins: { list: mock() },
};
mock.module('../../../../src/config/pinata', () => ({ pinata }));

// Mock fs module for updateAvatar file cleanup
const mockExistsSync = mock(() => true);
const mockUnlinkSync = mock();
mock.module('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    unlinkSync: mockUnlinkSync,
  },
}));

// Mock Bun.file
const originalBunFile = Bun.file;
Bun.file = (path: string) => {
  return new Blob(['avatar-data'], { type: 'image/jpeg' }) as any;
};

describe('Feature: user profile lookup and share-target discovery', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    Object.values(logger).forEach(fn => fn.mockReset());
    mockExistsSync.mockClear();
    mockUnlinkSync.mockClear();
    globalThis.fetch = mock() as any;
  });

  // --- getUserById ---

  test('given an existing user id, when the profile is requested, then the selected public profile fields are returned', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');
    const user = userFactory();
    prisma.user.findUnique.mockResolvedValue(user);

    const result = await userService.getUserById('user-1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: expect.any(Object),
    });
    expect(result).toEqual(user);
  });

  test('given an unknown user id, when the profile is requested, then a not-found error is raised', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(userService.getUserById('missing')).rejects.toThrow('User not found');
  });

  // --- getPublicProfile ---

  test('given a valid user, when their public profile is requested, then returns profile, public folders, and public documents', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');
    const user = userFactory({ id: 'user-1' });
    const folder = folderFactory({ ownerId: 'user-1', privacy: 'PUBLIC' });
    const document = documentFactory({ ownerId: 'user-1', privacy: 'PUBLIC' });

    prisma.user.findUnique.mockResolvedValue(user);
    prisma.folder.findMany.mockResolvedValue([folder]);
    prisma.document.findMany.mockResolvedValue([document]);

    const result = await userService.getPublicProfile('user-1');

    expect(result).toEqual({
      user,
      folders: [folder],
      documents: [document],
    });
    expect(prisma.folder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId: 'user-1', privacy: 'PUBLIC', isArchived: false, deletedAt: null },
    }));
  });

  test('given an unknown user, when public profile is requested, then throws user not found error', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(userService.getPublicProfile('missing')).rejects.toThrow('User not found');
  });

  // --- searchUsersForShare ---

  test('given a search keyword shorter than two characters, when share targets are searched, then no database lookup is performed', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');

    const result = await userService.searchUsersForShare({ query: 'a', currentUserId: 'user-1' });

    expect(result).toEqual({ success: false, users: [], message: 'Query minimal 2 karakter' });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  test('given no current user id, when share targets are searched, then the search is rejected', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');

    const result = await userService.searchUsersForShare({ query: 'ali', currentUserId: '' });

    expect(result).toEqual({ success: false, users: [], message: 'User ID required' });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  test('given a valid query and existing share recipients, when share targets are searched, then self and already shared users are excluded', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');
    const users = [userFactory({ id: 'user-2', username: 'alice2' })];
    prisma.user.findMany.mockResolvedValue(users);

    const result = await userService.searchUsersForShare({
      query: 'ali',
      currentUserId: 'user-1',
      excludeSharedUserIds: ['user-3'],
      limit: 5,
    });

    expect(result).toEqual({ success: true, users });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { id: { not: 'user-1' } },
          { id: { notIn: ['user-3'] } },
          {
            OR: [
              { username: { contains: 'ali', mode: 'insensitive' } },
              { email: { contains: 'ali', mode: 'insensitive' } },
              { walletAddress: { contains: 'ali', mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: expect.any(Object),
      take: 5,
      orderBy: { username: 'asc' },
    });
  });

  test('given the database lookup fails, when share targets are searched, then a safe failure response is returned', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');
    prisma.user.findMany.mockRejectedValue(new Error('db down'));

    const result = await userService.searchUsersForShare({ query: 'alice', currentUserId: 'user-1' });

    expect(result).toEqual({ success: false, users: [], message: 'Failed to search users' });
    expect(logger.error).toHaveBeenCalled();
  });

  // --- updateProfile ---

  test('given valid profile data, when updating profile, then it validates and updates fields in db', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');
    prisma.user.findFirst.mockResolvedValue(null); // No username/email duplicate
    const updatedUser = userFactory({ id: 'user-1', username: 'newname', email: 'new@example.com' });
    prisma.user.update.mockResolvedValue(updatedUser);

    const result = await userService.updateProfile('user-1', {
      username: 'newname',
      email: 'new@example.com',
      bio: 'Hello bio',
      website: 'https://example.com',
    });

    expect(result).toEqual(updatedUser);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        username: 'newname',
        email: 'new@example.com',
        bio: 'Hello bio',
        website: 'https://example.com',
      }),
    }));
  });

  test('given invalid username format, when updating profile, then validation error is thrown', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');

    await expect(userService.updateProfile('user-1', { username: 'ab' })).rejects.toThrow('Username must be 3-20 characters');
    await expect(userService.updateProfile('user-1', { username: 'invalid name!' })).rejects.toThrow('Username must be 3-20 characters');
  });

  test('given username already taken, when updating profile, then throws username taken error', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');
    prisma.user.findFirst.mockResolvedValue(userFactory({ id: 'user-2' }));

    await expect(userService.updateProfile('user-1', { username: 'taken_name' })).rejects.toThrow('Username is already taken');
  });

  test('given invalid email format, when updating profile, then validation error is thrown', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');

    await expect(userService.updateProfile('user-1', { email: 'invalid-email' })).rejects.toThrow('Please enter a valid email address');
  });

  test('given email already registered, when updating profile, then throws email registered error', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');
    prisma.user.findFirst.mockResolvedValue(userFactory({ id: 'user-2' }));

    await expect(userService.updateProfile('user-1', { email: 'registered@example.com' })).rejects.toThrow('Email is already registered');
  });

  // --- updateAvatar ---

  test('given a new avatar file, when updateAvatar runs, then it uploads to Pinata, updates user db, cleans up temp file, and unpins old avatar', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');
    
    // Setup user with an existing old avatar to test unpin flow
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        username: 'alice',
        pinataGroupId: 'group-1',
        avatarUrl: 'https://gateway.pinata.cloud/ipfs/QmOldHash',
      })
      .mockResolvedValueOnce({
        avatarUrl: 'https://gateway.pinata.cloud/ipfs/QmNewHash',
      });

    // Mock Pinata upload fetch response
    (globalThis.fetch as any).mockImplementation((url: string, init?: any) => {
      if (url.includes('pinFileToIPFS')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ IpfsHash: 'QmNewHash' }),
        });
      }
      if (url.includes('unpin')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('Unpinned'),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const updatedUser = userFactory({ id: 'user-1', avatarUrl: 'https://gateway.pinata.cloud/ipfs/QmNewHash' });
    prisma.user.update.mockResolvedValue(updatedUser);

    const mockFile = {
      path: '/tmp/avatar.jpg',
      originalname: 'avatar.jpg',
    } as any;

    const result = await userService.updateAvatar('user-1', mockFile);

    expect(result).toEqual(updatedUser);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        avatarUrl: expect.stringContaining('QmNewHash'),
      }),
    }));

    // Temp file should be deleted
    expect(mockUnlinkSync).toHaveBeenCalledWith('/tmp/avatar.jpg');

    // Wait a brief moment to allow non-blocking unpin IIFE to execute
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('unpin/QmOldHash'), expect.any(Object));
  });

  test('given Pinata upload fails, when updateAvatar runs, then it cleans up temp file and throws error', async () => {
    const { userService } = await import('../../../../src/modules/user/user.service');
    
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
    });

    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('Pinata error details'),
    });

    const mockFile = {
      path: '/tmp/avatar.jpg',
      originalname: 'avatar.jpg',
    } as any;

    await expect(userService.updateAvatar('user-1', mockFile)).rejects.toThrow('Pinata API Error');
    expect(mockUnlinkSync).toHaveBeenCalledWith('/tmp/avatar.jpg');
  });
});
