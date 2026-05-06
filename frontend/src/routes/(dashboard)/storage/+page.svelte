<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { storageService } from '$lib/services';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  // Komponen Refactor
  import Breadcrumbs from '$lib/components/storage/Breadcrumbs.svelte';
  import ViewSwitcher from '$lib/components/storage/ViewSwitcher.svelte';
  import FileTable from '$lib/components/storage/FileTable.svelte';
  import FileGrid from '$lib/components/storage/FileGrid.svelte';

  // Komponen Modal
  import UploadModal from '$lib/components/storage/UploadModal.svelte';
  import FolderModal from '$lib/components/storage/FolderModal.svelte';

  // State Management
  let folders = $state([]);
  let items = $state([]);
  let breadcrumbs = $state([]);
  let currentFolder = $state(null);
  let isLoading = $state(true);
  let isProcessing = $state(false); 
  let viewMode = $state(1); 
  let showUpload = $state(false);
  let showFolder = $state(false);

  function getFileTheme(mimeType: string) {
    if (mimeType.includes('image')) return { color: 'text-purple-500 bg-purple-500/10' };
    if (mimeType.includes('video')) return { color: 'text-red-500 bg-red-500/10' };
    if (mimeType.includes('pdf') || mimeType.includes('document')) return { color: 'text-orange-500 bg-orange-500/10' };
    return { color: 'text-blue-500 bg-blue-500/10' };
  }

  async function loadStorageData() {
    try {
      isLoading = true;
      const folderId = $page.url.searchParams.get('folder');

      if (folderId) {
        const pathRes = await storageService.getFolderPath(folderId);
        if (pathRes.success) {
          breadcrumbs = pathRes.data;
          currentFolder = pathRes.data[pathRes.data.length - 1];
        }
      } else {
        breadcrumbs = [];
        currentFolder = null;
      }

      const [fRes, dRes] = await Promise.all([
        storageService.getFolders(folderId).catch(() => ({ success: false, data: [] })),
        storageService.getDocuments(folderId).catch(() => ({ success: false, data: [] }))
      ]);
      
      folders = fRes.success ? fRes.data : [];
      items = dRes.success ? dRes.data : [];
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => { isLoading = false; }, 300);
    }
  }

  $effect(() => {
    $page.url.searchParams.get('folder');
    loadStorageData();
  });

  const navigateTo = (folder: any | null) => {
    goto(folder ? `?folder=${folder.id}` : '?', { noScroll: true });
  };

  async function withLoading(fn: () => Promise<void>) {
    isProcessing = true;
    try { await fn(); } finally { isProcessing = false; }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus file ini?")) return;
    await withLoading(async () => { await storageService.deleteItem(id); await loadStorageData(); });
  }

  async function handleDeleteFolder(id: string) {
    if (!confirm("Hapus folder ini?")) return;
    await withLoading(async () => { await storageService.deleteFolder(id); await loadStorageData(); });
  }

  onMount(loadStorageData);
</script>

<main class="relative w-full flex-1 p-4 sm:p-6 md:p-10 overflow-y-auto max-w-[1600px] mx-auto">
  
  {#if isProcessing}
    <div class="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade>
      <div class="bg-[#121214] p-8 rounded-[40px] border border-white/10 shadow-2xl flex flex-col items-center" in:scale>
        <div class="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h3 class="text-white font-bold text-lg">DecentraShare Sync</h3>
        <p class="text-gray-500 text-sm italic">Processing Ledger...</p>
      </div>
    </div>
  {/if}

  <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-10">
    <div>
      <Breadcrumbs {breadcrumbs} {currentFolder} {navigateTo} />
      <div class="flex items-center gap-4">
        <h2 class="text-2xl md:text-3xl font-black text-white tracking-tight">
          {currentFolder ? currentFolder.name : 'All Files'}
        </h2>
        <ViewSwitcher bind:viewMode />
      </div>
    </div>
    
    <div class="flex gap-3 w-full sm:w-auto">
      <button onclick={() => showFolder = true} class="flex-1 sm:flex-none px-6 py-3 bg-white/5 border border-white/10 text-white rounded-[20px] font-bold text-sm hover:bg-white/10 transition-all">+ Folder</button>
      <button onclick={() => showUpload = true} class="flex-1 sm:flex-none px-6 py-3 bg-blue-600 text-white rounded-[20px] font-bold text-sm hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20">Upload</button>
    </div>
  </header>

  {#if isLoading}
    <div class="flex flex-col items-center justify-center h-80 border border-white/5 rounded-[48px] bg-white/[0.01]">
      <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p class="text-gray-500 text-sm animate-pulse font-bold tracking-widest uppercase text-[10px]">Syncing...</p>
    </div>
  {:else}
    <div in:fade>
      {#if viewMode === 1}
        <section class="mb-10">
          <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Folders</h3>
          <FileGrid {folders} items={[]} openFolder={navigateTo} {handleDeleteFolder} {handleDelete} {getFileTheme} />
        </section>
        <section>
          <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Documents</h3>
          <FileTable folders={[]} {items} viewMode={1} openFolder={navigateTo} {handleDeleteFolder} {handleDelete} {getFileTheme} />
        </section>
      {:else if viewMode === 2}
        <FileTable {folders} {items} viewMode={2} openFolder={navigateTo} {handleDeleteFolder} {handleDelete} {getFileTheme} />
      {:else}
        <FileGrid {folders} {items} openFolder={navigateTo} {handleDeleteFolder} {handleDelete} {getFileTheme} />
      {/if}
    </div>
  {/if}

  <FolderModal isOpen={showFolder} onClose={() => showFolder = false} onCreated={loadStorageData} parentId={currentFolder?.id} />
  <UploadModal isOpen={showUpload} onClose={() => showUpload = false} onUploaded={() => withLoading(loadStorageData)} folderId={currentFolder?.id} />
</main>