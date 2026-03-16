import { prisma } from '../../config/db';
import { pinata } from '../../config/pinata';
import { logger } from '../../utils/logger';

/**
 * Mencari user berdasarkan username untuk keperluan sharing
 */
export const searchUsers = async (query: string, currentUserId: string) => {
  return await prisma.user.findMany({
    where: {
      username: {
        contains: query,
        mode: 'insensitive', 
      },
      id: { not: currentUserId }, // Supaya Bos tidak berbagi ke diri sendiri
    },
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      walletAddress: true,
    },
    take: 10, // Batasi 10 hasil saja biar ringan
  });
};