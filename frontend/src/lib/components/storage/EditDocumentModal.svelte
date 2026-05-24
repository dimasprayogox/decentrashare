<!-- src/lib/components/storage/EditDocumentModal.svelte -->
<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  
  let {
    isOpen = false,
    onClose,
    onConfirm,
    initialTitle,
    initialDescription,
    isProcessing = false,
    errorMessage = ''  // ✅ NEW: prop untuk error dari parent
  }: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (title: string, description: string) => Promise<void>;
    initialTitle: string;
    initialDescription: string | null;
    isProcessing?: boolean;
    errorMessage?: string;  // ✅ NEW
  } = $props();

  let title = $state(initialTitle);
  let description = $state(initialDescription ?? '');
  let localError = $state('');  // ✅ Local error state

  // Sync errorMessage dari parent + auto-clear
  $effect(() => {
    if (errorMessage) {
      localError = errorMessage;
    }
  });

  // Reset state when modal opens
  $effect(() => {
    if (isOpen) {
      title = initialTitle;
      description = initialDescription ?? '';
      localError = '';  // Clear error saat modal buka lagi
    }
  });

  async function handleSubmit() {
    // ✅ Validasi: title tidak boleh kosong
    if (!title.trim()) {
      localError = 'Title cannot be empty';
      return;
    }
    
    // Clear error sebelum submit
    localError = '';
    
    // ✅ Debug: log kalau handleSubmit terpanggil
    console.log('📝 EditDocumentModal: handleSubmit called', { title: title.trim(), description: description.trim() });
    
    // ✅ Panggil parent callback
    await onConfirm(title.trim(), description.trim());
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
    if (e.key === 'Enter' && !e.shiftKey && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      handleSubmit();
    }
  }
  
  // ✅ Helper: cek apakah user sedang select text
  function isTextSelected(): boolean {
    const selection = window.getSelection();
    return selection?.toString().length > 0;
  }
</script>

{#if isOpen}
  <div 
    class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
    onclick={(e) => {
      // ✅ FIX 1: Jangan close kalau user sedang select text
      if (isTextSelected()) {
        return;
      }
      // ✅ FIX 2: Hanya close kalau klik langsung di backdrop (bukan di dalam modal)
      if (e.target === e.currentTarget) {
        onClose();
      }
    }}
    onkeydown={handleKeydown}
    tabindex="-1"
  >
    <div 
      class="bg-gradient-to-br from-[#1a1a1e] to-[#121214] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
      in:scale={{ duration: 200, easing: cubicOut }}
      // ✅ FIX 3: Stop propagation + prevent default untuk semua event di modal content
      onclick={(e) => e.stopPropagation()}
      onmousedown={(e) => { e.stopPropagation(); }}
      // ✅ FIX 4: Jangan close modal kalau user lagi select text di dalam modal
      onmouseup={(e) => {
        e.stopPropagation();
        if (isTextSelected()) {
          e.preventDefault();
        }
      }}
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-white/10">
        <h3 class="text-white font-semibold">Edit Document</h3>
        <button 
          type="button"  // ✅ Explicit button type
          onclick={(e) => { e.stopPropagation(); onClose(); }}
          class="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          aria-label="Close"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="p-4 space-y-4">
        <!-- Title Input -->
        <div>
          <label class="block text-sm text-gray-400 mb-2">Title <span class="text-red-400">*</span></label>
          <input 
            type="text"
            value={title}
            oninput={(e) => { 
              title = (e.target as HTMLInputElement).value;
              localError = '';  // Clear error saat user mengetik
            }}
            onmousedown={(e) => e.stopPropagation()}  // ✅ Prevent backdrop close on input click
            class="w-full px-3 py-2 bg-white/5 border rounded-xl text-white 
                   {localError ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : 'border-white/10 focus:border-blue-500 focus:ring-blue-500/50'}
                   focus:outline-none focus:ring-1 placeholder:text-gray-600 transition-colors"
            placeholder="Enter document title"
            disabled={isProcessing}
          />
          {#if localError}
            <p class="mt-1 text-xs text-red-400 flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              {localError}
            </p>
          {/if}
        </div>

        <!-- Description Input -->
        <div>
          <label class="block text-sm text-gray-400 mb-2">
            Description <span class="text-gray-600">(optional)</span>
          </label>
          <textarea 
            value={description}
            oninput={(e) => { 
              description = (e.target as HTMLTextAreaElement).value;
              localError = '';
            }}
            onmousedown={(e) => e.stopPropagation()}  // ✅ Prevent backdrop close
            rows={3}
            class="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white 
                   focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50
                   placeholder:text-gray-600 transition-colors resize-none"
            placeholder="Add a description..."
            disabled={isProcessing}
          />
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="flex items-center justify-end gap-3 p-4 border-t border-white/10">
        <button 
          type="button"  // ✅ Explicit button type
          onclick={(e) => { e.stopPropagation(); onClose(); }}
          disabled={isProcessing}
          class="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button 
          type="button"  // ✅ Explicit button type - PENTING!
          onclick={(e) => { 
            e.stopPropagation();  // ✅ Stop propagation
            handleSubmit();       // ✅ Panggil submit
          }}
          disabled={isProcessing || !title.trim()}
          class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-xl transition-colors disabled:cursor-not-allowed flex items-center gap-2"
        >
          {#if isProcessing}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span>Saving...</span>
          {:else}
            <span>Save Changes</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}