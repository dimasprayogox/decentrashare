// src/modules/admin/admin.service.ts
import { prisma } from '../../config/db';
import { logger } from '../../utils/logger';
import { Role } from '@prisma/client';

export type ListUsersOptions = {
  query?: string;
  role?: Role;
  page?: number;
  limit?: number;
};

const DEFAULT_STORAGE_LIMIT = 5n * 1024n * 1024n * 1024n; // 5GB in bytes

// Helper: serialize a user record (convert BigInt storageLimit -> number)
const serializeUser = (user: any) => ({
  ...user,
  storageLimit: user.storageLimit !== undefined && user.storageLimit !== null
    ? Number(user.storageLimit)
    : Number(DEFAULT_STORAGE_LIMIT),
});

export const adminService = {
  /**
   * Daftar semua user dengan pencarian, filter role, dan pagination.
   * Menyertakan ringkasan penggunaan storage per user.
   */
  async listUsers({ query, role, page = 1, limit = 20 }: ListUsersOptions) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const where: any = {};

    if (role) {
      where.role = role;
    }

    if (query && query.trim().length > 0) {
      const q = query.trim();
      where.OR = [
        { username: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { walletAddress: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          walletAddress: true,
          username: true,
          email: true,
          avatarUrl: true,
          role: true,
          storageLimit: true,
          isRegistered: true,
          lastActive: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { documents: true, folders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      prisma.user.count({ where }),
    ]);

    // Hitung penggunaan storage tiap user (dokumen aktif saja)
    const usageList = await prisma.document.groupBy({
      by: ['ownerId'],
      where: {
        ownerId: { in: users.map((u) => u.id) },
        isArchived: false,
        deletedAt: null,
      },
      _sum: { fileSize: true },
    });

    const usageMap = new Map<string, number>(
      usageList.map((u) => [u.ownerId, u._sum.fileSize ?? 0])
    );

    const data = users.map((user) => {
      const usedBytes = usageMap.get(user.id) ?? 0;
      const limitBytes = Number(user.storageLimit);
      return {
        ...serializeUser(user),
        storage: {
          usedBytes,
          quotaBytes: limitBytes,
          usagePercent: limitBytes > 0 ? Math.min(100, (usedBytes / limitBytes) * 100) : 0,
        },
      };
    });

    return {
      users: data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  },

  /**
   * Detail user beserta penggunaan storage.
   */
  async getUserDetail(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        walletAddress: true,
        username: true,
        email: true,
        avatarUrl: true,
        bio: true,
        website: true,
        role: true,
        storageLimit: true,
        isRegistered: true,
        lastActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { documents: true, folders: true } },
      },
    });

    if (!user) throw new Error('User not found');

    const usage = await prisma.document.aggregate({
      where: { ownerId: userId, isArchived: false, deletedAt: null },
      _sum: { fileSize: true },
    });

    const usedBytes = usage._sum.fileSize ?? 0;
    const limitBytes = Number(user.storageLimit);

    return {
      ...serializeUser(user),
      storage: {
        usedBytes,
        quotaBytes: limitBytes,
        usagePercent: limitBytes > 0 ? Math.min(100, (usedBytes / limitBytes) * 100) : 0,
      },
    };
  },

  /**
   * Ubah role user lain. Admin tidak boleh menurunkan role dirinya sendiri.
   */
  async updateUserRole(adminId: string, targetUserId: string, newRole: Role) {
    if (!['USER', 'ADMIN'].includes(newRole)) {
      throw new Error('Invalid role. Must be USER or ADMIN');
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });

    if (!target) throw new Error('User not found');

    // Cegah admin menurunkan dirinya sendiri (menghindari lockout)
    if (adminId === targetUserId && newRole !== 'ADMIN') {
      throw new Error('You cannot change your own admin role');
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole, updatedAt: new Date() },
      select: {
        id: true,
        walletAddress: true,
        username: true,
        email: true,
        role: true,
        storageLimit: true,
        updatedAt: true,
      },
    });

    await this.logAdminAction(
      adminId,
      'ADMIN_UPDATE_ROLE',
      targetUserId,
      updated.username || updated.walletAddress,
      `Role changed from ${target.role} to ${newRole}`
    );

    logger.info('[AdminService] User role updated', {
      adminId,
      targetUserId,
      from: target.role,
      to: newRole,
    });

    return serializeUser(updated);
  },

  /**
   * Atur batas penyimpanan (storage limit) user dalam bytes.
   */
  async updateUserStorageLimit(adminId: string, targetUserId: string, storageLimitBytes: number) {
    if (!Number.isFinite(storageLimitBytes) || storageLimitBytes < 0) {
      throw new Error('Storage limit must be a non-negative number (bytes)');
    }

    // Batas atas wajar: 1 TB
    const MAX_LIMIT = 1024 * 1024 * 1024 * 1024;
    if (storageLimitBytes > MAX_LIMIT) {
      throw new Error('Storage limit cannot exceed 1TB');
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, storageLimit: true, username: true, walletAddress: true },
    });

    if (!target) throw new Error('User not found');

    // Pastikan limit baru tidak lebih kecil dari yang sudah dipakai
    const usage = await prisma.document.aggregate({
      where: { ownerId: targetUserId, isArchived: false, deletedAt: null },
      _sum: { fileSize: true },
    });
    const usedBytes = usage._sum.fileSize ?? 0;

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { storageLimit: BigInt(Math.floor(storageLimitBytes)), updatedAt: new Date() },
      select: {
        id: true,
        walletAddress: true,
        username: true,
        email: true,
        role: true,
        storageLimit: true,
        updatedAt: true,
      },
    });

    await this.logAdminAction(
      adminId,
      'ADMIN_UPDATE_STORAGE_LIMIT',
      targetUserId,
      target.username || target.walletAddress,
      `Storage limit set to ${Math.floor(storageLimitBytes)} bytes (previous: ${Number(target.storageLimit)} bytes)`
    );

    logger.info('[AdminService] User storage limit updated', {
      adminId,
      targetUserId,
      newLimit: Math.floor(storageLimitBytes),
    });

    return {
      ...serializeUser(updated),
      storage: {
        usedBytes,
        quotaBytes: Number(updated.storageLimit),
        usagePercent:
          Number(updated.storageLimit) > 0
            ? Math.min(100, (usedBytes / Number(updated.storageLimit)) * 100)
            : 0,
      },
    };
  },

  /**
   * Catat aksi admin ke activity log (non-blocking, tidak melempar error).
   */
  async logAdminAction(
    adminId: string,
    action: string,
    targetUserId: string,
    targetName: string,
    details: string
  ) {
    try {
      await prisma.activityLog.create({
        data: {
          userId: adminId,
          action,
          entityType: 'USER',
          entityId: targetUserId,
          entityName: targetName,
          details,
        },
      });
    } catch (error: any) {
      logger.error('[AdminService] Failed to log admin action', {
        adminId,
        action,
        error: error.message,
      });
    }
  },
};
