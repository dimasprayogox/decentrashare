<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  
  import { storageService } from '$lib/services/storage/storage';
  import { tryBatchWithSingleFallback } from '$lib/services/web3/blockchain';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';

  // Components
  import Breadcrumbs from '$lib/components/storage/Breadcrumbs.svelte';
  import ViewSwitcher from '$lib/components/storage/ViewSwitcher.svelte';
  import FileTable from '$lib/components/storage/FileTable.svelte';
  import FileGrid from '$lib/components/storage/FileGrid.svelte';
  import UploadModal from '$lib/components/storage/UploadModal.svelte';
  import FolderModal from '$lib/components/storage/FolderModal.svelte';
  import BulkActionBar from '$lib/components/storage/BulkActionBar.svelte';
  import ShareModal from '$lib/components/storage/ShareModal.svelte';

  // Composables
  import { useSelection } from '$lib/composables/useSelection.svelte';
  import { useDelete } from '$lib/composables/useDelete.svelte';
  import { useRename } from '$lib/composables/useRename.svelte';

  import type { Folder, Document, PrivacyLevel, ShareableUser } from '$lib/types/storage';

  type SortField = 'name' | 'createdAt' | 'updatedAt' | 'fileSize' | 'type';
  type SortDirection = 'asc' | 'desc';
  type SortPreset = {
    id: string;
    label: string;
    field: SortField;
    direction: SortDirection;
  };

  // ── Composables ──────────────────────────────────────────
  // ✅ Hanya ambil functions yang tidak butuh state management
  const {
    // Tidak perlu ambil selectedItems, toggleSelection, clearSelection dari composable
    // Kita akan buat local state sendiri untuk reactivity
  } = useSelection();

  // ✅ DELETE: Destructuring TANPA rename (pakai nama asli)
  const {
    isProcessing: isDeleteProcessing,
    confirmDelete,
    executeDelete,
    cancelDelete,
    confirmBulkDelete,
    executeBulkDelete,
    cancelBulkDelete
  } = useDelete(refreshStorage);

  // ✅ RENAME: Destructuring DENGAN rename (karena butuh local wrappers)
  const {
    isProcessing: isRenameProcessing,
    startRename: startRenameFromComposable,
    submitRename: submitRenameFromComposable,
    cancelRename: cancelRenameFromComposable
  } = useRename(refreshStorage);

  // ── Local State (untuk UI reactivity) ───────────────────
  let folders = $state<Folder[]>([]);
  let items = $state<Document[]>([]);
  let breadcrumbs = $state<{ id: string; name: string }[]>([]);
  let currentFolder = $state<{ id: string; name: string } | null>(null);
  let isLoading = $state(true);
  let isRefreshingStorage = $state(false);
  let viewMode = $state(1);
  let showUpload = $state(false);
  let showFolder = $state(false);

  // ✅ FIX UTAMA: Deklarasikan selectedItems sebagai local $state!
  let selectedItems = $state<string[]>([]);
  let selectionMode = $state(false);
  
  // ✅ Local state untuk rename modal
  let renamingItem = $state<{ id: string; type: 'folder' | 'document'; name: string } | null>(null);
  let renameInputValue = $state(""); 
  let renameError = $state("");
  
  // ✅ Local state untuk delete modal
  let deletingItem = $state<{ id: string; type: 'folder' | 'document'; name: string } | null>(null);
  let bulkDeleteItems = $state<Array<{ id: string; type: 'folder' | 'document'; name: string }>>([]);
  let deleteError = $state("");

  let showMoveModal = $state(false);
  let moveTargetFolderId = $state<string | null>(null);
  let moveError = $state("");
  let moveSuccess = $state("");
  let moveNotice = $state("");
  let moveTargets = $state<Array<{ id: string; type: 'folder' | 'document'; name: string; parentId?: string | null }>>([]);
  let isMoveProcessing = $state(false);
  let moveFolderTree = $state<Record<string, Folder[]>>({});
  let moveExpandedFolders = $state<string[]>([]);
  let moveLoadingFolders = $state<string[]>([]);

  let showShareModal = $state(false);
  let shareTarget = $state<{
    id: string;
    type: 'folder' | 'document';
    name: string;
    privacy: PrivacyLevel;
  } | null>(null);

  let showBulkShareModal = $state(false);
  let bulkShareTargets = $state<Array<{ id: string; type: 'folder' | 'document'; name: string }>>([]);
  let bulkShareSearchQuery = $state('');
  let bulkShareSearchResults = $state<ShareableUser[]>([]);
  let bulkShareSelectedUsers = $state<ShareableUser[]>([]);
  let bulkSharePrivacy = $state<PrivacyLevel>('SPECIFIC_USER');
  let bulkShareRole = $state<'VIEWER' | 'EDITOR'>('VIEWER');
  let bulkShareError = $state('');
  let bulkShareSuccess = $state('');
  let isBulkShareSearching = $state(false);
  let isBulkShareProcessing = $state(false);
  let bulkShareSearchTimeout: ReturnType<typeof setTimeout>;

  // ✅ TAMBAHKAN: Current user state
  let currentUser = $state<{ 
    id: string; 
    username: string; 
    walletAddress: string;
  } | null>(null);
  
  const sortPresets: SortPreset[] = [
    { id: 'updated-desc', label: 'Last modified', field: 'updatedAt', direction: 'desc' },
    { id: 'created-desc', label: 'Newest upload', field: 'createdAt', direction: 'desc' },
    { id: 'created-asc', label: 'Oldest upload', field: 'createdAt', direction: 'asc' },
    { id: 'name-asc', label: 'Name A-Z', field: 'name', direction: 'asc' },
    { id: 'name-desc', label: 'Name Z-A', field: 'name', direction: 'desc' },
    { id: 'size-desc', label: 'Largest first', field: 'fileSize', direction: 'desc' },
    { id: 'size-asc', label: 'Smallest first', field: 'fileSize', direction: 'asc' },
    { id: 'type-asc', label: 'File type', field: 'type', direction: 'asc' }
  ];

  // Sort state
  let sortOption = $state<{ field: SortField; direction: SortDirection }>({
    field: 'updatedAt',
    direction: 'desc'
  });
  let isBulkConfirmingBlockchain = $state(false);
  let bulkConfirmStatus = $state('');
  let bulkConfirmSuccess = $state('');
  let bulkConfirmError = $state('');
  let isDownloading = $state(false);
  let downloadStatus = $state('');
  let downloadSuccess = $state('');
  let downloadError = $state('');

  // Combined processing state
  const isProcessing = $derived(isDeleteProcessing || isRenameProcessing || isBulkConfirmingBlockchain || isMoveProcessing || isDownloading || isLoading);

  // ✅ Helper: Check if item is selected (reactive karena selectedItems adalah $state)
  const isSelected = (id: string): boolean => selectedItems.includes(id);

  // ✅ Helper functions untuk selection logic (pakai local selectedItems)
  function getSelectedFolders(folders: Folder[]) {
    return folders.filter(f => selectedItems.includes(f.id));
  }

  function getSelectedDocuments(items: Document[]) {
    return items.filter(d => selectedItems.includes(d.id));
  }

  type DocumentWithTxFallbacks = Document & {
    blockchain_tx?: string | null;
    txHash?: string | null;
    transactionHash?: string | null;
    tx_id?: string | null;
  };

  function getBlockchainTx(item: Document): string | null {
    const document = item as DocumentWithTxFallbacks;
    const alternatives = [document.blockchainTx, document.blockchain_tx, document.txHash, document.transactionHash, document.tx_id];
    return alternatives.find(tx => typeof tx === 'string' && tx.length > 10) || null;
  }

  function getSelectedUnconfirmedDocuments(items: Document[]) {
    return getSelectedDocuments(items).filter(d => !getBlockchainTx(d));
  }

  function getSelectedType(folders: Folder[], items: Document[]): 'folders' | 'documents' | 'mixed' | 'items' {
    const selectedFolders = getSelectedFolders(folders);
    const selectedDocuments = getSelectedDocuments(items);
    if (selectedFolders.length > 0 && selectedDocuments.length > 0) return 'mixed';
    if (selectedFolders.length > 0) return 'folders';
    if (selectedDocuments.length > 0) return 'documents';
    return 'items';
  }

  const moveTreeKey = (folderId: string | null) => folderId ?? 'root';

  function isMoveFolderExpanded(folderId: string): boolean {
    return moveExpandedFolders.includes(folderId);
  }

  function isMoveFolderLoading(folderId: string): boolean {
    return moveLoadingFolders.includes(folderId);
  }

  function getMoveChildren(folderId: string | null): Folder[] {
    return moveFolderTree[moveTreeKey(folderId)] ?? [];
  }

  async function loadMoveFolderChildren(folderId: string | null, force = false) {
    const key = moveTreeKey(folderId);
    if (moveFolderTree[key] && !force) return;

    try {
      if (folderId) moveLoadingFolders = [...moveLoadingFolders, folderId];
      const response = await storageService.getFolders(folderId);
      moveFolderTree = {
        ...moveFolderTree,
        [key]: response.success ? response.data : []
      };
    } catch (error) {
      console.error('Failed to load move destination folders:', error);
      moveFolderTree = { ...moveFolderTree, [key]: [] };
    } finally {
      if (folderId) moveLoadingFolders = moveLoadingFolders.filter(id => id !== folderId);
    }
  }

  async function toggleMoveFolder(folderId: string) {
    if (isMoveFolderExpanded(folderId)) {
      moveExpandedFolders = moveExpandedFolders.filter(id => id !== folderId);
      return;
    }

    moveExpandedFolders = [...moveExpandedFolders, folderId];
    await loadMoveFolderChildren(folderId);
  }

  function folderExistsInMoveTree(folderId: string): boolean {
    return Object.values(moveFolderTree).some(children => children.some(folder => folder.id === folderId));
  }

  function getLoadedDescendantFolderIds(folderId: string): string[] {
    const descendants: string[] = [];

    function walk(parentId: string) {
      for (const child of getMoveChildren(parentId)) {
        descendants.push(child.id);
        walk(child.id);
      }
    }

    walk(folderId);
    return descendants;
  }

  function isInvalidMoveDestination(folderId: string | null): boolean {
    if (!folderId) return false;
    return moveTargets.some(target => {
      if (target.type !== 'folder') return false;
      return target.id === folderId || getLoadedDescendantFolderIds(target.id).includes(folderId);
    });
  }

  function getMoveTargetLabel(): string {
    if (moveTargets.length === 0) return 'No items selected';
    if (moveTargets.length === 1) return moveTargets[0].name;
    const folderCount = moveTargets.filter(target => target.type === 'folder').length;
    const documentCount = moveTargets.filter(target => target.type === 'document').length;
    return `${moveTargets.length} items (${folderCount} folder, ${documentCount} dokumen)`;
  }

  function getMoveDestinationLabel(): string {
    if (!moveTargetFolderId) return 'Root';
    return Object.values(moveFolderTree).flat().find(folder => folder.id === moveTargetFolderId)?.name ?? 'Selected folder';
  }

  function getVisibleMoveFolders() {
    const rows: Array<{ folder: Folder; depth: number }> = [];

    function walk(parentId: string | null, depth: number) {
      for (const folder of getMoveChildren(parentId)) {
        if (isInvalidMoveDestination(folder.id)) continue;
        rows.push({ folder, depth });
        if (isMoveFolderExpanded(folder.id)) {
          walk(folder.id, depth + 1);
        }
      }
    }

    walk(null, 0);
    return rows;
  }

  // ✅ Derived values
  const selectedTypeValue = $derived(getSelectedType(folders, items));
  const selectedUnconfirmedDocuments = $derived(getSelectedUnconfirmedDocuments(items));
  const visibleMoveFolders = $derived(getVisibleMoveFolders());

  // ✅ Debug effect
  $effect(() => {
    console.log('🔍 selectedItems:', selectedItems);
  });

  // ── Helpers ──────────────────────────────────────────────
  function getFileTheme(mimeType: string) {
    if (mimeType.includes('image')) return { color: 'text-purple-500 bg-purple-500/10' };
    if (mimeType.includes('video')) return { color: 'text-red-500 bg-red-500/10' };
    if (mimeType.includes('pdf') || mimeType.includes('document')) return { color: 'text-orange-500 bg-orange-500/10' };
    return { color: 'text-blue-500 bg-blue-500/10' };
  }

  // ✅ Local selection functions (update local $state)
  function toggleSelection(id: string) {
    if (selectedItems.includes(id)) {
      selectedItems = selectedItems.filter(i => i !== id);
    } else {
      selectedItems = [...selectedItems, id];
    }
  }

  function clearSelection() {
    selectedItems = [];
  }

  function toggleSelectMode() {
    selectionMode = !selectionMode;
    if (!selectionMode) clearSelection();
  }

  function buildQueryString(params: Record<string, string | number | null | undefined>): string {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    return searchParams.toString() ? `?${searchParams.toString()}` : '';
  }

  // ── Sorting ──────────────────────────────────────────────
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

  let searchQuery = $state('');
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

  onMount(() => {
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
    return () => {
      window.removeEventListener('decentrashare:search', handleSearch);
      window.removeEventListener('decentrashare:sort', handleSort);
    };
  });

  // ── Data Loading ─────────────────────────────────────────
  async function refreshStorage() {
    if (isRefreshingStorage) return;

    try {
      isRefreshingStorage = true;
      await loadStorageData(false);
    } finally {
      isRefreshingStorage = false;
    }
  }

  async function loadStorageData(showLoading = true) {
    try {
      if (showLoading) isLoading = true;
      const folderId = page.url.searchParams.get('folder');

      if (folderId) {
        try {
          const pathRes = await storageService.getFolderPath(folderId);
          if (pathRes.success) {
            breadcrumbs = pathRes.data;
            currentFolder = pathRes.data[pathRes.data.length - 1] || null;
          }
        } catch (e) {
          console.warn('Failed to load folder path:', e);
          breadcrumbs = [];
          currentFolder = null;
        }
      } else {
        breadcrumbs = [];
        currentFolder = null;
      }

      const [fRes, dRes] = await Promise.allSettled([
        storageService.getFolders(folderId),
        storageService.getDocuments(folderId)
      ]);
      
      folders = (fRes.status === 'fulfilled' && fRes.value.success) ? fRes.value.data : [];
      items = (dRes.status === 'fulfilled' && dRes.value.success) ? dRes.value.data : [];
      
    } catch (err) {
      console.error('[Storage] loadStorageData error:', err);
    } finally {
      if (showLoading) setTimeout(() => { isLoading = false; }, 200);
    }
  }

  $effect(() => {
    page.url.searchParams.get('folder');
    loadStorageData();
  });

  // ── Navigation ───────────────────────────────────────────
  const openFolder = (folder: { id: string } | null) => {
    if (folder) {
      goto(`?folder=${folder.id}`, { noScroll: true });
    } else {
      goto('?', { noScroll: true });
    }
  };

  const goBack = () => {
    if (breadcrumbs.length > 1) {
      const parentFolder = breadcrumbs[breadcrumbs.length - 2];
      goto(`?folder=${parentFolder.id}`, { noScroll: true });
    } else {
      goto('?', { noScroll: true });
    }
  };

  // ── Delete Handlers ─────────────────────────────────────

  const handleDelete = (id: string) => {
    const item = items.find(d => d.id === id);
    if (item) {
      deletingItem = { id, type: 'document', name: item.title };
      confirmDelete({ id, type: 'document', name: item.title });
      deleteError = "";
    }
  };

  const handleDeleteFolder = (id: string) => {
    const folder = folders.find(f => f.id === id);
    if (folder) {
      deletingItem = { id, type: 'folder', name: folder.name };
      confirmDelete({ id, type: 'folder', name: folder.name });
      deleteError = "";
    }
  };

  async function handleExecuteDelete() {
    if (!deletingItem) return;
    const result = await executeDelete();
    if (result.success) {
      deletingItem = null;
      deleteError = "";
    } else {
      deleteError = result.error || "Unknown error";
    }
  }

  function handleCancelDelete() {
    deletingItem = null;
    deleteError = "";
    cancelDelete();
  }

  // ✅ Bulk delete handlers
  const handleConfirmBulkDelete = () => {
    if (selectedItems.length === 0) return;
    
    const itemsToDelete = [
      ...getSelectedFolders(folders).map(f => ({ id: f.id, type: 'folder' as const, name: f.name })),
      ...getSelectedDocuments(items).map(d => ({ id: d.id, type: 'document' as const, name: d.title }))
    ];
    
    bulkDeleteItems = itemsToDelete;
    confirmBulkDelete(itemsToDelete);
    deleteError = "";
  };

  async function handleExecuteBulkDelete() {
    const result = await executeBulkDelete();
    if (result.success) {
      bulkDeleteItems = [];
      deleteError = "";
      clearSelection();
    } else {
      deleteError = result.error || "Unknown error";
    }
  }

  function handleCancelBulkDelete() {
    bulkDeleteItems = [];
    deleteError = "";
    cancelBulkDelete();
  }

  async function handleBulkConfirmBlockchain() {
    const documentsToConfirm = selectedUnconfirmedDocuments;

    bulkConfirmSuccess = '';
    bulkConfirmError = '';

    if (documentsToConfirm.length === 0) {
      bulkConfirmError = 'Tidak ada file terpilih yang perlu dikonfirmasi on-chain.';
      return;
    }

    const documentIds = documentsToConfirm.map(document => document.id);

    try {
      isBulkConfirmingBlockchain = true;
      bulkConfirmStatus = `Preparing ${documentIds.length} file${documentIds.length > 1 ? 's' : ''}...`;

      const response = await storageService.triggerBatchBlockchainConfirmation(documentIds);
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to prepare batch blockchain data');
      }

      const confirmedIds = response.data.docIds?.length ? response.data.docIds : documentIds;

      const txResult = await tryBatchWithSingleFallback(response.data, {
        onStatus: (status) => {
          bulkConfirmStatus = status.replace('✅', '').trim();
        }
      });

      bulkConfirmStatus = 'Updating database...';
      await storageService.confirmBatchComplete(txResult.txHash, confirmedIds);
      await refreshStorage();

      bulkConfirmSuccess = `${confirmedIds.length} file berhasil dikonfirmasi on-chain.`;
      bulkConfirmStatus = '';
      clearSelection();

      setTimeout(() => {
        bulkConfirmSuccess = '';
      }, 4000);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to confirm selected files on-chain';

      if (message === 'TRANSACTION_REJECTED') {
        bulkConfirmError = 'Konfirmasi wallet dibatalkan.';
      } else if (message === 'INSUFFICIENT_FUNDS') {
        bulkConfirmError = 'Saldo ETH tidak cukup untuk gas.';
      } else if (message === 'WRONG_NETWORK') {
        bulkConfirmError = 'Pindahkan wallet ke jaringan Sepolia.';
      } else if (message === 'TX_CONFIRMATION_TIMEOUT') {
        bulkConfirmError = 'Transaksi belum terkonfirmasi. Silakan refresh beberapa saat lagi.';
      } else {
        bulkConfirmError = message;
      }
    } finally {
      isBulkConfirmingBlockchain = false;
      bulkConfirmStatus = '';
    }
  }

  // ── Rename Handlers ─────────────────────────────────────

  const handleRename = (id: string, type: 'folder' | 'document', name: string) => {
    renamingItem = { id, type, name };
    startRenameFromComposable({ id, type, name });
    renameInputValue = name;
    renameError = "";
  };

  async function handleSubmitRename() {
    if (!renamingItem || !renameInputValue.trim()) return;
    const result = await submitRenameFromComposable(renameInputValue);
    if (result.success) {
      renamingItem = null;
      renameInputValue = "";
      renameError = "";
    } else {
      renameError = result.error || "Unknown error";
    }
  }

  function handleCancelRename() {
    renamingItem = null;
    renameInputValue = "";
    renameError = "";
    cancelRenameFromComposable();
  }

  // ── Other Handlers ──────────────────────────────────────

 // ✅ FIX: handleShare harus set shareTarget dengan lengkap
const handleShare = (id: string, type: 'folder' | 'document') => {
  // Cari item berdasarkan type
  const item = type === 'document'
    ? items.find(d => d.id === id)
    : folders.find(f => f.id === id);

  if (!item) {
    console.error('Item not found:', id, type);
    return;
  }

  // Set shareTarget dengan semua data yang dibutuhkan ShareModal
  shareTarget = {
    id: item.id,
    type,
    name: type === 'document' ? (item as Document).title : (item as Folder).name,
    privacy: item.privacy
  };

  // Buka modal
  showShareModal = true;
};

  function resetBulkShareState() {
    showBulkShareModal = false;
    bulkShareTargets = [];
    bulkShareSearchQuery = '';
    bulkShareSearchResults = [];
    bulkShareSelectedUsers = [];
    bulkSharePrivacy = 'SPECIFIC_USER';
    bulkShareRole = 'VIEWER';
    bulkShareError = '';
  }

  function toggleBulkShareUser(user: ShareableUser) {
    if (bulkShareSelectedUsers.some(selected => selected.id === user.id)) {
      bulkShareSelectedUsers = bulkShareSelectedUsers.filter(selected => selected.id !== user.id);
    } else {
      bulkShareSelectedUsers = [...bulkShareSelectedUsers, user];
      bulkShareSearchResults = bulkShareSearchResults.filter(result => result.id !== user.id);
    }
  }

  async function performBulkShareSearch() {
    if (bulkShareSearchQuery.trim().length < 2) {
      bulkShareSearchResults = [];
      return;
    }

    try {
      isBulkShareSearching = true;
      bulkShareError = '';
      const response = await storageService.searchUsersForShare(bulkShareSearchQuery, {
        excludeSharedUserIds: bulkShareSelectedUsers.map(user => user.id)
      });
      bulkShareSearchResults = response.success ? response.data.users : [];
    } catch (error: unknown) {
      bulkShareError = error instanceof Error ? error.message : 'Gagal mencari user.';
    } finally {
      isBulkShareSearching = false;
    }
  }

  function handleBulkShareSearchInput() {
    if (bulkShareSearchTimeout) clearTimeout(bulkShareSearchTimeout);
    bulkShareSearchTimeout = setTimeout(() => {
      void performBulkShareSearch();
    }, 300);
  }

  function handleBulkManageAccess() {
    const targets = [
      ...getSelectedFolders(folders).map(folder => ({ id: folder.id, type: 'folder' as const, name: folder.name })),
      ...getSelectedDocuments(items).map(document => ({ id: document.id, type: 'document' as const, name: document.title }))
    ];

    if (targets.length === 0) {
      bulkShareError = 'Pilih minimal satu item untuk dibagikan.';
      return;
    }

    bulkShareTargets = targets;
    bulkShareSearchQuery = '';
    bulkShareSearchResults = [];
    bulkShareSelectedUsers = [];
    bulkSharePrivacy = 'SPECIFIC_USER';
    bulkShareRole = 'VIEWER';
    bulkShareError = '';
    bulkShareSuccess = '';
    showBulkShareModal = true;
  }

  async function handleExecuteBulkShare() {
    if (bulkSharePrivacy === 'SPECIFIC_USER' && bulkShareSelectedUsers.length === 0) {
      bulkShareError = 'Pilih minimal satu user tujuan untuk Specific User.';
      return;
    }

    const selectedUserIds = bulkShareSelectedUsers.map(user => user.id);
    const folderTargets = bulkShareTargets.filter(target => target.type === 'folder');
    const documentTargets = bulkShareTargets.filter(target => target.type === 'document');

    try {
      isBulkShareProcessing = true;
      bulkShareError = '';

      if (documentTargets.length > 0) {
        await storageService.updateDocumentsPrivacy(documentTargets.map(target => ({
          documentId: target.id,
          newPrivacy: bulkSharePrivacy
        })));
      }

      if (folderTargets.length > 0) {
        await Promise.all(folderTargets.map(target =>
          storageService.updateFolderPrivacy(target.id, { newPrivacy: bulkSharePrivacy })
        ));
      }

      if (bulkSharePrivacy === 'SPECIFIC_USER') {
        if (documentTargets.length > 0) {
          await storageService.shareDocuments(documentTargets.map(target => ({
            documentId: target.id,
            targetUsers: selectedUserIds
          })));
        }

        if (folderTargets.length > 0) {
          await storageService.shareFolders(folderTargets.map(target => ({
            itemId: target.id,
            itemType: 'folder',
            targetUsers: selectedUserIds.map(userId => ({ userId, role: bulkShareRole }))
          })));
        }
      }

      const parts = [];
      if (folderTargets.length > 0) parts.push(`${folderTargets.length} folder`);
      if (documentTargets.length > 0) parts.push(`${documentTargets.length} dokumen`);
      bulkShareSuccess = `${parts.join(' dan ')} berhasil diupdate ke ${bulkSharePrivacy}.`;
      showBulkShareModal = false;
      clearSelection();
      selectionMode = false;
      await refreshStorage();

      setTimeout(() => {
        bulkShareSuccess = '';
      }, 4000);
    } catch (error: unknown) {
      bulkShareError = error instanceof Error ? error.message : 'Gagal mengupdate share item.';
    } finally {
      isBulkShareProcessing = false;
    }
  }

  async function handleDownload(id: string, type: 'folder' | 'document' = 'document') {
    const item = type === 'document' ? items.find(document => document.id === id) : folders.find(folder => folder.id === id);

    try {
      isDownloading = true;
      downloadError = '';
      downloadSuccess = '';
      downloadStatus = `Preparing ${type === 'document' ? 'file' : 'folder'} download...`;

      if (type === 'document') {
        await storageService.downloadDocument(id, (item as Document | undefined)?.title || (item as Document | undefined)?.fileName);
      } else {
        await storageService.downloadFolder(id, (item as Folder | undefined)?.name);
      }

      downloadSuccess = `${type === 'document' ? 'File' : 'Folder'} download started.`;
      setTimeout(() => {
        downloadSuccess = '';
      }, 4000);
    } catch (err: any) {
      console.error('Download failed:', err);
      downloadError = err.message || 'Failed to download item';
      throw new Error(downloadError);
    } finally {
      isDownloading = false;
      downloadStatus = '';
    }
  }

  async function handleBulkDownload() {
    const documentIds = getSelectedDocuments(items).map(document => document.id);
    const folderIds = getSelectedFolders(folders).map(folder => folder.id);

    if (documentIds.length === 0 && folderIds.length === 0) {
      downloadError = 'Pilih minimal satu item untuk didownload.';
      return;
    }

    try {
      isDownloading = true;
      downloadError = '';
      downloadSuccess = '';
      downloadStatus = `Preparing ${documentIds.length + folderIds.length} selected item(s)...`;

      await storageService.bulkDownloadItems({ documentIds, folderIds });

      downloadSuccess = 'Bulk download archive started.';
      clearSelection();
      selectionMode = false;
      setTimeout(() => {
        downloadSuccess = '';
      }, 4000);
    } catch (err: any) {
      console.error('Bulk download failed:', err);
      downloadError = err.message || 'Failed to download selected items';
    } finally {
      isDownloading = false;
      downloadStatus = '';
    }
  }

  function openMoveModal(targets: Array<{ id: string; type: 'folder' | 'document'; name: string; parentId?: string | null }>) {
    moveTargets = targets;
    moveTargetFolderId = null;
    moveError = "";
    moveSuccess = "";
    moveNotice = "";
    moveFolderTree = {};
    moveExpandedFolders = [];
    moveLoadingFolders = [];
    showMoveModal = true;
    void loadMoveFolderChildren(null, true);
  }

  function handleSingleMove(id: string, type: 'folder' | 'document') {
    const item = type === 'document' ? items.find(document => document.id === id) : folders.find(folder => folder.id === id);
    if (!item) {
      moveError = 'Item tidak ditemukan.';
      return;
    }

    openMoveModal([{
      id: item.id,
      type,
      name: type === 'document' ? (item as Document).title : (item as Folder).name,
      parentId: type === 'document' ? (item as Document).folderId : (item as Folder).parentId
    }]);
  }

  function handleBulkMove() {
    const targets = [
      ...getSelectedFolders(folders).map(folder => ({ id: folder.id, type: 'folder' as const, name: folder.name, parentId: folder.parentId })),
      ...getSelectedDocuments(items).map(document => ({ id: document.id, type: 'document' as const, name: document.title, parentId: document.folderId }))
    ];

    if (targets.length === 0) {
      moveError = "Pilih minimal satu item untuk dipindahkan.";
      return;
    }

    openMoveModal(targets);
  }

  async function handleExecuteMove() {
    const documentIds = moveTargets.filter(target => target.type === 'document').map(target => target.id);
    const folderTargets = moveTargets.filter(target => target.type === 'folder');

    if (moveTargets.length === 0) {
      moveError = "Pilih minimal satu item untuk dipindahkan.";
      return;
    }

    if (moveTargetFolderId && !folderExistsInMoveTree(moveTargetFolderId)) {
      moveError = "Folder tujuan tidak valid atau belum dimuat.";
      return;
    }

    if (isInvalidMoveDestination(moveTargetFolderId)) {
      moveError = "Folder tidak bisa dipindahkan ke dirinya sendiri atau subfoldernya.";
      return;
    }

    try {
      isMoveProcessing = true;
      moveError = "";
      moveSuccess = "";

      let movedDocuments = 0;
      let movedFolders = 0;
      let appliedPrivacy = '';

      if (documentIds.length > 0) {
        const documentResponse = await storageService.moveDocuments(documentIds, moveTargetFolderId);
        if (!documentResponse.success) {
          throw new Error(documentResponse.message || 'Gagal memindahkan dokumen.');
        }
        movedDocuments = documentResponse.data?.count ?? documentIds.length;
        appliedPrivacy = documentResponse.data?.appliedPrivacy ?? appliedPrivacy;
      }

      for (const folder of folderTargets) {
        const folderResponse = await storageService.moveFolder(folder.id, moveTargetFolderId);
        if (!folderResponse.success) {
          throw new Error(folderResponse.message || `Gagal memindahkan folder ${folder.name}.`);
        }
        movedFolders += 1;
        appliedPrivacy = folderResponse.data?.appliedPrivacy ?? appliedPrivacy;
      }

      const parts = [];
      if (movedFolders > 0) parts.push(`${movedFolders} folder`);
      if (movedDocuments > 0) parts.push(`${movedDocuments} dokumen`);

      moveSuccess = `${parts.join(' dan ')} dipindahkan ke ${getMoveDestinationLabel()}. ${appliedPrivacy ? `Privacy disesuaikan menjadi ${appliedPrivacy}.` : ''}`;
      showMoveModal = false;
      await refreshStorage();
      moveFolderTree = {};
      moveExpandedFolders = [];
      moveLoadingFolders = [];
      clearSelection();
      selectionMode = false;

      setTimeout(() => {
        moveSuccess = "";
      }, 4000);
    } catch (error: unknown) {
      moveError = error instanceof Error ? error.message : "Gagal memindahkan item.";
    } finally {
      isMoveProcessing = false;
    }
  }

  function handleCancelMove() {
    showMoveModal = false;
    moveTargetFolderId = null;
    moveTargets = [];
    moveFolderTree = {};
    moveExpandedFolders = [];
    moveLoadingFolders = [];
    moveError = "";
    moveNotice = "";
  }

  const handleFolderCreated = () => refreshStorage();
  const handleFilesUploaded = () => refreshStorage();

  onMount(() => {
  currentUser = {
    id: 'user_123',
    username: 'demo_user',
    walletAddress: '0xabc123def456'
  };

  const handleStorageRefresh = () => {
    void refreshStorage();
  };

  window.addEventListener('decentrashare:refresh', handleStorageRefresh);
  void refreshStorage();

  return () => {
    window.removeEventListener('decentrashare:refresh', handleStorageRefresh);
  };
});
</script>

<main class="relative w-full flex-1 p-4 sm:p-6 md:p-10 overflow-y-auto max-w-[1600px] mx-auto">
  
  {#if isProcessing}
    <div class="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade>
      <div class="bg-[#121214] p-8 rounded-[40px] border border-white/10 shadow-2xl flex flex-col items-center" in:scale>
        <div class="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h3 class="text-white font-bold text-lg">DecentraShare Sync</h3>
        <p class="text-gray-500 text-sm italic">Wait a minute...</p>
      </div>
    </div>
  {/if}

  <!-- ═══════════════════════════════════════════════════ -->
  <!-- MODALS -->
  <!-- ═══════════════════════════════════════════════════ -->
  
  <!-- Rename Modal -->
<!-- Rename Modal - Sudah benar, tidak perlu change -->
{#if renamingItem}
  <div class="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade>
    <div class="bg-[#1a1a1e] p-6 rounded-2xl border border-white/10 shadow-2xl w-full max-w-sm" in:scale>
      <h3 class="text-white font-bold mb-4">Rename {renamingItem.type}</h3>
      
      <input 
        bind:value={renameInputValue}
        oninput={() => renameError = ""} 
        onkeydown={(e) => {
          if (e.key === 'Enter') handleSubmitRename();
          if (e.key === 'Escape') handleCancelRename();
        }}
        class="w-full px-4 py-3 bg-white/5 border rounded-xl text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 transition-all mb-2
               {renameError ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/50' : 'border-white/10 focus:border-blue-500 focus:ring-blue-500/50'}"
        placeholder="Enter new name..."
        autofocus
        disabled={isRenameProcessing}
      />
      
      {#if renameError}
        <p class="text-xs text-red-400 ml-1 mb-4 flex items-center gap-1" role="alert" aria-live="polite">
          <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span class="truncate">{renameError}</span>
        </p>
      {/if}
      
      <div class="flex gap-3">
        <button 
          onclick={handleCancelRename}
          class="flex-1 h-10 bg-white/5 text-white rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50"
          disabled={isRenameProcessing}
        >
          Cancel
        </button>
        <button 
          onclick={handleSubmitRename}
          class="flex-1 h-10 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          disabled={isRenameProcessing || !renameInputValue.trim()}
        >
          {#if isRenameProcessing}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          {:else}
            Save
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Modal - ✅ FIX: Buttons call local wrappers (yang call composable nama asli) -->
{#if deletingItem}
  <div class="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade>
    <div class="bg-[#1a1a1e] p-6 rounded-2xl border border-white/10 shadow-2xl w-full max-w-sm" in:scale>
      
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        </div>
        <div>
          <h3 class="text-white font-bold">Delete {deletingItem.type}</h3>
          <p class="text-xs text-gray-500">This action cannot be undone.</p>
        </div>
      </div>
      
      <p class="text-sm text-gray-300 mb-4">
        Are you sure you want to delete "<span class="text-white font-medium">{deletingItem.name}</span>"?
      </p>
      
      {#if deleteError}
        <p class="text-xs text-red-400 ml-1 mb-4 flex items-center gap-1" role="alert" aria-live="polite">
          <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span class="truncate">{deleteError}</span>
        </p>
      {/if}
      
      <div class="flex gap-3">
        <!-- ✅ Call local wrapper (yang call composable nama asli) -->
        <button onclick={handleCancelDelete} class="flex-1 h-10 bg-white/5 text-white rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50" disabled={isProcessing}>Cancel</button>
        <button onclick={handleExecuteDelete} class="flex-1 h-10 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2" disabled={isProcessing}>
          {#if isProcessing}<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>{:else}Delete{/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Bulk Delete Modal - ✅ FIX: Buttons call local wrappers -->
{#if bulkDeleteItems.length > 0}
  <div class="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade>
    <div class="bg-[#1a1a1e] p-6 rounded-2xl border border-white/10 shadow-2xl w-full max-w-sm" in:scale>
      
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        </div>
        <div>
          <h3 class="text-white font-bold">Delete {bulkDeleteItems.length} Items</h3>
          <p class="text-xs text-gray-500">This action cannot be undone.</p>
        </div>
      </div>
      
      <div class="max-h-48 overflow-y-auto mb-4 pr-2">
        {#each bulkDeleteItems.slice(0, 5) as item}
          <p class="text-sm text-gray-300 py-1 flex items-center gap-2">
            {#if item.type === 'folder'}
              <svg class="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
            {:else}
              <svg class="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            {/if}
            <span class="truncate">{item.name}</span>
          </p>
        {/each}
        {#if bulkDeleteItems.length > 5}<p class="text-xs text-gray-500 italic mt-2">+ {bulkDeleteItems.length - 5} more...</p>{/if}
      </div>
      
      {#if deleteError}
        <p class="text-xs text-red-400 ml-1 mb-4 flex items-center gap-1" role="alert" aria-live="polite">
          <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span class="truncate">{deleteError}</span>
        </p>
      {/if}
      
      <div class="flex gap-3">
        <!-- ✅ Call local wrapper (yang call composable nama asli) -->
        <button onclick={handleCancelBulkDelete} class="flex-1 h-10 bg-white/5 text-white rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50" disabled={isProcessing}>Cancel</button>
        <button onclick={handleExecuteBulkDelete} class="flex-1 h-10 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2" disabled={isProcessing}>
          {#if isProcessing}<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>{:else}Delete {bulkDeleteItems.length}{/if}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showMoveModal}
  <div class="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade>
    <div class="bg-[#111115] rounded-[32px] border border-white/10 shadow-2xl shadow-black/60 w-full max-w-2xl max-h-[86vh] overflow-hidden" in:scale>
      <div class="p-6 border-b border-white/10 bg-gradient-to-br from-blue-600/15 via-white/[0.03] to-transparent">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-4 min-w-0">
            <div class="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-400/20 flex items-center justify-center shrink-0">
              <svg class="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
              </svg>
            </div>
            <div class="min-w-0">
              <h3 class="text-white font-black text-xl tracking-tight">Move Item</h3>
              <p class="text-sm text-gray-400 truncate">{getMoveTargetLabel()}</p>
            </div>
          </div>
          <button onclick={handleCancelMove} class="p-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/10 transition-colors" disabled={isMoveProcessing} aria-label="Close move modal">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div class="rounded-2xl bg-white/5 border border-white/10 px-4 py-3"><p class="text-gray-500 uppercase tracking-wider font-bold">Items</p><p class="text-white font-semibold mt-1">{moveTargets.length}</p></div>
          <div class="rounded-2xl bg-white/5 border border-white/10 px-4 py-3"><p class="text-gray-500 uppercase tracking-wider font-bold">Destination</p><p class="text-white font-semibold mt-1 truncate">{getMoveDestinationLabel()}</p></div>
          <div class="rounded-2xl bg-white/5 border border-white/10 px-4 py-3"><p class="text-gray-500 uppercase tracking-wider font-bold">Privacy</p><p class="text-blue-300 font-semibold mt-1">Auto sync</p></div>
        </div>
      </div>

      <div class="p-6 space-y-4 overflow-y-auto max-h-[calc(86vh-220px)]">

      {#if moveNotice}
        <p class="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-3" role="status">{moveNotice}</p>
      {/if}

      <div class="space-y-2 max-h-72 overflow-y-auto mb-4 pr-1">
        <button onclick={() => moveTargetFolderId = null} class="w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-colors {moveTargetFolderId === null ? 'bg-blue-600/20 border-blue-500/50 text-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}" disabled={isMoveProcessing}>
          <span>
            <span class="block font-medium">Root</span>
            <span class="block text-xs text-gray-500">Privacy akan menjadi PRIVATE</span>
          </span>
          {#if moveTargetFolderId === null}<span class="text-blue-400">Selected</span>{/if}
        </button>

        {#if visibleMoveFolders.length === 0}
          <div class="px-4 py-6 text-center rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
            <p class="text-sm text-gray-400">Belum ada folder tujuan.</p>
            <p class="text-xs text-gray-600 mt-1">Pilih Root atau buat folder baru terlebih dahulu.</p>
          </div>
        {/if}

        {#each visibleMoveFolders as row (row.folder.id)}
          {@const invalidDestination = isInvalidMoveDestination(row.folder.id)}
          <div class="flex items-stretch gap-2" style={`margin-left: ${row.depth * 1.25}rem`}>
            <button onclick={() => toggleMoveFolder(row.folder.id)} class="w-11 rounded-xl border border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center" disabled={isMoveProcessing} title="Show subfolders">
              {#if isMoveFolderLoading(row.folder.id)}
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              {:else}
                <svg class="w-4 h-4 transition-transform {isMoveFolderExpanded(row.folder.id) ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
              {/if}
            </button>
            <button onclick={() => { if (!invalidDestination) moveTargetFolderId = row.folder.id; }} class="flex-1 flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all {invalidDestination ? 'bg-red-500/5 border-red-500/20 text-gray-600 cursor-not-allowed' : moveTargetFolderId === row.folder.id ? 'bg-blue-600/20 border-blue-500/50 text-white shadow-lg shadow-blue-500/10' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}" disabled={isMoveProcessing || invalidDestination}>
              <span class="min-w-0">
                <span class="flex items-center gap-2 font-medium truncate"><svg class="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>{row.folder.name}</span>
                <span class="block text-xs text-gray-500">Level {row.depth + 1} · {invalidDestination ? 'Invalid destination' : `Privacy tujuan: ${row.folder.privacy}`}</span>
              </span>
              {#if moveTargetFolderId === row.folder.id}<span class="text-blue-400 text-xs font-semibold">Selected</span>{/if}
            </button>
          </div>

          {#if isMoveFolderExpanded(row.folder.id) && getMoveChildren(row.folder.id).length === 0 && !isMoveFolderLoading(row.folder.id)}
            <p class="py-1 text-xs text-gray-600 italic" style={`margin-left: ${(row.depth + 1) * 1.25 + 3.5}rem`}>Tidak ada subfolder</p>
          {/if}
        {/each}
      </div>

      {#if moveError}
        <p class="text-xs text-red-400 ml-1 mb-4 flex items-center gap-1" role="alert" aria-live="polite">
          <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>{moveError}</span>
        </p>
      {/if}

      <div class="flex gap-3">
        <button onclick={handleCancelMove} class="flex-1 h-10 bg-white/5 text-white rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50" disabled={isMoveProcessing}>Cancel</button>
        <button onclick={handleExecuteMove} class="flex-1 h-10 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-bold" disabled={isMoveProcessing || isInvalidMoveDestination(moveTargetFolderId)}>
          {#if isMoveProcessing}<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>{:else}Move Here{/if}
        </button>
      </div>
    </div>
  </div>
</div>
{/if}

  {#if showBulkShareModal}
    <div class="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-md px-4" transition:fade>
      <div class="w-full max-w-lg rounded-[28px] border border-white/10 bg-[#111115] shadow-2xl shadow-black/60 overflow-hidden" in:scale>
        <div class="p-6 border-b border-white/10 bg-gradient-to-br from-violet-600/15 via-white/[0.03] to-transparent">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-white font-black text-xl">Bulk Share</h3>
              <p class="text-sm text-gray-400">
                {bulkShareTargets.filter(target => target.type === 'folder').length} folder · {bulkShareTargets.filter(target => target.type === 'document').length} dokumen
              </p>
            </div>
            <button onclick={resetBulkShareState} class="p-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/10 transition-colors" disabled={isBulkShareProcessing} aria-label="Close bulk share modal">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div class="p-6 space-y-4">
          <div>
            <p class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Privacy Level</p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {#each ['PRIVATE', 'PUBLIC', 'SPECIFIC_USER'] as level (level)}
                <button onclick={() => bulkSharePrivacy = level as PrivacyLevel} class="px-4 py-3 rounded-2xl border text-left transition-all {bulkSharePrivacy === level ? 'bg-violet-600/20 border-violet-500/60 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}" disabled={isBulkShareProcessing}>
                  <span class="block text-sm font-bold">{level === 'SPECIFIC_USER' ? 'Specific User' : level.charAt(0) + level.slice(1).toLowerCase()}</span>
                  <span class="block text-xs text-gray-500 mt-1">{level === 'SPECIFIC_USER' ? 'Pilih user tertentu' : level === 'PUBLIC' ? 'Semua orang bisa akses' : 'Hanya owner'}</span>
                </button>
              {/each}
            </div>
          </div>

          {#if bulkShareTargets.some(target => target.type === 'folder') && bulkShareTargets.some(target => target.type === 'document')}
            <p class="text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-2xl px-4 py-3">
              Mixed selection: privacy diterapkan ke folder dan dokumen. Role hanya berlaku untuk folder; dokumen hanya menerima user.
            </p>
          {/if}

          {#if bulkSharePrivacy === 'SPECIFIC_USER'}
            <div>
              <label class="text-xs font-bold uppercase tracking-wider text-gray-500">Cari user</label>
              <input bind:value={bulkShareSearchQuery} oninput={handleBulkShareSearchInput} class="mt-2 w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-gray-600 focus:outline-none focus:border-violet-500" placeholder="Username atau wallet address" disabled={isBulkShareProcessing} />
            </div>

            {#if isBulkShareSearching}
              <p class="text-sm text-gray-500">Searching...</p>
            {:else if bulkShareSearchResults.length > 0}
              <div class="max-h-44 overflow-y-auto rounded-2xl border border-white/10 bg-black/20">
                {#each bulkShareSearchResults as user (user.id)}
                  <button onclick={() => toggleBulkShareUser(user)} class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors">
                    <span class="min-w-0">
                      <span class="block text-sm text-white font-medium truncate">{user.username}</span>
                      <span class="block text-xs text-gray-500 truncate">{user.walletAddress}</span>
                    </span>
                    <span class="text-violet-300 text-xs font-bold">Add</span>
                  </button>
                {/each}
              </div>
            {/if}

            {#if bulkShareSelectedUsers.length > 0}
              <div class="flex flex-wrap gap-2">
                {#each bulkShareSelectedUsers as user (user.id)}
                  <button onclick={() => toggleBulkShareUser(user)} class="px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-200 text-xs hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-300 transition-colors">
                    {user.username} ×
                  </button>
                {/each}
              </div>
            {/if}

            {#if bulkShareTargets.some(target => target.type === 'folder')}
              <div>
                <label class="text-xs font-bold uppercase tracking-wider text-gray-500">Folder role</label>
                <select bind:value={bulkShareRole} class="mt-2 w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-violet-500" disabled={isBulkShareProcessing}>
                  <option value="VIEWER" class="bg-[#111115]">Viewer</option>
                  <option value="EDITOR" class="bg-[#111115]">Editor</option>
                </select>
              </div>
            {/if}
          {:else}
            <p class="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3">
              User selection tidak diperlukan. Jika privacy bukan Specific User, akses user spesifik akan dibersihkan oleh backend.
            </p>
          {/if}

          {#if bulkShareError}
            <p class="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3" role="alert">{bulkShareError}</p>
          {/if}
        </div>

        <div class="p-5 border-t border-white/10 flex gap-3">
          <button onclick={resetBulkShareState} class="flex-1 h-11 rounded-2xl bg-white/5 text-white hover:bg-white/10 transition-colors" disabled={isBulkShareProcessing}>Cancel</button>
          <button onclick={handleExecuteBulkShare} class="flex-1 h-11 rounded-2xl bg-violet-600 text-white font-bold hover:bg-violet-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors" disabled={isBulkShareProcessing || (bulkSharePrivacy === 'SPECIFIC_USER' && bulkShareSelectedUsers.length === 0)}>
            {isBulkShareProcessing ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ═══════════════════════════════════════════════════ -->
  <!-- HEADER -->
  <!-- ═══════════════════════════════════════════════════ -->
  <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6 mb-10">
    <div class="flex items-center gap-3 flex-1 min-w-0">
      {#if breadcrumbs.length > 0}
        <button onclick={goBack} class="p-2 mt-7 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all shrink-0" title="Back to parent folder">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </button>
      {/if}
      
      <div class="min-w-0">
        <Breadcrumbs {breadcrumbs} {currentFolder} {openFolder} />
        <div class="flex items-center gap-3">
          <h2 class="text-2xl md:text-3xl font-black text-white tracking-tight truncate">{currentFolder ? currentFolder.name : 'All Files'}</h2>
          <ViewSwitcher bind:viewMode />
        </div>
      </div>
    </div>
    
    <div class="flex gap-3 w-full sm:w-auto">
      <!-- Select Mode Toggle -->
     <button 
  onclick={toggleSelectMode}
  class="flex-1 sm:flex-none px-4 py-3 bg-white/5 border border-white/10 text-white rounded-[20px] font-medium text-sm hover:bg-white/10 transition-all duration-300 flex items-center gap-2 {selectionMode ? 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-500/50 hover:from-blue-500 hover:to-blue-600 shadow-lg shadow-blue-500/30 ring-1 ring-blue-400/30 animate-pulse-slow' : ''}"
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
  {#if selectionMode && selectedItems?.length > 0}
  {/if}
</button>

      <button onclick={refreshStorage} class="flex-1 sm:flex-none px-4 py-3 bg-white/5 border border-white/10 text-white rounded-[20px] font-medium text-sm hover:bg-white/10 transition-all disabled:opacity-50" disabled={isLoading || isRefreshingStorage}>Refresh</button>

      <!-- Action Buttons -->
      <button onclick={() => showFolder = true} class="flex-1 sm:flex-none px-6 py-3 bg-white/5 border border-white/10 text-white rounded-[20px] font-bold text-sm hover:bg-white/10 transition-all">+ Folder</button>
      <button onclick={() => showUpload = true} class="flex-1 sm:flex-none px-6 py-3 bg-blue-600 text-white rounded-[20px] font-bold text-sm hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20">Upload</button>
    </div>
  </header>

  {#if moveSuccess || bulkShareSuccess || (moveError && !showMoveModal)}
    <div class="mb-6 px-4 py-3 rounded-xl border flex items-center gap-3 {moveError ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}" role="status" aria-live="polite">
      {#if moveError}
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      {:else}
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
      {/if}
      <p class="text-sm flex-1">{moveError || moveSuccess || bulkShareSuccess}</p>
      <button onclick={() => { moveError = ''; moveSuccess = ''; bulkShareSuccess = ''; }} class="p-1 hover:bg-white/10 rounded" aria-label="Dismiss move status">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  {/if}

  {#if downloadStatus || downloadSuccess || downloadError}
    <div class="mb-6 px-4 py-3 rounded-xl border flex items-center gap-3 {downloadError ? 'bg-red-500/10 border-red-500/20 text-red-400' : downloadSuccess ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}" role="status" aria-live="polite">
      {#if downloadStatus}
        <svg class="w-5 h-5 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      {:else if downloadSuccess}
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
      {:else}
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      {/if}
      <p class="text-sm flex-1">{downloadStatus || downloadSuccess || downloadError}</p>
      {#if downloadError || downloadSuccess}
        <button onclick={() => { downloadError = ''; downloadSuccess = ''; }} class="p-1 hover:bg-white/10 rounded" aria-label="Dismiss download status">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      {/if}
    </div>
  {/if}

  {#if bulkConfirmStatus || bulkConfirmSuccess || bulkConfirmError}
    <div class="mb-6 px-4 py-3 rounded-xl border flex items-center gap-3 {bulkConfirmError ? 'bg-red-500/10 border-red-500/20 text-red-400' : bulkConfirmSuccess ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}" role="status" aria-live="polite">
      {#if bulkConfirmStatus}
        <svg class="w-5 h-5 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      {:else if bulkConfirmSuccess}
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
      {:else}
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      {/if}
      <p class="text-sm flex-1">{bulkConfirmStatus || bulkConfirmSuccess || bulkConfirmError}</p>
      {#if bulkConfirmError || bulkConfirmSuccess}
        <button onclick={() => { bulkConfirmError = ''; bulkConfirmSuccess = ''; }} class="p-1 hover:bg-white/10 rounded" aria-label="Dismiss blockchain confirmation status">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      {/if}
    </div>
  {/if}

  <!-- ═══════════════════════════════════════════════════ -->
  <!-- CONTENT -->
  <!-- ═══════════════════════════════════════════════════ -->
  {#if isLoading || isRefreshingStorage}
    <div class="py-24 flex flex-col items-center justify-center text-center border border-white/5 rounded-[32px] bg-white/[0.01]">
      <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p class="text-gray-400">Loading storage items...</p>
    </div>
  {:else}
    <div in:fade>
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
              handleDeleteFolder={handleDeleteFolder} handleDelete={handleDelete} {getFileTheme}
              onRename={(id, name) => handleRename(id, 'folder', name)}
              onShare={handleShare} onDownload={handleDownload} onMove={handleSingleMove}
              onDeleteConfirm={(id, type, name) => {
                deletingItem = { id, type, name };  
                confirmDelete({ id, type, name });   
                deleteError = "";
              }}
              {selectedItems} 
              {selectionMode}
              onToggleSelect={toggleSelection}
              {isSelected} 
              onRefresh={refreshStorage}
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
              handleDeleteFolder={handleDeleteFolder} handleDelete={handleDelete} {getFileTheme}
              onRename={(id, name) => handleRename(id, 'document', name)}
              onShare={handleShare} onDownload={handleDownload} onMove={handleSingleMove}
              onDeleteConfirm={(id, type, name) => {
                deletingItem = { id, type, name };  
                confirmDelete({ id, type, name });   
                deleteError = "";
              }}
              {selectedItems} 
              {selectionMode}
              onToggleSelect={toggleSelection}
              {isSelected}
              onRefresh={refreshStorage}
            />
          {:else}<p class="text-gray-600 text-sm italic pl-2">No documents yet</p>{/if}
        </section>
      {:else if viewMode === 2}
        <!-- Table View -->
        {#if sortedFolders.length > 0 || sortedItems.length > 0}
          <FileTable 
            folders={sortedFolders} items={sortedItems} viewMode={2} {openFolder}
            handleDeleteFolder={handleDeleteFolder} handleDelete={handleDelete} {getFileTheme}
            onRename={(id, name) => handleRename(id, folders.some(f => f.id === id) ? 'folder' : 'document', name)}
            onShare={handleShare} onDownload={handleDownload} onMove={handleSingleMove}
            onDeleteConfirm={(id, type, name) => {
                deletingItem = { id, type, name };  
                confirmDelete({ id, type, name });   
                deleteError = "";
              }}
            {selectedItems} 
            {selectionMode}
            onToggleSelect={toggleSelection}
            {isSelected}
            onRefresh={refreshStorage}
          />
        {:else}
          <div class="text-center py-20 border border-white/5 rounded-[32px] bg-white/[0.01]"><p class="text-gray-500">No items in this folder</p></div>
        {/if}
      {:else}
        <!-- Grid View -->
        {#if sortedFolders.length > 0 || sortedItems.length > 0}
          <FileGrid 
            folders={sortedFolders} items={sortedItems} {openFolder}
            handleDeleteFolder={handleDeleteFolder} handleDelete={handleDelete} {getFileTheme}
            onRename={(id, name) => handleRename(id, folders.some(f => f.id === id) ? 'folder' : 'document', name)}
            onShare={handleShare} onDownload={handleDownload} onMove={handleSingleMove}
            onDeleteConfirm={(id, type, name) => {
              deletingItem = { id, type, name };
              confirmDelete({ id, type, name });
              deleteError = "";
            }}
            {selectedItems} 
            {selectionMode}
            onToggleSelect={toggleSelection}
            {isSelected}
            onRefresh={refreshStorage}
          />
        {:else}
          <div class="text-center py-20 border border-white/5 rounded-[32px] bg-white/[0.01]"><p class="text-gray-500">No items in this folder</p></div>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- ═══════════════════════════════════════════════════ -->
  <!-- CHILD MODALS -->
  <!-- ═══════════════════════════════════════════════════ -->
  <FolderModal isOpen={showFolder} onClose={() => showFolder = false} onCreated={handleFolderCreated} parentId={currentFolder?.id ?? null} existingFolders={folders} />
  <UploadModal isOpen={showUpload} onClose={() => showUpload = false} onUploaded={handleFilesUploaded} folderId={currentFolder?.id ?? null} />

  {#if selectionMode}
    <BulkActionBar
      selectedCount={selectedItems.length}
      selectedType={selectedTypeValue}
      onMove={handleBulkMove}
      onManageAccess={handleBulkManageAccess}
      onConfirmBlockchain={handleBulkConfirmBlockchain}
      onDownload={handleBulkDownload}
      canConfirmBlockchain={selectedUnconfirmedDocuments.length > 0}
      confirmBlockchainCount={selectedUnconfirmedDocuments.length}
      isConfirmingBlockchain={isBulkConfirmingBlockchain}
      isProcessing={isProcessing}
      onDelete={handleConfirmBulkDelete}
      onCancel={toggleSelectMode}
    />
  {/if}

  {#if showShareModal && shareTarget && currentUser}
  <ShareModal
    isOpen={showShareModal}
    itemId={shareTarget.id}
    itemType={shareTarget.type}
    itemName={shareTarget.name}
    currentPrivacy={shareTarget.privacy}
    currentUserId={currentUser.id}
    onClose={() => { 
      showShareModal = false; 
      shareTarget = null; 
    }}
    onShared={refreshStorage} 
  />
{/if}
</main>