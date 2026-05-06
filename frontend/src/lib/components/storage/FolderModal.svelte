<script lang="ts">
  import { scale, fade } from 'svelte/transition';
  import { tick } from 'svelte'; // Import tick untuk handle autofocus
  import { storageService } from '$lib/services';

  // Props: tambahkan parentId untuk mendukung nested folder
  let { isOpen, onClose, onCreated, parentId = null } = $props();

  let folderName = $state("");
  let isSubmitting = $state(false);
  let errorMsg = $state("");
  let inputElement: HTMLInputElement | undefined = $state();

  // Handle Autofocus secara cerdas untuk Svelte 5 agar tidak bentrok (Solve console error)
  $effect(() => {
    if (isOpen) {
      tick().then(() => {
        inputElement?.focus();
      });
    }
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!folderName.trim()) return;

    try {
      isSubmitting = true;
      errorMsg = "";

      // Kirim folderName DAN parentId ke service
      const res = await storageService.createFolder(folderName, parentId);

      if (res.success) {
        folderName = ""; 
        onCreated?.();   
        onClose();       
      } else {
        throw new Error(res.message || "Gagal membuat folder");
      }
    } catch (err: any) {
      errorMsg = err.message || "Terjadi kesalahan";
    } finally {
      isSubmitting = false;
    }
  }
</script>

{#if isOpen}
<div class="fixed inset-0 z-[100] flex items-center justify-center p-6">
  <div 
    transition:fade={{ duration: 200 }}
    class="absolute inset-0 bg-black/80 backdrop-blur-sm" 
    onclick={!isSubmitting ? onClose : null}
  ></div>

  <div 
    in:scale={{start: 0.95}} 
    class="relative w-full max-w-md bg-[#121214] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
  >
    <div class="p-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h3 class="text-xl font-bold text-white">Buat Folder Baru</h3>
          <p class="text-[10px] text-gray-500 mt-1 uppercase tracking-tighter">
            Lokasi: <span class="text-blue-400">{parentId ? 'Dalam Folder' : 'Root / File Saya'}</span>
          </p>
        </div>
        <button onclick={onClose} class="text-gray-500 hover:text-white transition-colors" disabled={isSubmitting}>
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <form onsubmit={handleSubmit} class="space-y-6">
        <div>
          <label for="folderName" class="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Nama Folder</label>
          <input 
            bind:this={inputElement}
            type="text" 
            id="folderName"
            bind:value={folderName}
            placeholder="Contoh: Project Skripsi"
            class="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all disabled:opacity-50"
            disabled={isSubmitting}
          />
          {#if errorMsg}
            <p class="text-red-400 text-[10px] mt-2 ml-1 uppercase font-bold tracking-wider">{errorMsg}</p>
          {/if}
        </div>

        <div class="flex gap-3">
          <button 
            type="button"
            onclick={onClose}
            disabled={isSubmitting}
            class="flex-1 h-14 bg-white/5 text-white rounded-2xl font-bold hover:bg-white/10 transition-all disabled:opacity-30"
          >
            Batal
          </button>
          <button 
            type="submit"
            disabled={isSubmitting || !folderName.trim()}
            class="flex-[2] h-14 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-500 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
          >
            {#if isSubmitting}
              <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            {:else}
              Buat Folder
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
{/if}