<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { storageService } from '$lib/services';
  import UploadModal from '$lib/components/dashboard/UploadModal.svelte';
  import FolderModal from '$lib/components/dashboard/FolderModal.svelte';

  // UI States
  let showUpload = $state(false);
  let showFolder = $state(false);
  let isLoading = $state(true);

  // Navigasi & Data States
  let currentFolder = $state(null); 
  let items = $state([]);
  let folders = $state([]);
  let quickAccess = $state([]);

  async function loadStorageData() {
    try {
      isLoading = true;
      const folderId = currentFolder?.id || null;

      const [folderRes, docRes, recentRes] = await Promise.all([
        storageService.getFolders().catch(() => ({ success: false, data: [] })),
        storageService.getDocuments(folderId).catch(() => ({ success: false, data: [] })),
        storageService.getRecentFiles().catch(() => ({ success: false, data: [] }))
      ]);

      folders = folderRes.success ? folderRes.data : [];
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
    try {
      await storageService.deleteItem(id);
      loadStorageData();
    } catch (err) {
      alert("Gagal menghapus item");
    }
  }

  onMount(loadStorageData);
</script>

<main class="w-full flex-1 p-4 sm:p-6 md:p-10 overflow-y-auto max-w-[1600px] mx-auto">
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
              <h4 class="font-medium text-white truncate">{item.name}</h4>
            </div>
          {/each}
        </div>
      </section>

      <section class="mb-10" in:fade>
        <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Folder Utama</h3>
        <div class="grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-4 gap-6">
          {#each folders as folder}
            <button onclick={() => openFolder(folder)} class="p-4 bg-white/[0.02] border border-white/5 rounded-3xl hover:bg-white/[0.05] transition-all flex items-center gap-4 text-left">
              <div class="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center">
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path></svg>
              </div>
              <h4 class="text-sm font-semibold text-white truncate">{folder.name}</h4>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <section class="pb-10" in:fade>
      <div class="bg-white/[0.02] border border-white/5 rounded-[32px] overflow-hidden">
        <table class="w-full text-left">
          <thead class="bg-white/5 text-[10px] text-gray-500 uppercase tracking-widest">
            <tr>
              <th class="px-8 py-4 font-bold">Nama</th>
              <th class="hidden sm:table-cell px-4 py-4 text-center">Ukuran</th>
              <th class="px-8 py-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
  {#each items as item (item.id)}
    <tr class="hover:bg-white/[0.03] transition-all group">
      <td class="px-8 py-6">
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          </div>
          <div>
            <p class="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">{item.title}</p>
            <p class="text-[10px] text-gray-500 uppercase">{item.mimeType.split('/')[1]}</p>
          </div>
        </div>
      </td>

      <td class="hidden sm:table-cell px-4 py-6 text-gray-400 text-center font-mono text-xs">
        {item.fileSize ? (item.fileSize / (1024 * 1024)).toFixed(2) + ' MB' : '--'}
      </td>

      <td class="hidden lg:table-cell px-6 py-6">
        <div class="flex items-center gap-2">
          <code class="text-[10px] bg-blue-500/5 px-2 py-1 rounded-full text-blue-400/80 border border-blue-500/10 font-mono">
            {item.ipfsHash.slice(0, 10)}...
          </code>
          <button class="text-gray-600 hover:text-white" title="Copy CID">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V7m-4 4h.01m-6.99 0h.01M12 11h.01M12 15h.01M12 19h.01M8 11h.01M8 15h.01M8 19h.01"></path></svg>
          </button>
        </div>
      </td>

      <td class="hidden xl:table-cell px-6 py-6 text-center">
        {#if item.isOnChain}
          <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 text-green-500 text-[10px] font-bold border border-green-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            ON-CHAIN
          </span>
        {:else}
          <span class="text-gray-600 text-[10px]">PENDING</span>
        {/if}
      </td>

      <td class="px-8 py-6 text-right">
        <div class="flex justify-end gap-2">
          {#if item.isOnChain}
            <a href="https://sepolia.etherscan.io/tx/{item.blockchainTx}" target="_blank" class="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-blue-400" title="View Transaction">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
            </a>
          {/if}
          <button onclick={() => handleDelete(item.id)} class="p-2 hover:bg-red-500/20 rounded-lg text-gray-500 hover:text-red-400">
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
  <UploadModal isOpen={showUpload} onClose={() => showUpload = false} onUploaded={loadStorageData} folderId={currentFolder?.id} />
</main>