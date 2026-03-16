-- CreateEnum
CREATE TYPE "AccessRoleFolder" AS ENUM ('VIEWER', 'EDITOR');

-- AlterTable
ALTER TABLE "folder_access" ADD COLUMN     "role" "AccessRoleFolder" NOT NULL DEFAULT 'VIEWER';
