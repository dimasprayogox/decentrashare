// backend/src/modules/pinata/pinata.service.ts
import { prisma } from '../../config/db';
import { pinata } from '../../config/pinata';
import { logger } from '../../utils/logger';

// ── Types / Interfaces ────────────────────────────────────────────────────────

export interface PinCleanupResult {
  success: boolean;
  ipfsHash: string;
  message?: string;
  error?: string;
}

export interface UploadWithUserContextOptions {
  folderPath?: string;           // e.g., "documents", "images", "folders/{folderId}"
  customMetadata?: Record<string, any>;  // Additional key-value metadata
}

export interface PinataUploadResult {
  ipfsHash: string;              // The IPFS CID of the uploaded file
  pinataUrl: string;             // Gateway URL for accessing the file
  metadata: {
    name: string;                // Original filename
    keyvalues: Record<string, any>;  // Custom metadata for filtering
  };
  groupId: string | null;        // Pinata group ID the file was assigned to
}

// ── PinataCleanupService ──────────────────────────────────────────────────────
/**
 * Bertanggung jawab atas operasi pembersihan (unpin & archiving) file di Pinata.
 * Menggunakan static methods karena tidak memerlukan state instance.
 */
export class PinataCleanupService {
  /**
   * Unpin file dari Pinata (soft delete).
   */
  static async unpin(ipfsHash: string): Promise<PinCleanupResult> {
    try {
      // Pinata SDK v3+ syntax
      await pinata.unpin([ipfsHash]);

      logger.info(`🗑️ Successfully unpinned: ${ipfsHash}`);
      return { success: true, ipfsHash, message: 'Unpinned successfully' };
    } catch (error: any) {
      // Handle kasus: pin sudah tidak ada (404)
      if (error?.status === 404) {
        logger.warn(`⚠️ Pin already deleted: ${ipfsHash}`);
        return { success: true, ipfsHash, message: 'Already deleted' };
      }

      logger.error(`❌ Failed to unpin ${ipfsHash}`, {
        error: error.message,
        status: error?.status,
      });
      return {
        success: false,
        ipfsHash,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * (Opsional) Archive metadata sebelum delete.
   * Bisa simpan ke S3 Glacier, database archive, atau file JSON.
   */
  static async archiveMetadata(doc: {
    id: string;
    ipfsHash: string;
    fileName: string;
    ownerId: string;
    fileHash: string;
    createdAt: Date;
  }): Promise<boolean> {
    try {
      const archivePath = `./archives/orphaned/${doc.id}.json`;
      const fs = await import('fs/promises');
      const path = await import('path');

      await fs.mkdir(path.dirname(archivePath), { recursive: true });
      await fs.writeFile(
        archivePath,
        JSON.stringify(
          { ...doc, archivedAt: new Date().toISOString(), reason: 'ORPHANED_PIN_CLEANUP' },
          null,
          2
        )
      );

      logger.debug(`📦 Archived metadata: ${doc.id}`);
      return true;
    } catch (error: any) {
      logger.error(`❌ Failed to archive metadata ${doc.id}`, { error: error.message });
      return false;
    }
  }
}

// ── PinataService ─────────────────────────────────────────────────────────────
/**
 * Bertanggung jawab atas manajemen grup Pinata per-user dan upload file ke IPFS.
 */
export class PinataService {

  /**
   * Buat grup Pinata untuk user yang baru registrasi.
   * IDEMPOTENT: Jika grup sudah ada di Pinata (by name), re-associate.
   * Prevents duplicate groups during development re-registration.
   *
   * @param userId - The user's database ID
   * @param username - The user's username (for group naming)
   * @returns The Pinata group ID, or null if creation failed (non-blocking)
   */
  async createUserPinGroup(userId: string, username: string): Promise<string | null> {
    try {
      // Check if already exists (safety for retries)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { pinataGroupId: true },
      });

      if (user?.pinataGroupId) {
        return user.pinataGroupId;
      }

      const groupName = `user-${userId}-${username}`.slice(0, 50);

      // Idempotent: Check if group already exists in Pinata.
      try {
        const existingGroups = await pinata.groups.list().name(groupName).limit(1);
        const match = existingGroups?.find((g) => g.name === groupName) ?? existingGroups?.[0];

        if (match?.id) {
          await prisma.user.update({
            where: { id: userId },
            data: { pinataGroupId: match.id },
          });
          logger.info(`🔗 Re-associated existing Pinata group "${groupName}" with user ${userId}`);
          return match.id;
        }
      } catch (listError: any) {
        logger.warn('⚠️ Could not check existing Pinata groups during registration', {
          userId,
          error: listError.message,
        });
      }

      // Create new group
      const group = await pinata.groups.create({ name: groupName });

      // Save to database
      await prisma.user.update({
        where: { id: userId },
        data: { pinataGroupId: group.id },
      });

      logger.info(`📁 Created Pinata group "${groupName}" for newly registered user ${userId}`);
      return group.id;
    } catch (error: any) {
      // Non-blocking: Log but don't throw
      logger.warn('⚠️ Failed to create Pinata group during registration (non-critical)', {
        userId,
        username,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Pastikan user memiliki grup Pinata. Jika belum ada, buat atau re-associate.
   * Digunakan pada saat upload file pertama kali setelah registrasi.
   */
  async ensureUserPinGroup(userId: string, username: string): Promise<string | null> {
    try {
      // ── 1. FAST PATH: Check if user already has group in DB ─────────────
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { pinataGroupId: true },
      });

      if (user?.pinataGroupId) {
        return user.pinataGroupId;
      }

      // ── 2. Prepare group name (consistent naming convention) ────────────
      const groupName = `user-${userId}-${username}`.slice(0, 50);

      // ── 3. IDEMPOTENT CHECK: See if group already exists in Pinata ─────
      try {
        const existingGroups = await pinata.groups.list().name(groupName).limit(1);
        const match = existingGroups?.find((g) => g.name === groupName) ?? existingGroups?.[0];

        if (match?.id) {
          await prisma.user.update({
            where: { id: userId },
            data: { pinataGroupId: match.id },
          });
          logger.info(`🔗 Re-associated existing Pinata group "${groupName}" with user ${userId}`);
          return match.id;
        }
      } catch (listError: any) {
        logger.warn('⚠️ Could not check existing Pinata groups, proceeding to create new one', {
          userId,
          username,
          error: listError.message,
        });
      }

      // ── 4. CREATE: Group doesn't exist, create new one ──────────────────
      const group = await pinata.groups.create({ name: groupName });

      // ── 5. SAVE: Link group ID to user in database ──────────────────────
      await prisma.user.update({
        where: { id: userId },
        data: { pinataGroupId: group.id },
      });

      logger.info(`📁 Created Pinata group "${groupName}" for user ${userId}`);
      return group.id;
    } catch (error: any) {
      // Non-blocking: Return null so upload can proceed without group assignment
      logger.error('❌ Failed to create Pinata group:', {
        userId,
        username,
        error: error.message,
        code: error.code,
      });
      return null;
    }
  }

  /**
   * Upload file ke Pinata dengan konteks user (group, metadata).
   *
   * @param fileBuffer - The file content as Buffer
   * @param fileName - Original filename
   * @param mimeType - File MIME type
   * @param userId - User ID for organization
   * @param options - Optional folder path and custom metadata
   * @returns PinataUploadResult with IPFS hash, URL, metadata, and group info
   */
  async uploadFileWithUserContext(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    userId: string,
    options?: UploadWithUserContextOptions
  ): Promise<PinataUploadResult> {
    // Fetch minimal user info for group operations
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    // Ensure user has a group (creates one if first upload, or re-associates existing)
    const groupId = await this.ensureUserPinGroup(userId, user?.username || 'user');

    // Prepare Pinata metadata for filtering/searching via API
    const metadata = {
      name: fileName,
      keyvalues: {
        userId,
        uploadedAt: new Date().toISOString(),
        originalName: fileName,
        folderPath: options?.folderPath || 'root',
        ...options?.customMetadata,
      },
    };

    // Prepare upload options for Pinata SDK
    const uploadOptions: any = { metadata };

    // Assign to user's group if available (enables dashboard organization)
    if (groupId) {
      uploadOptions.groupId = groupId;
    }

    // Upload to Pinata using web3 SDK
    // globalThis.File is available natively in Bun and Node.js 20+ — no external package needed
    const upload = await pinata.upload.file(
      new globalThis.File([fileBuffer], fileName, { type: mimeType }),
      uploadOptions
    );

    return {
      ipfsHash: upload.IpfsHash,
      pinataUrl: `https://gateway.pinata.cloud/ipfs/${upload.IpfsHash}`,
      metadata,
      groupId,
    };
  }

  /**
   * List files for a specific user from Pinata via metadata filtering.
   * Useful for admin/debug purposes, sync verification, and audit trails.
   *
   * @param userId - The user ID to filter by
   * @param limit - Maximum number of pins to return (default: 50)
   * @returns Array of pin metadata objects
   */
  async getUserPinsFromPinata(userId: string, limit: number = 50) {
    try {
      const pins = await pinata.pins.list({
        metadata: {
          keyvalues: {
            userId: {
              value: userId,
              op: 'eq', // Exact match operator
            },
          },
        },
        limit,
      });

      return pins.results.map((pin) => ({
        ipfsHash: pin.ipfs_pin_hash,
        name: pin.metadata?.name,
        uploadedAt: pin.date_pinned,
        size: pin.size,
        metadata: pin.metadata?.keyvalues,
      }));
    } catch (error: any) {
      logger.error('❌ Failed to list user pins from Pinata:', {
        userId,
        error: error.message,
        code: error.code,
      });
      return [];
    }
  }
}

// Singleton instance
export const pinataService = new PinataService();
export default pinataService;

// ── Backward-compatible named exports ─────────────────────────────────────────
// Dipakai oleh folder.service dan document.service yang mengimport fungsi langsung.
export const createUserPinGroup = (userId: string, username: string) =>
  pinataService.createUserPinGroup(userId, username);
export const ensureUserPinGroup = (userId: string, username: string) =>
  pinataService.ensureUserPinGroup(userId, username);
export const uploadFileWithUserContext = (
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  userId: string,
  options?: UploadWithUserContextOptions
) => pinataService.uploadFileWithUserContext(fileBuffer, fileName, mimeType, userId, options);
export const getUserPinsFromPinata = (userId: string, limit?: number) =>
  pinataService.getUserPinsFromPinata(userId, limit);