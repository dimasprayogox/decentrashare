-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ipfsRootCid" TEXT,
ADD COLUMN     "pinataGroupId" TEXT,
ALTER COLUMN "username" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;
