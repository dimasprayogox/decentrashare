<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fade } from 'svelte/transition';

  import Breadcrumbs from '$lib/components/storage/Breadcrumbs.svelte';
  import FileGrid from '$lib/components/storage/FileGrid.svelte';
  import FileTable from '$lib/components/storage/FileTable.svelte';
  import ViewSwitcher from '$lib/components/storage/ViewSwitcher.svelte';
  import { storageService } from '$lib/services/storage/storage';
  import type { Document, Folder } from '$lib/types/storage';

  type SortField = 'name' | 'createdAt' | 'updatedAt' | 'fileSize' | 'type';
  type SortDirection = 'asc' | 'desc';

  let query = $state('');
  let folders = $state<Folder[]>([]);
  let items = $state<Document[]>([]);
  let browseFolders = $state<Folder[]>([]);
  let browseItems = $state<Document[]>([]);
  let breadcrumbs = $state<Array<{ id: string; name: string }>>([]);
  let currentFolder = $state<(Pick<Folder, 'id' | 'name' | 'parentId' | 'owner'> & { owners?: Folder['owner'][] }) | null>(null);
  let isSearching = $state(false);
  let isFolderLoading = $state(false);
  let searchError = $state('');
  let viewMode = $state(2);
  let currentUser = $state<{ id: string; username: string; walletAddress: string } | null>(null);
  let searchTimeout: ReturnType<typeof setTimeout>;
  let requestSeq = 0;

  const sortOption = $state<{ field: SortField; direction: SortDirection }>({
    field: 'updatedAt',
    direction: 'desc'
  });

  const publicFolders = $derived(folders.filter(folder => folder.privacy === 'PUBLIC'));
  const publicItems = $derived(items.filter(item => item.privacy === 'PUBLIC'));
  const activeFolders = $derived(currentFolder ? browseFolders : publicFolders);
  const activeItems = $derived(currentFolder ? browseItems : publicItems);
  const sortedFolders = $derived(sortItems(activeFolders, sortOption));
  const sortedItems = $derived(sortItems(activeItems, sortOption));
  const resultCount = $derived(sortedFolders.length + sortedItems.length);

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
      ? aValue.localeCompare(bValue, 'id', { numeric: true, sensitivity: 'base' })
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
      return getSortableName(a).localeCompare(getSortableName(b), 'id', { numeric: true, sensitivity: 'base' });
    });
  }

  async function performSearch(searchQuery = query) {
    const trimmedQuery = searchQuery.trim();
    const currentSeq = ++requestSeq;

    if (trimmedQuery.length < 2) {
      folders = [];
      items = [];
      searchError = '';
      isSearching = false;
      return;
    }

    try {
      isSearching = true;
      searchError = '';
      const [documentsResponse, foldersResponse] = await Promise.all([
        storageService.searchPublicDocuments(trimmedQuery, 24),
        storageService.searchPublicFolders(trimmedQuery, 24)
      ]);
      if (currentSeq !== requestSeq) return;
      items = documentsResponse.success && documentsResponse.data
        ? documentsResponse.data.filter(item => item.privacy === 'PUBLIC')
        : [];
      folders = foldersResponse.success && foldersResponse.data
        ? foldersResponse.data.filter(folder => folder.privacy === 'PUBLIC')
        : [];
    } catch (error: unknown) {
      if (currentSeq !== requestSeq) return;
      folders = [];
      items = [];
      searchError = error instanceof Error ? error.message : 'Failed to search public folders and documents.';
    } finally {
      if (currentSeq === requestSeq) isSearching = false;
    }
  }

  function scheduleSearch(searchQuery = query) {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      void performSearch(searchQuery);
    }, 350);
  }

  async function handleDownload(id: string, type: 'folder' | 'document' = 'document') {
    if (type === 'folder') {
      const folder = [...folders, ...browseFolders].find(item => item.id === id);
      await storageService.downloadFolder(id, folder?.name);
      return;
    }

    const item = [...items, ...browseItems].find(document => document.id === id);
    await storageService.downloadDocument(id, item?.title || item?.fileName);
  }

  async function openFolder(folder: { id: string } | null) {
    if (!folder) {
      currentFolder = null;
      breadcrumbs = [];
      browseFolders = [];
      browseItems = [];
      searchError = '';
      return;
    }

    try {
      isFolderLoading = true;
      searchError = '';
      const response = await storageService.getPublicFolderContents(folder.id);
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to open public folder.');
      }

      currentFolder = response.data.currentFolder;
      breadcrumbs = response.data.breadcrumbs;
      browseFolders = response.data.folders.filter(item => item.privacy === 'PUBLIC');
      browseItems = response.data.documents.filter(item => item.privacy === 'PUBLIC');
    } catch (error: unknown) {
      searchError = error instanceof Error ? error.message : 'Failed to open public folder.';
    } finally {
      isFolderLoading = false;
    }
  }

  function noop() {}

  $effect(() => {
    if (currentFolder) return;
    scheduleSearch(query);
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

  onDestroy(() => {
    if (searchTimeout) clearTimeout(searchTimeout);
  });
</script>

<main class="relative w-full flex-1 p-4 sm:p-6 md:p-10 overflow-y-auto max-w-[1600px] mx-auto">
  <header class="mb-8 space-y-4">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6">
      <div class="min-w-0">
        <p class="text-xs font-black uppercase tracking-[0.35em] text-blue-400/80 mb-2">Explore</p>
        <div class="flex items-center gap-3">
          <h2 class="text-2xl md:text-3xl font-black text-white tracking-tight truncate">Public Files</h2>
          <ViewSwitcher bind:viewMode />
        </div>
    </div>
    </div>

    <section class="rounded-[28px] border border-white/10 bg-white/[0.03] p-3 sm:p-4 shadow-xl shadow-black/10" aria-label="Public file search">
      <div class="flex flex-col md:flex-row gap-3">
        <div class="relative flex-1">
          <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m1.1-5.4a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"/></svg>
          <input
            bind:value={query}
            class="w-full h-13 rounded-2xl border border-white/10 bg-black/20 pl-12 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all disabled:opacity-60"
            placeholder="Search folders or documents public..."
            disabled={currentFolder !== null}
          />
        </div>
        <button
          onclick={() => performSearch(query)}
          class="h-13 px-6 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          disabled={currentFolder !== null || isSearching || query.trim().length < 2}
        >
          {#if isSearching}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Searching
          {:else}
            Search
          {/if}
        </button>
      </div>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
        <span class="pl-1 text-xs text-gray-300"> {sortedFolders.length} folders | {sortedItems.length} documents</span>
      </div>
    </section>
  </header>

  {#if currentFolder}
    <section class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6 mb-8" transition:fade>
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <button onclick={() => openFolder(null)} class="p-2 mt-7 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all shrink-0" title="Back to search results">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </button>

        <div class="min-w-0">
          <Breadcrumbs {breadcrumbs} {currentFolder} navigateTo={openFolder} />
          <div class="flex items-center gap-3">
            <h2 class="text-2xl md:text-3xl font-black text-white tracking-tight truncate">{currentFolder.name}</h2>
          </div>
      </div>
      </div>
    </section>
  {/if}

  {#if isSearching || isFolderLoading}
    <div class="py-24 flex flex-col items-center justify-center text-center border border-white/5 rounded-[32px] bg-white/[0.01]" transition:fade>
      <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p class="text-gray-400">{isFolderLoading ? 'Loading public folder contents...' : 'Searching public folders and documents...'}</p>
    </div>
  {:else}
    <div in:fade>
      {#if !currentFolder && query.trim().length < 2}
        <div class="py-24 flex flex-col items-center justify-center text-center border border-white/5 rounded-[32px] bg-white/[0.01]">
          <div class="w-14 h-14 rounded-3xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
            <svg class="w-7 h-7 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m1.1-5.4a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"/></svg>
          </div>
          <p class="text-white font-bold">Type at least 2 characters to search public folders and documents.</p>
          <p class="text-gray-500 text-sm mt-1">Results show public content from every owner, including your own.</p>
        </div>
      {:else if searchError}
        <div class="py-20 text-center border border-red-500/20 rounded-[32px] bg-red-500/[0.03]">
          <p class="text-red-300 font-semibold">{searchError}</p>
          <button onclick={() => performSearch(query)} class="mt-4 px-4 py-2 rounded-xl bg-red-500/10 text-red-200 border border-red-500/20 hover:bg-red-500/20 transition-colors">Try again</button>
        </div>
      {:else if resultCount > 0}
        {#if viewMode === 3}
          <FileGrid
            folders={sortedFolders}
            items={sortedItems}
            {openFolder}
            handleDeleteFolder={noop}
            handleDelete={noop}
            {getFileTheme}
            onDownload={handleDownload}
            selectedItems={[]}
            selectionMode={false}
            currentUserId={currentUser?.id}
            onToggleSelect={noop}
            onRefresh={() => performSearch(query)}
            publicExploreMode={true}
          />
        {:else}
          <FileTable
            folders={sortedFolders}
            items={sortedItems}
            viewMode={2}
            {openFolder}
            handleDeleteFolder={noop}
            handleDelete={noop}
            {getFileTheme}
            onDownload={handleDownload}
            selectedItems={[]}
            selectionMode={false}
            currentUserId={currentUser?.id}
            onToggleSelect={noop}
            onRefresh={() => performSearch(query)}
            publicExploreMode={true}
          />
        {/if}
      {:else}
        <div class="text-center py-20 border border-white/5 rounded-[32px] bg-white/[0.01]">
          <p class="text-white font-bold">No public folders or documents found.</p>
          <p class="text-gray-500 text-sm mt-1">Try another keyword or make sure the content you are looking for is public.</p>
        </div>
      {/if}
    </div>
  {/if}
</main>
