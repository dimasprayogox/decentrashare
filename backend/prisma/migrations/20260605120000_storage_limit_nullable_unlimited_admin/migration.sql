-- AlterTable: storageLimit menjadi nullable (NULL = unlimited)
ALTER TABLE "users" ALTER COLUMN "storageLimit" DROP NOT NULL;

-- Set semua ADMIN yang sudah ada menjadi unlimited (NULL)
UPDATE "users" SET "storageLimit" = NULL WHERE "role" = 'ADMIN';
