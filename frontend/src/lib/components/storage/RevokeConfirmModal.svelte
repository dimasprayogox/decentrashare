<!-- src/lib/components/storage/RevokeConfirmModal.svelte -->
<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  // ── Props (✅ RUNES MODE: pakai $props()) ──
  let {
    isOpen = false,
    username = '',
    itemType = 'document' as 'folder' | 'document',
    onConfirm = () => {},
    onCancel = () => {},
    isProcessing = false
  }: {
    isOpen?: boolean;
    username?: string;
    itemType?: 'folder' | 'document';
    onConfirm?: () => void;
    onCancel?: () => void;
    isProcessing?: boolean;
  } = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
  }
</script>

{#if isOpen}
  <div 
    class="fixed inset-0 z-[10001] flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="revoke-modal-title"
    onkeydown={handleKeydown}
  >
    <!-- Backdrop -->
    <div 
      class="absolute inset-0 bg-black/70 backdrop-blur-sm"
      transition:fade={{ duration: 150 }}
      onclick={onCancel}
    ></div>

    <!-- Modal Content -->
    <div 
      class="relative bg-[#1a1a1e] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
      transition:fly={{ y: 10, duration: 200, easing: cubicOut }}
    >
      <!-- Header -->
      <div class="flex items-center gap-3 p-4 border-b border-white/10">
        <div class="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        </div>
        <div>
          <h3 id="revoke-modal-title" class="text-white font-semibold">Delete Access</h3>
        </div>
      </div>

      <!-- Body -->
      <div class="p-4">
        <p class="text-sm text-gray-300">
          are you sure you deleted @{username}'s access to this {itemType}?
        </p>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-3 p-4 border-t border-white/10 bg-[#151518]">
        <button
          onclick={onCancel}
          disabled={isProcessing}
          class="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onclick={onConfirm}
          disabled={isProcessing}
          class="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          {#if isProcessing}
            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Deleting...
          {:else}
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            Delete
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}