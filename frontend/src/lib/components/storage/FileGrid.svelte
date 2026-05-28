<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ItemMenu from './ItemMenu.svelte';
  import type { Folder, Document } from '$lib/types/storage';
  import ProfilePreviewModal from '$lib/components/storage/ProfilePreviewModal.svelte';
  import FilePreviewModal from '$lib/components/storage/FilePreviewModal.svelte';
  import EditDocumentModal from '$lib/components/storage/EditDocumentModal.svelte';
  import { storageService } from '$lib/services/storage/storage';
  
  // ─────────────────────────────────────────────────────────────
  // ✅ PROPS (dengan onRefresh untuk konsistensi)
  // ─────────────────────────────────────────────────────────────
  let { 
    folders, 
    items, 
    viewMode = 2, 
    openFolder, 
    handleDeleteFolder, 
    handleDelete, 
    getFileTheme,
    onRename,
    onDeleteConfirm,
    onShare,
    onDownload,
    onMove,
    onRestore,
    trashMode = false,
    selectedItems = [],
    onToggleSelect,
    selectionMode = false,
    currentUserId,
    onRefresh
  }: {
    folders: Folder[];
    items: Document[];
    viewMode?: number;
    openFolder: (folder: { id: string } | null) => void;
    handleDeleteFolder: (id: string) => void;
    handleDelete: (id: string) => void;
    getFileTheme: (mimeType: string) => { color: string };
    onRename?: (id: string, name: string) => void;
    onDeleteConfirm?: (id: string, type: 'folder' | 'document', name: string) => void;
    onShare?: (id: string, type: 'folder' | 'document') => void;
    onDownload?: (id: string, type: 'folder' | 'document') => void | Promise<void>;
    onMove?: (id: string, type: 'folder' | 'document') => void | Promise<void>;
    onRestore?: (id: string, type: 'folder' | 'document', name: string) => void | Promise<void>;
    trashMode?: boolean;
    selectedItems?: string[];
    onToggleSelect?: (id: string) => void;
    selectionMode?: boolean;
    currentUserId?: string;
    onRefresh?: () => Promise<void>;
  } = $props();

  // 🔥 DEBUG PROPS - Tempel di sini
$effect(() => {
  if (import.meta.env.DEV) {
    console.log('🔍 [FileGrid] Props received:', {
      folders_undefined: folders === undefined,
      folders_length: folders?.length,
      folders_first: folders?.[0] ? { id: folders[0].id, name: folders[0].name } : 'N/A',
      viewMode_value: viewMode,
      should_show_folders: viewMode === 2
    });
  }
});
  // ─────────────────────────────────────────────────────────────
  // ✅ STATE MODALS & EDIT (dari FileTable)
  // ─────────────────────────────────────────────────────────────
  
  // Profile Modal
  let showProfileModal = $state(false);
  let selectedProfile = $state<{
    id: string;
    username?: string | null;
    email?: string | null;
    walletAddress: string;
    avatarUrl?: string | null;
    bio?: string | null;
    website?: string | null;
    joinedAt?: string | Date;
  } | null>(null);

  // File Preview Modal
  let showFilePreview = $state(false);
  let selectedFile = $state<{
    id: string;
    title: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    ipfsHash?: string;
    fileUrl?: string;
    downloadUrl: string;
    requiresAuth?: boolean;
    privacy: 'PRIVATE' | 'PUBLIC' | 'LINK_ONLY' | 'SPECIFIC_USER';
    description?: string | null;
  } | null>(null);

  // Edit Document Modal (KRITIS)
  let showEditModal = $state(false);
  let editingDoc = $state<{ id: string; title: string; description: string | null } | null>(null);
  let editTitle = $state('');
  let editDescription = $state('');
  let isEditProcessing = $state(false);
  let editErrorMessage = $state('');

  let previewUrls = $state<Record<string, string>>({});
  let previewLoading = $state<Record<string, boolean>>({});
  let previewErrors = $state<Record<string, string>>({});
  let now = $state(Date.now());
  let countdownTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    countdownTimer = setInterval(() => {
      now = Date.now();
    }, 60_000);
  });

  onDestroy(() => {
    if (countdownTimer) clearInterval(countdownTimer);
  });

  // Mobile detection (dari kode Anda)
  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : false;

  // ─────────────────────────────────────────────────────────────
  // ✅ HELPER FUNCTIONS (dari FileTable)
  // ─────────────────────────────────────────────────────────────

  function getAccessRoleBadge(role?: 'VIEWER' | 'EDITOR' | 'ADMIN') {
    if (role === 'EDITOR') return { label: 'Editor', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' };
    if (role === 'VIEWER') return { label: 'Viewer', className: 'bg-blue-500/10 text-blue-300 border-blue-500/20' };
    if (role === 'ADMIN') return { label: 'Admin', className: 'bg-purple-500/10 text-purple-300 border-purple-500/20' };
    return null;
  }

  function formatOwnerName(
    owner: { username?: string | null; email?: string | null; walletAddress: string } | null | undefined,
    currentUserId?: string,
    ownerId?: string
  ): string {
    const isCurrentUser = currentUserId && ownerId && currentUserId === ownerId;
    const suffix = isCurrentUser ? ' (Saya)' : '';
    if (!owner) {
      if (ownerId) return `${ownerId.slice(0, 8)}...${suffix}`;
      return `Unknown${suffix}`;
    }
    if (owner.username) return `${owner.username}${suffix}`;
    if (owner.email) return `${owner.email}${suffix}`;
    return `${owner.walletAddress.slice(0, 6)}...${owner.walletAddress.slice(-4)}${suffix}`;
  }

  function getOwnerAvatar(owner: {
    username?: string | null;
    avatarUrl?: string | null;
    walletAddress: string;
  } | null | undefined): { type: 'image' | 'initial'; value: string } {
    if (!owner) return { type: 'initial', value: '?' };
    if (owner.avatarUrl) return { type: 'image', value: owner.avatarUrl };
    const initial = (owner.username?.trim()?.[0] || owner.email?.trim()?.[0] || owner.walletAddress[0] || '?').toUpperCase();
    return { type: 'initial', value: initial };
  }

  function formatFileSize(bytes: number | null | undefined): string {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function getPendingRemainingMs(item: Document): number {
    if (!item.pendingOnChainUntil || item.isOnChain) return 0;
    return new Date(item.pendingOnChainUntil).getTime() - now;
  }

  function isPendingOnChain(item: Document): boolean {
    return getPendingRemainingMs(item) > 0;
  }

  function isPendingExpired(item: Document): boolean {
    return Boolean(item.pendingOnChainUntil && !item.isOnChain && getPendingRemainingMs(item) <= 0);
  }

  function formatPendingCountdown(item: Document): string {
    const remaining = getPendingRemainingMs(item);
    if (remaining <= 0) return 'Expired';
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }

  function formatTrashRetentionCountdown(deletedAt: string | null | undefined): string {
    if (!deletedAt) return 'Auto-delete in 60d';
    const expiresAt = new Date(deletedAt);
    expiresAt.setDate(expiresAt.getDate() + 60);
    const remaining = expiresAt.getTime() - now;
    if (remaining <= 0) return 'Auto-delete pending';
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `Auto-delete in ${days}d ${hours}h`;
    const minutes = Math.max(1, Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60)));
    return `Auto-delete in ${hours}h ${minutes}m`;
  }

 // ─────────────────────────────────────────────────────────────
// ✅ STATE UNTUK IMAGE PREVIEW (menggunakan storageService)
// ─────────────────────────────────────────────────────────────
function isImageMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  const supported = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  return supported.includes(mimeType.toLowerCase());
}

function isVideoMimeType(mimeType: string | null | undefined): boolean {
  return mimeType?.toLowerCase().startsWith('video/') ?? false;
}

function isAudioMimeType(mimeType: string | null | undefined): boolean {
  return mimeType?.toLowerCase().startsWith('audio/') ?? false;
}

function isBlobPreviewMimeType(mimeType: string | null | undefined, fileName: string | null | undefined): boolean {
  if (isImageMimeType(mimeType) || isVideoMimeType(mimeType)) return true;
  const normalized = mimeType?.toLowerCase() || '';
  const extension = getFileExtension(fileName).toLowerCase();
  return normalized.includes('pdf') || normalized.startsWith('text/') || normalized.includes('json') || ['txt', 'csv', 'json', 'md', 'pdf'].includes(extension);
}

function isDocumentPreviewMimeType(mimeType: string | null | undefined, fileName: string | null | undefined): boolean {
  return isBlobPreviewMimeType(mimeType, fileName) && !isImageMimeType(mimeType) && !isVideoMimeType(mimeType);
}

function getFileExtension(fileName: string | null | undefined): string {
  const extension = fileName?.split('.').pop()?.trim();
  return extension ? extension.toUpperCase().slice(0, 6) : 'FILE';
}

function getFilePreviewMeta(item: Document) {
  const mimeType = item.mimeType?.toLowerCase() || '';
  const extension = getFileExtension(item.fileName || item.title);

  if (mimeType.includes('pdf')) {
    return { label: 'PDF', icon: 'pdf', gradient: 'from-red-500/25 via-rose-500/10 to-orange-500/20', text: 'text-red-200', badge: 'bg-red-500/20 text-red-200 border-red-400/30' };
  }
  if (mimeType.startsWith('video/')) {
    return { label: extension === 'FILE' ? 'VIDEO' : extension, icon: 'video', gradient: 'from-purple-500/25 via-fuchsia-500/10 to-pink-500/20', text: 'text-purple-200', badge: 'bg-purple-500/20 text-purple-200 border-purple-400/30' };
  }
  if (mimeType.startsWith('audio/')) {
    return { label: extension === 'FILE' ? 'AUDIO' : extension, icon: 'audio', gradient: 'from-emerald-500/25 via-teal-500/10 to-cyan-500/20', text: 'text-emerald-200', badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' };
  }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || ['XLS', 'XLSX', 'CSV'].includes(extension)) {
    return { label: extension === 'FILE' ? 'SHEET' : extension, icon: 'sheet', gradient: 'from-green-500/25 via-lime-500/10 to-emerald-500/20', text: 'text-green-200', badge: 'bg-green-500/20 text-green-200 border-green-400/30' };
  }
  if (mimeType.includes('word') || mimeType.includes('document') || ['DOC', 'DOCX', 'TXT', 'RTF'].includes(extension)) {
    return { label: extension === 'FILE' ? 'DOC' : extension, icon: 'doc', gradient: 'from-blue-500/25 via-sky-500/10 to-cyan-500/20', text: 'text-blue-200', badge: 'bg-blue-500/20 text-blue-200 border-blue-400/30' };
  }
  if (mimeType.includes('presentation') || ['PPT', 'PPTX'].includes(extension)) {
    return { label: extension === 'FILE' ? 'SLIDE' : extension, icon: 'slide', gradient: 'from-orange-500/25 via-amber-500/10 to-yellow-500/20', text: 'text-orange-200', badge: 'bg-orange-500/20 text-orange-200 border-orange-400/30' };
  }
  if (mimeType.includes('zip') || mimeType.includes('compressed') || ['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(extension)) {
    return { label: extension === 'FILE' ? 'ZIP' : extension, icon: 'archive', gradient: 'from-yellow-500/25 via-stone-500/10 to-zinc-500/20', text: 'text-yellow-200', badge: 'bg-yellow-500/20 text-yellow-200 border-yellow-400/30' };
  }

  return { label: extension, icon: 'file', gradient: 'from-slate-500/25 via-gray-500/10 to-zinc-500/20', text: 'text-slate-200', badge: 'bg-slate-500/20 text-slate-200 border-slate-400/30' };
}

async function loadPreviewForItem(item: Document) {
  if (!item?.id || !isBlobPreviewMimeType(item.mimeType, item.fileName || item.title)) return;

  const id = item.id;

  // Skip jika sudah handled
  if (previewUrls[id] || previewLoading[id] || previewErrors[id]) {
    return;
  }

  // Timeout safeguard
  const timeoutId = setTimeout(() => {
    if (previewLoading[id]) {
      previewErrors[id] = 'Loading timeout';
      delete previewLoading[id];
    }
  }, 8000);

  try {
    // ✅ Direct property assignment - reliably reactive in Svelte 5
    previewLoading[id] = true;

    const blob = await storageService.fetchDocumentPreviewBlob(id);
    const blobUrl = URL.createObjectURL(blob);

    // ✅ Update state - this WILL trigger re-render now!
    previewUrls[id] = blobUrl;

  } catch (err) {
    console.warn('⚠️ Failed to load preview for:', id, err);
    previewErrors[id] = err instanceof Error ? err.message : 'Failed to load';

  } finally {
    clearTimeout(timeoutId);
    // ✅ Always clear loading state
    delete previewLoading[id];
  }
}
// ✅ Helper: Get preview URL for template (now uses object property access)
function getPreviewUrl(item: Document): string | undefined {
  return previewUrls[item.id];
}

function isPreviewLoading(itemId: string): boolean {
  return !!previewLoading[itemId];
}

function getPreviewError(itemId: string): string | undefined {
  return previewErrors[itemId];
}

function closeFilePreview() {
  showFilePreview = false;
  selectedFile = null;
}

// ✅ Cleanup blob URLs saat component unmount
onMount(() => {
  return () => {
    // Revoke semua blob URLs
    Object.values(previewUrls).forEach(blobUrl => {
      try { URL.revokeObjectURL(blobUrl); } catch (e) {}
    });
    // Clear state
    previewUrls = {};
    previewLoading = {};
    previewErrors = {};
    
    storageService.cleanupPreviewCache?.();
  };
});

// ✅ Cleanup preview saat items berubah
$effect(() => {
  const currentIds = new Set(items.map(i => i.id));
  
  // Cleanup untuk item yang sudah tidak ada
  Object.keys(previewUrls).forEach(id => {
    if (!currentIds.has(id)) {
      const url = previewUrls[id];
      if (url) {
        try { URL.revokeObjectURL(url); } catch {}
      }
      delete previewUrls[id];
      delete previewErrors[id];
      delete previewLoading[id];
      
      storageService.cleanupPreviewCache?.(id);
    }
  });
});

// ✅ Effect: Auto-load preview untuk image items
$effect(() => {
  if (!items?.length) return;
  
  for (const item of items) {
    if (!isBlobPreviewMimeType(item.mimeType, item.fileName || item.title)) continue;
    
    const id = item.id;
    
    // Skip jika sudah handled
    if (previewUrls[id] || previewLoading[id] || previewErrors[id]) {
      continue;
    }
    
    // Trigger load (fire-and-forget)
    loadPreviewForItem(item);
  }
});

// ✅✅✅ OPEN FILE PREVIEW - UI LOGIC (TETAP DI COMPONENT!)
function openFilePreview(item: Document) {
  if (selectionMode) return; // Jangan preview jika dalam selection mode
  
  const isPrivate = item.privacy === 'PRIVATE' || item.privacy === 'SPECIFIC_USER';
  
  selectedFile = {
    id: item.id,
    title: item.title,
    fileName: item.fileName,
    mimeType: item.mimeType,
    fileSize: item.fileSize,
    ipfsHash: item.ipfsHash,
    fileUrl: `/api/documents/${item.id}/preview`,
    downloadUrl: `/api/documents/${item.id}/download`,
    requiresAuth: isPrivate,
    privacy: item.privacy ?? 'PRIVATE',
    description: item.description ?? null
  };
  
  if (import.meta.env.DEV) {
    console.log('📦 File preview:', { id: item.id, title: item.title });
  }
  showFilePreview = true;
}

  // ✅ Open profile modal (dari FileTable)
  function openProfileModal(
    owner: {
      id?: string;
      username?: string | null;
      email?: string | null;
      walletAddress: string;
      avatarUrl?: string | null;
      bio?: string | null;
      website?: string | null;
      joinedAt?: string | Date;
    } | null, 
    ownerId?: string
  ) {
    if (!owner && !ownerId) return;
    selectedProfile = owner ? {
      id: owner.id || ownerId!,
      username: owner.username,
      email: owner.email,
      walletAddress: owner.walletAddress,
      avatarUrl: owner.avatarUrl,
      bio: owner.bio,
      website: owner.website,
      joinedAt: owner.joinedAt
    } : {
      id: ownerId!,
      walletAddress: ownerId!
    };
    showProfileModal = true;
  }

  function closeProfileModal() {
    showProfileModal = false;
    selectedProfile = null;
  }

  // ✅✅✅ OPEN EDIT MODAL (SAMA PERSIS FILETABLE - DIRECT ASSIGNMENT)
  function openEditModal(item: { id: string; title: string; description?: string | null }) {
    if (import.meta.env.DEV) {
      console.log('✏️ Grid openEditModal:', { id: item.id, title: item.title });
    }
    // ✅ DIRECT ASSIGNMENT - trigger reaktivitas Svelte 5
    editingDoc = { id: item.id, title: item.title, description: item.description ?? null };
    editTitle = item.title;
    editDescription = item.description ?? '';
    showEditModal = true;  // ✅ Ini yang trigger modal muncul
  }

  // ✅✅✅ SUBMIT EDIT (SAMA PERSIS FILETABLE)
  async function submitEdit() {
    if (!editingDoc || !editTitle.trim()) return;
    
    const titleChanged = editTitle.trim() !== editingDoc.title;
    const descChanged = (editDescription.trim() || null) !== (editingDoc.description?.trim() || null);
    
    if (!titleChanged && !descChanged) {
      showEditModal = false;
      return;
    }
    
    try {
      isEditProcessing = true;
      editErrorMessage = '';  // ✅ Clear error sebelum submit
      
      const updates: { title?: string; description?: string | null } = {};
      if (titleChanged) updates.title = editTitle.trim();
      if (descChanged) updates.description = editDescription.trim() || null;
      
      const result = await storageService.updateDocumentMetadata(editingDoc.id, updates);
      
      // Handle error response dari backend
      if (result && typeof result === 'object' && 'success' in result && result.success === false) {
        throw new Error((result as any).message || 'Failed to update document');
      }
      
      await onRefresh?.();
      
      // ✅ RESET STATE DULU, baru close modal (PATTERN FILETABLE):
      editingDoc = null;
      editTitle = '';
      editDescription = '';
      editErrorMessage = '';
      showEditModal = false;  // ✅ Baru close modal
      
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('❌ Update failed:', error);
      
      // ✅ SET editErrorMessage agar muncul di modal!
      editErrorMessage = 
        error?.response?.message ||
        error?.message ||
        error?.error ||
        'Failed to update document';
      
      // ❌ JANGAN reset state atau close modal jika error!
      
    } finally {
      isEditProcessing = false;
    }
  }

  // ✅ Cancel edit (dari FileTable)
  function cancelEdit() {
    showEditModal = false;
    editingDoc = null;
  }

  // ─────────────────────────────────────────────────────────────
  // ✅ DEBUG EFFECTS (DEV ONLY)
  // ─────────────────────────────────────────────────────────────
  $effect(() => {
    if (import.meta.env.DEV) {
      console.log('🔍 FileGrid State:', {
        foldersCount: folders?.length,
        itemsCount: items?.length,
        viewMode,
        selectionMode,
        selectedItemsCount: selectedItems?.length,
        showEditModal
      });
    }
  });

  $effect(() => {
    if (import.meta.env.DEV && items?.length > 0) {
      console.log('📦 Items sample:', items.slice(0, 2).map(item => ({
        id: item.id,
        title: item.title,
        hasDescription: !!item.description,
        blockchainTx: (item as any).blockchainTx
      })));
    }
  });

  // ✅ Debug: Monitor state changes
$effect(() => {
  if (import.meta.env.DEV) {
    console.log('📊 Preview State Changed:', {
      urls: previewUrls,
      loading: previewLoading,
      errors: previewErrors,
      itemsCount: items?.length
    });
  }
});
</script>

<!-- ✅ GRID CONTAINER dengan visual design Anda -->
<div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-6">
  
  <!-- ✅ FOLDERS (hanya jika viewMode === 2) -->
{#if viewMode === 2}
  {#each folders as folder (folder.id)}
    <div 
      class="group relative bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/10 rounded-[10px] p-6 
             hover:from-white/[0.06] hover:to-white/[0.02] hover:border-white/20 hover:shadow-xl hover:shadow-blue-500/5 
             transition-all duration-300 flex flex-col items-center text-center cursor-pointer overflow-visible select-none
             min-h-[200px] h-full
             {selectionMode && selectedItems.includes(folder.id) 
               ? 'ring-2 ring-blue-500/70 bg-blue-500/10 border-blue-500/30 shadow-lg shadow-blue-500/10' 
               : ''}"
      onclick={(e) => {
        // ... (event handler tetap sama)
        if (selectionMode) {
          e.preventDefault(); e.stopPropagation();
          const el = e.currentTarget as HTMLElement;
          el.style.transform = 'scale(0.98)';
          setTimeout(() => { el.style.transform = ''; }, 100);
          onToggleSelect?.(folder.id);
          return;
        }
        if ((e.target as HTMLElement).closest('[data-checkbox]')) { e.stopPropagation(); return; }
        if ((e.target as HTMLElement).closest('[data-item-menu]')) { e.stopPropagation(); return; }
        openFolder(folder);
      }}
    >
      <!-- ✨ Checkbox (tetap sama) -->
      {#if selectionMode}
        <div class="absolute top-3 left-3 z-40">
          <label class="relative flex items-center justify-center cursor-pointer">
            <input type="checkbox" data-checkbox checked={selectedItems.includes(folder.id)}
              onchange={(e) => { e.stopPropagation(); onToggleSelect?.(folder.id); }}
              onclick={(e) => e.stopPropagation()} class="peer sr-only" />
            <div class="w-6 h-6 rounded-full border-2 transition-all duration-300 flex items-center justify-center backdrop-blur-md
                      {selectedItems.includes(folder.id) ? 'bg-blue-500 border-blue-500 shadow-lg shadow-blue-500/40' : 'bg-white/10 border-white/30 hover:border-white/50'}">
              {#if selectedItems.includes(folder.id)}
                <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                </svg>
              {/if}
            </div>
          </label>
        </div>
      {/if}

      <!-- 📁 Folder Icon Container - CENTERED VERTICALLY -->
      <div class="relative w-full flex-1 flex items-center justify-center mb-2">
        <div class="relative w-20 h-20 flex items-center justify-center">
          
          <div class="absolute inset-0 rounded-[28px] blur-2xl opacity-0 group-hover:opacity-100 transition-all duration-500 bg-gradient-to-br from-amber-400/40 via-orange-400/30 to-amber-600/40"></div>
          
          {#if selectionMode && selectedItems.includes(folder.id)}
            <div class="absolute inset-0 rounded-[28px] blur-xl bg-gradient-to-br from-blue-500/40 to-cyan-400/40 animate-pulse"></div>
          {/if}

          <div class="relative w-20 h-20 rounded-[28px] bg-gradient-to-br from-white/10 via-white/5 to-white/[0.02] backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.1)_inset] group-hover:scale-105 group-hover:border-amber-400/40 transition-all duration-300 overflow-visible" onclick={(e) => e.stopPropagation()} title="Buka folder">

            <svg class="w-12 h-12 drop-shadow-lg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="folderGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#f59e0b" /><stop offset="50%" stop-color="#f97316" /><stop offset="100%" stop-color="#ea580c" />
                </linearGradient>
                <linearGradient id="folderGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="white" stop-opacity="0.4" /><stop offset="50%" stop-color="white" stop-opacity="0.1" /><stop offset="100%" stop-color="white" stop-opacity="0" />
                </linearGradient>
                <filter id="folderGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="blur" /><feFlood flood-color="#f59e0b" flood-opacity="0.3" result="glowColor" /><feComposite in="glowColor" in2="blur" operator="in" result="softGlow" /><feMerge><feMergeNode in="softGlow" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <path d="M15 30 C15 25, 20 20, 25 20 L40 20 L48 28 L85 28 C90 28, 95 33, 95 38 L95 80 C95 85, 90 90, 85 90 L15 90 C10 90, 5 85, 5 80 L5 30 Z" fill="url(#folderGrad1)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" filter="url(#folderGlow)" />
              <path d="M25 20 L40 20 L48 28 L38 28 C33 28, 28 25, 25 20 Z" fill="url(#folderGrad1)" stroke="rgba(255,255,255,0.4)" stroke-width="1" />
              <path d="M15 30 C15 25, 20 20, 25 20 L40 20 L48 28 L85 28 C90 28, 95 33, 95 38 L95 80 C95 85, 90 90, 85 90 L15 90 C10 90, 5 85, 5 80 L5 30 Z" fill="url(#folderGrad2)" class="opacity-60" />
              <path d="M18 32 C18 28, 22 24, 26 24 L39 24 L46 30 L83 30 C87 30, 91 34, 91 38 L91 78 C91 82, 87 86, 83 86 L18 86 C14 86, 10 82, 10 78 L10 32 Z" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.8" />
              <g class="opacity-70">
                <rect x="22" y="45" width="56" height="8" rx="2" fill="white" fill-opacity="0.15" />
                <rect x="26" y="56" width="48" height="8" rx="2" fill="white" fill-opacity="0.1" />
                <rect x="30" y="67" width="40" height="6" rx="1.5" fill="white" fill-opacity="0.08" />
              </g>
              <g class="opacity-80">
                <circle cx="78" cy="35" r="2" fill="white" fill-opacity="0.6" /><circle cx="82" cy="38" r="1" fill="white" fill-opacity="0.4" />
              </g>
            </svg>

            <div class="absolute inset-0 rounded-[28px] opacity-0 group-hover:opacity-100 bg-gradient-to-tr from-transparent via-white/10 to-transparent animate-shine pointer-events-none" style="background-size: 200% 100%; animation: shine 1.5s ease-in-out infinite;"></div>
          </div>
        </div>
      </div>

      <div class="w-full flex flex-col items-center gap-2 mt-auto">
        <div class="flex w-full items-center justify-center gap-2 min-w-0">
          <h4 class="text-xs font-semibold text-white/90 truncate uppercase tracking-wide group-hover:text-white transition-colors duration-200">
            {folder.name}
          </h4>
          {@const folderRoleBadge = getAccessRoleBadge(folder.accessRole)}
          {#if folderRoleBadge}
            <span class="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider {folderRoleBadge.className}">
              {folderRoleBadge.label}
            </span>
          {/if}
        </div>
        {#if trashMode}
          <span class="inline-flex max-w-full items-center justify-center text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap bg-red-500/10 text-red-300 border border-red-500/20" title="Item akan dihapus otomatis setelah 60 hari di Trash">
            {formatTrashRetentionCountdown(folder.deletedAt)}
          </span>
        {/if}
        {#if folder._count?.documents}
        {/if}
      </div>

      {#if !selectionMode}
        <div class="absolute top-2 right-2 z-30 {isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-all duration-200" data-item-menu onclick={(e) => e.stopPropagation()}>
          <ItemMenu itemId={folder.id} itemType="folder" itemName={folder.name} isOwner={true} onRename={onRename} onShare={onShare} onMove={onMove} onRestore={onRestore} trashMode={trashMode} onDelete={(id, type, name) => onDeleteConfirm?.(id, type, name)} onDownload={onDownload} />
        </div>
      {/if}
    </div>
  {/each}
{/if}

  <!-- ✅ DOCUMENTS (DESAIN ANDA + FUNGSI FILETABLE) -->
<!-- ✅ DOCUMENTS (dengan auto-load preview via {@const}) -->
<!-- ✅ DOCUMENT CARD - REDESIGNED LAYOUT -->
{#each items as item (item.id)}
  {@const theme = getFileTheme(item.mimeType)}
  {@const previewMeta = getFilePreviewMeta(item)}

  <div
    class="group relative bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/10 rounded-[10px] 
           hover:from-white/[0.06] hover:to-white/[0.02] hover:border-white/20 transition-all duration-300 
           flex flex-col cursor-pointer overflow-visible select-none
           {selectionMode && selectedItems.includes(item.id) 
             ? 'ring-2 ring-blue-500/70 bg-blue-500/10 border-blue-500/30' 
             : ''}"
    onclick={(e) => {
      if (selectionMode) {
        e.preventDefault(); e.stopPropagation();
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'scale(0.98)';
        setTimeout(() => { el.style.transform = ''; }, 100);
        onToggleSelect?.(item.id);
        return;
      }
      if ((e.target as HTMLElement).closest('[data-checkbox], [data-item-menu]')) {
        e.stopPropagation(); return;
      }
      e.stopPropagation();
      openFilePreview(item);
    }}
  >
    <!-- ✅ TOP BAR: Title (kiri) + ItemMenu (kanan) -->
    <div class="flex items-center justify-between pl-3">

      <!-- ✅ Checkbox (hanya selection mode) -->
      {#if selectionMode}
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <div class="absolute -top-1.5 -left-1.5 z-40 w-6 h-6">
            <input 
              type="checkbox" data-checkbox
              checked={selectedItems.includes(item.id)}
              onchange={(e) => { e.stopPropagation(); onToggleSelect?.(item.id); }}
              onclick={(e) => e.stopPropagation()}
              class="w-6 h-6 rounded-full border-2 border-white/50 bg-white/10
                     checked:bg-blue-600 checked:border-blue-600 cursor-pointer appearance-none opacity-0"
            />
            <span 
              class="absolute inset-0 flex items-center justify-center rounded-full border-2 pointer-events-none
                     {selectedItems.includes(item.id) 
                       ? 'bg-blue-600 border-blue-600' 
                       : 'bg-white/10 border-white/50'}
                     transition-all duration-200"
            >
              {#if selectedItems.includes(item.id)}
                <svg class="w-4 h-4 text-white drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                </svg>
              {/if}
            </span>
          </div>
          
          <!-- ✅ Title -->
          <div class="flex min-w-0 items-center gap-2 pt-4 pb-4">
            <h4 class="text-sm font-medium text-white/90 truncate group-hover:text-white transition-colors duration-200">
              {item.title}
            </h4>
            {@const selectedDocumentRoleBadge = getAccessRoleBadge(item.accessRole)}
            {#if selectedDocumentRoleBadge}
              <span class="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider {selectedDocumentRoleBadge.className}">
                {selectedDocumentRoleBadge.label}
              </span>
            {/if}
          </div>
        </div>
      {:else}
        <!-- ✅ Title (tanpa checkbox) -->
        <div class="flex min-w-0 items-center gap-2 pt-4 pb-4">
          <h4 class="text-sm font-medium text-white/90 truncate group-hover:text-white transition-colors duration-200">
            {item.title}
          </h4>
          {@const documentRoleBadge = getAccessRoleBadge(item.accessRole)}
          {#if documentRoleBadge}
            <span class="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider {documentRoleBadge.className}">
              {documentRoleBadge.label}
            </span>
          {/if}
        </div>
      {/if}

      <!-- ✅ ItemMenu (3-dot) - sejajar dengan title -->
      {#if !selectionMode}
        <div class="flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100 
                    {isMobile ? 'opacity-100' : ''} transition-all duration-200" 
             data-item-menu onclick={(e) => e.stopPropagation()}>
          <ItemMenu
            itemId={item.id}
            itemType="document"
            itemName={item.title}
            itemDescription={item.description}
            isOwner={true}
            onRename={onRename}
            onEdit={(id, title, description) => {
              if (import.meta.env.DEV) console.log('🎯 Grid ItemMenu onEdit:', { id, title });
              openEditModal({ id, title, description });
            }}
            onShare={onShare}
            onMove={onMove}
            onRestore={onRestore}
            trashMode={trashMode}
            onDelete={(id, type, name) => onDeleteConfirm?.(id, type, name)}
            onDownload={onDownload}
          />
        </div>
      {/if}
    </div>

    <!-- ✅ FULL FILE PREVIEW AREA -->
    <div class="pr-2 pl-2 pb-2">
      <div class="relative w-full max-h-35 aspect-square rounded-[8px] overflow-hidden bg-white/5 border border-white/10 group-hover:border-white/20 transition-all duration-300">
        {#if previewLoading[item.id]}
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/20">
            <div class="w-8 h-8 rounded-full border-3 border-white/20 border-t-blue-500 animate-spin"></div>
            <span class="text-[10px] text-gray-400">Loading preview...</span>
          </div>
        {:else if previewUrls[item.id] && isImageMimeType(item.mimeType)}
          {#key previewUrls[item.id]}
            <img src={previewUrls[item.id]} alt={item.title} class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onerror={() => { previewErrors[item.id] = 'Failed to render image'; delete previewUrls[item.id]; }} />
          {/key}
        {:else if previewUrls[item.id] && isVideoMimeType(item.mimeType)}
          <video src={previewUrls[item.id]} class="w-full h-full object-cover bg-black" preload="metadata" muted playsinline onerror={() => { previewErrors[item.id] = 'Failed to render video'; }}></video>
          <div class="absolute inset-0 z-10 flex items-center justify-center bg-black/10 pointer-events-none">
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 border border-white/20 backdrop-blur-sm shadow-lg shadow-black/40 group-hover:scale-110 transition-transform duration-300">
              <svg class="ml-1 h-6 w-6 text-white drop-shadow" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5.14v13.72c0 .76.84 1.22 1.48.81l10.78-6.86a.96.96 0 000-1.62L9.48 4.33A.96.96 0 008 5.14z" />
              </svg>
            </div>
          </div>
        {:else if previewUrls[item.id] && isDocumentPreviewMimeType(item.mimeType, item.fileName || item.title)}
          <iframe src={previewUrls[item.id]} title={item.title} class="w-full h-full bg-white border-0 pointer-events-none"></iframe>
        {:else if !isImageMimeType(item.mimeType)}
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br {previewMeta.gradient}">
            {#if isAudioMimeType(item.mimeType)}
              <div class="relative w-20 h-20 rounded-full bg-white/10 border border-white/20 shadow-xl backdrop-blur-sm flex items-center justify-center {previewMeta.text} group-hover:scale-105 transition-transform duration-300">
                <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M9 19V6l12-2v13"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-2a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              </div>
            {:else}
              <div class="absolute inset-x-4 top-4 h-16 rounded-2xl bg-white/5 border border-white/10"></div>
              <div class="absolute left-6 right-6 top-8 space-y-2 opacity-60">
                <div class="h-1.5 rounded-full bg-white/30"></div>
                <div class="h-1.5 w-4/5 rounded-full bg-white/20"></div>
                <div class="h-1.5 w-3/5 rounded-full bg-white/10"></div>
              </div>
              <div class="relative w-16 h-20 rounded-xl bg-white/10 border border-white/20 shadow-xl backdrop-blur-sm flex items-center justify-center {previewMeta.text} group-hover:scale-105 transition-transform duration-300">
                <div class="absolute top-0 right-0 w-5 h-5 bg-white/20 rounded-bl-xl"></div>
                {#if previewMeta.icon === 'archive'}
                  <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                {:else}
                  <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M9 13h6M9 17h4"/></svg>
                {/if}
              </div>
            {/if}
           
          </div>
        {:else}
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 {theme.color}">
            <svg class="w-12 h-12 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            {#if previewErrors[item.id]}<span class="text-[10px] text-gray-500">Preview unavailable</span>{/if}
          </div>
        {/if}
        <span class="absolute top-2 right-2 z-20 text-[8px] font-bold px-2 py-0.5 rounded-full border backdrop-blur-sm {isImageMimeType(item.mimeType) ? 'bg-black/60 text-white border-white/10' : previewMeta.badge}">
          {isImageMimeType(item.mimeType) ? 'IMG' : previewMeta.label}
        </span>
      </div>
    </div>

    {#if isPendingOnChain(item)}
      <div class="px-2 pb-2">
        <span class="inline-flex w-full items-center justify-center text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap bg-red-500/10 text-red-400 border border-red-500/20" title="File akan otomatis dihapus dari IPFS dan database jika tidak dikonfirmasi dalam 24 jam">
          Auto delete in: {formatPendingCountdown(item)}
        </span>
      </div>
    {:else if isPendingExpired(item)}
      <div class="px-2 pb-2">
        <span class="inline-flex w-full items-center justify-center text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap bg-red-500/10 text-red-400 border border-red-500/20" title="Batas konfirmasi 24 jam sudah habis. File akan dihapus otomatis.">
          Expired - cleanup
        </span>
      </div>
    {/if}

  </div>
{/each}
</div>

<!-- ✅ MODALS - WAJIB DI LUAR {#each} LOOP (DESAIN + FUNGSI FILETABLE) -->
<ProfilePreviewModal
  isOpen={showProfileModal}
  onClose={closeProfileModal}
  profile={selectedProfile}
  {currentUserId}
/>

<FilePreviewModal
  isOpen={showFilePreview}
  onClose={closeFilePreview}
  file={selectedFile}
/>

<!-- ✅ Edit Document Modal (LOGIKA FILETABLE) -->
<EditDocumentModal
  isOpen={showEditModal}
  onClose={cancelEdit}
  initialTitle={editTitle}
  initialDescription={editDescription}
  isProcessing={isEditProcessing}
  errorMessage={editErrorMessage}
  onConfirm={async (title, description) => {
    // ✅ Update local state dulu, baru panggil submitEdit
    editTitle = title;
    editDescription = description;
    await submitEdit();
  }}
/>