<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';

  import Breadcrumbs from '$lib/components/storage/Breadcrumbs.svelte';
  import UploadModal from '$lib/components/storage/UploadModal.svelte';
  import ViewSwitcher from '$lib/components/storage/ViewSwitcher.svelte';
  import FileTable from '$lib/components/storage/FileTable.svelte';
  import FileGrid from '$lib/components/storage/FileGrid.svelte';
  import { storageService } from '$lib/services/storage/storage';
  import type { Document, Folder } from '$lib/types/storage';

  type SortField = 'name' | 'createdAt' | 'updatedAt' | 'fileSize' | 'type';
  type SortDirection = 'asc' | 'desc';
  let rootFolders = $state<Folder[]>([]);
  let folders = $state<Folder[]>([]);
  let items = $state<Document[]>([]);
  let breadcrumbs = $state<{ id: string; name: string }[]>([]);
  let currentFolder = $state<{ id: string; name: string; parentId?: string | null } | null>(null);
  let isLoading = $state(true);
  let isRefreshing = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');
  let viewMode = $state(2);
  let selectedItems = $state<string[]>([]);
  let selectionMode = $state(false);
  let showUpload = $state(false);
  let folderRoles = $state<Record<string, 'VIEWER' | 'EDITOR' | 'ADMIN'>>({});

  const currentFolderRole = $derived(currentFolder ? folderRoles[currentFolder.id] : undefined);
  const canUploadToCurrentFolder = $derived(Boolean(currentFolder && currentFolderRole === 'EDITOR'));
  const sortedFolders = $derived(sortItems(folders, { field: 'updatedAt', direction: 'desc' }));
  const sortedItems = $derived(sortItems(items, { field: 'updatedAt', direction: 'desc' }));
  const totalCount = $derived(folders.length + items.length);
  const visibleCount = $derived(sortedFolders.length + sortedItems.length);
  const selectedFolders = $derived(folders.filter(folder => selectedItems.includes(folder.id)));
  const selectedDocuments = $derived(items.filter(item => selectedItems.includes(item.id)));
  const selectedCount = $derived(selectedFolders.length + selectedDocuments.length);
  const selectedTypeValue = $derived(selectedFolders.length > 0 && selectedDocuments.length > 0 ? 'mixed' : selectedFolders.length > 0 ? 'folders' : selectedDocuments.length > 0 ? 'documents' : 'items');

  function getFileTheme(mimeType: string) {
    if (mimeType.includes('image')) return { color: 'text-purple-500 bg-purple-500/10' };
    if (mimeType.includes('video')) return { color: 'text-red-500 bg-red-500/10' };
    if (mimeType.includes('pdf') || mimeType.includes('document')) return { color: 'text-orange-500 bg-orange-500/10' };
    return { color: 'text-blue-500 bg-blue-500/10' };
  }

  function getSortableName(item: { name?: string; title?: string; fileName?: string }): string {
    return (item.name || item.title || item.fileName || '').trim();
  }

  function getSortableType(item: { mimeType?: string; name?: string; title?: string; fileName?: string }): string {
    if (item.mimeType) return item.mimeType.toLowerCase();
    const name = getSortableName(item);
    const extension = name.includes('.') ? name.split('.').pop() : '';
    return extension?.toLowerCase() || 'folder';
  }

  function compareValues(aValue: string | number, bValue: string | number, direction: SortDirection): number {
    const result = typeof aValue === 'string' && typeof bValue === 'string'
      ? aValue.localeCompare(bValue, 'en', { numeric: true, sensitivity: 'base' })
      : Number(aValue) - Number(bValue);

    return direction === 'asc' ? result : -result;
  }

  function sortItems<T extends { name?: string; title?: string; fileName?: string; createdAt?: string; updatedAt?: string; fileSize?: number; mimeType?: string }>(
    array: T[],
    { field, direction }: { field: SortField; direction: SortDirection }
  ): T[] {
    return [...array].sort((a, b) => {
      let comparison = 0;

      switch (field) {
        case 'name':
          comparison = compareValues(getSortableName(a), getSortableName(b), direction);
          break;
        case 'createdAt':
        case 'updatedAt':
          comparison = compareValues(
            a[field] ? new Date(a[field]!).getTime() : 0,
            b[field] ? new Date(b[field]!).getTime() : 0,
            direction
          );
          break;
        case 'fileSize':
          comparison = compareValues(a.fileSize ?? 0, b.fileSize ?? 0, direction);
          break;
        case 'type':
          comparison = compareValues(getSortableType(a), getSortableType(b), direction);
          break;
      }

      if (comparison !== 0) return comparison;
      return getSortableName(a).localeCompare(getSortableName(b), 'en', { numeric: true, sensitivity: 'base' });
    });
  }

  function toggleSelection(id: string) {
    selectedItems = selectedItems.includes(id)
      ? selectedItems.filter(itemId => itemId !== id)
      : [...selectedItems, id];
  }

  function toggleSelectMode() {
    selectionMode = !selectionMode;
    if (!selectionMode) selectedItems = [];
  }

  async function openFolder(folder: { id: string } | null) {
    if (!folder) {
      currentFolder = null;
      breadcrumbs = [];
      folders = rootFolders;
      items = [];
      return;
    }

    await loadSharedFolderContents(folder.id);
  }

  function goBack() {
    if (breadcrumbs.length > 1) {
      const parentFolder = breadcrumbs[breadcrumbs.length - 2];
      openFolder(parentFolder);
    } else {
      openFolder(null);
    }
  }

  function noop() {}

  async function handleDownload(id: string, type: 'folder' | 'document') {
    try {
      errorMessage = '';
      successMessage = '';

      if (type === 'folder') {
        const folder = folders.find(item => item.id === id);
        await storageService.downloadFolder(id, folder?.name);
      } else {
        const document = items.find(item => item.id === id);
        await storageService.downloadDocument(id, document?.fileName || document?.title);
      }

      successMessage = 'Item downloaded successfully.';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to download item.';
    }
  }

  async function downloadSelectedItems() {
    if (selectedCount === 0) return;

    try {
      errorMessage = '';
      successMessage = '';
      const documentIds = selectedDocuments.map(document => document.id);
      const folderIds = selectedFolders.map(folder => folder.id);

      if (documentIds.length === 1 && folderIds.length === 0) {
        await storageService.downloadDocument(documentIds[0], selectedDocuments[0]?.fileName || selectedDocuments[0]?.title);
      } else if (folderIds.length === 1 && documentIds.length === 0) {
        await storageService.downloadFolder(folderIds[0], selectedFolders[0]?.name);
      } else {
        await storageService.bulkDownloadItems({ documentIds, folderIds });
      }

      successMessage = `${documentIds.length + folderIds.length} item${documentIds.length + folderIds.length > 1 ? 's' : ''} downloaded.`;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to download selected items.';
    }
  }

  async function loadSharedFolderContents(folderId: string) {
    try {
      isLoading = true;
      errorMessage = '';

      const [pathResponse, folderResponse, documentResponse] = await Promise.all([
        storageService.getFolderPath(folderId),
        storageService.getFolders(folderId),
        storageService.getFolderContents(folderId),
      ]);

      if (!pathResponse.success || !pathResponse.data) {
        throw new Error(pathResponse.message || 'Failed to load folder path.');
      }

      if (!folderResponse.success || !folderResponse.data) {
        throw new Error(folderResponse.message || 'Failed to load child folders.');
      }

      if (!documentResponse.success || !documentResponse.data) {
        throw new Error(documentResponse.message || 'Failed to load folder documents.');
      }

      breadcrumbs = pathResponse.data;
      currentFolder = pathResponse.data[pathResponse.data.length - 1] || null;
      folders = folderResponse.data.map(folder => ({ ...folder, accessRole: folderRoles[folder.id] }));
      items = documentResponse.data.map(document => ({ ...document, accessRole: currentFolderRole ?? 'VIEWER' }));
      selectedItems = selectedItems.filter(id => folders.some(folder => folder.id === id) || items.some(item => item.id === id));
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load shared folder contents.';
    } finally {
      isLoading = false;
    }
  }

  async function refreshSharedItems() {
    if (currentFolder) {
      isRefreshing = true;
      await loadSharedFolderContents(currentFolder.id);
      isRefreshing = false;
      return;
    }

    await loadSharedItems(true);
  }

  async function loadSharedItems(refresh = false) {
    try {
      isLoading = !refresh;
      isRefreshing = refresh;
      errorMessage = '';
      currentFolder = null;
      breadcrumbs = [];

      const [documentResponse, folderResponse] = await Promise.all([
        storageService.getSharedWithMe(),
        storageService.getSharedFoldersWithMe(),
      ]);

      if (!documentResponse.success || !documentResponse.data) {
        throw new Error(documentResponse.message || 'Failed to load shared documents.');
      }

      if (!folderResponse.success || !folderResponse.data) {
        throw new Error(folderResponse.message || 'Failed to load shared folders.');
      }

      folderRoles = Object.fromEntries(folderResponse.data.map(item => [item.folder.id, item.role]));
      const sharedFolders = folderResponse.data.map(item => ({ ...item.folder, accessRole: item.role }));
      const sharedFolderIds = new Set(sharedFolders.map(folder => folder.id));
      rootFolders = sharedFolders.filter(folder => !folder.parentId || !sharedFolderIds.has(folder.parentId));
      folders = rootFolders;
      items = documentResponse.data.map(item => ({ ...item.document, accessRole: 'VIEWER' }));
      selectedItems = selectedItems.filter(id => folders.some(folder => folder.id === id) || items.some(item => item.id === id));
    } catch (error) {
      rootFolders = [];
      folderRoles = {};
      folders = [];
      items = [];
      breadcrumbs = [];
      currentFolder = null;
      selectedItems = [];
      errorMessage = error instanceof Error ? error.message : 'Failed to load shared items.';
    } finally {
      isLoading = false;
      isRefreshing = false;
    }
  }

  onMount(() => {
    loadSharedItems();
  });
</script>

<svelte:head>
  <title>Dibagikan | DecentraShare</title>
</svelte:head>

<main class="relative w-full flex-1 p-4 sm:p-6 md:p-10 overflow-y-auto max-w-[1600px] mx-auto" in:fade>
  <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6 mb-10">
    <div class="flex items-center gap-3 flex-1 min-w-0">
      {#if currentFolder}
        <button onclick={goBack} class="p-2 mt-7 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all shrink-0" title="Back to parent folder">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </button>
      {/if}

      <div class="min-w-0">
        {#if currentFolder}
          <Breadcrumbs {breadcrumbs} {currentFolder} navigateTo={openFolder} />
        {:else}
          <p class="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Shared with me</p>
        {/if}
        <div class="flex items-center gap-3">
          <h2 class="text-2xl md:text-3xl font-black text-white tracking-tight truncate">{currentFolder ? currentFolder.name : 'Dibagikan'}</h2>
          <ViewSwitcher bind:viewMode />
        </div>
        <p class="mt-2 max-w-xl text-sm text-gray-400">
          {currentFolder ? 'Isi folder yang dibagikan ke akun Anda.' : 'File dan folder yang dibagikan user lain ke akun Anda.'}
        </p>
      </div>
    </div>

    <div class="flex gap-3 w-full sm:w-auto">
      <button
        onclick={toggleSelectMode}
        disabled={totalCount === 0}
        class="flex-1 sm:w-32 px-4 py-3 bg-white/5 border border-white/10 text-white rounded-[20px] font-medium text-sm hover:bg-white/10 transition-all duration-300 flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 {selectionMode ? 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-500/50 hover:from-blue-500 hover:to-blue-600 shadow-lg shadow-blue-500/30 ring-1 ring-blue-400/30 animate-pulse-slow' : ''}"
        title={selectionMode ? 'Exit selection mode' : 'Select items'}
      >
        <span class="relative">
          <svg class="w-4 h-4 transition-all duration-300 {selectionMode ? 'drop-shadow-[0_0_8px_rgba(248,113,113,0.6)]' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {#if selectionMode}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
            {:else}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            {/if}
          </svg>
          {#if selectionMode}
            <span class="absolute inset-0 rounded-full bg-blue-500/40 blur-md animate-ping opacity-70"></span>
          {/if}
        </span>
        <span class="hidden sm:inline transition-colors duration-300 {selectionMode ? 'text-blue-100 font-semibold' : ''}">
          {selectionMode ? 'Cancel' : 'Select'}
        </span>
      </button>

      <button onclick={refreshSharedItems} class="flex-1 sm:w-32 px-4 py-3 bg-white/5 border border-white/10 text-white rounded-[20px] font-medium text-sm hover:bg-white/10 transition-all disabled:opacity-50 flex items-center justify-center gap-2" disabled={isLoading || isRefreshing}>
        <svg class="w-4 h-4 {isRefreshing ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Refresh
      </button>

      {#if canUploadToCurrentFolder}
        <button onclick={() => showUpload = true} class="flex-1 sm:w-32 px-4 py-3 bg-blue-600 text-white rounded-[20px] font-bold text-sm hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0L8 8m4-4l4 4" /></svg>
          Upload
        </button>
      {/if}
    </div>
  </header>

  <UploadModal isOpen={showUpload} onClose={() => showUpload = false} onUploaded={refreshSharedItems} folderId={currentFolder?.id ?? null} />

  {#if errorMessage}
    <div class="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {errorMessage}
    </div>
  {/if}

  {#if successMessage}
    <div class="mb-6 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-200">
      {successMessage}
    </div>
  {/if}

  {#if selectionMode && selectedCount > 0}
    <section class="mb-6 flex flex-col gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 md:flex-row md:items-center md:justify-between">
      <p class="text-sm text-blue-100">
        {selectedCount} {selectedTypeValue} selected
      </p>
      <div class="flex gap-2">
        <button
          onclick={downloadSelectedItems}
          class="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
        >
          Download
        </button>
        <button
          onclick={() => { selectionMode = false; selectedItems = []; }}
          class="rounded-2xl border border-white/10 px-4 py-2 text-sm font-medium text-gray-200 transition hover:text-white"
        >
          Clear
        </button>
      </div>
    </section>
  {/if}

  {#if isLoading}
    <div class="flex flex-col items-center justify-center rounded-[32px] border border-white/5 bg-white/[0.01] py-24 text-center">
      <div class="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      <p class="text-gray-400">Loading shared items...</p>
    </div>
  {:else if visibleCount === 0}
    <div class="flex flex-col items-center justify-center rounded-[32px] border border-white/5 bg-white/[0.01] py-24 text-center">
      <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-500/10 text-blue-300">
        <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <h2 class="text-lg font-semibold text-white">No shared items found</h2>
      <p class="mt-2 max-w-md text-sm text-gray-500">
        Files or folders shared to you will appear here.
      </p>
    </div>
  {:else}
    <div in:fade>
      {#if viewMode === 1}
        <section class="mb-10">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Folders</h3>
            <span class="text-[10px] text-gray-600">{sortedFolders.length} items</span>
          </div>
          {#if sortedFolders.length > 0}
            <FileGrid
              folders={sortedFolders}
              items={[]}
              {openFolder}
              handleDeleteFolder={noop}
              handleDelete={noop}
              {getFileTheme}
              onDownload={handleDownload}
              {selectedItems}
              {selectionMode}
              onToggleSelect={toggleSelection}
              onRefresh={refreshSharedItems}
            />
          {:else}
            <p class="pl-2 text-sm italic text-gray-600">No shared folders</p>
          {/if}
        </section>

        <section>
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Documents</h3>
            <span class="text-[10px] text-gray-600">{sortedItems.length} items</span>
          </div>
          {#if sortedItems.length > 0}
            <FileTable
              folders={[]}
              items={sortedItems}
              viewMode={1}
              {openFolder}
              handleDeleteFolder={noop}
              handleDelete={noop}
              {getFileTheme}
              onDownload={handleDownload}
              {selectedItems}
              {selectionMode}
              onToggleSelect={toggleSelection}
              onRefresh={refreshSharedItems}
            />
          {:else}
            <p class="pl-2 text-sm italic text-gray-600">No shared documents</p>
          {/if}
        </section>
      {:else if viewMode === 2}
        <FileTable
          folders={sortedFolders}
          items={sortedItems}
          viewMode={2}
          {openFolder}
          handleDeleteFolder={noop}
          handleDelete={noop}
          {getFileTheme}
          onDownload={handleDownload}
          {selectedItems}
          {selectionMode}
          onToggleSelect={toggleSelection}
          onRefresh={refreshSharedItems}
        />
      {:else}
        <FileGrid
          folders={sortedFolders}
          items={sortedItems}
          {openFolder}
          handleDeleteFolder={noop}
          handleDelete={noop}
          {getFileTheme}
          onDownload={handleDownload}
          {selectedItems}
          {selectionMode}
          onToggleSelect={toggleSelection}
          onRefresh={refreshSharedItems}
        />
      {/if}
    </div>
  {/if}
</main>
