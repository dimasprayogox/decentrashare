// backend/src/services/pinata/pinata.service.ts
import { prisma } from '../../config/db';
import { pinata } from '../../config/pinata';
import { logger } from '../../utils/logger';

/**
 * Ensure user has a Pinata group for organizing their files.
 * 
 * IDEMPOTENT: If group already exists in Pinata (by name), re-associate it.
 * Prevents duplicate groups during development re-registration.
 * 
 * @param userId - The user's database ID
 * @param username - The user's username (for group naming)
 * @returns The Pinata group ID, or null if creation failed (non-blocking)
 */
export interface PinCleanupResult {
  success: boolean;
  ipfsHash: string;
  message?: string;
  error?: string;
}

export class PinataCleanupService {
  /**
   * Unpin file dari Pinata (soft delete)
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
        status: error?.status 
      });
      return { 
        success: false, 
        ipfsHash, 
        error: error.message || 'Unknown error' 
      };
    }
  }

  /**
   * (Opsional) Archive metadata sebelum delete
   * Bisa simpan ke S3 Glacier, database archive, atau file JSON
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
      // Contoh: simpan ke file JSON lokal (ganti dengan S3/DB production)
      const archivePath = `./archives/orphaned/${doc.id}.json`;
      const fs = await import('fs/promises');
      const path = await import('path');
      
      await fs.mkdir(path.dirname(archivePath), { recursive: true });
      await fs.writeFile(archivePath, JSON.stringify({
        ...doc,
        archivedAt: new Date().toISOString(),
        reason: 'ORPHANED_PIN_CLEANUP'
      }, null, 2));
      
      logger.debug(`📦 Archived metadata: ${doc.id}`);
      return true;
    } catch (error: any) {
      logger.error(`❌ Failed to archive metadata ${doc.id}`, { error: error.message });
      return false;
    }
  }
}

export const createUserPinGroup = async (userId: string, username: string): Promise<string | null> => {
  try {
    // Check if already exists (safety for retries)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pinataGroupId: true }
    });
    
    if (user?.pinataGroupId) {
      return user.pinataGroupId;
    }
    
    const groupName = `user-${userId}-${username}`.slice(0, 50);
    
    // Idempotent: Check if group already exists in Pinata.
    // NOTE: pinata-web3 v0.5.4 `groups.list()` takes NO args and returns a
    // plain array via a builder (`.name()`, `.limit()`), not `{ groups: [] }`.
    try {
      const existingGroups = await pinata.groups.list().name(groupName).limit(1);
      const match = existingGroups?.find(g => g.name === groupName) ?? existingGroups?.[0];

      if (match?.id) {
        await prisma.user.update({
          where: { id: userId },
          data: { pinataGroupId: match.id }
        });
        logger.info(`🔗 Re-associated existing Pinata group "${groupName}" with user ${userId}`);
        return match.id;
      }
    } catch (listError: any) {
      logger.warn('⚠️ Could not check existing Pinata groups during registration', { userId, error: listError.message });
    }
    
    // Create new group
    const group = await pinata.groups.create({ name: groupName });
    
    // Save to database
    await prisma.user.update({
      where: { id: userId },
      data: { pinataGroupId: group.id }
    });
    
    logger.info(`📁 Created Pinata group "${groupName}" for newly registered user ${userId}`);
    return group.id;
    
  } catch (error: any) {
    // Non-blocking: Log but don't throw
    logger.warn('⚠️ Failed to create Pinata group during registration (non-critical)', {
      userId,
      username,
      error: error.message
    });
    return null;
  }
};

export const ensureUserPinGroup = async (userId: string, username: string): Promise<string | null> => {
  try {
    // ── 1. FAST PATH: Check if user already has group in DB ─────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pinataGroupId: true }
    });
    
    if (user?.pinataGroupId) {
      return user.pinataGroupId;
    }
    
    // ── 2. Prepare group name (consistent naming convention) ────────────
    const groupName = `user-${userId}-${username}`.slice(0, 50);
    
    // ── 3. IDEMPOTENT CHECK: See if group already exists in Pinata ─────
    // This prevents duplicate groups when re-registering in development.
    // NOTE: pinata-web3 v0.5.4 `groups.list()` takes NO args and returns a
    // plain array via a builder (`.name()`, `.limit()`), not `{ groups: [] }`.
    try {
      const existingGroups = await pinata.groups.list().name(groupName).limit(1);
      const match = existingGroups?.find(g => g.name === groupName) ?? existingGroups?.[0];

      if (match?.id) {
        // ✅ Group exists in Pinata but not linked in DB (e.g., after hard delete)
        // Re-associate it with this user to avoid creating duplicate
        await prisma.user.update({
          where: { id: userId },
          data: { pinataGroupId: match.id }
        });
        
        logger.info(`🔗 Re-associated existing Pinata group "${groupName}" with user ${userId}`);
        return match.id;
      }
    } catch (listError: any) {
      // ⚠️ If listing groups fails, continue to create (non-critical fallback)
      logger.warn('⚠️ Could not check existing Pinata groups, proceeding to create new one', {
        userId,
        username,
        error: listError.message
      });
    }
    
    // ── 4. CREATE: Group doesn't exist, create new one ──────────────────
    const group = await pinata.groups.create({ name: groupName });
    
    // ── 5. SAVE: Link group ID to user in database ──────────────────────
    await prisma.user.update({
      where: { id: userId },
      data: { pinataGroupId: group.id }
    });
    
    logger.info(`📁 Created Pinata group "${groupName}" for user ${userId}`);
    return group.id;
    
  } catch (error: any) {
    // ❌ Non-blocking: Return null so upload can proceed without group assignment
    logger.error('❌ Failed to create Pinata group:', { 
      userId, 
      username, 
      error: error.message,
      code: error.code 
    });
    return null;
  }
};

/**
 * Options for uploading files with user context.
 */
export interface UploadWithUserContextOptions {
  folderPath?: string;           // e.g., "documents", "images", "folders/{folderId}"
  customMetadata?: Record<string, any>;  // Additional key-value metadata
}

/**
 * Result of uploading a file with user context.
 */
export interface PinataUploadResult {
  ipfsHash: string;              // The IPFS CID of the uploaded file
  pinataUrl: string;             // Gateway URL for accessing the file
  metadata: {
    name: string;                // Original filename
    keyvalues: Record<string, any>;  // Custom metadata for filtering
  };
  groupId: string | null;        // Pinata group ID the file was assigned to
}

/**
 * Upload file to Pinata with user-specific organization.
 * 
 * Features:
 * - Assigns to user's Pinata group (if exists/created)
 * - Adds structured metadata for programmatic filtering
 * - Uses consistent naming for dashboard browsing
 * 
 * @param fileBuffer - The file content as Buffer
 * @param fileName - Original filename
 * @param mimeType - File MIME type
 * @param userId - User ID for organization
 * @param options - Optional folder path and custom metadata
 * @returns PinataUploadResult with IPFS hash, URL, metadata, and group info
 */
export const uploadFileWithUserContext = async (
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  userId: string,
  options?: UploadWithUserContextOptions
): Promise<PinataUploadResult> => {
  // Fetch minimal user info for group operations
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true }
  });
  
  // Ensure user has a group (creates one if first upload, or re-associates existing)
  const groupId = await ensureUserPinGroup(userId, user?.username || 'user');
  
  // Prepare Pinata metadata for filtering/searching via API
  const metadata = {
    name: fileName,
    keyvalues: {
      userId,                                    // Primary filter: which user owns this
      uploadedAt: new Date().toISOString(),      // When was it uploaded
      originalName: fileName,                    // Original filename for display
      folderPath: options?.folderPath || 'root', // Logical folder path for organization
      ...options?.customMetadata                 // Merge any additional custom metadata
    }
  };
  
  // Prepare upload options for Pinata SDK
  const uploadOptions: any = {
    metadata: metadata
  };
  
  // Assign to user's group if available (enables dashboard organization)
  if (groupId) {
    uploadOptions.groupId = groupId;
  }
  
  // Upload to Pinata using web3 SDK
  const upload = await pinata.upload.file(
    new File([fileBuffer], fileName, { type: mimeType }),
    uploadOptions
  );
  
  return {
    ipfsHash: upload.IpfsHash,
    pinataUrl: `https://gateway.pinata.cloud/ipfs/${upload.IpfsHash}`,
    metadata: metadata,
    groupId: groupId
  };
};

/**
 * List files for a specific user from Pinata via metadata filtering.
 * 
 * Useful for:
 * - Admin/debug purposes
 * - Sync verification
 * - Audit trails
 * 
 * @param userId - The user ID to filter by
 * @param limit - Maximum number of pins to return (default: 50)
 * @returns Array of pin metadata objects
 */
export const getUserPinsFromPinata = async (userId: string, limit: number = 50) => {
  try {
    const pins = await pinata.pins.list({
      metadata: {
        keyvalues: {
          userId: {
            value: userId,
            op: 'eq'  // Exact match operator
          }
        }
      },
      limit: limit
    });
    
    return pins.results.map(pin => ({
      ipfsHash: pin.ipfs_pin_hash,
      name: pin.metadata?.name,
      uploadedAt: pin.date_pinned,
      size: pin.size,
      metadata: pin.metadata?.keyvalues,
      // Optional: include group info if needed
      // groupId: pin.group_id
    }));
    
  } catch (error: any) {
    logger.error('❌ Failed to list user pins from Pinata:', { 
      userId, 
      error: error.message,
      code: error.code 
    });
    return [];
  }
};