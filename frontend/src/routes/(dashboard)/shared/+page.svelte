<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';

  import ViewSwitcher from '$lib/components/storage/ViewSwitcher.svelte';
  import FileTable from '$lib/components/storage/FileTable.svelte';
  import FileGrid from '$lib/components/storage/FileGrid.svelte';
  import { storageService } from '$lib/services/storage/storage';
  import type { Document, Folder } from '$lib/types/storage';

  type SortField = 'name' | 'createdAt' | 'updatedAt' | 'fileSize' | 'type';
  type SortDirection = 'asc' | 'desc';
  type SortPreset = {
    id: string;
    label: string;
    field: SortField;
    direction: SortDirection;
  };

  let folders = $state<Folder[]>([]);
  let items = $state<Document[]>([]);
  let isLoading = $state(true);
  let isRefreshing = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');
  let viewMode = $state(2);
  let searchQuery = $state('');
  let selectedItems = $state<string[]>([]);
  let selectionMode = $state(false);
  let sortOption = $state<{ field: SortField; direction: SortDirection }>({
    field: 'updatedAt',
    direction: 'desc'
  });

  const sortPresets: SortPreset[] = [
    { id: 'updated-desc', label: 'Last modified', field: 'updatedAt', direction: 'desc' },
    { id: 'created-desc', label: 'Newest shared', field: 'createdAt', direction: 'desc' },
    { id: 'created-asc', label: 'Oldest shared', field: 'createdAt', direction: 'asc' },
    { id: 'name-asc', label: 'Name A-Z', field: 'name', direction: 'asc' },
    { id: 'name-desc', label: 'Name Z-A', field: 'name', direction: 'desc' },
    { id: 'size-desc', label: 'Largest first', field: 'fileSize', direction: 'desc' },
    { id: 'size-asc', label: 'Smallest first', field: 'fileSize', direction: 'asc' },
    { id: 'type-asc', label: 'File type', field: 'type', direction: 'asc' }
  ];

  const normalizedSearchQuery = $derived(searchQuery.trim().toLowerCase());
  const visibleFolders = $derived(normalizedSearchQuery
    ? folders.filter(folder => [folder.name, folder.owner?.username, folder.owner?.walletAddress].some(value => value?.toLowerCase().includes(normalizedSearchQuery)))
    : folders
  );
  const visibleItems = $derived(normalizedSearchQuery
    ? items.filter(item => [item.title, item.fileName, item.mimeType, item.owner?.username, item.owner?.walletAddress].some(value => value?.toLowerCase().includes(normalizedSearchQuery)))
    : items
  );
  const sortedFolders = $derived(sortItems(visibleFolders, sortOption));
  const sortedItems = $derived(sortItems(visibleItems, sortOption));
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

  function openFolder(folder: { id: string } | null) {
    if (!folder) return;
    window.location.href = `/storage?folder=${folder.id}`;
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

  async function loadSharedItems(refresh = false) {
    try {
      isLoading = !refresh;
      isRefreshing = refresh;
      errorMessage = '';

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

      folders = folderResponse.data.map(item => item.folder);
      items = documentResponse.data.map(item => item.document);
      selectedItems = selectedItems.filter(id => folders.some(folder => folder.id === id) || items.some(item => item.id === id));
    } catch (error) {
      folders = [];
      items = [];
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

<div class="space-y-8" in:fade>
  <section class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400">Shared with me</p>
      <h1 class="mt-3 text-3xl font-bold text-white md:text-4xl">Dibagikan</h1>
      <p class="mt-2 max-w-2xl text-sm text-gray-400">
        File dan folder yang dibagikan user lain ke akun Anda.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <button
        onclick={() => loadSharedItems(true)}
        disabled={isLoading || isRefreshing}
        class="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-blue-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg class="h-4 w-4 {isRefreshing ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Refresh
      </button>
      <button
        onclick={toggleSelectMode}
        disabled={totalCount === 0}
        class="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-blue-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selectionMode ? 'Cancel selection' : 'Select'}
      </button>
      <ViewSwitcher bind:viewMode />
    </div>
  </section>

  <section class="grid gap-4 md:grid-cols-3">
    <div class="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <p class="text-xs font-medium uppercase tracking-widest text-gray-500">Total</p>
      <p class="mt-2 text-3xl font-bold text-white">{totalCount}</p>
    </div>
    <div class="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <p class="text-xs font-medium uppercase tracking-widest text-gray-500">Folders</p>
      <p class="mt-2 text-3xl font-bold text-white">{folders.length}</p>
    </div>
    <div class="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <p class="text-xs font-medium uppercase tracking-widest text-gray-500">Documents</p>
      <p class="mt-2 text-3xl font-bold text-white">{items.length}</p>
    </div>
  </section>

  <section class="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/[0.02] p-4 md:flex-row md:items-center md:justify-between">
    <div class="relative flex-1">
      <svg class="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z" />
      </svg>
      <input
        bind:value={searchQuery}
        placeholder="Search shared files, folders, or owners..."
        class="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-blue-500/50"
      />
    </div>

    <select
      class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-200 outline-none transition focus:border-blue-500/50"
      value={`${sortOption.field}:${sortOption.direction}`}
      onchange={(event) => {
        const [field, direction] = event.currentTarget.value.split(':') as [SortField, SortDirection];
        sortOption = { field, direction };
      }}
    >
      {#each sortPresets as preset}
        <option value={`${preset.field}:${preset.direction}`}>{preset.label}</option>
      {/each}
    </select>
  </section>

  {#if errorMessage}
    <div class="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {errorMessage}
    </div>
  {/if}

  {#if successMessage}
    <div class="rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-200">
      {successMessage}
    </div>
  {/if}

  {#if selectionMode && selectedCount > 0}
    <section class="flex flex-col gap-3 rounded-3xl border border-blue-500/20 bg-blue-500/10 p-4 md:flex-row md:items-center md:justify-between">
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
        {searchQuery ? 'Try another search keyword.' : 'Files or folders shared to you will appear here.'}
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
              onRefresh={() => loadSharedItems(true)}
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
              onRefresh={() => loadSharedItems(true)}
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
          onRefresh={() => loadSharedItems(true)}
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
          onRefresh={() => loadSharedItems(true)}
        />
      {/if}
    </div>
  {/if}
</div>
