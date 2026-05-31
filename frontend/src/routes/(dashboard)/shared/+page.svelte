<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';

  import Breadcrumbs from '$lib/components/storage/Breadcrumbs.svelte';
  import FolderModal from '$lib/components/storage/FolderModal.svelte';
  import UploadModal from '$lib/components/storage/UploadModal.svelte';
  import ViewSwitcher from '$lib/components/storage/ViewSwitcher.svelte';
  import FileTable from '$lib/components/storage/FileTable.svelte';
  import FileGrid from '$lib/components/storage/FileGrid.svelte';
  import BulkActionBar from '$lib/components/storage/BulkActionBar.svelte';
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
  let isBulkDownloading = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');
  let viewMode = $state(2);
  let selectedItems = $state<string[]>([]);
  let selectionMode = $state(false);
  let currentUserId = $state<string | null>(null);
  let showUpload = $state(false);
  let showFolder = $state(false);
  let folderRoles = $state<Record<string, 'VIEWER' | 'EDITOR' | 'ADMIN'>>({});
  let renamingItem = $state<{ id: string; type: 'folder' | 'document'; name: string } | null>(null);
  let renameInputValue = $state('');
  let renameError = $state('');
  let isRenameProcessing = $state(false);
  let showMoveModal = $state(false);
  let moveTargets = $state<Array<{ id: string; type: 'folder' | 'document'; name: string; parentId?: string | null }>>([]);
  let moveTargetFolderId = $state<string | null>(null);
  let moveError = $state('');
  let moveSuccess = $state('');
  let isMoveProcessing = $state(false);
  let searchQuery = $state('');
  let sortOption = $state<{ field: SortField; direction: SortDirection }>({
    field: 'updatedAt',
    direction: 'desc'
  });


  const currentFolderRole = $derived(currentFolder ? folderRoles[currentFolder.id] : undefined);
  const canEditCurrentFolder = $derived(Boolean(currentFolder && currentFolderRole === 'EDITOR'));
  const canUploadToCurrentFolder = $derived(canEditCurrentFolder);
  const normalizedSearchQuery = $derived(searchQuery.trim().toLowerCase());
  const visibleFolders = $derived(normalizedSearchQuery
    ? folders.filter(folder => folder.name.toLowerCase().includes(normalizedSearchQuery))
    : folders
  );
  const visibleItems = $derived(normalizedSearchQuery
    ? items.filter(item => [item.title, item.fileName, item.mimeType].some(value => value?.toLowerCase().includes(normalizedSearchQuery)))
    : items
  );
  const sortedFolders = $derived(sortItems(visibleFolders, sortOption));
  const sortedItems = $derived(sortItems(visibleItems, sortOption));
  const totalCount = $derived(folders.length + items.length);
  const visibleCount = $derived(sortedFolders.length + sortedItems.length);
  const selectedFolders = $derived(folders.filter(folder => selectedItems.includes(folder.id)));
  const selectedDocuments = $derived(items.filter(item => selectedItems.includes(item.id)));
  const selectedCount = $derived(selectedFolders.length + selectedDocuments.length);
  const isProcessing = $derived(isLoading || isRefreshing || isMoveProcessing || isRenameProcessing || isBulkDownloading);
  const isBulkActionProcessing = $derived(isProcessing);
  const selectedTypeValue = $derived(selectedFolders.length > 0 && selectedDocuments.length > 0 ? 'mixed' : selectedFolders.length > 0 ? 'folders' : selectedDocuments.length > 0 ? 'documents' : 'items');

  function applyFolderAccessRole<T extends { ownerId: string; accessRole?: 'VIEWER' | 'EDITOR' | 'ADMIN' }>(item: T, role?: 'VIEWER' | 'EDITOR' | 'ADMIN'): T {
    return {
      ...item,
      accessRole: currentUserId && item.ownerId === currentUserId ? undefined : role
    };
  }

  function removeDocumentAccessRole<T extends { accessRole?: 'VIEWER' | 'EDITOR' | 'ADMIN' }>(document: T): T {
    return {
      ...document,
      accessRole: undefined
    };
  }

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

  function handleRename(id: string, type: 'folder' | 'document', name: string) {
    const item = type === 'folder' ? folders.find(folder => folder.id === id) : items.find(document => document.id === id);
    if (!item?.accessRole || item.accessRole !== 'EDITOR') return;
    renamingItem = { id, type, name };
    renameInputValue = name;
    renameError = '';
  }

  async function handleSubmitRename() {
    if (!renamingItem || !renameInputValue.trim()) return;

    try {
      isRenameProcessing = true;
      renameError = '';

      if (renamingItem.type === 'folder') {
        await storageService.renameFolder(renamingItem.id, renameInputValue);
      } else {
        await storageService.renameDocument(renamingItem.id, renameInputValue);
      }

      renamingItem = null;
      renameInputValue = '';
      await refreshSharedItems();
    } catch (error) {
      renameError = error instanceof Error ? error.message : 'Failed to rename item.';
    } finally {
      isRenameProcessing = false;
    }
  }

  function handleCancelRename() {
    renamingItem = null;
    renameInputValue = '';
    renameError = '';
  }

  function openMoveModal(targets: Array<{ id: string; type: 'folder' | 'document'; name: string; parentId?: string | null }>) {
    moveTargets = targets;
    moveTargetFolderId = currentFolder?.id ?? null;
    moveError = '';
    moveSuccess = '';
    showMoveModal = true;
  }

  function handleSingleMove(id: string, type: 'folder' | 'document') {
    const item = type === 'folder' ? folders.find(folder => folder.id === id) : items.find(document => document.id === id);
    if (!item?.accessRole || item.accessRole !== 'EDITOR') return;
    openMoveModal([{ id, type, name: type === 'folder' ? (item as Folder).name : (item as Document).title, parentId: type === 'folder' ? (item as Folder).parentId : (item as Document).folderId }]);
  }

  async function handleExecuteMove() {
    const documentIds = moveTargets.filter(target => target.type === 'document').map(target => target.id);
    const folderTargets = moveTargets.filter(target => target.type === 'folder');

    try {
      isMoveProcessing = true;
      moveError = '';

      if (documentIds.length > 0) {
        await storageService.moveDocuments(documentIds, moveTargetFolderId);
      }

      for (const folder of folderTargets) {
        await storageService.moveFolder(folder.id, moveTargetFolderId);
      }

      moveSuccess = 'Item moved successfully.';
      showMoveModal = false;
      await refreshSharedItems();
      selectedItems = [];
      selectionMode = false;
    } catch (error) {
      moveError = error instanceof Error ? error.message : 'Failed to move item.';
    } finally {
      isMoveProcessing = false;
    }
  }

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
    if (selectedCount === 0 || isBulkDownloading) return;

    try {
      isBulkDownloading = true;
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
      selectedItems = [];
      selectionMode = false;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to download selected items.';
    } finally {
      isBulkDownloading = false;
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

      const inheritedRole = folderRoles[folderId] ?? currentFolderRole ?? 'VIEWER';
      folderRoles = {
        ...folderRoles,
        ...Object.fromEntries(folderResponse.data.map(folder => [folder.id, folderRoles[folder.id] ?? inheritedRole]))
      };
      breadcrumbs = pathResponse.data;
      currentFolder = pathResponse.data[pathResponse.data.length - 1] || null;
      folders = folderResponse.data.map(folder => applyFolderAccessRole(folder, folderRoles[folder.id] ?? inheritedRole));
      items = documentResponse.data.map(removeDocumentAccessRole);
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
      const sharedFolders = folderResponse.data.map(item => applyFolderAccessRole(item.folder, item.role));
      const sharedFolderIds = new Set(sharedFolders.map(folder => folder.id));
      rootFolders = sharedFolders.filter(folder => !folder.parentId || !sharedFolderIds.has(folder.parentId));
      folders = rootFolders;
      items = documentResponse.data
        .map(item => removeDocumentAccessRole(item.document))
        .filter(document => !document.folderId || !sharedFolderIds.has(document.folderId));
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
    storageService.getCurrentUser()
      .then(response => {
        currentUserId = response.data?.id ?? null;
      })
      .catch(() => {
        currentUserId = null;
      });

    const handleSearch = (event: Event) => {
      const customEvent = event as CustomEvent<{ query?: string }>;
      searchQuery = customEvent.detail?.query ?? '';
    };
    const handleSort = (event: Event) => {
      const customEvent = event as CustomEvent<{ field?: SortField; direction?: SortDirection }>;
      if (!customEvent.detail?.field || !customEvent.detail?.direction) return;
      sortOption = { field: customEvent.detail.field, direction: customEvent.detail.direction };
    };

    window.addEventListener('decentrashare:search', handleSearch);
    window.addEventListener('decentrashare:sort', handleSort);
    void loadSharedItems();

    return () => {
      window.removeEventListener('decentrashare:search', handleSearch);
      window.removeEventListener('decentrashare:sort', handleSort);
    };
  });
</script>

<svelte:head>
  <title>Shared | DecentraShare</title>
</svelte:head>

<main class="relative w-full flex-1 p-4 sm:p-6 md:p-10 overflow-y-auto max-w-[1600px] mx-auto" in:fade>
  {#if isProcessing}
    <div class="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade>
      <div class="bg-[#121214] p-8 rounded-[40px] border border-white/10 shadow-2xl flex flex-col items-center" in:scale>
        <div class="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h3 class="text-white font-bold text-lg">DecentraShare Sync</h3>
        <p class="text-gray-500 text-sm italic">Wait a minute...</p>
      </div>
    </div>
  {/if}
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
          <h2 class="text-2xl md:text-3xl font-black text-white tracking-tight truncate">{currentFolder ? currentFolder.name : 'Shared'}</h2>
          <ViewSwitcher bind:viewMode />
        </div>
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

      {#if canEditCurrentFolder}
        <button onclick={() => showFolder = true} class="flex-1 sm:w-32 px-4 py-3 bg-white/5 border border-white/10 text-white rounded-[20px] font-bold text-sm hover:bg-white/10 transition-all flex items-center justify-center gap-2">
          <span class="text-lg leading-none">+</span>
          Folder
        </button>
      {/if}

      {#if canUploadToCurrentFolder}
        <button onclick={() => showUpload = true} class="flex-1 sm:w-32 px-4 py-3 bg-blue-600 text-white rounded-[20px] font-bold text-sm hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0L8 8m4-4l4 4" /></svg>
          Upload
        </button>
      {/if}
    </div>
  </header>

  <FolderModal isOpen={showFolder} onClose={() => showFolder = false} onCreated={refreshSharedItems} parentId={currentFolder?.id ?? null} existingFolders={folders} />
  <UploadModal isOpen={showUpload} onClose={() => showUpload = false} onUploaded={refreshSharedItems} folderId={currentFolder?.id ?? null} />

  {#if renamingItem}
    <div class="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade>
      <div class="bg-[#1a1a1e] p-6 rounded-2xl border border-white/10 shadow-2xl w-full max-w-sm">
        <h3 class="text-white font-bold mb-4">Rename {renamingItem.type}</h3>
        <input
          bind:value={renameInputValue}
          oninput={() => renameError = ''}
          onkeydown={(event) => {
            if (event.key === 'Enter') handleSubmitRename();
            if (event.key === 'Escape') handleCancelRename();
          }}
          class="w-full px-4 py-3 bg-white/5 border rounded-xl text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 transition-all mb-2 {renameError ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/50' : 'border-white/10 focus:border-blue-500 focus:ring-blue-500/50'}"
          placeholder="Enter new name..."
          disabled={isRenameProcessing}
        />
        {#if renameError}
          <p class="text-xs text-red-400 ml-1 mb-4" role="alert">{renameError}</p>
        {/if}
        <div class="flex gap-3">
          <button onclick={handleCancelRename} class="flex-1 h-10 bg-white/5 text-white rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50" disabled={isRenameProcessing}>Cancel</button>
          <button onclick={handleSubmitRename} class="flex-1 h-10 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed" disabled={isRenameProcessing || !renameInputValue.trim()}>{isRenameProcessing ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showMoveModal}
    <div class="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade>
      <div class="bg-[#111115] rounded-[32px] border border-white/10 shadow-2xl shadow-black/60 w-full max-w-md overflow-hidden">
        <div class="p-6 border-b border-white/10 bg-gradient-to-br from-blue-600/15 via-white/[0.03] to-transparent">
          <h3 class="text-white font-black text-xl tracking-tight">Move Item</h3>
          <p class="text-sm text-gray-400 truncate">{moveTargets.map(target => target.name).join(', ')}</p>
        </div>
        <div class="p-6 space-y-4">
          <button onclick={() => moveTargetFolderId = currentFolder?.id ?? null} class="w-full px-4 py-3 rounded-xl border text-left transition-colors {moveTargetFolderId === (currentFolder?.id ?? null) ? 'bg-blue-600/20 border-blue-500/50 text-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}" disabled={isMoveProcessing}>
            Current folder
          </button>
          {#each folders.filter(folder => folder.accessRole === 'EDITOR') as folder (folder.id)}
            <button onclick={() => moveTargetFolderId = folder.id} class="w-full px-4 py-3 rounded-xl border text-left transition-colors {moveTargetFolderId === folder.id ? 'bg-blue-600/20 border-blue-500/50 text-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}" disabled={isMoveProcessing}>
              {folder.name}
            </button>
          {/each}
          {#if moveError}
            <p class="text-xs text-red-400" role="alert">{moveError}</p>
          {/if}
          <div class="flex gap-3">
            <button onclick={() => showMoveModal = false} class="flex-1 h-10 bg-white/5 text-white rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50" disabled={isMoveProcessing}>Cancel</button>
            <button onclick={handleExecuteMove} class="flex-1 h-10 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed" disabled={isMoveProcessing}>{isMoveProcessing ? 'Moving...' : 'Move Here'}</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if selectionMode && selectedCount > 0}
    <BulkActionBar
      selectedCount={selectedCount}
      selectedType={selectedTypeValue}
      onDownload={downloadSelectedItems}
      onCancel={() => { selectionMode = false; selectedItems = []; }}
      isProcessing={isBulkActionProcessing}
      isDownloading={isBulkDownloading}
    />
  {/if}

  {#if isLoading}
    <div class="flex flex-col items-center justify-center rounded-[32px] border border-white/5 bg-white/[0.01] py-24 text-center">
      <div class="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      <p class="text-gray-400">Wait a minute...</p>
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
              onRename={(id, name) => handleRename(id, 'folder', name)}
              onMove={handleSingleMove}
              onDownload={handleDownload}
              {selectedItems}
              {selectionMode}
              {currentUserId}
              onToggleSelect={toggleSelection}
              onRefresh={refreshSharedItems}
              sharedMode={true}
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
              onRename={(id, name) => handleRename(id, 'document', name)}
              onMove={handleSingleMove}
              onDownload={handleDownload}
              {selectedItems}
              {selectionMode}
              {currentUserId}
              onToggleSelect={toggleSelection}
              onRefresh={refreshSharedItems}
              sharedMode={true}
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
          onRename={(id, name) => handleRename(id, folders.some(folder => folder.id === id) ? 'folder' : 'document', name)}
          onMove={handleSingleMove}
          onDownload={handleDownload}
          {selectedItems}
          {selectionMode}
          {currentUserId}
          onToggleSelect={toggleSelection}
          onRefresh={refreshSharedItems}
          sharedMode={true}
        />
      {:else}
        <FileGrid
          folders={sortedFolders}
          items={sortedItems}
          {openFolder}
          handleDeleteFolder={noop}
          handleDelete={noop}
          {getFileTheme}
          onRename={(id, name) => handleRename(id, folders.some(folder => folder.id === id) ? 'folder' : 'document', name)}
          onMove={handleSingleMove}
          onDownload={handleDownload}
          {selectedItems}
          {selectionMode}
          {currentUserId}
          onToggleSelect={toggleSelection}
          onRefresh={refreshSharedItems}
          sharedMode={true}
        />
      {/if}
    </div>
  {/if}
</main>
