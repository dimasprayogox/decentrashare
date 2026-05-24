// src/lib/services/web3/blockchain.ts
import { ethers, type ContractInterface } from "ethers";
import type { BlockchainRecordData, BatchBlockchainPayload } from "$lib/types/storage";

// ── Helper: Switch to Sepolia Network ───────────────────────
async function switchToSepolia() {
  const sepolia = {
    chainId: "0xaa36a7",
    chainName: "Sepolia Test Network",
    nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.sepolia.org"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"]
  };
  
  try {
    await window.ethereum.request({ 
      method: "wallet_switchEthereumChain", 
      params: [{ chainId: sepolia.chainId }] 
    });
  } catch (e: any) {
    if (e.code === 4902) {
      await window.ethereum.request({ 
        method: "wallet_addEthereumChain", 
        params: [sepolia] 
      });
    } else {
      console.error('[Web3] Network switch failed:', e);
      throw e;
    }
  }
}

// ── Single File: recordFileOnChain (existing) ───────────────
export async function recordFileOnChain(
  data: BlockchainRecordData,
  callbacks?: {
    onStatus?: (status: string) => void;
    onTxHash?: (txHash: string) => void;
  }
) {
  if (!window.ethereum) throw new Error("Wallet not detected. Install MetaMask/Rabby.");

  const provider = new ethers.BrowserProvider(window.ethereum);
  
  // ✅ Pastikan jaringan Sepolia
  const network = await provider.getNetwork();
  if (network.chainId !== 11155111n) {
    await switchToSepolia();
  }

  const signer = await provider.getSigner();
  const userAddress = await signer.getAddress();
  
  console.log('[Web3] Recording to blockchain:', { 
    cid: data.cid.slice(0, 10) + '...', 
    user: userAddress 
  });

  const contract = new ethers.Contract(data.contractAddress, data.abi as ContractInterface, signer);

  // Estimasi gas + buffer 20%
  let gasLimit: bigint;
  try {
    const estimated = await contract.recordFile.estimateGas(...data.args);
    gasLimit = (estimated * 120n) / 100n;
    console.log('[Web3] Estimated gas:', estimated.toString(), 'with buffer:', gasLimit.toString());
  } catch (err) {
    console.warn('[Web3] Gas estimation failed, using fallback');
    gasLimit = 300000n;
  }

  try {
    if (callbacks?.onStatus) callbacks.onStatus('🔐 Menunggu konfirmasi wallet...');
    
    const tx = await contract.recordFile(...data.args, { gasLimit });
    
    if (callbacks?.onTxHash) callbacks.onTxHash(tx.hash);
    if (callbacks?.onStatus) callbacks.onStatus('⛓️ TX terkirim, menunggu konfirmasi...');
    
    console.log('[Web3] TX sent:', tx.hash);
    
    // Wait with timeout
    const receipt = await Promise.race([
      tx.wait(1),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TX_CONFIRMATION_TIMEOUT')), 120000)
      )
    ]) as ethers.TransactionReceipt;
    
    console.log('[Web3] Confirmed:', { 
      txHash: receipt.hash, 
      block: receipt.blockNumber,
      gasUsed: receipt.gasUsed?.toString()
    });
    
    if (receipt.status !== 1) {
      throw new Error('TRANSACTION_FAILED_ON_CHAIN');
    }
    
    if (callbacks?.onStatus) callbacks.onStatus('✅ Confirmed!');
    
    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      success: true,
      gasUsed: receipt.gasUsed?.toString()
    };
    
  } catch (error: any) {
    // Specific error handling
    if (error.code === 4001 || error.message?.includes('rejected')) {
      throw new Error('TRANSACTION_REJECTED');
    }
    if (error.code === -32603 || error.message?.includes('insufficient funds')) {
      throw new Error('INSUFFICIENT_FUNDS');
    }
    if (error.code === 4902 || error.message?.includes('unrecognized chain')) {
      throw new Error('WRONG_NETWORK');
    }
    if (error.message?.includes('execution reverted')) {
      throw new Error(`CONTRACT_ERROR: ${error.reason || error.message}`);
    }
    if (error.message === 'TX_CONFIRMATION_TIMEOUT') {
      throw new Error('TX_CONFIRMATION_TIMEOUT');
    }
    
    console.error('[Web3] Unexpected error:', error);
    throw new Error(`BLOCKCHAIN_ERROR: ${error.message || 'Unknown error'}`);
  }
}

// ── ✅ NEW: Batch Files: recordFilesBatchOnChain ─────────────
export async function recordFilesBatchOnChain(
  payload: BatchBlockchainPayload,
  callbacks?: {
    onStatus?: (status: string) => void;
    onTxHash?: (txHash: string) => void;
  }
) {
  if (!window.ethereum) throw new Error('Wallet not detected. Install MetaMask/Rabby.');

  const provider = new ethers.BrowserProvider(window.ethereum);
  
  // ✅ Pastikan jaringan Sepolia
  const network = await provider.getNetwork();
  if (network.chainId !== 11155111n) {
    await switchToSepolia();
  }

  const signer = await provider.getSigner();
  
  console.log('[Web3] Recording batch to blockchain:', { 
    fileCount: payload.items.length,
    user: await signer.getAddress()
  });

  const contract = new ethers.Contract(
    payload.contractAddress, 
    payload.abi as ContractInterface, 
    signer
  );

  // Estimasi gas + buffer 20%
  let gasLimit: bigint;
  try {
    const estimated = await contract[payload.functionName].estimateGas(...payload.args);
    gasLimit = (estimated * 120n) / 100n;
    console.log('[Web3] Estimated gas:', estimated.toString(), 'with buffer:', gasLimit.toString());
  } catch (err) {
    console.warn('[Web3] Batch gas estimation failed, using fallback');
    // Fallback: ~200k gas per file, max 10 files
    gasLimit = 200000n * BigInt(Math.min(payload.items.length, 10));
  }

  try {
    if (callbacks?.onStatus) callbacks.onStatus('🔐 Confirm batch in wallet...');
    
    // ✅ Send SINGLE transaction untuk semua file
    // Spread args: [cids[], names[], hashes[]] → recordFilesBatch(cids, names, hashes)
    const tx = await contract[payload.functionName](...payload.args, { gasLimit });
    
    if (callbacks?.onTxHash) callbacks.onTxHash(tx.hash);
    if (callbacks?.onStatus) callbacks.onStatus('⛓️ TX sent, waiting for confirmation...');
    
    console.log('[Web3] Batch TX sent:', tx.hash);
    
    // Wait with timeout (lebih lama untuk batch)
    const receipt = await Promise.race([
      tx.wait(1),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TX_CONFIRMATION_TIMEOUT')), 180000) // 3 min
      )
    ]) as ethers.TransactionReceipt;
    
    console.log('[Web3] Batch confirmed:', { 
      txHash: receipt.hash, 
      block: receipt.blockNumber,
      gasUsed: receipt.gasUsed?.toString()
    });
    
    if (receipt.status !== 1) {
      throw new Error('TRANSACTION_FAILED_ON_CHAIN');
    }
    
    if (callbacks?.onStatus) callbacks.onStatus('✅ Batch confirmed!');
    
    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      success: true,
      gasUsed: receipt.gasUsed?.toString(),
      fileCount: payload.items.length
    };
    
  } catch (error: any) {
    // Specific error handling
    if (error.code === 4001 || error.message?.includes('rejected')) {
      throw new Error('TRANSACTION_REJECTED');
    }
    if (error.code === -32603 || error.message?.includes('insufficient funds')) {
      throw new Error('INSUFFICIENT_FUNDS');
    }
    if (error.code === 4902 || error.message?.includes('unrecognized chain')) {
      throw new Error('WRONG_NETWORK');
    }
    if (error.message?.includes('execution reverted')) {
      throw new Error(`CONTRACT_ERROR: ${error.reason || error.message}`);
    }
    if (error.message === 'TX_CONFIRMATION_TIMEOUT') {
      throw new Error('TX_CONFIRMATION_TIMEOUT');
    }
    
    console.error('[Web3] Batch unexpected error:', error);
    throw new Error(`BLOCKCHAIN_ERROR: ${error.message || 'Unknown error'}`);
  }
}