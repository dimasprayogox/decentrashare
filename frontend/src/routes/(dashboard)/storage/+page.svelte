<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { storageService } from '$lib/services';
  import UploadModal from '$lib/components/dashboard/UploadModal.svelte';
  import FolderModal from '$lib/components/dashboard/FolderModal.svelte';

  // UI States
  let showUpload = $state(false);
  let showFolder = $state(false);
  let isLoading = $state(true);
  let isProcessing = $state(false); // State untuk loading overlay saat upload/delete

  // Navigasi & Data States
  let currentFolder = $state(null); 
  let items = $state([]);
  let folders = $state([]);
  let quickAccess = $state([]);

  // Helper untuk membedakan icon & warna berdasarkan tipe file
  function getFileTheme(mimeType: string) {
    if (mimeType.includes('image')) return { color: 'text-purple-500 bg-purple-500/10', icon: 'image' };
    if (mimeType.includes('video')) return { color: 'text-red-500 bg-red-500/10', icon: 'video' };
    if (mimeType.includes('pdf')) return { color: 'text-orange-500 bg-orange-500/10', icon: 'pdf' };
    return { color: 'text-blue-500 bg-blue-500/10', icon: 'file' };
  }

  // Wrapper untuk handle state loading global
  async function withLoading(fn: () => Promise<void>) {
    try {
      isProcessing = true;
      await fn();
    } finally {
      isProcessing = false;
    }
  }

  async function loadStorageData() {
    try {
      isLoading = true;
      const folderId = currentFolder?.id || null;

      const [folderRes, docRes, recentRes] = await Promise.all([
        storageService.getFolders().catch(() => ({ success: false, data: [] })),
        storageService.getDocuments(folderId).catch(() => ({ success: false, data: [] })),
        storageService.getRecentFiles().catch(() => ({ success: false, data: [] }))
      ]);

      if (!currentFolder) {
        folders = folderRes.success ? folderRes.data : [];
      } else {
        folders = [];
      }

      items = docRes.success ? docRes.data : [];
      quickAccess = recentRes.success ? recentRes.data : [];
    } catch (err) {
      console.error("Fatal Error:", err);
    } finally {
      setTimeout(() => { isLoading = false; }, 300);
    }
  }

  function openFolder(folder: any) {
    currentFolder = folder;
    loadStorageData();
  }

  function goBack() {
    currentFolder = null;
    loadStorageData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus item ini secara permanen?")) return;
    await withLoading(async () => {
      try {
        await storageService.deleteItem(id);
        await loadStorageData();
      } catch (err) {
        alert("Gagal menghapus item");
      }
    });
  }

  onMount(loadStorageData);
</script>

<main class="relative w-full flex-1 p-4 sm:p-6 md:p-10 overflow-y-auto max-w-[1600px] mx-auto">
  
  {#if isProcessing}
    <div class="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade>
      <div class="bg-[#121214] p-8 rounded-[32px] border border-white/10 shadow-2xl flex flex-col items-center" in:scale>
        <div class="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h3 class="text-white font-bold text-lg">Memproses Data</h3>
        <p class="text-gray-500 text-sm">Menghubungi IPFS & Smart Contract...</p>
      </div>
    </div>
  {/if}

  <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 md:mb-12">
    <div>
      <nav class="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">
        <button onclick={goBack} class="hover:text-white transition-colors">File Saya</button>
        {#if currentFolder}
          <span>/</span> <span class="text-blue-400">{currentFolder.name}</span>
        {/if}
      </nav>
      <h2 class="text-2xl md:text-3xl font-bold text-white">{currentFolder ? currentFolder.name : 'Semua File'}</h2>
    </div>
    
    <div class="flex gap-3 w-full sm:w-auto">
      <button onclick={() => showFolder = true} class="flex-1 sm:flex-none px-5 py-3 bg-white/5 border border-white/10 text-white rounded-2xl font-bold text-sm hover:bg-white/10 transition-all">+ Folder</button>
      <button onclick={() => showUpload = true} class="flex-1 sm:flex-none px-5 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20">Upload</button>
    </div>
  </header>

  {#if isLoading}
    <div class="flex flex-col items-center justify-center h-64 border border-white/5 rounded-[32px] bg-white/[0.01]">
      <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p class="text-gray-500 text-sm animate-pulse">Sinkronisasi data IPFS...</p>
    </div>
  {:else}
    {#if !currentFolder}
      <section class="mb-10" in:fade>
        <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Akses Cepat</h3>
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-6">
          {#each quickAccess as item}
            <div class="p-6 bg-white/[0.02] border border-white/5 rounded-3xl hover:bg-white/[0.05] transition-all cursor-pointer">
              <h4 class="font-medium text-white truncate">{item.title}</h4>
            </div>
          {/each}
        </div>
      </section>

      <section class="mb-10" in:fade>
  <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">
    {currentFolder ? 'Sub-Folder' : 'Folder Utama'}
  </h3>
  <div class="grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-4 gap-6">
    {#each folders as folder}
      <div class="group relative bg-white/[0.02] border border-white/5 rounded-3xl hover:bg-white/[0.05] transition-all p-4">
        <button onclick={() => openFolder(folder)} class="flex items-center gap-4 text-left w-full pr-12">
          <div class="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path></svg>
          </div>
          <h4 class="text-sm font-semibold text-white truncate">{folder.name}</h4>
        </button>

        <div class="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
          <button 
            onclick={() => handleRenameFolder(folder.id, folder.name)} 
            class="p-2 text-gray-500 hover:text-blue-400" 
            title="Rename Folder"
            aria-label="Ubah Nama"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
          </button>
          
          <button 
            onclick={() => handleDeleteFolder(folder.id)} 
            class="p-2 text-gray-500 hover:text-red-400" 
            title="Delete Folder"
            aria-label="Hapus Folder"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      </div>
    {/each}
  </div>
</section>
    {/if}
<section class="pb-10" in:fade>
  <div class="bg-white/[0.02] border border-white/5 rounded-[32px] overflow-hidden">
    <table class="w-full text-left border-collapse">
      <thead class="bg-white/5 text-[10px] text-gray-500 uppercase tracking-widest">
        <tr>
          <th class="px-8 py-4 font-bold">Nama</th>
          <th class="hidden md:table-cell px-4 py-4 text-center">Ukuran</th>
          <th class="hidden lg:table-cell px-4 py-4 text-center text-xs">IPFS Hash</th>
          <th class="hidden xl:table-cell px-4 py-4 text-center">Status</th>
          <th class="hidden sm:table-cell px-4 py-4 text-center">Diunggah</th>
          <th class="px-8 py-4 text-right">Aksi</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-white/5">
        {#each items as item (item.id)}
          {@const theme = getFileTheme(item.mimeType)}
          <tr class="hover:bg-white/[0.03] transition-all group">
            
            <td class="px-8 py-6">
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center {theme.color}">
                  {#if item.mimeType.includes('image')}
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 00-2 2z"></path></svg>
                  {:else if item.mimeType.includes('video')}
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                  {:else if item.mimeType.includes('pdf') || item.mimeType.includes('document') || item.mimeType.includes('msword')}
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                  {:else}
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                  {/if}
                </div>
                <div>
                  <p class="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">{item.title}</p>
                  <p class="text-[10px] text-gray-500 uppercase">{item.fileName.split('.').pop()}</p>
                </div>
              </div>
            </td>

            <td class="hidden md:table-cell px-4 py-6 text-gray-400 text-center font-mono text-xs">
              {item.fileSize ? (item.fileSize / (1024 * 1024)).toFixed(2) + ' MB' : '--'}
            </td>

            <td class="hidden lg:table-cell px-4 py-6 text-center">
              <div class="flex items-center justify-center gap-2">
                <code class="text-[10px] bg-blue-500/5 px-2 py-1 rounded-full text-blue-400/80 border border-blue-500/10 font-mono">
                  {item.ipfsHash.slice(0, 8)}...{item.ipfsHash.slice(-4)}
                </code>
              </div>
            </td>

            <td class="hidden xl:table-cell px-4 py-6 text-center">
              {#if item.isOnChain}
                <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 text-green-500 text-[10px] font-bold border border-green-500/20">
                  <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  ON-CHAIN
                </span>
              {:else}
                <span class="text-gray-600 text-[10px] font-bold">PENDING</span>
              {/if}
            </td>

            <td class="hidden sm:table-cell px-4 py-6 text-center text-gray-500 text-[11px]">
              {new Date(item.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
            </td>

            <td class="px-8 py-6 text-right">
              <div class="flex justify-end gap-2">
                {#if item.isOnChain}
                  <a href="https://sepolia.etherscan.io/tx/{item.blockchainTx}" target="_blank" class="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-blue-400" title="Etherscan">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                  </a>
                {/if}
                <button onclick={() => handleDelete(item.id)} class="p-2 hover:bg-red-500/20 rounded-lg text-gray-500 hover:text-red-400" title="Hapus">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </div>
            </td>

          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
    
  {/if}

  <FolderModal isOpen={showFolder} onClose={() => showFolder = false} onCreated={loadStorageData} />
  <UploadModal 
    isOpen={showUpload} 
    onClose={() => showUpload = false} 
    onUploaded={() => withLoading(loadStorageData)} 
    folderId={currentFolder?.id} 
  />
</main>