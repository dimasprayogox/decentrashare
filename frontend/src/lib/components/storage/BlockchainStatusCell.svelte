<script lang="ts">
  import { storageService } from '$lib/services/storage/storage';
  import { recordFileOnChain } from '$lib/services/web3/blockchain';
  import type { Document } from '$lib/types/storage';
  
  export let document: Document;
  export let onConfirmed: () => void;
  
  let confirming = $state(false);
  let statusMsg = $state("");
  
  async function handleConfirmBlockchain() {
    if (confirming) return;
    
    try {
      confirming = true;
      statusMsg = "Preparing...";
      
      // 1. Minta data blockchain dari backend
      const response = await storageService.triggerBlockchainConfirmation(document.id);
      
      if (!response.success || !response.data?.blockchainData) {
        throw new Error(response.message || "Failed to prepare blockchain data");
      }
      
      statusMsg = "Confirm in wallet...";
      
      // 2. Prompt MetaMask sign TX
      const txResult = await recordFileOnChain(response.data.blockchainData);
      
      statusMsg = "Updating status...";
      
      // 3. Notify backend bahwa TX confirmed
      await storageService.confirmDocumentOnChain(
        document.id,
        txResult.txHash,
        txResult.blockNumber
      );
      
      statusMsg = "On-chain!";
      onConfirmed?.(); // Refresh parent
      
    } catch (err: any) {
      console.error("Confirm blockchain failed:", err);
      
      if (err.message?.includes('expired')) {
        statusMsg = "Expired";
      } else if (err.message === 'TRANSACTION_REJECTED') {
        statusMsg = "Cancelled";
      } else if (err.message?.includes('insufficient')) {
        statusMsg = "No ETH";
      } else {
        statusMsg = "Error";
      }
    } finally {
      confirming = false;
      setTimeout(() => { if (!confirming) statusMsg = ""; }, 3000);
    }
  }
  
  // Helper: Format countdown
  function getCountdown(deadline: string | null): string {
    if (!deadline) return "";
    const remaining = new Date(deadline).getTime() - Date.now();
    if (remaining <= 0) return "Expired";
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }
</script>

<div class="flex flex-col gap-1 min-w-[180px]">
  {#if document.isOnChain && document.blockchainTx}
    <!-- ✅ Already on-chain: Show TX link -->
    <a 
      href={`https://sepolia.etherscan.io/tx/${document.blockchainTx}`}
      target="_blank"
      rel="noopener noreferrer"
      class="text-xs text-blue-400 hover:text-blue-300 truncate flex items-center gap-1"
    >
      <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
      </svg>
      {document.blockchainTx.slice(0, 6)}...{document.blockchainTx.slice(-4)}
    </a>
    <span class="text-[10px] text-green-400 flex items-center gap-1">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>
      Confirmed
    </span>
    
  {:else if document.pendingOnChainUntil && new Date(document.pendingOnChainUntil) > new Date()}
    <!-- ⏳ Pending: Show countdown + Confirm button -->
    <div class="flex items-center gap-2">
      <button 
        onclick={handleConfirmBlockchain}
        disabled={confirming}
        class="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded transition-colors flex items-center gap-1"
        title="Confirm file on blockchain"
      >
        {#if confirming}
          <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Confirming...
        {:else}
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          Confirm
        {/if}
      </button>
      
      {#if getCountdown(document.pendingOnChainUntil) !== "Expired"}
        <span class="text-[10px] text-yellow-400" title="Time remaining to confirm">
          ⏰ {getCountdown(document.pendingOnChainUntil)}
        </span>
      {/if}
    </div>
    
    {#if statusMsg}
      <span class="text-[10px] text-gray-400">{statusMsg}</span>
    {/if}
    
  {:else}
    <!-- ❌ Expired or never pending -->
    <span class="text-[10px] text-red-400">
      {document.pendingOnChainUntil ? '⏰ Expired' : '—'}
    </span>
  {/if}
</div>