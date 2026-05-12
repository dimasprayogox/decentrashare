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

  // ✅ KHUSUS UPLOAD AVATAR KE IPFS
async updateAvatar(userId: string, file: Express.Multer.File) {
    try {
      const formData = new FormData();
      
      // 1. KUNCI UTAMA: Gunakan Bun.file()
      // Bun.file() akan langsung membaca file dari disk dan otomatis 
      // menjadikannya object Blob/File yang 100% sah di mata Bun.
      const bunFile = Bun.file(file.path);
      
      // 2. Append ke FormData (Pasti lolos dari error "Expected argument to be a Blob")
      formData.append('file', bunFile);

      // 3. Tambahkan metadata Pinata
      const pinataMetadata = JSON.stringify({
        name: `AVATAR_${userId}_${Date.now()}`,
        keyvalues: {
          folder: 'profile-pictures',
          userId: userId,
          appContext: 'user-profile'
        }
      });
      formData.append('pinataMetadata', pinataMetadata);
      formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

      // 4. Tembak langsung API Pinata
      const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PINATA_JWT}`
          // Biarkan Bun yang mengurus Content-Type dan Boundary-nya
        },
        body: formData
      });

      if (!pinataRes.ok) {
        const errorData = await pinataRes.text();
        throw new Error(`Pinata API Error: ${errorData}`);
      }

      const uploadData = await pinataRes.json();

      // 5. Susun URL menggunakan Gateway Bos
      let gateway = process.env.PINATA_GATEWAY_URL || 'gateway.pinata.cloud';
      
      // Bersihkan jika gateway di .env terlanjur ada https:// atau /ipfs/
      gateway = gateway.replace(/^https?:\/\//, '').replace(/\/ipfs\/?$/, '').replace(/\/$/, '');
      
      const avatarUrl = `https://${gateway}/ipfs/${uploadData.IpfsHash}`;

      // 6. UPDATE DATABASE
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

      logger.info(`[User] Avatar updated to IPFS: ${uploadData.IpfsHash} for userId: ${userId}`);
      return updated;

    } catch (error: any) {
      logger.error(`[User] Avatar upload failed: ${error.message}`);
      throw error;
      
    } finally {
      // 7. CLEANUP: Hapus file temp multer
      if (file && file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
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