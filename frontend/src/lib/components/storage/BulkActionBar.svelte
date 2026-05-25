<!-- src/lib/components/storage/BulkActionBar.svelte -->
<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  
  // ── Props (Svelte 5 Style) ──
  let {
    selectedCount,
    selectedType,
    onMove,
    onManageAccess,
    onConfirmBlockchain,
    onDelete,      // ✅ Hanya untuk soft delete
    onCancel,
    isProcessing = false,  // ✅ Loading state
    isConfirmingBlockchain = false,
    canConfirmBlockchain = false,
    confirmBlockchainCount = 0
  }: {
    selectedCount: number;
    selectedType: 'folders' | 'documents' | 'mixed' | 'items';
    onMove?: () => void;
    onManageAccess?: () => void;
    onConfirmBlockchain?: () => void;
    onDelete?: () => void;  // ✅ No isPermanent param needed
    onCancel?: () => void;
    isProcessing?: boolean;
    isConfirmingBlockchain?: boolean;
    canConfirmBlockchain?: boolean;
    confirmBlockchainCount?: number;
  } = $props();
</script>

<!-- ✅ Bulk Action Toolbar (Fixed Bottom) -->
<div 
  transition:fly={{ y: 20, duration: 200, easing: cubicOut }}
  class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-1 px-4 py-3 bg-[#1a1a1e] border border-white/10 rounded-2xl shadow-2xl shadow-black/50"
  role="toolbar"
  aria-label="Bulk actions"
>
  <!-- Top Row: Action Buttons -->
  <div class="flex items-center gap-2">
    
    <!-- Selected Count -->
    <span class="text-sm text-gray-300 mr-2">
      {selectedCount} {selectedType} selected
    </span>
    
    <div class="w-px h-6 bg-white/10"></div>
    
    <!-- Move Button -->
    <button 
      onclick={() => onMove?.()}
      disabled={isProcessing}
      class="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title="Move to folder"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
      </svg>
      <span class="hidden sm:inline">Move</span>
    </button>
    
    <!-- Share Button -->
    <button
      onclick={() => onManageAccess?.()}
      disabled={isProcessing}
      class="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title="Manage access"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
      </svg>
      <span class="hidden sm:inline">Share</span>
    </button>

    {#if canConfirmBlockchain || isConfirmingBlockchain}
      <button
        onclick={() => onConfirmBlockchain?.()}
        disabled={(isProcessing && !isConfirmingBlockchain) || !canConfirmBlockchain}
        class="flex items-center gap-2 px-4 py-2 text-sm text-blue-300 hover:text-white hover:bg-blue-500/10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Confirm selected documents on blockchain"
      >
        {#if isConfirmingBlockchain}
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span class="hidden sm:inline">Confirming...</span>
        {:else}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          <span class="hidden sm:inline">Confirm On-chain ({confirmBlockchainCount})</span>
        {/if}
      </button>
    {/if}

    <div class="w-px h-6 bg-white/10"></div>

    <!-- ✅ Delete Button (Soft Delete Only) -->
    <button 
      onclick={() => onDelete?.()}  // ✅ No param needed
      disabled={isProcessing}
      class="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title="Move selected items to trash"
    >
      {#if isProcessing}
        <!-- Loading Spinner -->
        <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <span class="hidden sm:inline">Moving...</span>
      {:else}
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
        <span class="hidden sm:inline">Move to Trash</span>
      {/if}
    </button>
    
    <div class="w-px h-6 bg-white/10"></div>
    
    <!-- Cancel Button -->
    <button 
      onclick={onCancel}
      disabled={isProcessing}
      class="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
      aria-label="Clear selection"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>
  </div>
  
  <!-- ✅ Bottom Row: Helpful Hint for Soft Delete -->
  {#if !isProcessing}
    <p class="text-[9px] text-gray-600 hidden sm:block">
      Items can be restored from Trash anytime
    </p>
  {/if}
</div>