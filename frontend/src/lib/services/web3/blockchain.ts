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
  
  if (Array.isArray(arg1) && Array.isArray(arg2) && Array.isArray(arg3)) {
    const [cids, fileNames, fileHashes] = payload.args as [string[], string[], string[]];
    
    if (cids.length === 0) throw new Error('Empty batch: no files to confirm');
    if (cids.length !== fileNames.length || cids.length !== fileHashes.length) {
      throw new Error(`Array length mismatch: cids=${cids.length}, names=${fileNames.length}, hashes=${fileHashes.length}`);
    }
    if (cids.length > 50) throw new Error(`Batch too large: ${cids.length} files (max 50)`);
    
    // ✅ VALIDASI: Pastikan tidak ada string kosong setelah trim
    cids.forEach((cid, i) => {
      if (!cid?.trim()) throw new Error(`Empty CID at index ${i}`);
      if (!fileNames[i]?.trim()) throw new Error(`Empty fileName at index ${i}`);
      if (!fileHashes[i]?.trim()) throw new Error(`Empty fileHash at index ${i}`);
    });
  }
  else if (Array.isArray(arg1) && payload.args.length === 1) {
    const records = payload.args[0] as any[];
    if (records.length === 0) throw new Error('Empty batch');
    if (records.length > 50) throw new Error(`Batch too large: ${records.length}`);
  }
  else {
    throw new Error(`Invalid payload format`);
  }
}

// ── Helper: Extract Revert Reason ───────────────────────────
function extractRevertReason(error: any, abi: ContractInterface, functionName: string): string {
  if (error.revert?.reason) return error.revert.reason;
  if (error.reason && error.reason !== 'unknown error') return error.reason;
  
  if (error.data?.data) {
    try {
      const iface = new Interface(abi as any);
      const decoded = iface.parseError(error.data.data);
      if (decoded?.name) return decoded.name;
    } catch (e) { /* ignore */ }
  }
  
  const msg = error.message?.toLowerCase() || '';
  if (msg.includes('duplicate') || msg.includes('exists')) return 'DuplicateContent';
  if (msg.includes('length') || msg.includes('array')) return 'ArrayLengthMismatch';
  if (msg.includes('empty') || msg.includes('zero')) return 'EmptyBatch';
  
  return error.message || 'Unknown revert';
}

// ── Helper: Trim all strings in payload ─────────────────────
function sanitizePayloadArgs(args: [string[], string[], string[]]): [string[], string[], string[]] {
  return [
    args[0].map(s => s?.trim() || ''),  // cids
    args[1].map(s => s?.trim() || ''),  // fileNames
    args[2].map(s => s?.trim() || '')   // fileHashes
  ];
}

// ── Single File: recordFileOnChain ──────────────────────────
export async function recordFileOnChain(
  data: BlockchainRecordData,
  callbacks?: { onStatus?: (s: string) => void; onTxHash?: (h: string) => void }
) {
  if (!window.ethereum) throw new Error("Wallet not detected");

  const provider = new ethers.BrowserProvider(window.ethereum);
  if ((await provider.getNetwork()).chainId !== 11155111n) await switchToSepolia();

  const signer = await provider.getSigner();
  const contract = new ethers.Contract(data.contractAddress, data.abi as ContractInterface, signer);

  // ✅ Trim args sebelum kirim
  const trimmedArgs = data.args.map(s => s.trim()) as [string, string, string];

  let gasLimit: bigint;
  try {
    const est = await contract.recordFile.estimateGas(...trimmedArgs);
    gasLimit = (est * 120n) / 100n;
  } catch {
    gasLimit = 300000n;
  }

  try {
    callbacks?.onStatus?.('Confirm in wallet...');
    const tx = await contract.recordFile(...trimmedArgs, { gasLimit });
    callbacks?.onTxHash?.(tx.hash);
    callbacks?.onStatus?.('Waiting for confirmation...');

    const receipt = await Promise.race([
      tx.wait(1),
      new Promise((_, r) => setTimeout(() => r(new Error('TX_CONFIRMATION_TIMEOUT')), 120000))
    ]) as ethers.TransactionReceipt;

    if (receipt.status !== 1) throw new Error('TRANSACTION_FAILED_ON_CHAIN');
    callbacks?.onStatus?.('Confirmed!');

    return { txHash: receipt.hash, blockNumber: receipt.blockNumber, success: true, gasUsed: receipt.gasUsed?.toString() };
  } catch (error: any) {
    if (error.code === 4001 || error.message?.includes('rejected')) throw new Error('TRANSACTION_REJECTED');
    if (error.code === -32603 || error.message?.includes('insufficient funds')) throw new Error('INSUFFICIENT_FUNDS');
    if (error.code === 4902 || error.message?.includes('unrecognized chain')) throw new Error('WRONG_NETWORK');
    if (error.message?.includes('execution reverted')) {
      const reason = extractRevertReason(error, data.abi, data.functionName);
      throw new Error(`CONTRACT_ERROR: ${reason}`);
    }
    if (error.message === 'TX_CONFIRMATION_TIMEOUT') throw new Error('TX_CONFIRMATION_TIMEOUT');
    throw new Error(`BLOCKCHAIN_ERROR: ${error.message || 'Unknown'}`);
  }
}

// ── ✅ Batch Files: recordFilesBatchOnChain ──────────────────
// src/lib/services/web3/blockchain.ts

export async function recordFilesBatchOnChain(
  payload: BatchBlockchainPayload,
  callbacks?: { onStatus?: (s: string) => void; onTxHash?: (h: string) => void }
) {
  if (!window.ethereum) throw new Error('Wallet not detected');

  const provider = new ethers.BrowserProvider(window.ethereum);
  if ((await provider.getNetwork()).chainId !== 11155111n) await switchToSepolia();

  const signer = await provider.getSigner();

  // ✅ 1. UNWRAP ABI: Pastikan yang dipakai adalah ARRAY murni
  const rawAbi = Array.isArray(payload.abi) 
    ? payload.abi 
    : (payload.abi as any)?.abi;
    
  if (!Array.isArray(rawAbi) || rawAbi.length === 0) {
    throw new Error('Invalid ABI format. Expected an array of function definitions.');
  }

  // ✅ 2. CREATE CONTRACT dengan ABI yang sudah di-unwrap
  const contract = new ethers.Contract(payload.contractAddress, rawAbi, signer);

  // ✅ 3. VALIDASI & SANITIZE PAYLOAD
  const [rawCids, rawNames, rawHashes] = payload.args as [string[], string[], string[]];
  if (!rawCids?.length || !rawNames?.length || !rawHashes?.length) {
    throw new Error('Empty payload arrays');
  }

  const sanitizedArgs: [string[], string[], string[]] = [
    rawCids.map(s => s?.trim()),
    rawNames.map(s => s?.trim()),
    rawHashes.map(s => s?.trim())
  ];

  // ✅ 4. VERIFY ENCODING SEBELUM KIRIM TX (PENTING!)
  const iface = new ethers.Interface(rawAbi);
  try {
    // Try encoding first. If it fails, it means there is an ABI mismatch
    const encodedData = iface.encodeFunctionData('recordFilesBatch', sanitizedArgs);
    console.log('[Web3] Encoding verified:', {
      selector: encodedData.slice(0, 10),
      length: encodedData.length,
      cidsCount: sanitizedArgs[0].length
    });
  } catch (encErr: any) {
    console.error('[Web3] Encoding failed:', encErr.message);
    throw new Error(`ABI Mismatch or Invalid Args: ${encErr.message}`);
  }

  // ✅ 5. MANUAL GAS LIMIT (Bypass broken estimation)
  const gasLimit = 2000000n; // 2M gas (cukup untuk batch 10 files)

  try {
    callbacks?.onStatus?.('Confirm batch in wallet...');
    
    // ✅ KIRIM TX
    const tx = await contract.recordFilesBatch(
      sanitizedArgs[0],
      sanitizedArgs[1], 
      sanitizedArgs[2], 
      { gasLimit }
    );
    
    callbacks?.onTxHash?.(tx.hash);
    callbacks?.onStatus?.('TX sent, waiting...');

    const receipt = await Promise.race([
      tx.wait(1),
      new Promise((_, r) => setTimeout(() => r(new Error('TX_CONFIRMATION_TIMEOUT')), 180000))
    ]) as ethers.TransactionReceipt;

    if (receipt.status !== 1) throw new Error('TRANSACTION_FAILED_ON_CHAIN');
    callbacks?.onStatus?.('Batch confirmed!');

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      success: true,
      gasUsed: receipt.gasUsed?.toString(),
      fileCount: sanitizedArgs[0].length
    };

  } catch (error: any) {
    console.error('[Web3] Batch failed:', {
      message: error.message,
      code: error.code,
      data: error.data,
      gasUsed: error.receipt?.gasUsed?.toString()
    });

    if (error.code === 4001 || error.message?.includes('rejected')) throw new Error('TRANSACTION_REJECTED');
    if (error.code === -32603 || error.message?.includes('insufficient funds')) throw new Error('INSUFFICIENT_FUNDS');
    if (error.code === 4902 || error.message?.includes('unrecognized chain')) throw new Error('WRONG_NETWORK');
    if (error.message === 'TX_CONFIRMATION_TIMEOUT') throw new Error('TX_CONFIRMATION_TIMEOUT');
    
    throw new Error(`CONTRACT_ERROR: ${error.message || 'Execution reverted'}`);
  }
}
// ✅ ✅ ✅ FULL VALID CODE - COPY PASTE INI ✅ ✅ ✅
export async function tryBatchWithSingleFallback(
  payload: BatchBlockchainPayload,
  callbacks?: { 
    onStatus?: (status: string) => void; 
    onTxHash?: (txHash: string) => void 
  }
): Promise<{
  txHash: string;
  blockNumber: number;
  success: boolean;
  gasUsed?: string;
  fileCount: number;
  fallback?: boolean;
  details?: Array<{
    index: number;
    success: boolean;
    txHash?: string;
    error?: string;
  }>;
}> {
  try {
    // Coba batch dulu
    return await recordFilesBatchOnChain(payload, callbacks);
  } catch (batchError: any) {
    console.warn('[Web3] Batch failed, trying single-file fallback...', batchError.message);
    
    const [cids, names, hashes] = payload.args as [string[], string[], string[]];
    
    // ✅ UNWRAP ABI untuk single calls (PENTING!)
    const rawAbi = Array.isArray(payload.abi) 
      ? payload.abi 
      : (payload.abi as any)?.abi;
    
    const results: Array<{
      index: number;
      success: boolean;
      txHash?: string;
      error?: string;
    }> = [];
    
    for (let i = 0; i < cids.length; i++) {
      try {
        callbacks?.onStatus?.(`Confirming file ${i+1}/${cids.length}...`);
        
        const result = await recordFileOnChain({
          cid: cids[i],
          fileName: names[i],
          fileHash: hashes[i],
          contractAddress: payload.contractAddress,
          abi: rawAbi,  // ← ✅ Pakai rawAbi yang sudah di-unwrap
          functionName: 'recordFile',
          args: [cids[i], names[i], hashes[i]]
        }, callbacks);
        
        results.push({ success: true, index: i, txHash: result.txHash });
      } catch (singleError: any) {
        console.warn(`[Web3] File ${i} failed:`, singleError.message);
        results.push({ success: false, index: i, error: singleError.message });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    if (successCount === 0) {
      throw new Error(`All ${cids.length} files failed: ${results.map(r => r.error).join(', ')}`);
    }
    
    const firstSuccess = results.find(r => r.success);
    
    return {
      txHash: firstSuccess?.txHash || '',
      blockNumber: firstSuccess ? (await new ethers.BrowserProvider(window.ethereum).getTransaction(firstSuccess.txHash!))?.blockNumber || 0 : 0,
      success: true,
      fileCount: successCount,
      fallback: true,
      details: results
    };
  }
}