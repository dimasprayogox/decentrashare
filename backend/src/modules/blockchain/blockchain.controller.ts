import { Request, Response } from "express";
import { generateFileHash } from "../../utils/hash.util";
import ipfsService from "../../services/ipfs.service";
import blockchainService from "./blockchain.service.js";
// import fileModel from "../models/file.model"; // Jika pakai PostgreSQL

export const uploadFile = async (req: Request, res: Response) => {
    try {
        const file = req.file; // Asumsi pakai Multer
        if (!file) return res.status(400).json({ message: "File tidak ada" });

        // 1. HITUNG SHA-256 (Integritas)
        const fileHash = await generateFileHash(file.path);

        // 2. UPLOAD KE IPFS (Penyimpanan)
        const ipfsResult = await ipfsService.upload(file.path); 
        const ipfsHash = ipfsResult.IpfsHash;

        // 3. CATAT KE BLOCKCHAIN (Kepemilikan)
        const txHash = await blockchainService.recordToBlockchain(
            ipfsHash, 
            file.originalname, 
            fileHash
        );

        // 4. SIMPAN METADATA KE POSTGRESQL (Manajemen)
        // const newFile = await fileModel.create({ ... });

        return res.status(201).json({
            message: "File Berhasil Terdesentralisasi!",
            data: {
                fileName: file.originalname,
                cid: ipfsHash,
                sha256: fileHash,
                blockchainTx: txHash
            }
        });

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};