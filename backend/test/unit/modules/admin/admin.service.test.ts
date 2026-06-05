import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../../../helpers/prisma';
import { userFactory } from '../../../helpers/factories';

const prisma = createPrismaMock();
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };

mock.module('../../../../src/config/db', () => ({ prisma }));
mock.module('../../../../src/utils/logger', () => ({ logger }));
mock.module('../../../../src/utils/logger.js', () => ({ logger }));

const FIVE_GB = 5368709120;
const TEN_GB = 10737418240;

describe('Feature: admin user management and storage limit control', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    Object.values(logger).forEach(fn => fn.mockReset());
  });

  // --- listUsers ---

  test('given users exist, when listUsers runs, then it returns paginated users with per-user storage usage', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    const userA = {
      ...userFactory({ id: 'user-1', username: 'alice', storageLimit: BigInt(FIVE_GB) }),
      _count: { documents: 2, folders: 1 },
    };
    const userB = {
      ...userFactory({ id: 'user-2', username: 'bob', storageLimit: BigInt(TEN_GB) }),
      _count: { documents: 0, folders: 0 },
    };

    prisma.user.findMany.mockResolvedValue([userA, userB]);
    prisma.user.count.mockResolvedValue(2);
    prisma.document.groupBy.mockResolvedValue([
      { ownerId: 'user-1', _sum: { fileSize: 1073741824 } }, // 1GB used
    ]);

    const result = await adminService.listUsers({ page: 1, limit: 20 });

    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    expect(result.users).toHaveLength(2);

    // BigInt storageLimit must be serialized to a number
    expect(result.users[0].storageLimit).toBe(FIVE_GB);
    expect(typeof result.users[0].storageLimit).toBe('number');

    // user-1 has 1GB usage against a 5GB quota
    expect(result.users[0].storage).toEqual({
      usedBytes: 1073741824,
      quotaBytes: FIVE_GB,
      usagePercent: 20,
      unlimited: false,
    });

    // user-2 has no usage recorded -> 0 bytes
    expect(result.users[1].storage).toEqual({
      usedBytes: 0,
      quotaBytes: TEN_GB,
      usagePercent: 0,
      unlimited: false,
    });
  });

  test('given an admin user with a null storage limit, when listUsers runs, then their storage is reported as unlimited', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    const adminUser = {
      ...userFactory({ id: 'admin-1', username: 'root', role: 'ADMIN', storageLimit: null }),
      _count: { documents: 5, folders: 3 },
    };

    prisma.user.findMany.mockResolvedValue([adminUser]);
    prisma.user.count.mockResolvedValue(1);
    prisma.document.groupBy.mockResolvedValue([
      { ownerId: 'admin-1', _sum: { fileSize: 2147483648 } }, // 2GB used
    ]);

    const result = await adminService.listUsers({ page: 1, limit: 20 });

    expect(result.users[0].storageLimit).toBe(null);
    expect(result.users[0].storage).toEqual({
      usedBytes: 2147483648,
      quotaBytes: null,
      usagePercent: 0,
      unlimited: true,
    });
  });

  test('given a search query, when listUsers runs, then it filters by username, email, and wallet address', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
    prisma.document.groupBy.mockResolvedValue([]);

    await adminService.listUsers({ query: 'ali', page: 1, limit: 20 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { username: { contains: 'ali', mode: 'insensitive' } },
          { email: { contains: 'ali', mode: 'insensitive' } },
          { walletAddress: { contains: 'ali', mode: 'insensitive' } },
        ],
      }),
    }));
  });

  test('given a role filter, when listUsers runs, then it filters users by that role', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
    prisma.document.groupBy.mockResolvedValue([]);

    await adminService.listUsers({ role: 'ADMIN' as any });

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ role: 'ADMIN' }),
    }));
  });

  test('given an out-of-range page size, when listUsers runs, then the limit is clamped to a safe maximum', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
    prisma.document.groupBy.mockResolvedValue([]);

    const result = await adminService.listUsers({ page: 0, limit: 9999 });

    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(100);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 100,
    }));
  });

  // --- getUserDetail ---

  test('given an existing user, when getUserDetail runs, then it returns the user with storage usage', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    prisma.user.findUnique.mockResolvedValue({
      ...userFactory({ id: 'user-1', storageLimit: BigInt(FIVE_GB) }),
      _count: { documents: 3, folders: 2 },
    });
    prisma.document.aggregate.mockResolvedValue({ _sum: { fileSize: 2684354560 } }); // 2.5GB

    const result = await adminService.getUserDetail('user-1');

    expect(result.storageLimit).toBe(FIVE_GB);
    expect(result.storage).toEqual({
      usedBytes: 2684354560,
      quotaBytes: FIVE_GB,
      usagePercent: 50,
      unlimited: false,
    });
  });

  test('given an unknown user, when getUserDetail runs, then a not-found error is raised', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    prisma.user.findUnique.mockResolvedValue(null);

    await expect(adminService.getUserDetail('missing')).rejects.toThrow('User not found');
  });

  // --- updateUserRole ---

  test('given a valid target user, when updateUserRole promotes them to ADMIN, then the role is updated, storage becomes unlimited, and the action is logged', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    prisma.user.findUnique.mockResolvedValue({ id: 'user-2', role: 'USER' });
    const updated = userFactory({ id: 'user-2', role: 'ADMIN', storageLimit: null });
    prisma.user.update.mockResolvedValue(updated);
    prisma.activityLog.create.mockResolvedValue({});

    const result = await adminService.updateUserRole('admin-1', 'user-2', 'ADMIN' as any);

    expect(result.role).toBe('ADMIN');
    // ADMIN = unlimited → storageLimit null
    expect(result.storageLimit).toBe(null);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-2' },
      data: expect.objectContaining({ role: 'ADMIN', storageLimit: null }),
    }));
    expect(prisma.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'admin-1',
        action: 'ADMIN_UPDATE_ROLE',
        entityType: 'USER',
        entityId: 'user-2',
      }),
    }));
  });

  test('given an admin being demoted to USER, when updateUserRole runs, then storage is reset to the default 5GB', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    prisma.user.findUnique.mockResolvedValue({ id: 'user-2', role: 'ADMIN' });
    prisma.user.update.mockResolvedValue(
      userFactory({ id: 'user-2', role: 'USER', storageLimit: BigInt(FIVE_GB) })
    );
    prisma.activityLog.create.mockResolvedValue({});

    const result = await adminService.updateUserRole('admin-1', 'user-2', 'USER' as any);

    expect(result.role).toBe('USER');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: 'USER', storageLimit: BigInt(FIVE_GB) }),
    }));
  });

  test('given an invalid role value, when updateUserRole runs, then it rejects before touching the database', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    await expect(adminService.updateUserRole('admin-1', 'user-2', 'SUPERUSER' as any))
      .rejects.toThrow('Invalid role');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('given an unknown target user, when updateUserRole runs, then a not-found error is raised', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    prisma.user.findUnique.mockResolvedValue(null);

    await expect(adminService.updateUserRole('admin-1', 'missing', 'ADMIN' as any))
      .rejects.toThrow('User not found');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('given an admin demoting their own account, when updateUserRole runs, then it is blocked to prevent lockout', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });

    await expect(adminService.updateUserRole('admin-1', 'admin-1', 'USER' as any))
      .rejects.toThrow('cannot change your own admin role');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  // --- updateUserStorageLimit ---

  test('given a valid new limit, when updateUserStorageLimit runs, then the limit is persisted as BigInt and serialized back as a number', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-2',
      role: 'USER',
      storageLimit: BigInt(FIVE_GB),
      username: 'bob',
      walletAddress: '0xbob',
    });
    prisma.document.aggregate.mockResolvedValue({ _sum: { fileSize: 1073741824 } }); // 1GB used
    prisma.user.update.mockResolvedValue(
      userFactory({ id: 'user-2', storageLimit: BigInt(TEN_GB) })
    );
    prisma.activityLog.create.mockResolvedValue({});

    const result = await adminService.updateUserStorageLimit('admin-1', 'user-2', TEN_GB);

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-2' },
      data: expect.objectContaining({ storageLimit: BigInt(TEN_GB) }),
    }));
    expect(result.storageLimit).toBe(TEN_GB);
    expect(result.storage).toEqual({
      usedBytes: 1073741824,
      quotaBytes: TEN_GB,
      usagePercent: 10,
      unlimited: false,
    });
    expect(prisma.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ADMIN_UPDATE_STORAGE_LIMIT' }),
    }));
  });

  test('given an admin target, when updateUserStorageLimit runs, then it is rejected because admins are unlimited', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-2',
      role: 'ADMIN',
      storageLimit: null,
      username: 'adminbob',
      walletAddress: '0xadmin',
    });

    await expect(adminService.updateUserStorageLimit('admin-1', 'admin-2', TEN_GB))
      .rejects.toThrow('Admins have unlimited storage');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('given a negative limit, when updateUserStorageLimit runs, then it is rejected', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    await expect(adminService.updateUserStorageLimit('admin-1', 'user-2', -1))
      .rejects.toThrow('Storage limit must be a non-negative number');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('given a limit above the 1TB cap, when updateUserStorageLimit runs, then it is rejected', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    const overCap = 1024 * 1024 * 1024 * 1024 + 1; // 1TB + 1 byte

    await expect(adminService.updateUserStorageLimit('admin-1', 'user-2', overCap))
      .rejects.toThrow('cannot exceed 1TB');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('given an unknown target user, when updateUserStorageLimit runs, then a not-found error is raised', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    prisma.user.findUnique.mockResolvedValue(null);

    await expect(adminService.updateUserStorageLimit('admin-1', 'missing', TEN_GB))
      .rejects.toThrow('User not found');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('given a fractional byte limit, when updateUserStorageLimit runs, then the value is floored before persisting', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-2',
      role: 'USER',
      storageLimit: BigInt(FIVE_GB),
      username: 'bob',
      walletAddress: '0xbob',
    });
    prisma.document.aggregate.mockResolvedValue({ _sum: { fileSize: 0 } });
    prisma.user.update.mockResolvedValue(userFactory({ id: 'user-2', storageLimit: BigInt(100) }));
    prisma.activityLog.create.mockResolvedValue({});

    await adminService.updateUserStorageLimit('admin-1', 'user-2', 100.9);

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ storageLimit: BigInt(100) }),
    }));
  });

  // --- logAdminAction ---

  test('given the activity log write fails, when logAdminAction runs, then the error is swallowed and logged', async () => {
    const { adminService } = await import('../../../../src/modules/admin/admin.service');

    prisma.activityLog.create.mockRejectedValue(new Error('log db down'));

    await adminService.logAdminAction('admin-1', 'ADMIN_TEST', 'user-2', 'bob', 'details');

    expect(logger.error).toHaveBeenCalled();
  });
});
