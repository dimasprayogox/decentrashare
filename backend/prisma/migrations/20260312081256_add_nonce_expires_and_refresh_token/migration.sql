-- DropIndex
DROP INDEX "users_email_key";

-- DropIndex
DROP INDEX "users_username_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "nonceExpiresAt" TIMESTAMP(3),
ADD COLUMN     "refreshToken" TEXT,
ALTER COLUMN "nonce" DROP NOT NULL;
