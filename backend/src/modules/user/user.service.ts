// src/modules/user/user.service.ts
import { prisma } from '../../config/db';
import { logger } from '../../utils/logger';
import { pinata } from '../../config/pinata';
import fs from 'fs';
import { File, Blob } from 'formdata-node'; // Sesuai dengan cara upload multiple sebelumnya

export type SearchUsersOptions = {
  query: string;
  currentUserId: string;
  excludeSharedUserIds?: string[];
  limit?: number;
};

export type SearchUsersResult = {
  success: boolean;
  users: Array<{
    id: string;
    username: string | null;
    walletAddress: string;
    avatarUrl: string | null;
    email?: string | null;
  }>;
  message?: string;
};

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

  async getPublicProfile(userId: string) {
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
        createdAt: true,
      },
    });

    if (!user) throw new Error('User not found');

    const [folders, documents] = await Promise.all([
      prisma.folder.findMany({
        where: { ownerId: userId, privacy: 'PUBLIC', isArchived: false, deletedAt: null },
        include: {
          owner: { select: { id: true, username: true, email: true, walletAddress: true, avatarUrl: true } },
          _count: { select: { documents: true } }
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
      }),
      prisma.document.findMany({
        where: { ownerId: userId, privacy: 'PUBLIC', isArchived: false, deletedAt: null },
        include: {
          folder: true,
          owner: { select: { id: true, username: true, email: true, walletAddress: true, avatarUrl: true } }
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
      })
    ]);

    return { user, folders, documents };
  },

async searchUsersForShare({
  query,
  currentUserId,
  excludeSharedUserIds = [],
  limit = 20
}: SearchUsersOptions): Promise<SearchUsersResult> {
  try {
    // ✅ Validation
    if (!query || query.trim().length < 2) {
      return {
        success: false,
        users: [],
        message: 'Query minimal 2 karakter'
      };
    }

    if (!currentUserId) {
      return {
        success: false,
        users: [],
        message: 'User ID required'
      };
    }

    // ✅ Prisma query dengan filtering yang aman
    const users = await prisma.user.findMany({
      where: {
        AND: [
          // Exclude diri sendiri
          { id: { not: currentUserId } },
          
          // Exclude user yang sudah di-share (jika ada)
          ...(excludeSharedUserIds.length > 0 
            ? [{ id: { notIn: excludeSharedUserIds } }] 
            : []),
          
          // Search by username, email, or wallet address
          {
            OR: [
              { username: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
              { walletAddress: { contains: query, mode: 'insensitive' } }
            ]
          }
        ]
      },
      select: {
        id: true,
        username: true,
        walletAddress: true,
        avatarUrl: true,
        email: true
      },
      take: limit,
      orderBy: {
        // Prioritize username matches, then by last active
        username: 'asc'
      }
    });

    logger.debug('[UserService] searchUsersForShare', {
      query,
      currentUserId,
      found: users.length,
      excludeCount: excludeSharedUserIds.length
    });

    return {
      success: true,
      users: users as SearchUsersResult['users']
    };

  } catch (error: any) {
    logger.error('[UserService] searchUsersForShare error:', {
      query,
      currentUserId,
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      users: [],
      message: 'Failed to search users'
    };
  }
},

async updateAvatar(userId: string, file: Express.Multer.File) {
  let oldAvatarHash: string | null = null; // Track old hash for cleanup
  
  try {
    // ✅ 0. Fetch user + their Pinata group ID + old avatar
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        pinataGroupId: true,
        username: true,
        avatarUrl: true  // ← Fetch old avatar URL for cleanup later
      }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Extract old IPFS hash for cleanup (if exists)
    if (user.avatarUrl) {
      const match = user.avatarUrl.match(/\/ipfs\/([a-zA-Z0-9]+)/);
      if (match?.[1]) {
        oldAvatarHash = match[1];
        logger.debug(`[Pinata] Will cleanup old avatar after update`, { 
          userId, 
          oldHash: oldAvatarHash 
        });
      }
    }
    
    const formData = new FormData();
    const bunFile = Bun.file(file.path);
    
    // 1. Append file (prevent Pinata wrapping)
    formData.append('file', bunFile, file.originalname);

    // 2. Metadata dengan kategorisasi jelas
    const pinataMetadata = JSON.stringify({
      name: `AVATAR`,
      keyvalues: {
        userId,
        contentType: 'avatar',
        folderPath: 'profile/avatars',
        originalName: file.originalname,
        uploadedAt: new Date().toISOString(),
      }
    });
    formData.append('pinataMetadata', pinataMetadata);

    // 3. Options: Gunakan group personal user
    const pinataOptions: any = { 
      cidVersion: 1,
      wrapWithDirectory: false
    };

    if (user.pinataGroupId) {
      pinataOptions.groupId = user.pinataGroupId;
      logger.debug(`[Pinata] Using user's personal group for avatar`, { 
        userId, 
        groupId: user.pinataGroupId 
      });
    }

    formData.append('pinataOptions', JSON.stringify(pinataOptions));

    // 4. Upload NEW avatar ke Pinata API
    const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PINATA_JWT}`
      },
      body: formData
    });

    if (!pinataRes.ok) {
      const errorData = await pinataRes.text();
      throw new Error(`Pinata API Error: ${errorData}`);
    }

    const uploadData = await pinataRes.json();
    const newIpfsHash = uploadData.IpfsHash;

    // 5. Build gateway URL
    let gateway = process.env.PINATA_GATEWAY_URL || 'gateway.pinata.cloud';
    gateway = gateway.replace(/^https?:\/\//, '').replace(/\/ipfs\/?$/, '').replace(/\/$/, '');
    const avatarUrl = `https://${gateway}/ipfs/${newIpfsHash}`;

    // 6. ✅ Update database dengan new avatarUrl
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { 
        avatarUrl,
        updatedAt: new Date() 
      },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        updatedAt: true,
      },
    });

    logger.info(`[User] Avatar updated to IPFS`, {
      userId,
      oldHash: oldAvatarHash,
      newHash: newIpfsHash,
      pinataGroupId: user.pinataGroupId || 'ungrouped',
      contentType: 'avatar'
    });
    
    // ✅ 7. Return success (cleanup old avatar happens AFTER return, non-blocking)
    return updated;

  } catch (error: any) {
    logger.error(`[User] Avatar upload failed: ${error.message}`, { 
      userId, 
      fileName: file?.originalname,
      error: error.stack 
    });
    throw error;
    
  // ✅ Ganti entire finally block di updateAvatar() dengan ini:

} finally {
  // ── (A) Cleanup temp multer file ─────────────────────────
  if (file?.path && fs.existsSync(file.path)) {
    try { 
      fs.unlinkSync(file.path); 
    } catch (cleanupErr: any) {
      logger.warn(`[User] Failed to cleanup temp avatar file`, { path: file.path });
    }
  }

  // ── (B) ✅ Cleanup old avatar from Pinata (non-blocking) ──
  if (oldAvatarHash) {
    // ✅ Use IIFE for reliable async execution in Bun
    (async () => {
      try {
        // Tiny delay to ensure DB transaction is committed
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify user still has different avatarUrl (race condition safety)
        const currentUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { avatarUrl: true }
        });
        
        logger.debug(`[Pinata Cleanup] Checking if old avatar should be unpinned`, {
          userId,
          oldAvatarHash,
          currentAvatarUrl: currentUser?.avatarUrl,
          shouldUnpin: currentUser?.avatarUrl && !currentUser.avatarUrl.includes(oldAvatarHash)
        });
        
        // Only unpin if current avatar is different from old one
        if (currentUser?.avatarUrl && !currentUser.avatarUrl.includes(oldAvatarHash)) {
          logger.info(`[Pinata Cleanup] Attempting to unpin old avatar: ${oldAvatarHash}`, { userId });
          
          // ✅ Use direct REST API (more reliable than SDK method)
          const unpinRes = await fetch(`https://api.pinata.cloud/pinning/unpin/${oldAvatarHash}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${process.env.PINATA_JWT}`
            }
          });
          
          if (unpinRes.ok) {
            logger.info(`[Pinata Cleanup] ✅ Successfully unpinned old avatar`, {
              userId,
              oldAvatarHash
            });
          } else {
            const errorData = await unpinRes.text();
            logger.warn(`[Pinata Cleanup] ⚠️ Unpin failed`, {
              userId,
              oldAvatarHash,
              status: unpinRes.status,
              error: errorData
            });
          }
        } else {
          logger.debug(`[Pinata Cleanup] ⏭️ Skipping unpin - avatar still in use or already changed`, {
            userId,
            oldAvatarHash,
            currentAvatarUrl: currentUser?.avatarUrl
          });
        }
        
      } catch (unpinError: any) {
        logger.warn(`[Pinata Cleanup] ❌ Error during unpin process`, {
          userId,
          oldAvatarHash,
          error: unpinError.message,
          stack: unpinError.stack
        });
      }
    })(); // ← IIFE: immediately invoked, non-blocking
  }
}
},

  // ✅ UPDATE PROFIL (TEXT DATA)
  async updateProfile(
    userId: string,
    {
      username, email, bio, website
    }: {
      username?: string; email?: string;
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

    // ── Build update object ──
    const updateData: any = { updatedAt: new Date() };
    
    if (username !== undefined) updateData.username = username.trim();
    if (email !== undefined) updateData.email = email.trim().toLowerCase();
    if (bio !== undefined) updateData.bio = bio?.trim() || null;
    if (website !== undefined) updateData.website = website?.trim() || null;

    // ── Prisma update: ✅ Fix typo Bos, pakai "data:" ──
    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData, // Tadi di kode Bos kurang key "data:"
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

    logger.info(`[User] Profile text updated for userId: ${userId}`);
    return updated;
  },
};