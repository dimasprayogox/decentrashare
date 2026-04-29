<script lang="ts">
  import { fade, scale, slide } from 'svelte/transition';
  let { isOpen, onClose } = $props();

  let isDragging = $state(false);
  let files = $state<File[]>([]);

  // Fungsi tambah file
  function handleFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const array = Array.from(newFiles);
    // Filter file > 100MB agar tidak jebol
    const validFiles = array.filter(f => f.size <= 100 * 1024 * 1024);
    files = [...files, ...validFiles];
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    handleFiles(e.dataTransfer?.files || null);
  }

  // Fungsi hapus file dari antrean
  function removeFile(index: number) {
    files = files.filter((_, i) => i !== index);
  }

  function startUpload() {
    console.log("Mengunggah ke IPFS...", files);
    // Logika Web3/IPFS Bos masuk sini
  }
</script>

{#if isOpen}
<div class="fixed inset-0 z-[999] flex items-center justify-center p-4 md:p-6">
  <div 
    transition:fade={{ duration: 200 }}
    class="absolute inset-0 bg-black/80 backdrop-blur-md" 
    onclick={onClose}
  ></div>

  <div 
    in:scale={{ start: 0.9, duration: 300 }}
    out:fade={{ duration: 200 }}
    class="relative w-full max-w-xl bg-[#121214] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
  >
    <div class="p-6 md:p-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h3 class="text-xl font-bold text-white">Unggah ke IPFS</h3>
          <p class="text-xs text-gray-500 mt-1">File akan terdesentralisasi secara permanen.</p>
        </div>
        <button onclick={onClose} class="p-2 text-gray-500 hover:text-white transition-colors">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <label 
        ondragover={(e) => { e.preventDefault(); isDragging = true; }}
        ondragleave={() => isDragging = false}
        ondrop={handleDrop}
        class="group border-2 border-dashed {isDragging ? 'border-blue-500 bg-blue-500/5' : 'border-white/10 hover:border-white/20'} rounded-2xl p-10 text-center transition-all cursor-pointer block relative"
      >
        <input 
          type="file" 
          multiple 
          class="absolute inset-0 opacity-0 cursor-pointer" 
          onchange={(e) => handleFiles(e.currentTarget.files)} 
        />
        
        <div class="w-16 h-16 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-500 group-hover:scale-110 transition-transform">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
        </div>
        <p class="text-white font-medium">Klik atau tarik file ke sini</p>
        <p class="text-gray-500 text-[10px] uppercase tracking-widest mt-2 font-bold">Maksimal 100MB per file</p>
      </label>

      {#if files.length > 0}
        <div class="mt-6 space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
          {#each files as file, i (file.name + i)}
            <div transition:slide class="flex items-center justify-between p-3 bg-white/[0.03] border border-white/5 rounded-xl group/item">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 shrink-0">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                </div>
                <div class="truncate">
                    <p class="text-sm text-gray-200 truncate">{file.name}</p>
                    <p class="text-[10px] text-gray-500 font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <button 
                onclick={() => removeFile(i)}
                class="p-2 text-gray-600 hover:text-red-400 transition-colors"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <button 
        disabled={files.length === 0}
        onclick={startUpload}
        class="w-full mt-8 h-14 bg-blue-600 disabled:bg-white/5 disabled:text-gray-500 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all active:scale-95 shadow-xl shadow-blue-600/20"
      >
        {files.length > 0 ? `Upload ${files.length} File` : 'Pilih File Terlebih Dahulu'}
      </button>
    </div>
  </div>
</div>
{/if}

<style>
    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 10px;
    }
</style>