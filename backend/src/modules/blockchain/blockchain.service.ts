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
   * ✅ FUNGSI BARU: Siapkan data untuk frontend sign TX
   * Frontend yang akan pakai data ini untuk panggil contract via wallet user
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
      const record = await contract.getFileByHash(fileHash);
      return record;
    } catch {
      return null;
    }
  }

  /**
   * ✅ Estimasi gas (opsional, bisa dipanggil frontend juga)
   */
  async estimateGas(cid: string, fileName: string, fileHash: string): Promise<bigint> {
    const contract = new ethers.Contract(this.contractAddress, this.abi, this.provider);
    // Estimasi tanpa signer hanya untuk referensi
    try {
      return await contract.recordFile.estimateGas(cid, fileName, fileHash);
    } catch {
      // Fallback ke estimasi manual jika estimateGas gagal
      return ethers.parseUnits("0.002", "ether"); // ~200k gas * 10 gwei
    }
  }
}

export default new BlockchainService();