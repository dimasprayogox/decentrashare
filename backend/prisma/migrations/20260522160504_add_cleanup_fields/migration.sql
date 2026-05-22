-- CreateEnum
CREATE TYPE "CleanupStatus" AS ENUM ('PENDING', 'ARCHIVED', 'DELETED', 'FAILED');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "cleanupStatus" "CleanupStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "pendingOnChainUntil" TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "folders" ALTER COLUMN "updatedAt" DROP DEFAULT;
