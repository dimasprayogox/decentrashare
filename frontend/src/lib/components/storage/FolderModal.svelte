<script lang="ts">
  import { scale, fade } from 'svelte/transition';
  import { tick } from 'svelte';
  import { storageService } from '$lib/services/storage/storage';
  import type { Folder } from '$lib/types/storage';

  // ── Props ──
  let { 
    isOpen, 
    onClose, 
    onCreated, 
    parentId = null,
    existingFolders = []  // ✅ For client-side duplicate check
  }: {
    isOpen: boolean;
    onClose: () => void;
    onCreated?: () => void;
    parentId?: string | null;
    existingFolders?: Folder[];  // ✅ List of folders already existing in this location
  } = $props();

  // ── State ──
  let folderName = $state("");
  let isSubmitting = $state(false);
  let errorMsg = $state("");
  let inputElement: HTMLInputElement | undefined = $state();

  // ── Autofocus ──
  $effect(() => {
    if (isOpen) {
      tick().then(() => inputElement?.focus());
    }
  });

  // ── Client-side Duplicate Check ──
  function isDuplicateName(name: string): boolean {
    const normalized = name.trim().toLowerCase();
    return existingFolders.some(folder => 
      folder.name.toLowerCase() === normalized
    );
  }

  // ── Submit Handler ──
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    
    const trimmedName = folderName.trim();
    
    // Validasi 1: Empty check
    if (!trimmedName) {
      errorMsg = "Folder name cannot be empty";
      return;
    }
    
    // Validasi 2: Client-side duplicate check (instant feedback)
    if (isDuplicateName(trimmedName)) {
      errorMsg = `Folder "${trimmedName}" already exists in this location`;
      // Shake animation feedback
      inputElement?.classList.add('animate-shake');
      setTimeout(() => inputElement?.classList.remove('animate-shake'), 300);
      return;
    }

    try {
      isSubmitting = true;
      errorMsg = "";

      // Call service (dengan duplicate handling di backend)
      const res = await storageService.createFolder(trimmedName, parentId);

      if (res.success) {
        // ✅ Success: reset & callback
        folderName = ""; 
        onCreated?.();   
        onClose();       
      } else {
        // ✅ Handle server-side duplicate error (FOLDER_EXISTS)
        if (res.errorCode === 'FOLDER_EXISTS') {
          errorMsg = res.message || `Folder "${trimmedName}" already exists in this location`;
        } else {
          errorMsg = res.message || "Failed to create folder";
        }
      }
    } catch (err: any) {
      // ✅ Handle network/API errors
      if (err.errorCode === 'FOLDER_EXISTS') {
        errorMsg = err.message || `Folder "${trimmedName}" already exists`;
      } else {
        errorMsg = err.message || "An error occurred";
      }
    } finally {
      isSubmitting = false;
    }
  }

  // ── Clear error when user types ──
  function handleInput() {
    if (errorMsg) errorMsg = "";
  }
</script>

{#if isOpen}
<div class="fixed inset-0 z-[100] flex items-center justify-center p-6">
  <!-- Backdrop -->
  <div 
    transition:fade={{ duration: 200 }}
    class="absolute inset-0 bg-black/80 backdrop-blur-sm" 
    onclick={!isSubmitting ? onClose : null}
  ></div>

  <!-- Modal Card -->
  <div 
    in:scale={{start: 0.95}} 
    class="relative w-full max-w-md bg-white dark:bg-[#121214] border border-slate-200 dark:border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
  >
    <div class="p-8">
      <!-- Header -->
      <div class="flex justify-between items-center mb-6">
        <div>
          <h3 class="text-xl font-bold text-slate-800 dark:text-white">Create New Folder</h3>
          <p class="text-[10px] text-gray-500 mt-1 uppercase tracking-tighter">
          </p>
        </div>
        <button onclick={onClose} class="text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-white transition-colors" disabled={isSubmitting}>
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <!-- Form -->
      <form onsubmit={handleSubmit} class="space-y-6">
        <div>
          <label for="folderName" class="block text-xs font-bold text-slate-500 dark:text-gray-500 uppercase tracking-widest mb-3">Folder Name</label>
          <input 
            bind:this={inputElement}
            type="text" 
            id="folderName"
            bind:value={folderName}
            oninput={handleInput} 
            placeholder="e.g. Music Project"
            class="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-5 py-4 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-650 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all disabled:opacity-50 {errorMsg ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/50' : ''}"
            disabled={isSubmitting}
          />
          {#if errorMsg}
            <p class="text-red-500 dark:text-red-400 text-[10px] mt-2 ml-1 uppercase font-bold tracking-wider flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              {errorMsg}
            </p>
          {/if}
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <button 
            type="button"
            onclick={onClose}
            disabled={isSubmitting}
            class="flex-1 h-14 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-white rounded-2xl font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition-all disabled:opacity-30"
          >
            Cancel
          </button>
          <button 
            type="submit"
            disabled={isSubmitting || !folderName.trim()}
            class="flex-[2] h-14 bg-blue-600 text-black rounded-2xl font-bold hover:bg-blue-700 disabled:bg-slate-100 dark:disabled:bg-gray-800 disabled:text-blue-600 dark:disabled:text-gray-500 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
          >
            {#if isSubmitting}
              <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            {:else}
              Create Folder
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
{/if}

<style>
  /* Shake animation untuk error feedback */
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }
  .animate-shake {
    animation: shake 0.3s ease-in-out;
  }
</style>