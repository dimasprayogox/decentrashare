import { ethers } from 'ethers';
import DecentraShareABI from '../../abis/DecentraShare.json';
import { config } from '../../config/env';

class BlockchainService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;

  constructor() {
    const rpcUrl = process.env.GANACHE_URL ?? config.blockchain.ganacheUrl;
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
    const contractAddress = process.env.CONTRACT_ADDRESS ?? config.blockchain.contractAddress;

    if (!privateKey) {
      throw new Error('Missing DEPLOYER_PRIVATE_KEY (or PRIVATE_KEY) in environment variables.');
    }
    if (!contractAddress) {
      throw new Error('Missing CONTRACT_ADDRESS in environment variables.');
    }

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.contract = new ethers.Contract(contractAddress, DecentraShareABI.abi, this.wallet);
  }

  async recordToBlockchain(ipfsHash: string, fileName: string, fileHash: string): Promise<string> {
    const tx = await this.contract.recordFile(ipfsHash, fileName, fileHash);
    await tx.wait();
    return tx.hash;
  }
}

export default new BlockchainService();