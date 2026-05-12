// src/modules/user/user.service.ts
import { prisma } from '../../config/db';
import { logger } from '../../utils/logger';

export const userService = {
  async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, walletAddress: true, username: true, email: true,
        avatarUrl: true, bio: true, website: true, role: true, isRegistered: true,
        createdAt: true, updatedAt: true,
      },
    });

    if (!user) throw new Error('User not found');
    return user;
  },

  async updateProfile(
    userId: string,
    {
      username, email, avatarUrl, bio, website
    }: {
      username?: string; email?: string; avatarUrl?: string;
      bio?: string; website?: string;
    }
  ) {
    // ── Simple validation ──
    if (username !== undefined) {
      const u = username.trim();
      if (u && !/^[a-zA-Z0-9_]{3,20}$/.test(u)) {
        throw new Error('Username must be 3-20 characters (letters, numbers, underscore only)');
      }
      const exists = await prisma.user.findFirst({
        where: { username: { equals: u, mode: 'insensitive' }, id: { not: userId } }
      });
      if (exists) throw new Error('Username is already taken');
    }

    if (email !== undefined) {
      const e = email.trim().toLowerCase();
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        throw new Error('Please enter a valid email address');
      }
      const exists = await prisma.user.findFirst({
        where: { email: { equals: e, mode: 'insensitive' }, id: { not: userId } }
      });
      if (exists) throw new Error('Email is already registered');
    }

    // ── Build update object manually (Bun-compatible) ──
    const updateData: any = { updatedAt: new Date() };
    
    if (username !== undefined) updateData.username = username.trim();
    if (email !== undefined) updateData.email = email.trim().toLowerCase();
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
    if (bio !== undefined) updateData.bio = bio?.trim() || null;
    if (website !== undefined) updateData.website = website?.trim() || null;

    // ── Prisma update: ✅ "data:" key required! ──
    const updated = await prisma.user.update({
      where: { id: userId },
       updateData,  // ← ✅ Ini kuncinya: "data:" sebelum object
      select: {
        id: true,
        walletAddress: true,
        username: true,
        email: true,
        avatarUrl: true,
        bio: true,
        website: true,
        role: true,
        isRegistered: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info(`[User] Profile updated for userId: ${userId}`);
    return updated;
  },
};