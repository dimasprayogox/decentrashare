import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../../../helpers/prisma';
import { userFactory } from '../../../helpers/factories';

const prisma = createPrismaMock();
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };

mock.module('../../../../src/config/db', () => ({ prisma }));
mock.module('../../../../src/utils/logger', () => ({ logger }));
mock.module('../../../../src/config/pinata', () => ({ pinata: {} }));

describe('Feature: user profile lookup and share-target discovery', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    Object.values(logger).forEach(fn => fn.mockReset());
  });

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
});
