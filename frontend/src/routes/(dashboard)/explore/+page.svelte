<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fade } from 'svelte/transition';

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
  let isSearching = $state(false);
  let searchError = $state('');
  let viewMode = $state(2);
  let currentUser = $state<{ id: string; username: string; walletAddress: string } | null>(null);
  let searchTimeout: ReturnType<typeof setTimeout>;
  let requestSeq = 0;

  const sortOption = $state<{ field: SortField; direction: SortDirection }>({
    field: 'updatedAt',
    direction: 'desc'
  });

  const publicFolders = $derived(folders.filter(folder => folder.privacy === 'PUBLIC' && folder.ownerId !== currentUser?.id));
  const publicItems = $derived(items.filter(item => item.privacy === 'PUBLIC' && item.ownerId !== currentUser?.id));
  const sortedFolders = $derived(sortItems(publicFolders, sortOption));
  const sortedItems = $derived(sortItems(publicItems, sortOption));
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
        ? documentsResponse.data.filter(item => item.privacy === 'PUBLIC' && item.ownerId !== currentUser?.id)
        : [];
      folders = foldersResponse.success && foldersResponse.data
        ? foldersResponse.data.filter(folder => folder.privacy === 'PUBLIC' && folder.ownerId !== currentUser?.id)
        : [];
    } catch (error: unknown) {
      if (currentSeq !== requestSeq) return;
      folders = [];
      items = [];
      searchError = error instanceof Error ? error.message : 'Gagal mencari folder dan dokumen publik.';
    } finally {
      if (currentSeq === requestSeq) isSearching = false;
    }
  }

  function scheduleSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      void performSearch(query);
    }, 350);
  }

  async function handleDownload(id: string) {
    const item = items.find(document => document.id === id);
    await storageService.downloadDocument(id, item?.title || item?.fileName);
  }

  function noop() {}
  const isSelected = () => false;

  $effect(() => {
    query;
    currentUser?.id;
    scheduleSearch();
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
  <header class="flex flex-col gap-6 mb-8">
    <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
      <div>
        <p class="text-xs font-black uppercase tracking-[0.35em] text-emerald-400/80 mb-3">Explore</p>
        <h1 class="text-3xl md:text-4xl font-black tracking-tight text-white">Search Public Files & Folders</h1>
        <p class="text-sm text-gray-400 mt-2 max-w-2xl">Temukan folder dan dokumen berstatus Public yang diupload oleh user lain. Konten milik sendiri otomatis disembunyikan dari hasil.</p>
      </div>

      <ViewSwitcher bind:viewMode />
    </div>

    <div class="rounded-[28px] border border-white/10 bg-white/[0.03] p-3 sm:p-4 shadow-xl shadow-black/10">
      <div class="flex flex-col md:flex-row gap-3">
        <div class="relative flex-1">
          <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m1.1-5.4a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"/></svg>
          <input
            bind:value={query}
            class="w-full h-13 rounded-2xl border border-white/10 bg-black/20 pl-12 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all"
            placeholder="Cari folder, judul, nama file, atau tipe dokumen public..."
            autofocus
          />
        </div>
        <button
          onclick={() => performSearch(query)}
          class="h-13 px-6 rounded-2xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          disabled={isSearching || query.trim().length < 2}
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
        <span>Minimal 2 karakter untuk mulai mencari.</span>
        <span class="font-bold text-emerald-300">{resultCount} results · {sortedFolders.length} folders · {sortedItems.length} documents</span>
      </div>
    </div>
  </header>

  {#if query.trim().length < 2}
    <div class="py-24 flex flex-col items-center justify-center text-center border border-white/5 rounded-[32px] bg-white/[0.01]" transition:fade>
      <div class="w-14 h-14 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
        <svg class="w-7 h-7 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m1.1-5.4a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"/></svg>
      </div>
      <p class="text-white font-bold">Ketik minimal 2 karakter untuk mencari folder dan dokumen public.</p>
      <p class="text-gray-500 text-sm mt-1">Hasil hanya menampilkan konten public milik orang lain.</p>
    </div>
  {:else if isSearching}
    <div class="py-24 flex flex-col items-center justify-center text-center border border-white/5 rounded-[32px] bg-white/[0.01]" transition:fade>
      <div class="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p class="text-gray-400">Searching public folders and documents...</p>
    </div>
  {:else if searchError}
    <div class="py-20 text-center border border-red-500/20 rounded-[32px] bg-red-500/[0.03]" transition:fade>
      <p class="text-red-300 font-semibold">{searchError}</p>
      <button onclick={() => performSearch(query)} class="mt-4 px-4 py-2 rounded-xl bg-red-500/10 text-red-200 border border-red-500/20 hover:bg-red-500/20 transition-colors">Try again</button>
    </div>
  {:else if resultCount > 0}
    <div transition:fade>
      {#if viewMode === 3}
        <FileGrid
          folders={sortedFolders}
          items={sortedItems}
          openFolder={noop}
          handleDeleteFolder={noop}
          handleDelete={noop}
          {getFileTheme}
          onDownload={(id) => handleDownload(id)}
          selectedItems={[]}
          selectionMode={false}
          currentUserId={currentUser?.id}
          onToggleSelect={noop}
          {isSelected}
          onRefresh={() => performSearch(query)}
          publicExploreMode={true}
        />
      {:else}
        <FileTable
          folders={sortedFolders}
          items={sortedItems}
          viewMode={2}
          openFolder={noop}
          handleDeleteFolder={noop}
          handleDelete={noop}
          {getFileTheme}
          onDownload={(id) => handleDownload(id)}
          selectedItems={[]}
          selectionMode={false}
          currentUserId={currentUser?.id}
          onToggleSelect={noop}
          {isSelected}
          onRefresh={() => performSearch(query)}
          publicExploreMode={true}
        />
      {/if}
    </div>
  {:else}
    <div class="py-24 flex flex-col items-center justify-center text-center border border-white/5 rounded-[32px] bg-white/[0.01]" transition:fade>
      <p class="text-white font-bold">Tidak ada folder atau dokumen public dari user lain.</p>
      <p class="text-gray-500 text-sm mt-1">Coba keyword lain atau pastikan konten yang dicari berstatus Public.</p>
    </div>
  {/if}
</main>
