/*
  Warnings:

  - A unique constraint covering the columns `[shareToken]` on the table `folders` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "folders" ADD COLUMN     "privacy" "PrivacyLevel" NOT NULL DEFAULT 'PRIVATE',
ADD COLUMN     "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "folders_shareToken_key" ON "folders"("shareToken");
