// src/services/blockchain.service.ts
import { ethers } from 'ethers';
import DecentraShareABI from '../../abis/DecentraShare.json';
import { config } from '../../config/env';

export interface BlockchainRecordData {
  cid: string;
  fileName: string;
  fileHash: string;
  contractAddress: string;
  abi: any;
  functionName: string;
  args: [string, string, string];
}

// ✅ NEW: Interface untuk batch payload ke frontend
export interface BatchBlockchainPayload {
  contractAddress: string;
  abi: any;
  functionName: string;
  args: [string[], string[], string[]]; // [cids, fileNames, fileHashes]
  items: Array<{ cid: string; fileName: string; fileHash: string }>; // Untuk referensi frontend
  documentIds?: string[]; // Optional: untuk update DB setelah tx sukses
}

class BlockchainService {
  private provider: ethers.JsonRpcProvider;
  private contractAddress: string;
  private abi: any;

  constructor() {
    const rpcUrl = process.env.RPC_URL ?? config.blockchain.ganacheUrl;
    const contractAddress = process.env.CONTRACT_ADDRESS ?? config.blockchain.contractAddress;

    if (!contractAddress) {
      throw new Error('Missing CONTRACT_ADDRESS in environment variables.');
    }

    // ✅ Hanya pakai provider (read-only), TANPA wallet/private key
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contractAddress = contractAddress;
    this.abi = DecentraShareABI.abi;
  }

  /**
   * ✅ Siapkan data untuk frontend sign TX (single file)
   */
  prepareTransactionData(cid: string, fileName: string, fileHash: string): BlockchainRecordData {
    return {
      cid,
      fileName,
      fileHash,
      contractAddress: this.contractAddress,
      abi: this.abi,
      functionName: 'recordFile',
      args: [cid, fileName, fileHash]
    };
  }

  /**
   * ✅ ✅ ✅ FUNGSI BARU: Siapkan batch data untuk frontend sign TX
   * Format: parallel arrays [cids[], fileNames[], fileHashes[]]
   * Agar frontend bisa langsung panggil: contract.recordFilesBatch(cids, names, hashes)
   */
  prepareBatchTransactionData(
    items: Array<{ cid: string; fileName: string; fileHash: string; documentId?: string }>
  ): BatchBlockchainPayload {
    // ✅ Pisahkan menjadi 3 parallel arrays (sesuai signature contract)
    const cids = items.map(item => item.cid);
    const fileNames = items.map(item => item.fileName);
    const fileHashes = items.map(item => item.fileHash);
    
    // ✅ Optional: kumpulkan documentIds untuk update DB setelah tx sukses
    const documentIds = items
      .filter(item => item.documentId)
      .map(item => item.documentId!);

    return {
      contractAddress: this.contractAddress,
      abi: this.abi,
      functionName: 'recordFilesBatch', // ← ⚙️ Sesuaikan jika nama fungsi di contract berbeda
      args: [cids, fileNames, fileHashes], // ← ✅ Format: [string[], string[], string[]]
      items, // ← Untuk referensi/debugging di frontend
      ...(documentIds.length > 0 && { documentIds }) // ← Optional, hanya jika ada documentId
    };
  }

  /**
   * ✅ Verifikasi TX hash sudah confirmed di blockchain
   */
  async verifyTransaction(txHash: string): Promise<{ confirmed: boolean; blockNumber?: number }> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt) return { confirmed: false };
      return { confirmed: receipt.status === 1, blockNumber: receipt.blockNumber };
    } catch {
      return { confirmed: false };
    }
  }

  /**
   * ✅ Baca data file dari kontrak (view function)
   */
  async getFileRecord(fileHash: string): Promise<any | null> {
    try {
      const contract = new ethers.Contract(this.contractAddress, this.abi, this.provider);
      // Sesuaikan dengan signature fungsi view di kontrak Anda
      const record = await contract.getFileByHash?.(fileHash);
      return record || null;
    } catch {
      return null;
    }
  }

  /**
   * ✅ Estimasi gas (opsional, bisa dipanggil frontend juga)
   */
  async estimateGas(cid: string, fileName: string, fileHash: string): Promise<bigint> {
    const contract = new ethers.Contract(this.contractAddress, this.abi, this.provider);
    try {
      return await contract.recordFile.estimateGas(cid, fileName, fileHash);
    } catch {
      // Fallback ke estimasi manual jika estimateGas gagal
      return 200000n; // ~200k gas units sebagai fallback
    }
  }

  /**
   * ✅ Estimasi gas untuk batch (opsional)
   */
  async estimateBatchGas(items: Array<{ cid: string; fileName: string; fileHash: string }>): Promise<bigint> {
    const contract = new ethers.Contract(this.contractAddress, this.abi, this.provider);
    
    const cids = items.map(i => i.cid);
    const fileNames = items.map(i => i.fileName);
    const fileHashes = items.map(i => i.fileHash);
    
    try {
      // ⚙️ Sesuaikan nama fungsi jika berbeda
      return await contract.recordFilesBatch.estimateGas(cids, fileNames, fileHashes);
    } catch {
      // Fallback: estimasi ~200k gas per file, max 10 files = 2M gas
      const estimated = 200000n * BigInt(Math.min(items.length, 10));
      return estimated;
    }
  }
}

export default new BlockchainService();