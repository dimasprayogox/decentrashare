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
  import BulkShareModal from '$lib/components/storage/BulkShareModal.svelte';
  import MoveItemsModal from '$lib/components/storage/MoveItemsModal.svelte';

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
  let errorMessage = $state('');
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
  let bulkShareTargets = $state<Array<{ id: string; type: 'folder' | 'document'; name: string; privacy: PrivacyLevel }>>([]);
  let bulkShareTargetPrivacy = $state<Record<string, PrivacyLevel>>({});
  let bulkShareSearchQuery = $state('');
  let bulkShareSearchResults = $state<ShareableUser[]>([]);
  let bulkShareSelectedUsers = $state<ShareableUser[]>([]);
  let bulkSharePrivacy = $state<PrivacyLevel>('SPECIFIC_USER');
  let bulkShareRole = $state<'VIEWER' | 'EDITOR'>('VIEWER');
  let bulkShareUserRoles = $state<Record<string, 'VIEWER' | 'EDITOR'>>({});
  let bulkShareAccessMode = $state<'all' | 'individual'>('all');
  let bulkShareActiveTargetId = $state<string | null>(null);
  let bulkShareTargetUsers = $state<Record<string, ShareableUser[]>>({});
  let bulkShareTargetUserRoles = $state<Record<string, Record<string, 'VIEWER' | 'EDITOR'>>>({});
  let bulkShareError = $state('');
  let bulkShareSuccess = $state('');
  let isBulkShareSearching = $state(false);
  let isBulkShareProcessing = $state(false);
  let bulkShareSearchTimeout: ReturnType<typeof setTimeout>;

  const bulkSharePrivacyConfig: Record<PrivacyLevel, {
    icon: string;
    label: string;
    description: string;
    color: string;
    gradient: string;
  }> = {
    PRIVATE: {
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>`,
      label: 'Private',
      description: 'Only owners can access',
      color: 'text-gray-400',
      gradient: 'from-gray-500/20 to-slate-500/20'
    },
    PUBLIC: {
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
      label: 'Public',
      description: 'Anyone can view & download',
      color: 'text-emerald-400',
      gradient: 'from-emerald-500/20 to-green-500/20'
    },
    LINK_ONLY: {
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
      label: 'Link Only',
      description: 'Only people with the link',
      color: 'text-blue-400',
      gradient: 'from-blue-500/20 to-cyan-500/20'
    },
    SPECIFIC_USER: {
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      label: 'Specific Users',
      description: 'Share with selected people only',
      color: 'text-violet-400',
      gradient: 'from-violet-500/20 to-purple-500/20'
    }
  };

  const currentBulkShareConfig = $derived(bulkSharePrivacyConfig[bulkSharePrivacy]);
  const bulkShareFolderCount = $derived(bulkShareTargets.filter(target => target.type === 'folder').length);
  const bulkShareDocumentCount = $derived(bulkShareTargets.filter(target => target.type === 'document').length);
  const bulkShareHasFolders = $derived(bulkShareFolderCount > 0);
  const bulkShareHasDocuments = $derived(bulkShareDocumentCount > 0);
  const bulkShareIsMixed = $derived(bulkShareHasFolders && bulkShareHasDocuments);
  const bulkShareHasSpecificUserItems = $derived(bulkShareTargets.some(target => getBulkShareTargetPrivacy(target.id) === 'SPECIFIC_USER'));
  const bulkShareSpecificUserFolderCount = $derived(bulkShareTargets.filter(target => target.type === 'folder' && getBulkShareTargetPrivacy(target.id) === 'SPECIFIC_USER').length);
  const bulkShareHasSpecificUserFolders = $derived(bulkShareSpecificUserFolderCount > 0);
  const bulkShareSpecificTargets = $derived(bulkShareTargets.filter(target => getBulkShareTargetPrivacy(target.id) === 'SPECIFIC_USER'));
  const bulkShareActiveTarget = $derived(bulkShareTargets.find(target => target.id === bulkShareActiveTargetId) || bulkShareSpecificTargets[0] || null);

  function getBulkShareUserInitial(username?: string): string {
    return username?.charAt(0).toUpperCase() || '?';
  }

  function getBulkShareUserRole(userId: string): 'VIEWER' | 'EDITOR' {
    return bulkShareUserRoles[userId] || bulkShareRole || 'VIEWER';
  }

  function setBulkShareUserRole(userId: string, role: 'VIEWER' | 'EDITOR') {
    bulkShareUserRoles = { ...bulkShareUserRoles, [userId]: role };
  }

  function getBulkShareTargetUsers(targetId: string): ShareableUser[] {
    return bulkShareTargetUsers[targetId] || [];
  }

  function getBulkShareTargetUserRole(targetId: string, userId: string): 'VIEWER' | 'EDITOR' {
    return bulkShareTargetUserRoles[targetId]?.[userId] || 'VIEWER';
  }

  function setBulkShareTargetUserRole(targetId: string, userId: string, role: 'VIEWER' | 'EDITOR') {
    bulkShareTargetUserRoles = {
      ...bulkShareTargetUserRoles,
      [targetId]: {
        ...(bulkShareTargetUserRoles[targetId] || {}),
        [userId]: role
      }
    };
  }

  function toggleBulkShareTargetUser(targetId: string, user: ShareableUser) {
    const users = getBulkShareTargetUsers(targetId);
    if (users.some(selected => selected.id === user.id)) {
      bulkShareTargetUsers = { ...bulkShareTargetUsers, [targetId]: users.filter(selected => selected.id !== user.id) };
      const targetRoles = { ...(bulkShareTargetUserRoles[targetId] || {}) };
      delete targetRoles[user.id];
      bulkShareTargetUserRoles = { ...bulkShareTargetUserRoles, [targetId]: targetRoles };
      return;
    }

    bulkShareTargetUsers = { ...bulkShareTargetUsers, [targetId]: [...users, user] };
    if (bulkShareTargets.find(target => target.id === targetId)?.type === 'folder') {
      setBulkShareTargetUserRole(targetId, user.id, 'VIEWER');
    }
  }

  function getBulkShareSpecificTargetsWithoutUsers(): string[] {
    if (bulkShareAccessMode === 'all') return bulkShareHasSpecificUserItems && bulkShareSelectedUsers.length === 0 ? ['all'] : [];
    return bulkShareSpecificTargets.filter(target => getBulkShareTargetUsers(target.id).length === 0).map(target => target.name);
  }

  function getBulkShareTargetIcon(type: 'folder' | 'document') {
    return type === 'folder' ? '📁' : '📄';
  }

  function getBulkShareTargetPrivacy(targetId: string): PrivacyLevel {
    return bulkShareTargetPrivacy[targetId] || bulkShareTargets.find(target => target.id === targetId)?.privacy || 'PRIVATE';
  }

  function setBulkShareTargetPrivacy(targetId: string, privacy: PrivacyLevel) {
    bulkShareTargetPrivacy = { ...bulkShareTargetPrivacy, [targetId]: privacy };
  }

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
  let bulkActionError = $state('');
  let bulkActionErrorTimer: ReturnType<typeof setTimeout> | undefined;

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

  function showBulkActionError(message: string) {
    bulkActionError = message;
    if (bulkActionErrorTimer) clearTimeout(bulkActionErrorTimer);
    bulkActionErrorTimer = setTimeout(() => {
      bulkActionError = '';
    }, 4000);
  }

  function isOwnedByCurrentUser(item: { ownerId: string }): boolean {
    return Boolean(currentUser?.id && item.ownerId === currentUser.id);
  }

  function getSelectedItemsOwnedByOthers() {
    if (!currentUser?.id) return [];
    return [
      ...getSelectedFolders(folders),
      ...getSelectedDocuments(items)
    ].filter(item => !isOwnedByCurrentUser(item));
  }

  function hasSelectedItemsOwnedByOthers() {
    return getSelectedItemsOwnedByOthers().length > 0;
  }

  function canMoveIntoFolder(folder: Folder): boolean {
    return isOwnedByCurrentUser(folder) || folder.accessRole === 'EDITOR' || folder.accessRole === 'ADMIN';
  }

  function getMoveDestinationDisabledReason(folder: Folder): string {
    if (isOwnedByCurrentUser(folder) || canMoveIntoFolder(folder)) return '';
    if (folder.accessRole === 'VIEWER') return 'You only have viewer access to this folder.';
    return 'You do not have permission to move items into this folder.';
  }

  function getMoveDestinationMeta(folder: Folder): string {
    if (isOwnedByCurrentUser(folder)) return `Privacy: ${folder.privacy}`;
    if (folder.accessRole === 'EDITOR' || folder.accessRole === 'ADMIN') return `Shared · ${folder.accessRole === 'ADMIN' ? 'Admin' : 'Editor'}`;
    if (folder.accessRole === 'VIEWER') return 'Shared · Viewer only';
    return `Privacy: ${folder.privacy}`;
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
    return `${moveTargets.length} items (${folderCount} folder(s), ${documentCount} document(s))`;
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
      errorMessage = '';
      const folderId = page.url.searchParams.get('folder');

      if (folderId) {
        try {
          const pathRes = await storageService.getFolderPath(folderId);
          if (pathRes.success) {
            breadcrumbs = pathRes.data;
            currentFolder = pathRes.data[pathRes.data.length - 1] || null;
          }
        } catch (e: any) {
          console.warn('Failed to load folder path:', e);
          breadcrumbs = [];
          currentFolder = null;
          if (e.status === 403 || e.message?.includes('Access denied')) {
            errorMessage = 'You do not have access to this folder / items';
            return;
          }
        }
      } else {
        breadcrumbs = [];
        currentFolder = null;
      }

      const [fRes, dRes] = await Promise.allSettled([
        storageService.getFolders(folderId),
        storageService.getDocuments(folderId)
      ]);
      
      if (folderId) {
        if (fRes.status === 'rejected' && ((fRes.reason as any).status === 403 || fRes.reason.message?.includes('Access denied'))) {
          errorMessage = 'You do not have access to this folder / items';
          return;
        }
        if (dRes.status === 'rejected' && ((dRes.reason as any).status === 403 || dRes.reason.message?.includes('Access denied'))) {
          errorMessage = 'You do not have access to this folder / items';
          return;
        }
      }
      
      folders = (fRes.status === 'fulfilled' && fRes.value.success) ? fRes.value.data : [];
      items = (dRes.status === 'fulfilled' && dRes.value.success) ? dRes.value.data : [];
      
    } catch (err: any) {
      console.error('[Storage] loadStorageData error:', err);
      if (err.status === 403 || err.message?.includes('Access denied')) {
        errorMessage = 'You do not have access to this folder / items';
      } else {
        errorMessage = err.message || 'Failed to load storage data';
      }
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

    if (hasSelectedItemsOwnedByOthers()) {
      showBulkActionError('You can only move items you own to trash. Remove shared items from selection first.');
      return;
    }

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
      bulkConfirmError = 'No selected files need to be confirmed on-chain.';
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

      bulkConfirmSuccess = `${confirmedIds.length} file(s) successfully confirmed on-chain.`;
      bulkConfirmStatus = '';
      clearSelection();

      setTimeout(() => {
        bulkConfirmSuccess = '';
      }, 4000);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to confirm selected files on-chain';

      if (message === 'TRANSACTION_REJECTED') {
        bulkConfirmError = 'Wallet confirmation cancelled.';
      } else if (message === 'INSUFFICIENT_FUNDS') {
        bulkConfirmError = 'Insufficient ETH balance for gas.';
      } else if (message === 'WRONG_NETWORK') {
        bulkConfirmError = 'Please switch your wallet network to Sepolia.';
      } else if (message === 'TX_CONFIRMATION_TIMEOUT') {
        bulkConfirmError = 'Transaction is not confirmed yet. Please refresh after a few moments.';
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
    bulkShareTargetPrivacy = {};
    bulkShareSearchQuery = '';
    bulkShareSearchResults = [];
    bulkShareSelectedUsers = [];
    bulkSharePrivacy = 'SPECIFIC_USER';
    bulkShareRole = 'VIEWER';
    bulkShareUserRoles = {};
    bulkShareAccessMode = 'all';
    bulkShareActiveTargetId = null;
    bulkShareTargetUsers = {};
    bulkShareTargetUserRoles = {};
    bulkShareError = '';
  }

  function toggleBulkShareUser(user: ShareableUser) {
    if (bulkShareSelectedUsers.some(selected => selected.id === user.id)) {
      bulkShareSelectedUsers = bulkShareSelectedUsers.filter(selected => selected.id !== user.id);
      const nextRoles = { ...bulkShareUserRoles };
      delete nextRoles[user.id];
      bulkShareUserRoles = nextRoles;
    } else {
      bulkShareSelectedUsers = [...bulkShareSelectedUsers, user];
      if (bulkShareHasFolders) setBulkShareUserRole(user.id, bulkShareRole);
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
      bulkShareError = error instanceof Error ? error.message : 'Failed to search for users.';
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
      ...getSelectedFolders(folders).map(folder => ({ id: folder.id, type: 'folder' as const, name: folder.name, privacy: folder.privacy })),
      ...getSelectedDocuments(items).map(document => ({ id: document.id, type: 'document' as const, name: document.title, privacy: document.privacy }))
    ];

    if (targets.length === 0) {
      bulkShareError = 'Select at least one item to share.';
      return;
    }

    if (hasSelectedItemsOwnedByOthers()) {
      showBulkActionError('Only the owner can manage access for selected items. Remove shared items from selection first.');
      return;
    }

    bulkShareTargets = targets;
    bulkShareTargetPrivacy = Object.fromEntries(targets.map(target => [target.id, target.privacy]));
    bulkShareActiveTargetId = targets[0]?.id ?? null;
    bulkShareTargetUsers = {};
    bulkShareTargetUserRoles = {};
    bulkShareSearchQuery = '';
    bulkShareSearchResults = [];
    bulkShareSelectedUsers = [];
    bulkSharePrivacy = 'SPECIFIC_USER';
    bulkShareRole = 'VIEWER';
    bulkShareUserRoles = {};
    bulkShareAccessMode = 'all';
    bulkShareError = '';
    bulkShareSuccess = '';
    showBulkShareModal = true;
  }

  async function handleExecuteBulkShare() {
    const missingSpecificTargets = getBulkShareSpecificTargetsWithoutUsers();
    if (missingSpecificTargets.length > 0) {
      bulkShareError = bulkShareAccessMode === 'all'
        ? 'Please select at least one target user for Specific Users items.'
        : `Please select at least one user for: ${missingSpecificTargets.join(', ')}`;
      return;
    }

    const selectedUserIds = bulkShareSelectedUsers.map(user => user.id);
    const folderTargets = bulkShareTargets.filter(target => target.type === 'folder');
    const documentTargets = bulkShareTargets.filter(target => target.type === 'document');
    const specificDocumentTargets = documentTargets.filter(target => getBulkShareTargetPrivacy(target.id) === 'SPECIFIC_USER');
    const specificFolderTargets = folderTargets.filter(target => getBulkShareTargetPrivacy(target.id) === 'SPECIFIC_USER');

    try {
      isBulkShareProcessing = true;
      bulkShareError = '';

      const nonSpecificDocumentTargets = documentTargets.filter(target => getBulkShareTargetPrivacy(target.id) !== 'SPECIFIC_USER');
      if (nonSpecificDocumentTargets.length > 0) {
        await storageService.updateDocumentsPrivacy(nonSpecificDocumentTargets.map(target => ({
          documentId: target.id,
          newPrivacy: getBulkShareTargetPrivacy(target.id)
        })));
      }

      const nonSpecificFolderTargets = folderTargets.filter(target => getBulkShareTargetPrivacy(target.id) !== 'SPECIFIC_USER');
      if (nonSpecificFolderTargets.length > 0) {
        await Promise.all(nonSpecificFolderTargets.map(target =>
          storageService.updateFolderPrivacy(target.id, { newPrivacy: getBulkShareTargetPrivacy(target.id) })
        ));
      }

      if (specificDocumentTargets.length > 0) {
        await storageService.shareDocuments(specificDocumentTargets.map(target => ({
          documentId: target.id,
          targetUsers: bulkShareAccessMode === 'all'
            ? selectedUserIds
            : getBulkShareTargetUsers(target.id).map(user => user.id)
        })));
      }

      if (specificFolderTargets.length > 0) {
        await storageService.shareFolders(specificFolderTargets.map(target => {
          const users = bulkShareAccessMode === 'all' ? bulkShareSelectedUsers : getBulkShareTargetUsers(target.id);
          return {
            itemId: target.id,
            itemType: 'folder',
            targetUsers: users.map(user => ({
              userId: user.id,
              role: bulkShareAccessMode === 'all'
                ? getBulkShareUserRole(user.id)
                : getBulkShareTargetUserRole(target.id, user.id)
            }))
          };
        }));
      }

      const parts = [];
      if (folderTargets.length > 0) parts.push(`${folderTargets.length} folder(s)`);
      if (documentTargets.length > 0) parts.push(`${documentTargets.length} document(s)`);
      bulkShareSuccess = `${parts.join(' and ')} successfully updated.`;
      showBulkShareModal = false;
      clearSelection();
      selectionMode = false;
      await refreshStorage();

      setTimeout(() => {
        bulkShareSuccess = '';
      }, 4000);
    } catch (error: unknown) {
      bulkShareError = error instanceof Error ? error.message : 'Failed to update share settings.';
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
      downloadError = 'Select at least one item to download.';
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

  async function openMoveModal(targets: Array<{ id: string; type: 'folder' | 'document'; name: string; parentId?: string | null }>) {
    moveTargets = targets;
    moveTargetFolderId = currentFolder?.id ?? null;
    moveError = "";
    moveSuccess = "";
    moveNotice = "";
    moveFolderTree = {};
    moveExpandedFolders = [];
    moveLoadingFolders = [];
    showMoveModal = true;
    
    await loadMoveFolderChildren(null, true);

    if (currentFolder) {
      for (const crumb of breadcrumbs) {
        if (!moveExpandedFolders.includes(crumb.id)) {
          moveExpandedFolders = [...moveExpandedFolders, crumb.id];
        }
        await loadMoveFolderChildren(crumb.id, true);
      }
      if (!moveExpandedFolders.includes(currentFolder.id)) {
        moveExpandedFolders = [...moveExpandedFolders, currentFolder.id];
      }
      await loadMoveFolderChildren(currentFolder.id, true);
    }
  }

  function handleSingleMove(id: string, type: 'folder' | 'document') {
    const item = type === 'document' ? items.find(document => document.id === id) : folders.find(folder => folder.id === id);
    if (!item) {
      moveError = 'Item not found.';
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
      moveError = "Select at least one item to move.";
      return;
    }

    if (hasSelectedItemsOwnedByOthers()) {
      showBulkActionError('You can only move items you own. Remove shared items from selection first.');
      return;
    }

    openMoveModal(targets);
  }

  async function handleExecuteMove() {
    const documentIds = moveTargets.filter(target => target.type === 'document').map(target => target.id);
    const folderTargets = moveTargets.filter(target => target.type === 'folder');

    if (moveTargets.length === 0) {
      moveError = "Select at least one item to move.";
      return;
    }

    if (moveTargetFolderId && !folderExistsInMoveTree(moveTargetFolderId)) {
      moveError = "Destination folder is invalid or has not been loaded yet.";
      return;
    }

    if (isInvalidMoveDestination(moveTargetFolderId)) {
      moveError = "Cannot move a folder into itself or its subfolders.";
      return;
    }

    if (moveTargetFolderId) {
      const targetFolder = Object.values(moveFolderTree).flat().find(folder => folder.id === moveTargetFolderId);
      if (targetFolder && !canMoveIntoFolder(targetFolder)) {
        moveError = getMoveDestinationDisabledReason(targetFolder);
        return;
      }
    }

    try {
      isMoveProcessing = true;
      moveError = "";
      moveSuccess = "";

      const targets = moveTargets.map(target => ({ id: target.id, type: target.type }));
      const response = await storageService.bulkMove(targets, moveTargetFolderId);
      if (!response.success) {
        throw new Error(response.message || 'Failed to move items.');
      }

      const movedFolders = moveTargets.filter(t => t.type === 'folder').length;
      const movedDocuments = moveTargets.filter(t => t.type === 'document').length;
      const appliedPrivacy = response.data?.appliedPrivacy || response.appliedPrivacy || '';

      const parts = [];
      if (movedFolders > 0) parts.push(`${movedFolders} folder(s)`);
      if (movedDocuments > 0) parts.push(`${movedDocuments} document(s)`);

      moveSuccess = `${parts.join(' and ')} moved to ${getMoveDestinationLabel()}. ${appliedPrivacy ? `Privacy settings adjusted to ${appliedPrivacy}.` : ''}`;
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
      moveError = error instanceof Error ? error.message : "Failed to move items.";
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

<MoveItemsModal
  isOpen={showMoveModal}
  targets={moveTargets}
  destinationLabel={getMoveDestinationLabel()}
  targetLabel={getMoveTargetLabel()}
  targetFolderId={moveTargetFolderId}
  visibleFolders={visibleMoveFolders}
  isProcessing={isMoveProcessing}
  error={moveError}
  notice={moveNotice}
  isInvalidDestination={isInvalidMoveDestination}
  isFolderExpanded={isMoveFolderExpanded}
  isFolderLoading={isMoveFolderLoading}
  getDestinationMeta={getMoveDestinationMeta}
  getDestinationDisabledReason={getMoveDestinationDisabledReason}
  getChildren={getMoveChildren}
  onSelectRoot={() => { moveTargetFolderId = null; }}
  onToggleFolder={toggleMoveFolder}
  onSelectFolder={(folder, disabled, reason) => { if (disabled) { moveError = reason || 'Invalid destination'; return; } moveTargetFolderId = folder.id; moveError = ''; }}
  onCancel={handleCancelMove}
  onMove={handleExecuteMove}
/>

  <BulkShareModal
    isOpen={showBulkShareModal}
    targets={bulkShareTargets}
    onClose={resetBulkShareState}
    onCompleted={async (message) => {
      bulkShareSuccess = message;
      showBulkShareModal = false;
      clearSelection();
      selectionMode = false;
      await refreshStorage();
      setTimeout(() => {
        bulkShareSuccess = '';
      }, 4000);
    }}
  />

  {#if false && showBulkShareModal}
    <div class="fixed inset-0 z-[10000] flex items-center justify-center p-4" role="dialog" aria-modal="true" transition:fade>
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={resetBulkShareState}></div>
      <div class="relative bg-[#1a1a1e] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" in:scale>
        <div class="flex items-center justify-between p-4 border-b border-white/10 bg-gradient-to-br from-violet-600/10 via-white/[0.03] to-transparent">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0 text-violet-300">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div class="min-w-0">
              <h3 class="text-lg font-semibold text-white truncate">Bulk Share</h3>
              <p class="text-xs text-gray-500">
                {bulkShareFolderCount} folder · {bulkShareDocumentCount} document
              </p>
            </div>
          </div>
          <button onclick={resetBulkShareState} class="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex-shrink-0" disabled={isBulkShareProcessing} aria-label="Close bulk share modal" title="Close">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="p-4 space-y-5 max-h-[70vh] overflow-y-auto">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Selected items & privacy</label>
            <div class="max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/5">
              {#each bulkShareTargets as target (target.id)}
                {@const targetPrivacy = getBulkShareTargetPrivacy(target.id)}
                {@const targetConfig = bulkSharePrivacyConfig[targetPrivacy]}
                <div class="px-3 py-3 space-y-3">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-sm shrink-0">{getBulkShareTargetIcon(target.type)}</div>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm text-white font-medium truncate">{target.name}</p>
                      <p class="text-[10px] text-gray-500 capitalize">{target.type}</p>
                    </div>
                    <span class="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold {targetConfig.color}">
                      <span class="w-4 h-4 flex items-center justify-center">{@html targetConfig.icon}</span>
                      {targetConfig.label}
                    </span>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {#each Object.entries(bulkSharePrivacyConfig) as [level, config] (level)}
                      <button onclick={() => setBulkShareTargetPrivacy(target.id, level as PrivacyLevel)} class="px-3 py-2.5 rounded-xl border text-left transition-all {targetPrivacy === level ? 'bg-blue-500/10 border-blue-500/50 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}" disabled={isBulkShareProcessing}>
                        <div class="flex items-center gap-2">
                          <span class="w-6 h-6 rounded-lg flex items-center justify-center bg-gradient-to-br {config.gradient} {config.color}">{@html config.icon}</span>
                          <span class="text-[11px] font-bold truncate">{config.label}</span>
                        </div>
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Privacy summary</label>
            <div class="rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/5">
              {#each bulkShareTargets as target (target.id)}
                {@const targetPrivacy = getBulkShareTargetPrivacy(target.id)}
                {@const targetConfig = bulkSharePrivacyConfig[targetPrivacy]}
                <div class="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span class="text-xs text-gray-300 truncate">{target.name}</span>
                  <span class="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold {targetConfig.color}">
                    <span class="w-4 h-4 flex items-center justify-center">{@html targetConfig.icon}</span>
                    {targetConfig.label}
                  </span>
                </div>
              {/each}
            </div>
          </div>

          {#if bulkShareIsMixed}
            <div class="flex gap-3 rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-xs text-blue-200">
              <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span>Mixed selection: privacy applies to folders and documents. Role only applies to folders; documents only receive selected users.</span>
            </div>
          {/if}

          {#if bulkShareHasSpecificUserItems}
            <div class="space-y-4 pt-2 border-t border-white/10">
              <div class="relative">
                <div class="absolute inset-0 bg-gradient-to-r from-violet-500/20 via-purple-500/10 to-transparent blur-xl opacity-50"></div>
                <div class="relative flex items-center justify-between py-3 border-b border-white/10">
                  <div class="flex items-center gap-2.5">
                    <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 text-violet-300 ring-1 ring-violet-500/30">
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                    </div>
                    <div>
                      <h4 class="text-sm font-semibold text-white">People with access</h4>
                      <p class="text-[10px] text-gray-500">Choose users for selected items</p>
                    </div>
                  </div>
                  {#if bulkShareSelectedUsers.length > 0}
                    <span class="inline-flex items-center px-2.5 py-1 rounded-full bg-gradient-to-r from-violet-500/20 to-purple-500/20 border border-violet-500/30 text-xs font-medium text-violet-200">
                      {bulkShareSelectedUsers.length}
                      <span class="ml-1 text-gray-400">{bulkShareSelectedUsers.length === 1 ? 'user' : 'users'}</span>
                    </span>
                  {/if}
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.03] p-1 border border-white/10">
                <button onclick={() => bulkShareAccessMode = 'all'} class="px-3 py-2 rounded-lg text-xs font-semibold transition-all {bulkShareAccessMode === 'all' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}" disabled={isBulkShareProcessing}>Apply to all</button>
                <button onclick={() => bulkShareAccessMode = 'individual'} class="px-3 py-2 rounded-lg text-xs font-semibold transition-all {bulkShareAccessMode === 'individual' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}" disabled={isBulkShareProcessing}>Set per item</button>
              </div>

              {#if bulkShareAccessMode === 'individual'}
                <div class="space-y-2">
                  <p class="text-xs font-medium text-gray-400">Choose item first:</p>
                  <div class="max-h-32 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/5">
                    {#each bulkShareSpecificTargets as target (target.id)}
                      <button onclick={() => bulkShareActiveTargetId = target.id} class="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors {bulkShareActiveTarget?.id === target.id ? 'bg-violet-500/10 text-violet-200' : 'text-gray-300'}" disabled={isBulkShareProcessing}>
                        <span class="flex items-center gap-2 min-w-0">
                          <span>{getBulkShareTargetIcon(target.type)}</span>
                          <span class="text-xs font-medium truncate">{target.name}</span>
                        </span>
                        <span class="text-[10px] text-gray-500">{getBulkShareTargetUsers(target.id).length} user</span>
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if bulkShareAccessMode === 'all' && bulkShareSelectedUsers.length > 0}
                <div>
                  <p class="text-xs font-medium text-gray-400 mb-2">Will share with all Specific Users items:</p>
                  <div class="space-y-2">
                    {#each bulkShareSelectedUsers as user (user.id)}
                      <div class="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5">
                        <div class="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden">
                          {#if user.avatarUrl}<img src={user.avatarUrl} alt={user.username} class="w-full h-full rounded-full object-cover" />{:else}{getBulkShareUserInitial(user.username)}{/if}
                        </div>
                        <div class="min-w-0 flex-1">
                          <p class="text-sm font-semibold text-white truncate">{user.username}</p>
                          <p class="text-[10px] text-gray-500 font-mono truncate">{user.walletAddress}</p>
                        </div>
                        {#if bulkShareHasFolders}
                          <div class="relative inline-flex items-center flex-shrink-0">
                            <select value={getBulkShareUserRole(user.id)} onchange={(event) => setBulkShareUserRole(user.id, event.currentTarget.value as 'VIEWER' | 'EDITOR')} class="appearance-none h-8 pl-3 pr-7 rounded-full text-[10px] font-semibold bg-white/5 border border-white/10 text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 cursor-pointer hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed" disabled={isBulkShareProcessing} title="Folder access role">
                              <option value="VIEWER" class="bg-[#1a1a1e] text-gray-300">Viewer</option>
                              <option value="EDITOR" class="bg-[#1a1a1e] text-violet-300">Editor</option>
                            </select>
                            <svg class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none w-2.5 h-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
                          </div>
                        {/if}
                        <button onclick={() => toggleBulkShareUser(user)} class="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all" aria-label="Remove {user.username}">
                          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if bulkShareAccessMode === 'individual' && bulkShareActiveTarget}
                <div>
                  <p class="text-xs font-medium text-gray-400 mb-2">Users for {bulkShareActiveTarget.name}:</p>
                  {#if getBulkShareTargetUsers(bulkShareActiveTarget.id).length > 0}
                    <div class="space-y-2 mb-3">
                      {#each getBulkShareTargetUsers(bulkShareActiveTarget.id) as user (user.id)}
                        <div class="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5">
                          <div class="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden">
                            {#if user.avatarUrl}<img src={user.avatarUrl} alt={user.username} class="w-full h-full rounded-full object-cover" />{:else}{getBulkShareUserInitial(user.username)}{/if}
                          </div>
                          <div class="min-w-0 flex-1">
                            <p class="text-sm font-semibold text-white truncate">{user.username}</p>
                            <p class="text-[10px] text-gray-500 font-mono truncate">{user.walletAddress}</p>
                          </div>
                          {#if bulkShareActiveTarget.type === 'folder'}
                            <div class="relative inline-flex items-center flex-shrink-0">
                              <select value={getBulkShareTargetUserRole(bulkShareActiveTarget.id, user.id)} onchange={(event) => setBulkShareTargetUserRole(bulkShareActiveTarget.id, user.id, event.currentTarget.value as 'VIEWER' | 'EDITOR')} class="appearance-none h-8 pl-3 pr-7 rounded-full text-[10px] font-semibold bg-white/5 border border-white/10 text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 cursor-pointer hover:bg-white/10 hover:text-white transition-all" disabled={isBulkShareProcessing}>
                                <option value="VIEWER" class="bg-[#1a1a1e] text-gray-300">Viewer</option>
                                <option value="EDITOR" class="bg-[#1a1a1e] text-violet-300">Editor</option>
                              </select>
                              <svg class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none w-2.5 h-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
                            </div>
                          {/if}
                          <button onclick={() => toggleBulkShareTargetUser(bulkShareActiveTarget.id, user)} class="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all" aria-label="Remove {user.username}">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                          </button>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="text-xs text-gray-500 mb-3">No users selected for this item.</p>
                  {/if}
                </div>
              {/if}

              <div class="relative">
                <input bind:value={bulkShareSearchQuery} oninput={handleBulkShareSearchInput} class="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all" placeholder={bulkShareAccessMode === 'individual' && bulkShareActiveTarget ? `Search users for ${bulkShareActiveTarget.name}...` : 'Search users by username or wallet...'} disabled={isBulkShareProcessing || (bulkShareAccessMode === 'individual' && !bulkShareActiveTarget)} autocomplete="off" />
                {#if isBulkShareSearching}
                  <div class="absolute right-3 top-1/2 -translate-y-1/2"><div class="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div></div>
                {/if}
              </div>

              {#if bulkShareSearchResults.length > 0}
                <div class="border border-white/10 rounded-lg max-h-44 overflow-y-auto bg-black/10">
                  {#each bulkShareSearchResults as user (user.id)}
                    <button onclick={() => bulkShareAccessMode === 'individual' && bulkShareActiveTarget ? toggleBulkShareTargetUser(bulkShareActiveTarget.id, user) : toggleBulkShareUser(user)} class="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left">
                      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-xs font-medium text-white flex-shrink-0 overflow-hidden">
                        {#if user.avatarUrl}<img src={user.avatarUrl} alt={user.username} class="w-full h-full rounded-full object-cover" />{:else}{getBulkShareUserInitial(user.username)}{/if}
                      </div>
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium text-white truncate">{user.username}</p>
                        <p class="text-xs text-gray-500 truncate">{user.walletAddress}</p>
                      </div>
                      <svg class="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    </button>
                  {/each}
                </div>
              {:else if bulkShareSearchQuery.trim().length >= 2 && !isBulkShareSearching}
                <p class="text-sm text-gray-500 text-center py-2">No users found</p>
              {/if}

              {#if bulkShareHasFolders && bulkShareSelectedUsers.length > 0}
                <div class="rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 text-xs text-violet-200">
                  Set Viewer/Editor per user above. Role applies only to folders{bulkShareHasDocuments ? '; documents only receive user access.' : '.'}
                </div>
              {/if}
            </div>
          {:else}
            <div class="flex gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-200">
              <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span>User selection is not required. Backend will clean specific-user access when privacy is not Specific Users.</span>
            </div>
          {/if}

          {#if bulkShareError}
            <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-start gap-2" role="alert">
              <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span>{bulkShareError}</span>
            </div>
          {/if}
        </div>

        <div class="flex items-center justify-between p-4 border-t border-white/10 bg-[#151518]">
          <div class="text-[10px] text-gray-500">
            {bulkShareTargets.length} selected item{bulkShareTargets.length === 1 ? '' : 's'}
          </div>
          <div class="flex items-center gap-3">
            <button onclick={resetBulkShareState} disabled={isBulkShareProcessing} class="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50">Cancel</button>
            <button onclick={handleExecuteBulkShare} disabled={isBulkShareProcessing || getBulkShareSpecificTargetsWithoutUsers().length > 0} class="px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-lg transition-all duration-200 flex items-center gap-2 shadow-lg shadow-blue-500/20 disabled:shadow-none">
              {#if isBulkShareProcessing}<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Saving...{:else}<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>Save Changes{/if}
            </button>
          </div>
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

  <!-- ═══════════════════════════════════════════════════ -->
  <!-- CONTENT -->
  <!-- ═══════════════════════════════════════════════════ -->
  {#if errorMessage}
    <div class="min-h-[420px] flex flex-col items-center justify-center rounded-[32px] border border-red-500/20 bg-red-500/10 text-center px-6">
      <p class="text-red-400 font-semibold mb-2">{errorMessage}</p>
      <button onclick={() => goto('?', { noScroll: true })} class="text-sm text-blue-400 hover:underline">Go back to My Storage</button>
    </div>
  {:else if isLoading || isRefreshingStorage}
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
              currentUserId={currentUser?.id}
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
              currentUserId={currentUser?.id}
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
            currentUserId={currentUser?.id}
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
            currentUserId={currentUser?.id}
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
    {#if bulkActionError}
      <div class="fixed bottom-24 left-1/2 z-[1100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-red-500/20 bg-[#1a1a1e] px-4 py-3 text-sm text-red-200 shadow-2xl shadow-black/40" role="alert" transition:fade>
        <div class="flex items-start gap-3">
          <svg class="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="flex-1">{bulkActionError}</p>
          <button onclick={() => { bulkActionError = ''; }} class="rounded-lg p-1 text-red-300 transition hover:bg-red-500/10 hover:text-red-100" aria-label="Dismiss bulk action error">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    {/if}

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