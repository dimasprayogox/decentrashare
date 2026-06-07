<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { storageService } from '$lib/services/storage/storage';
  import type { Document, Folder } from '$lib/types/storage';
  import FileGrid from '$lib/components/storage/FileGrid.svelte';
  import FileTable from '$lib/components/storage/FileTable.svelte';
  import ViewSwitcher from '$lib/components/storage/ViewSwitcher.svelte';
  import Breadcrumbs from '$lib/components/storage/Breadcrumbs.svelte';

  let folderDetail = $state<any>(null);
  let folders = $state<Folder[]>([]);
  let items = $state<Document[]>([]);
  let breadcrumbs = $state<{ id: string; name: string }[]>([]);
  let viewMode = $state(1); // 1 = split view, 2 = table view, 3 = grid view
  let isLoading = $state(true);
  let isDownloading = $state(false);
  let errorMessage = $state('');
  
  const isProcessing = $derived(isDownloading);
  
  let currentUser = $state<{
    id: string;
    username: string;
    walletAddress: string;
  } | null>(null);

  const folderId = $derived(page.params.id);
  const currentFolder = $derived(folderDetail ? { id: folderDetail.id, name: folderDetail.name } : null);

  const sortedFolders = $derived([...folders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  const sortedItems = $derived([...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

  function getFileTheme(mimeType: string) {
    if (mimeType.includes('image')) return { color: 'text-purple-500 bg-purple-500/10' };
    if (mimeType.includes('video')) return { color: 'text-red-500 bg-red-500/10' };
    if (mimeType.includes('pdf') || mimeType.includes('document')) return { color: 'text-orange-500 bg-orange-500/10' };
    return { color: 'text-blue-500 bg-blue-500/10' };
  }

  async function loadFolder() {
    try {
      isLoading = true;
      errorMessage = '';

      const detailRes = await storageService.getFolderDetail(folderId);
      if (!detailRes.success) throw new Error(detailRes.message || 'Folder not found');
      folderDetail = detailRes.data;

      const [fRes, dRes, pathRes] = await Promise.allSettled([
        storageService.getFolders(folderId),
        storageService.getDocuments(folderId),
        storageService.getFolderPath(folderId)
      ]);

      folders = (fRes.status === 'fulfilled' && fRes.value.success) ? fRes.value.data : [];
      items = (dRes.status === 'fulfilled' && dRes.value.success) ? dRes.value.data : [];
      breadcrumbs = (pathRes.status === 'fulfilled' && pathRes.value.success) ? pathRes.value.data : [];
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load folder';
    } finally {
      isLoading = false;
    }
  }

  async function downloadFolder() {
    if (!folderDetail || isDownloading) return;
    try {
      isDownloading = true;
      await storageService.downloadFolder(folderId, folderDetail.name);
    } catch (error) {
      console.error('Download folder failed:', error);
    } finally {
      isDownloading = false;
    }
  }

  async function downloadItem(id: string, type: 'folder' | 'document') {
    try {
      isDownloading = true;
      if (type === 'document') {
        const doc = items.find(d => d.id === id);
        if (doc) {
          await storageService.downloadDocument(id, doc.fileName || doc.title);
        }
      } else {
        const folder = folders.find(f => f.id === id);
        if (folder) {
          await storageService.downloadFolder(id, folder.name);
        }
      }
    } catch (error) {
      console.error('Download item failed:', error);
    } finally {
      isDownloading = false;
    }
  }

  const openFolder = (folder: { id: string } | null) => {
    if (folder) {
      goto(`/shared/link/folder/${folder.id}`);
    } else {
      goto('/shared');
    }
  };

  function goBack() {
    if (breadcrumbs.length > 1) {
      const parentFolder = breadcrumbs[breadcrumbs.length - 2];
      goto(`/shared/link/folder/${parentFolder.id}`);
    } else {
      goto('/shared');
    }
  }

  async function handleRefresh() {
    await loadFolder();
  }

  $effect(() => {
    if (folderId) {
      void loadFolder();
    }
  });

  onMount(() => {
    storageService.getCurrentUser()
      .then(response => {
        if (response.data) {
          currentUser = {
            id: response.data.id,
            username: response.data.username || '',
            walletAddress: response.data.walletAddress
          };
        }
      })
      .catch(() => {
        currentUser = null;
      });
  });
</script>

<main class="min-h-full p-4 sm:p-6 md:p-10 max-w-[1600px] mx-auto">
  <div class="mb-6">
    <button onclick={() => goto('/shared')} class="mb-4 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
      Back to Shared
    </button>
  </div>

  {#if isLoading}
    <div class="min-h-[400px] flex flex-col items-center justify-center rounded-[32px] border border-white/5 bg-white/[0.01] text-gray-300">
      <div class="w-10 h-10 rounded-full border-2 border-white/10 border-t-blue-400 animate-spin mb-4"></div>
      <p>Loading folder...</p>
    </div>
  {:else if errorMessage}
    <div class="min-h-[400px] flex flex-col items-center justify-center rounded-[32px] border border-red-500/20 bg-red-500/10 text-center px-6">
      <svg class="w-16 h-16 text-red-400/50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
      <p class="text-red-400 font-semibold mb-2">{errorMessage}</p>
      <button onclick={() => goto('/shared')} class="text-sm text-blue-400 hover:underline">Go to Shared with me</button>
    </div>
  {:else if folderDetail}
    <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6 mb-8">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        {#if breadcrumbs.length > 0}
          <button onclick={goBack} class="p-2 mt-7 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all shrink-0" title="Back to parent folder">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          </button>
        {/if}
        
        <div class="min-w-0">
          <Breadcrumbs {breadcrumbs} {currentFolder} {openFolder} />
          <div class="flex items-center gap-3">
            <h2 class="text-2xl md:text-3xl font-black text-white tracking-tight truncate">{folderDetail.name}</h2>
            <ViewSwitcher bind:viewMode />
          </div>
        </div>
      </div>
      
      <div class="flex gap-3 w-full sm:w-auto">
        {#if folderDetail && (folders.length > 0 || items.length > 0)}
          <button onclick={downloadFolder} disabled={isDownloading} class="flex-1 sm:flex-none px-6 py-3 bg-blue-600 text-white rounded-[20px] font-bold text-sm hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {#if isDownloading}
              <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Downloading...
            {:else}
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Download All
            {/if}
          </button>
        {/if}
      </div>
    </header>

    <!-- Content Container -->
    <div in:fade>
      {#if folders.length === 0 && items.length === 0}
        <div class="py-24 flex flex-col items-center justify-center text-center border border-white/5 rounded-[32px] bg-white/[0.01]">
          <div class="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 text-3xl">📭</div>
          <h3 class="text-white font-bold text-lg">This folder is empty</h3>
          <p class="text-gray-500 text-sm mt-1">No folders or documents have been shared here.</p>
        </div>
      {:else}
        {#if viewMode === 1}
          <!-- Split View -->
          <section class="mb-10">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Folders</h3>
              <span class="text-[10px] text-gray-600">{sortedFolders.length} items</span>
            </div>
            {#if sortedFolders.length > 0}
              <FileGrid 
                folders={sortedFolders} items={[]} {openFolder}
                handleDeleteFolder={() => {}} handleDelete={() => {}} {getFileTheme}
                trashMode={false}
                sharedMode={true}
                currentUserId={currentUser?.id}
                onDownload={downloadItem}
                onRefresh={handleRefresh}
              />
            {:else}<p class="text-gray-600 text-sm italic pl-2">No folders yet</p>{/if}
          </section>
          
          <section>
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Documents</h3>
              <span class="text-[10px] text-gray-600">{sortedItems.length} items</span>
            </div>
            {#if sortedItems.length > 0}
              <FileTable 
                folders={[]} items={sortedItems} viewMode={1} {openFolder}
                handleDeleteFolder={() => {}} handleDelete={() => {}} {getFileTheme}
                trashMode={false}
                sharedMode={true}
                currentUserId={currentUser?.id}
                onDownload={downloadItem}
                onRefresh={handleRefresh}
              />
            {:else}<p class="text-gray-600 text-sm italic pl-2">No documents yet</p>{/if}
          </section>
        {:else if viewMode === 2}
          <!-- Table View -->
          <FileTable 
            folders={sortedFolders} items={sortedItems} viewMode={2} {openFolder}
            handleDeleteFolder={() => {}} handleDelete={() => {}} {getFileTheme}
            trashMode={false}
            sharedMode={true}
            currentUserId={currentUser?.id}
            onDownload={downloadItem}
            onRefresh={handleRefresh}
          />
        {:else}
          <!-- Grid View -->
          <FileGrid 
            folders={sortedFolders} items={sortedItems} {openFolder}
            handleDeleteFolder={() => {}} handleDelete={() => {}} {getFileTheme}
            trashMode={false}
            sharedMode={true}
            currentUserId={currentUser?.id}
            onDownload={downloadItem}
            onRefresh={handleRefresh}
          />
        {/if}
      {/if}
    </div>
  {/if}

  {#if isProcessing}
    <div class="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade>
      <div class="bg-[#121214] p-8 rounded-[40px] border border-white/10 shadow-2xl flex flex-col items-center" in:scale>
        <div class="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h3 class="text-white font-bold text-lg">DecentraShare Sync</h3>
        <p class="text-gray-500 text-sm italic">Wait a minute...</p>
      </div>
    </div>
  {/if}
</main>
