/*
  Warnings:

  - Made the column `username` on table `users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `email` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "lastActive" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "preferences" JSONB DEFAULT '{}',
ADD COLUMN     "website" TEXT,
ALTER COLUMN "username" SET NOT NULL,
ALTER COLUMN "email" SET NOT NULL;
