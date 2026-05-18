// src/modules/user/user.service.ts
import { prisma } from '../../config/db';
import { logger } from '../../utils/logger';
import { pinata } from '../../config/pinata';
import fs from 'fs';
import { File, Blob } from 'formdata-node'; // Sesuai dengan cara upload multiple sebelumnya

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

  // backend/src/modules/user/user.service.ts

// backend/src/modules/user/user.service.ts

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
      name: `AVATAR_${userId}_${Date.now()}`,
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
    
  } finally {
    // ✅ 8. Cleanup: (A) Temp file + (B) Old avatar from Pinata (non-blocking)
    
    // (A) Cleanup temp multer file
    if (file?.path && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } 
      catch (cleanupErr: any) {
        logger.warn(`[User] Failed to cleanup temp avatar file`, { path: file.path });
      }
    }
  
    if (oldAvatarHash) {
      // Non-blocking cleanup: don't await, don't throw
      setTimeout(async () => {
        try {
          // Verify user still has different avatarUrl (in case of race condition)
          const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { avatarUrl: true }
          });
          
          // Only unpin if current avatar is different from old one
          if (currentUser?.avatarUrl && !currentUser.avatarUrl.includes(oldAvatarHash)) {
            await pinata.unpin(oldAvatarHash);
            logger.info(`[Pinata] Cleaned up old avatar`, { 
              userId, 
              oldHash: oldAvatarHash 
            });
          }
        } catch (unpinError: any) {
          // Non-critical: just log, don't throw
          logger.warn(`[Pinata] Failed to unpin old avatar (non-critical)`, {
            userId,
            oldHash: oldAvatarHash,
            error: unpinError.message
          });
        }
      }, 1000); // Small delay to ensure DB consistency
    }
  }
}

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