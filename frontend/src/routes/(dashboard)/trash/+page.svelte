<script lang="ts">
  import { fade, scale, fly } from 'svelte/transition';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';

  import Breadcrumbs from '$lib/components/storage/Breadcrumbs.svelte';
  import ViewSwitcher from '$lib/components/storage/ViewSwitcher.svelte';
  import FileTable from '$lib/components/storage/FileTable.svelte';
  import FileGrid from '$lib/components/storage/FileGrid.svelte';
  import { storageService } from '$lib/services/storage/storage';
  import type { Document, Folder } from '$lib/types/storage';

  type SortField = 'name' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'fileSize' | 'type';
  type SortDirection = 'asc' | 'desc';
  type SortPreset = {
    id: string;
    label: string;
    field: SortField;
    direction: SortDirection;
  };

  let folders = $state<Folder[]>([]);
  let items = $state<Document[]>([]);
  let breadcrumbs = $state<{ id: string; name: string }[]>([]);
  let currentFolder = $state<{ id: string; name: string; parentId: string | null } | null>(null);
  let selectedItems = $state<string[]>([]);
  let selectionMode = $state(false);
  let isLoading = $state(true);
  let isProcessing = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');
  let showDestroyConfirm = $state(false);
  let showRestoreConfirm = $state(false);
  let viewMode = $state(1);
  let showSortDropdown = $state(false);
  let sortOption = $state<{ field: SortField; direction: SortDirection }>({
    field: 'deletedAt',
    direction: 'desc'
  });

  const sortPresets: SortPreset[] = [
    { id: 'deleted-desc', label: 'Recently deleted', field: 'deletedAt', direction: 'desc' },
    { id: 'deleted-asc', label: 'Oldest deleted', field: 'deletedAt', direction: 'asc' },
    { id: 'updated-desc', label: 'Last modified', field: 'updatedAt', direction: 'desc' },
    { id: 'name-asc', label: 'Name A-Z', field: 'name', direction: 'asc' },
    { id: 'name-desc', label: 'Name Z-A', field: 'name', direction: 'desc' },
    { id: 'size-desc', label: 'Largest first', field: 'fileSize', direction: 'desc' },
    { id: 'size-asc', label: 'Smallest first', field: 'fileSize', direction: 'asc' },
    { id: 'type-asc', label: 'File type', field: 'type', direction: 'asc' }
  ];

  const selectedFolders = $derived(folders.filter(folder => selectedItems.includes(folder.id)));
  const selectedDocuments = $derived(items.filter(item => selectedItems.includes(item.id)));
  const selectedCount = $derived(selectedFolders.length + selectedDocuments.length);
  const totalCount = $derived(folders.length + items.length);
  const sortedFolders = $derived(sortItems(folders, sortOption));
  const sortedItems = $derived(sortItems(items, sortOption));

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

  function sortItems<T extends { name?: string; title?: string; fileName?: string; createdAt?: string; updatedAt?: string; deletedAt?: string | null; fileSize?: number; mimeType?: string }>(
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
        case 'deletedAt':
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

  function clearSelection() {
    selectedItems = [];
  }

  function exitSelectionMode() {
    selectionMode = false;
    clearSelection();
  }

  function toggleSelectMode() {
    selectionMode = !selectionMode;
    if (!selectionMode) clearSelection();
  }

  function showStatus(message: string, type: 'success' | 'error') {
    successMessage = type === 'success' ? message : '';
    errorMessage = type === 'error' ? message : '';
  }

  function toggleSortDropdown() {
    showSortDropdown = !showSortDropdown;
  }

  function applySort(preset: SortPreset) {
    sortOption = { field: preset.field, direction: preset.direction };
    showSortDropdown = false;
  }

  function isActiveSort(preset: SortPreset): boolean {
    return sortOption.field === preset.field && sortOption.direction === preset.direction;
  }

  function getSortLabel(): string {
    return sortPresets.find(isActiveSort)?.label ?? 'Custom sort';
  }

  function getTrashRetentionText(deletedAt: string | null | undefined): string {
    if (!deletedAt) return 'Auto-delete in 60 days';
    const expiresAt = new Date(deletedAt);
    expiresAt.setDate(expiresAt.getDate() + 60);
    const remainingMs = expiresAt.getTime() - Date.now();
    if (remainingMs <= 0) return 'Scheduled for automatic deletion';
    const days = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    return `Auto-delete in ${days} day${days > 1 ? 's' : ''}`;
  }

  async function loadTrashItems() {
    try {
      isLoading = true;
      errorMessage = '';

      const folderId = page.url.searchParams.get('folder');
      const response = await storageService.getArchivedFolderContents(folderId);

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to load trash items.');
      }

      folders = response.data.folders;
      items = response.data.documents;
      currentFolder = response.data.currentFolder;
      breadcrumbs = response.data.breadcrumbs;
    } catch (error) {
      folders = [];
      items = [];
      currentFolder = null;
      breadcrumbs = [];
      errorMessage = error instanceof Error ? error.message : 'Failed to load trash items.';
    } finally {
      isLoading = false;
    }
  }

  async function refreshTrashItems() {
    if (isProcessing) return;
    await loadTrashItems();
  }

  async function downloadSelectedItems() {
    if (selectedCount === 0 || isProcessing) return;

    try {
      isProcessing = true;
      errorMessage = '';
      const documentIds = selectedDocuments.map(document => document.id);
      const folderIds = selectedFolders.map(folder => folder.id);

      if (documentIds.length === 1 && folderIds.length === 0) {
        await storageService.downloadDocument(documentIds[0], selectedDocuments[0]?.fileName || selectedDocuments[0]?.title);
      } else if (folderIds.length === 1 && documentIds.length === 0) {
        await storageService.downloadFolder(folderIds[0], selectedFolders[0]?.name);
      } else {
        await storageService.bulkDownloadItems({ documentIds, folderIds });
      }

      showStatus(`${documentIds.length + folderIds.length} item${documentIds.length + folderIds.length > 1 ? 's' : ''} downloaded.`, 'success');
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to download selected items.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  async function downloadSingleItem(id: string, type: 'folder' | 'document' = 'document') {
    if (isProcessing) return;

    try {
      isProcessing = true;
      errorMessage = '';
      if (type === 'folder') {
        const folder = folders.find(item => item.id === id);
        await storageService.downloadFolder(id, folder?.name);
      } else {
        const document = items.find(item => item.id === id);
        await storageService.downloadDocument(id, document?.fileName || document?.title);
      }
      showStatus(`${type === 'folder' ? 'Folder' : 'Document'} downloaded.`, 'success');
    } catch (error) {
      showStatus(error instanceof Error ? error.message : `Failed to download ${type}.`, 'error');
    } finally {
      isProcessing = false;
    }
  }

  function confirmSingleRestore(id: string) {
    selectedItems = [id];
    selectionMode = false;
    showRestoreConfirm = true;
  }

  function confirmSelectedRestore() {
    if (selectedCount === 0 || isProcessing) return;
    showRestoreConfirm = true;
  }

  function confirmSingleDestroy(id: string, type: 'folder' | 'document', name: string) {
    selectedItems = [id];
    selectionMode = false;
    showDestroyConfirm = true;
  }

  async function restoreSelectedItems() {
    if (selectedCount === 0 || isProcessing) return;

    try {
      isProcessing = true;
      errorMessage = '';

      await Promise.all([
        selectedFolders.length > 0 ? storageService.restoreFolders(selectedFolders.map(folder => folder.id)) : Promise.resolve(),
        selectedDocuments.length > 0 ? storageService.restoreDocuments(selectedDocuments.map(document => document.id)) : Promise.resolve()
      ]);

      showStatus(`${selectedCount} item${selectedCount > 1 ? 's' : ''} restored.`, 'success');
      showRestoreConfirm = false;
      exitSelectionMode();
      await loadTrashItems();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to restore selected items.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  async function destroySelectedItems() {
    if (selectedCount === 0 || isProcessing) return;

    try {
      isProcessing = true;
      errorMessage = '';

      await Promise.all([
        selectedFolders.length > 0 ? storageService.destroyFolders(selectedFolders.map(folder => folder.id)) : Promise.resolve(),
        selectedDocuments.length > 0 ? storageService.destroyDocuments(selectedDocuments.map(document => document.id)) : Promise.resolve()
      ]);

      showStatus(`${selectedCount} item${selectedCount > 1 ? 's' : ''} permanently deleted.`, 'success');
      showDestroyConfirm = false;
      exitSelectionMode();
      await loadTrashItems();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to permanently delete selected items.', 'error');
    } finally {
      isProcessing = false;
    }
  }

  function noop() {}

  const openFolder = (folder: { id: string } | null) => {
    if (folder) {
      goto(`/trash?folder=${folder.id}`, { noScroll: true });
    } else {
      goto('/trash', { noScroll: true });
    }
  };

  const goBack = () => {
    if (breadcrumbs.length > 1) {
      const parentFolder = breadcrumbs[breadcrumbs.length - 2];
      goto(`/trash?folder=${parentFolder.id}`, { noScroll: true });
    } else {
      goto('/trash', { noScroll: true });
    }
  };

  $effect(() => {
    page.url.searchParams.get('folder');
    void loadTrashItems();
  });

  $effect(() => {
    if (!showSortDropdown) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest?.('[data-sort-container]')) showSortDropdown = false;
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  });

</script>

<main class="relative w-full flex-1 p-4 sm:p-6 md:p-10 overflow-y-auto max-w-[1600px] mx-auto">
  {#if isProcessing}
    <div class="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade>
      <div class="bg-[#121214] p-8 rounded-[40px] border border-white/10 shadow-2xl flex flex-col items-center" in:scale>
        <div class="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h3 class="text-white font-bold text-lg">Processing Trash</h3>
        <p class="text-gray-500 text-sm italic">Please wait...</p>
      </div>
    </div>
  {/if}

  {#if showRestoreConfirm}
    <div class="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" transition:fade>
      <div class="bg-[#1a1a1e] p-6 rounded-2xl border border-white/10 shadow-2xl w-full max-w-md" in:scale>
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
            <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10a9 9 0 0114.31-7.28L21 6m0 0h-6m6 0v-6M21 14a9 9 0 01-14.31 7.28L3 18m0 0h6m-6 0v6" />
            </svg>
          </div>
          <div>
            <h3 class="text-white font-bold">Restore Items</h3>
            <p class="text-xs text-gray-500">Items will return to storage.</p>
          </div>
        </div>

        <p class="text-sm text-gray-300 mb-4">
          Restore {selectedCount} selected item{selectedCount > 1 ? 's' : ''} from trash?
        </p>

        <div class="max-h-40 overflow-y-auto mb-5 pr-2 space-y-2">
          {#each selectedFolders.slice(0, 5) as folder (folder.id)}
            <div class="text-sm text-gray-400">
              <p class="truncate">{folder.name}</p>
              <p class="text-[10px] text-gray-600">{getTrashRetentionText(folder.deletedAt)}</p>
            </div>
          {/each}
          {#each selectedDocuments.slice(0, Math.max(0, 5 - selectedFolders.length)) as item (item.id)}
            <div class="text-sm text-gray-400">
              <p class="truncate">{item.title}</p>
              <p class="text-[10px] text-gray-600">{getTrashRetentionText(item.deletedAt)}</p>
            </div>
          {/each}
          {#if selectedCount > 5}
            <p class="text-xs text-gray-600 italic">+ {selectedCount - 5} more item{selectedCount - 5 > 1 ? 's' : ''}</p>
          {/if}
        </div>

        <div class="flex gap-3">
          <button onclick={() => showRestoreConfirm = false} class="flex-1 h-10 bg-white/5 text-white rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50" disabled={isProcessing}>Cancel</button>
          <button onclick={restoreSelectedItems} class="flex-1 h-10 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed font-bold" disabled={isProcessing}>Restore</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showDestroyConfirm}
    <div class="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" transition:fade>
      <div class="bg-[#1a1a1e] p-6 rounded-2xl border border-white/10 shadow-2xl w-full max-w-md" in:scale>
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
            <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 class="text-white font-bold">Delete Permanently</h3>
            <p class="text-xs text-gray-500">This action cannot be undone.</p>
          </div>
        </div>

        <p class="text-sm text-gray-300 mb-4">
          Permanently delete {selectedCount} selected item{selectedCount > 1 ? 's' : ''} from trash? This includes {selectedFolders.length} folder{selectedFolders.length === 1 ? '' : 's'} and {selectedDocuments.length} document{selectedDocuments.length === 1 ? '' : 's'}.
        </p>

        <div class="max-h-40 overflow-y-auto mb-5 pr-2 space-y-2">
          {#each selectedFolders.slice(0, 5) as folder (folder.id)}
            <div class="text-sm text-gray-400">
              <p class="truncate">{folder.name}</p>
              <p class="text-[10px] text-gray-600">{getTrashRetentionText(folder.deletedAt)}</p>
            </div>
          {/each}
          {#each selectedDocuments.slice(0, Math.max(0, 5 - selectedFolders.length)) as item (item.id)}
            <div class="text-sm text-gray-400">
              <p class="truncate">{item.title}</p>
              <p class="text-[10px] text-gray-600">{getTrashRetentionText(item.deletedAt)}</p>
            </div>
          {/each}
          {#if selectedCount > 5}
            <p class="text-xs text-gray-600 italic">+ {selectedCount - 5} more item{selectedCount - 5 > 1 ? 's' : ''}</p>
          {/if}
        </div>

        <div class="flex gap-3">
          <button onclick={() => showDestroyConfirm = false} class="flex-1 h-10 bg-white/5 text-white rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50" disabled={isProcessing}>Cancel</button>
          <button onclick={destroySelectedItems} class="flex-1 h-10 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed font-bold" disabled={isProcessing}>Delete Permanently</button>
        </div>
      </div>
    </div>
  {/if}

  <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6 mb-10">
    <div class="flex items-center gap-3 flex-1 min-w-0">
      {#if breadcrumbs.length > 0}
        <button onclick={goBack} class="p-2 mt-7 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all shrink-0" title="Back to parent folder">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </button>
      {/if}

      <div class="min-w-0">
        <Breadcrumbs {breadcrumbs} currentFolder={currentFolder ? { id: currentFolder.id, name: currentFolder.name } : null} navigateTo={openFolder} />
        <div class="flex items-center gap-3">
          <h2 class="text-2xl md:text-3xl font-black text-white tracking-tight truncate">{currentFolder ? currentFolder.name : 'Trash'}</h2>
          <ViewSwitcher bind:viewMode />
        </div>
        <p class="text-sm text-gray-500 mt-2 max-w-2xl">
          Review deleted folders and documents from your account. Restore items within 60 days or they will be permanently deleted automatically.
        </p>
      </div>
    </div>

    <div class="flex gap-3 w-full sm:w-auto">
      <div class="relative" data-sort-container>
        <button onclick={toggleSortDropdown} class="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 text-white rounded-[20px] font-medium text-sm hover:bg-white/10 transition-all disabled:opacity-50" disabled={isLoading || totalCount === 0}>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/></svg>
          <span class="hidden sm:inline">Sort:</span> {getSortLabel()}
          <svg class="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </button>

        {#if showSortDropdown}
          <div transition:fly={{ y: -8, duration: 150 }} class="absolute right-0 mt-2 w-56 bg-[#1a1a1e] border border-white/10 rounded-xl shadow-2xl py-1 z-50 overflow-hidden">
            {#each sortPresets as preset (preset.id)}
              <button onclick={() => applySort(preset)} class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors {isActiveSort(preset) ? 'bg-blue-500/10 text-blue-300' : ''}">
                <span>{preset.label}</span>
                {#if isActiveSort(preset)}
                  <svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <button
        onclick={toggleSelectMode}
        class="flex-1 sm:flex-none px-4 py-3 bg-white/5 border border-white/10 text-white rounded-[20px] font-medium text-sm hover:bg-white/10 transition-all duration-300 flex items-center gap-2 disabled:opacity-50 {selectionMode ? 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-500/50 hover:from-blue-500 hover:to-blue-600 shadow-lg shadow-blue-500/30 ring-1 ring-blue-400/30 animate-pulse-slow' : ''}"
        disabled={isLoading || totalCount === 0 || isProcessing}
        title={selectionMode ? 'Exit selection mode' : 'Select items'}
      >
        <span class="relative">
          <svg class="w-4 h-4 transition-all duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {#if selectionMode}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
            {:else}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            {/if}
          </svg>
          {#if selectionMode}<span class="absolute inset-0 rounded-full bg-blue-500/40 blur-md animate-ping opacity-70"></span>{/if}
        </span>
        <span class="hidden sm:inline transition-colors duration-300 {selectionMode ? 'text-blue-100 font-semibold' : ''}">{selectionMode ? 'Cancel' : 'Select'}</span>
      </button>

      <button onclick={refreshTrashItems} class="flex-1 sm:flex-none px-4 py-3 bg-white/5 border border-white/10 text-white rounded-[20px] font-medium text-sm hover:bg-white/10 transition-all disabled:opacity-50" disabled={isLoading || isProcessing}>Refresh</button>
    </div>
  </header>

  {#if successMessage || errorMessage}
    <div class="mb-6 px-4 py-3 rounded-xl border flex items-center gap-3 {errorMessage ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}" role="status" aria-live="polite">
      <p class="text-sm flex-1">{errorMessage || successMessage}</p>
      <button onclick={() => { errorMessage = ''; successMessage = ''; }} class="p-1 hover:bg-white/10 rounded" aria-label="Dismiss status">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  {/if}

  {#if isLoading}
    <div class="py-24 flex flex-col items-center justify-center text-center border border-white/5 rounded-[32px] bg-white/[0.01]">
      <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p class="text-gray-400">Loading trash items...</p>
    </div>
  {:else if totalCount === 0}
    <div class="py-24 flex flex-col items-center justify-center text-center border border-white/5 rounded-[32px] bg-white/[0.01]">
      <div class="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-5">
        <svg class="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-8 0h10" /></svg>
      </div>
      <h3 class="text-white font-bold text-lg mb-2">Trash is empty</h3>
      <p class="text-gray-500 text-sm max-w-md">Folders and documents you delete from Storage will appear here.</p>
    </div>
  {:else}
    <div in:fade>
      {#if viewMode === 1}
        <section class="mb-10">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Folders</h3>
            <span class="text-[10px] text-gray-600">{sortedFolders.length} item{sortedFolders.length === 1 ? '' : 's'}</span>
          </div>
          {#if sortedFolders.length > 0}
            <FileGrid folders={sortedFolders} items={[]} viewMode={2} openFolder={openFolder} handleDeleteFolder={noop} handleDelete={noop} {getFileTheme} selectedItems={selectedItems} {selectionMode} onToggleSelect={toggleSelection} onDownload={downloadSingleItem} onRestore={confirmSingleRestore} trashMode={true} onDeleteConfirm={confirmSingleDestroy} onRefresh={loadTrashItems} />
          {:else}
            <p class="text-gray-600 text-sm italic pl-2">No folders in trash</p>
          {/if}
        </section>

        <section>
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Documents</h3>
            <span class="text-[10px] text-gray-600">{sortedItems.length} item{sortedItems.length === 1 ? '' : 's'}</span>
          </div>
          {#if sortedItems.length > 0}
            <FileTable folders={[]} items={sortedItems} viewMode={1} openFolder={openFolder} handleDeleteFolder={noop} handleDelete={noop} {getFileTheme} selectedItems={selectedItems} {selectionMode} onToggleSelect={toggleSelection} onDownload={downloadSingleItem} onRestore={confirmSingleRestore} trashMode={true} onDeleteConfirm={confirmSingleDestroy} onRefresh={loadTrashItems} />
          {:else}
            <p class="text-gray-600 text-sm italic pl-2">No documents in trash</p>
          {/if}
        </section>
      {:else if viewMode === 2}
        {#if sortedFolders.length > 0 || sortedItems.length > 0}
          <FileTable folders={sortedFolders} items={sortedItems} viewMode={2} openFolder={openFolder} handleDeleteFolder={noop} handleDelete={noop} {getFileTheme} selectedItems={selectedItems} {selectionMode} onToggleSelect={toggleSelection} onDownload={downloadSingleItem} onRestore={confirmSingleRestore} trashMode={true} onDeleteConfirm={confirmSingleDestroy} onRefresh={loadTrashItems} />
        {:else}
          <div class="text-center py-20 border border-white/5 rounded-[32px] bg-white/[0.01]"><p class="text-gray-500">Trash is empty</p></div>
        {/if}
      {:else}
        {#if sortedFolders.length > 0 || sortedItems.length > 0}
          <FileGrid folders={sortedFolders} items={sortedItems} viewMode={2} openFolder={openFolder} handleDeleteFolder={noop} handleDelete={noop} {getFileTheme} selectedItems={selectedItems} {selectionMode} onToggleSelect={toggleSelection} onDownload={downloadSingleItem} onRestore={confirmSingleRestore} trashMode={true} onDeleteConfirm={confirmSingleDestroy} onRefresh={loadTrashItems} />
        {:else}
          <div class="text-center py-20 border border-white/5 rounded-[32px] bg-white/[0.01]"><p class="text-gray-500">Trash is empty</p></div>
        {/if}
      {/if}
    </div>
  {/if}

  {#if selectionMode}
    <div class="fixed left-1/2 bottom-6 z-[900] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-[28px] border border-white/10 bg-[#111115]/95 backdrop-blur-xl shadow-2xl shadow-black/50 p-4" transition:fade>
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div class="flex-1 min-w-0">
          <p class="text-white font-bold">{selectedCount} selected</p>
          <p class="text-xs text-gray-500">Restore selected trash items or delete them permanently.</p>
        </div>
        <button onclick={downloadSelectedItems} class="px-5 py-3 rounded-2xl bg-white/5 text-white font-bold hover:bg-white/10 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors" disabled={selectedCount === 0 || isProcessing}>Download</button>
        <button onclick={confirmSelectedRestore} class="px-5 py-3 rounded-2xl bg-green-600 text-white font-bold hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors" disabled={selectedCount === 0 || isProcessing}>Restore</button>
        <button onclick={() => showDestroyConfirm = true} class="px-5 py-3 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors" disabled={selectedCount === 0 || isProcessing}>Delete Permanently</button>
        <button onclick={exitSelectionMode} class="px-5 py-3 rounded-2xl bg-white/5 text-white font-bold hover:bg-white/10 transition-colors" disabled={isProcessing}>Cancel</button>
      </div>
    </div>
  {/if}
</main>
