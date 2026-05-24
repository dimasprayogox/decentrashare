// src/lib/services/web3/blockchain.ts
import { ethers, type ContractInterface, Interface } from "ethers";
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

// ── Helper: Validate Batch Payload ──────────────────────────
function validateBatchPayload(payload: BatchBlockchainPayload): void {
  const [arg1, arg2, arg3] = payload.args;
  
  // Check if args is array of arrays (parallel arrays format)
  if (Array.isArray(arg1) && Array.isArray(arg2) && Array.isArray(arg3)) {
    const [cids, fileNames, fileHashes] = payload.args as [string[], string[], string[]];
    
    if (cids.length === 0) {
      throw new Error('Empty batch: no files to confirm');
    }
    if (cids.length !== fileNames.length || cids.length !== fileHashes.length) {
      throw new Error(`Array length mismatch: cids=${cids.length}, names=${fileNames.length}, hashes=${fileHashes.length}`);
    }
    if (cids.length > 50) {
      throw new Error(`Batch too large: ${cids.length} files (max 50 for gas safety)`);
    }
    
    // Validate CID format (basic check)
    cids.forEach((cid, i) => {
      if (!cid || cid.length < 10 || !cid.startsWith('Qm')) {
        console.warn(`[Web3] Suspicious CID at index ${i}:`, cid?.slice(0, 30));
      }
    });
  }
  // If single arg (struct array format), just check it's not empty
  else if (Array.isArray(arg1) && payload.args.length === 1) {
    const records = payload.args[0] as any[];
    if (records.length === 0) {
      throw new Error('Empty batch: no records to confirm');
    }
    if (records.length > 50) {
      throw new Error(`Batch too large: ${records.length} records (max 50)`);
    }
  }
  else {
    throw new Error(`Invalid payload format: expected parallel arrays or single struct array`);
  }
}

// ── Helper: Extract Revert Reason from Error ────────────────
function extractRevertReason(error: any, abi: ContractInterface, functionName: string): string {
  // ethers v6: check various error properties
  if (error.revert?.reason) return error.revert.reason;
  if (error.reason && error.reason !== 'unknown error') return error.reason;
  
  // Try decode from error data
  if (error.data?.data) {
    try {
      const iface = new Interface(abi as any);
      const decoded = iface.parseError(error.data.data);
      if (decoded?.name) return decoded.name;
    } catch (e) {
      // Decode failed, fallback to raw message
    }
  }
  
  // Check error message for common patterns
  const msg = error.message?.toLowerCase() || '';
  if (msg.includes('length') || msg.includes('array')) return 'Array length mismatch';
  if (msg.includes('empty') || msg.includes('zero')) return 'Empty batch not allowed';
  if (msg.includes('owner') || msg.includes('access') || msg.includes('permission')) return 'Access denied';
  if (msg.includes('duplicate') || msg.includes('exists')) return 'Record already exists';
  
  return error.message || 'Unknown revert reason';
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
      const reason = extractRevertReason(error, data.abi, data.functionName);
      throw new Error(`CONTRACT_ERROR: ${reason}`);
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

  // ✅ VALIDASI PAYLOAD SEBELUM KIRIM (PENTING!)
  try {
    validateBatchPayload(payload);
  } catch (validationError: any) {
    console.error('[Web3] Payload validation failed:', validationError.message);
    throw new Error(`PAYLOAD_ERROR: ${validationError.message}`);
  }

  // ✅ DEBUG LOG: Tampilkan payload sebelum kirim
  const [arg1, arg2, arg3] = payload.args;
  if (Array.isArray(arg1) && Array.isArray(arg2) && Array.isArray(arg3)) {
    console.log('[Web3] Sending batch tx (parallel arrays):', {
      contractAddress: payload.contractAddress,
      functionName: payload.functionName,
      arrayLengths: [arg1.length, arg2.length, arg3.length],
      sample: {
        cid: arg1[0]?.slice(0, 20),
        fileName: arg2[0],
        fileHash: arg3[0]?.slice(0, 20)
      }
    });
  } else {
    console.log('[Web3] Sending batch tx (struct array):', {
      contractAddress: payload.contractAddress,
      functionName: payload.functionName,
      recordCount: (payload.args[0] as any[])?.length,
      sample: payload.items?.[0]
    });
  }

  // Estimasi gas + buffer 20%
  let gasLimit: bigint;
  try {
    const estimated = await contract[payload.functionName].estimateGas(...payload.args);
    gasLimit = (estimated * 120n) / 100n;
    console.log('[Web3] Estimated gas:', estimated.toString(), 'with buffer:', gasLimit.toString());
  } catch (err) {
    console.warn('[Web3] Batch gas estimation failed, using fallback');
    // Fallback: ~250k gas per file (lebih aman untuk batch), max 10 files
    const perFileGas = 250000n;
    const fileCount = BigInt(Math.min(payload.items.length, 10));
    gasLimit = perFileGas * fileCount + 100000n; // +100k buffer base
    console.log('[Web3] Using fallback gas:', gasLimit.toString());
  }

  try {
    if (callbacks?.onStatus) callbacks.onStatus('🔐 Confirm batch in wallet...');
    
    // ✅ Send SINGLE transaction untuk semua file
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
      gasUsed: receipt.gasUsed?.toString(),
      status: receipt.status
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
    // ✅ Extract detailed revert reason
    const revertReason = extractRevertReason(error, payload.abi, payload.functionName);
    
    console.error('[Web3] Batch transaction failed:', {
      reason: revertReason,
      originalMessage: error.message,
      code: error.code,
      data: error.data,
      receipt: error.receipt ? {
        status: error.receipt.status,
        gasUsed: error.receipt.gasUsed?.toString(),
        logs: error.receipt.logs?.length
      } : null
    });

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
    if (error.message?.includes('execution reverted') || revertReason !== error.message) {
      throw new Error(`CONTRACT_ERROR: ${revertReason}`);
    }
    if (error.message === 'TX_CONFIRMATION_TIMEOUT') {
      throw new Error('TX_CONFIRMATION_TIMEOUT');
    }
    
    console.error('[Web3] Batch unexpected error:', error);
    throw new Error(`BLOCKCHAIN_ERROR: ${error.message || 'Unknown error'}`);
  }
}