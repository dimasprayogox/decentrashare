-- AlterTable
ALTER TABLE "documents" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "folders" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ✅ Sync data lama biar updatedAt = createdAt (biar historis rapi)
UPDATE "documents" SET "updatedAt" = "createdAt";
UPDATE "folders" SET "updatedAt" = "createdAt";