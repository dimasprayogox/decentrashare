// src/services/blockchain.service.ts
import { ethers } from 'ethers';
import DecentraShareABI from '../../abis/DecentraShare.json';
import { config } from '../../config/env';
import { logger } from '../../utils/logger'; // ✅ Import logger

export interface BlockchainRecordData {
  cid: string;
  fileName: string;
  fileHash: string;
  contractAddress: string;
  abi: any;
  functionName: string;
  args: [string, string, string];
}

export interface BatchBlockchainPayload {
  contractAddress: string;
  abi: any;
  functionName: string;
  args: [string[], string[], string[]];
  items: Array<{ cid: string; fileName: string; fileHash: string }>;
  documentIds?: string[];
}

class BlockchainService {
  private provider: ethers.JsonRpcProvider;
  private contractAddress: string;
  private abi: any;

  constructor() {
    const rpcUrl = process.env.RPC_URL ?? config.blockchain.ganacheUrl;
    const contractAddress = process.env.CONTRACT_ADDRESS ?? "0xa56DE256D4AfD0CdF9860FccD281147B67F6ae85";

    if (!contractAddress) {
      throw new Error('Missing CONTRACT_ADDRESS in environment variables.');
    }

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
   * ✅ Siapkan batch data untuk frontend sign TX (parallel arrays)
   */
  prepareBatchTransactionData(
    items: Array<{ 
      cid: string; 
      fileName: string; 
      fileHash: string; 
      fileSize?: number | string; 
      timestamp?: number | string; 
      documentId?: string 
    }>
  ): BatchBlockchainPayload {
    const cids = items.map(item => item.cid);
    const fileNames = items.map(item => item.fileName);
    const fileHashes = items.map(item => item.fileHash);

    const documentIds = items
      .filter(item => item.documentId)
      .map(item => item.documentId!);

    const safeItems = items.map(item => ({
      cid: item.cid,
      fileName: item.fileName,
      fileHash: item.fileHash,
      ...(item.fileSize && { fileSize: String(item.fileSize) }),
      ...(item.timestamp && { timestamp: String(item.timestamp) })
    }));

    return {
      contractAddress: this.contractAddress,
      abi: this.abi,
      functionName: 'recordFilesBatch',
      args: [cids, fileNames, fileHashes],
      items: safeItems,
      ...(documentIds.length > 0 && { documentIds })
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
      const record = await contract.filesByIPFS(fileHash); // ✅ Sesuai contract Anda
      return record || null;
    } catch {
      return null;
    }
  }

  /**
   * ✅ Estimasi gas (opsional)
   */
  async estimateGas(cid: string, fileName: string, fileHash: string): Promise<bigint> {
    const contract = new ethers.Contract(this.contractAddress, this.abi, this.provider);
    try {
      return await contract.recordFile.estimateGas(cid, fileName, fileHash);
    } catch {
      return 200000n;
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
      return await contract.recordFilesBatch.estimateGas(cids, fileNames, fileHashes);
    } catch {
      const estimated = 200000n * BigInt(Math.min(items.length, 10));
      return estimated;
    }
  }

  async checkFileExistsOnChain(fileHash: string): Promise<boolean> {
    const contract = new ethers.Contract(this.contractAddress, this.abi, this.provider);
    const normalizedHash = fileHash.trim().toLowerCase();

    try {
      return Boolean(await contract.checkFileExists(normalizedHash));
    } catch (error) {
      logger.warn('[Blockchain] checkFileExists failed, falling back to isFileExists getter', {
        fileHash: normalizedHash,
        error: error instanceof Error ? error.message : 'unknown'
      });
      return Boolean(await contract.isFileExists(normalizedHash));
    }
  }

  async checkFilesExistOnChain(fileHashes: string[]) {
    const uniqueHashes = [...new Set(fileHashes.map(hash => hash.trim().toLowerCase()))];
    const results = await Promise.all(uniqueHashes.map(async (hash) => {
      try {
        return { hash, existsOnChain: await this.checkFileExistsOnChain(hash) };
      } catch (error) {
        logger.warn('[Blockchain] Failed to check file hash on-chain', {
          fileHash: hash,
          error: error instanceof Error ? error.message : 'unknown'
        });
        return { hash, existsOnChain: false, error: 'Unable to check blockchain status' };
      }
    }));

    return results;
  }

  /**
   * ✅ NEW: Filter files that are already on-chain before preparing batch
   */
  async filterNewFilesForBatch(
    items: Array<{ cid: string; fileName: string; fileHash: string; documentId?: string }>,
    contractAddress?: string
  ) {
    const rpcUrl = process.env.RPC_URL ?? config.blockchain.ganacheUrl;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const abi = DecentraShareABI.abi;
    
    const contract = new ethers.Contract(
      contractAddress || this.contractAddress,
      abi,
      provider
    );

    const newItems = [];
    
    for (const item of items) {
      try {
        // ✅ Check if fileHash already exists on-chain
        const exists = await contract.checkFileExists(item.fileHash);
        
        if (!exists) {
          // ✅ Also check if CID already has an owner
          const record = await contract.filesByIPFS(item.cid);
          if (record.owner === ethers.ZeroAddress) {
            newItems.push(item);
          }
        }
        // If exists, skip this item (already on-chain)
        
      } catch (err) {
        // If check fails, include item anyway (fail-safe)
        logger.warn('[Blockchain] Failed to check on-chain status, including item', {
          fileHash: item.fileHash,
          error: err instanceof Error ? err.message : 'unknown'
        });
        newItems.push(item);
      }
    }

    return {
      newItems,
      skippedCount: items.length - newItems.length,
      message: `Filtered: ${newItems.length} new, ${items.length - newItems.length} already on-chain`
    };
  }
} // ✅ ← TUTUP CLASS DI SINI

export default new BlockchainService(); // ✅ ← EXPORT DEFAULT DI SINI (PALING BAWAH)