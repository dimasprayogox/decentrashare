// src/controllers/document.controller.ts
import { Request, Response } from "express";
import { generateFileHash } from "../../utils/hash.util";
import ipfsService from "../../services/ipfs.service";
import blockchainService from "./blockchain.service";
import { prisma } from "../../lib/prisma"; // sesuaikan import prisma Anda

export const uploadFile = async (req: Request, res: Response) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ message: "File tidak ada" });

        // 1. HITUNG SHA-256 (Integritas)
        const fileHash = await generateFileHash(file.path);

        // 2. UPLOAD KE IPFS (Penyimpanan)
        const ipfsResult = await ipfsService.upload(file.path); 
        const ipfsHash = ipfsResult.IpfsHash;

        // 3. ✅ SIAPKAN DATA BLOCKCHAIN UNTUK FRONTEND (JANGAN EKSEKUSI DI SINI!)
        const blockchainData = blockchainService.prepareTransactionData(
            ipfsHash, 
            file.originalname, 
            fileHash
        );

        // 4. SIMPAN METADATA KE POSTGRESQL (isOnChain = false dulu)
        const newDocument = await prisma.document.create({
            data: {
                fileName: file.originalname,
                title: file.originalname, // atau format sesuai kebutuhan
                description: null,
                fileSize: file.size,
                mimeType: file.mimetype,
                ipfsHash: ipfsHash,
                fileHash: fileHash,
                blockchainTx: null,        // ← null dulu, tunggu dari frontend
                isOnChain: false,          // ← false dulu
                ownerId: req.user?.userId, // sesuaikan dengan auth middleware Anda
                folderId: null,
                privacy: 'PRIVATE',
            },
        });

        // 5. ✅ KEMBALIKAN RESPONSE + DATA UNTUK FRONTEND SIGN TX
        return res.status(201).json({
            message: "File uploaded to IPFS. Please confirm blockchain transaction in your wallet.",
            data: {
                id: newDocument.id,
                fileName: file.originalname,
                cid: ipfsHash,
                sha256: fileHash,
                isOnChain: false,
                // ✅ Data ini yang akan frontend pakai untuk panggil contract
                blockchainData: blockchainData
            }
        });

    } catch (error: any) {
        console.error("Upload error:", error);
        res.status(500).json({ 
            error: error.message,
            message: "Failed to process upload"
        });
    }
};
// ── 4. SIAPKAN DATA BLOCKCHAIN UNTUK FRONTEND (JANGAN EKSEKUSI DI SINI) ──
const blockchainData = blockchainService.prepareTransactionData(
  upload.IpfsHash,
  file.originalname,
  fileHash
);

// ── 5. SIMPAN KE DATABASE DENGAN STATUS isOnChain: false ──
const newDocument = await prisma.$transaction(async (tx) => {
  const doc = await tx.document.create({
    data: {
      fileName: file.originalname,
      title: finalTitle,
      description: finalDescription,
      fileSize: file.size,
      mimeType: file.mimetype,
      ipfsHash: upload.IpfsHash,
      fileHash,
      // ❌ JANGAN isi blockchainTx dulu, tunggu dari frontend
      blockchainTx: null,  // ← null dulu
      isOnChain: false,    // ← false dulu
      ownerId: userId,
      folderId: folderId || null,
      privacy: targetPrivacy,
    },
  });
  // ... activity log ...
  return doc;
});

// ── 6. KEMBALIKAN RESPONSE + DATA UNTUK FRONTEND SIGN ──
results.push({ 
  success: true, 
  fileName: file.originalname, 
  data: newDocument,
  blockchainData,  // ← ✅ Frontend akan pakai ini untuk panggil contract
  pinataInfo: {
    groupId: userGroupId,
    ipfsHash: upload.IpfsHash
  }
});