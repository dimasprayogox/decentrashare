/*
  Warnings:

  - You are about to drop the column `fileHash` on the `activity_logs` table. All the data in the column will be lost.
  - You are about to drop the column `ipfsHash` on the `activity_logs` table. All the data in the column will be lost.
  - You are about to alter the column `action` on the `activity_logs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `entityType` on the `activity_logs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `entityName` on the `activity_logs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `blockchainTx` on the `activity_logs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(66)`.
  - You are about to alter the column `details` on the `activity_logs` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(1000)`.
  - You are about to drop the column `cleanupStatus` on the `documents` table. All the data in the column will be lost.
  - You are about to drop the column `pendingOnChainUntil` on the `documents` table. All the data in the column will be lost.
  - You are about to alter the column `title` on the `documents` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(150)`.
  - You are about to alter the column `description` on the `documents` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(1000)`.
  - You are about to alter the column `fileName` on the `documents` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `mimeType` on the `documents` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `ipfsHash` on the `documents` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `fileHash` on the `documents` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(64)`.
  - You are about to alter the column `blockchainTx` on the `documents` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(66)`.
  - You are about to alter the column `name` on the `folders` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `shareToken` on the `folders` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to drop the column `isRegistered` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `lastActive` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `preferences` on the `users` table. All the data in the column will be lost.
  - You are about to alter the column `walletAddress` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(42)`.
  - You are about to alter the column `nonce` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `username` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `avatarUrl` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `email` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `bio` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `website` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `pinataGroupId` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.

*/
-- AlterTable
ALTER TABLE "activity_logs" DROP COLUMN "fileHash",
DROP COLUMN "ipfsHash",
ALTER COLUMN "action" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "entityType" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "entityName" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "blockchainTx" SET DATA TYPE VARCHAR(66),
ALTER COLUMN "details" SET DATA TYPE VARCHAR(10000);

-- AlterTable
ALTER TABLE "documents" DROP COLUMN "cleanupStatus",
DROP COLUMN "pendingOnChainUntil",
ALTER COLUMN "title" SET DATA TYPE VARCHAR(150),
ALTER COLUMN "description" SET DATA TYPE VARCHAR(10000),
ALTER COLUMN "fileName" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "mimeType" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "ipfsHash" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "fileHash" SET DATA TYPE VARCHAR(64),
ALTER COLUMN "blockchainTx" SET DATA TYPE VARCHAR(66);

-- AlterTable
ALTER TABLE "folders" ALTER COLUMN "name" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "shareToken" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "users" DROP COLUMN "isRegistered",
DROP COLUMN "lastActive",
DROP COLUMN "preferences",
ALTER COLUMN "walletAddress" SET DATA TYPE VARCHAR(42),
ALTER COLUMN "nonce" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "username" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "avatarUrl" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "bio" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "website" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "pinataGroupId" SET DATA TYPE VARCHAR(100);

-- DropEnum
DROP TYPE "CleanupStatus";
