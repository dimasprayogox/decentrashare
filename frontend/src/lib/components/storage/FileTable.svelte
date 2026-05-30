<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ItemMenu from './ItemMenu.svelte';
  import type { Folder, Document } from '$lib/types/storage';
  import ProfilePreviewModal from '$lib/components/storage/ProfilePreviewModal.svelte';
  import FilePreviewModal from '$lib/components/storage/FilePreviewModal.svelte';
  import EditDocumentModal from '$lib/components/storage/EditDocumentModal.svelte';
  import { storageService } from '$lib/services/storage/storage';
  import { recordFileOnChain } from '$lib/services/web3/blockchain';
  
  let { 
    folders, 
    items, 
    viewMode, 
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
    onRefresh,
    publicExploreMode = false
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
    publicExploreMode?: boolean;
  } = $props();

  // ─────────────────────────────────────────────────────────────
  // ✅ STATE UNTUK MODALS & EDIT
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
    privacy?: 'PRIVATE' | 'PUBLIC' | 'LINK_ONLY' | 'SPECIFIC_USER';
    description?: string | null;
  } | null>(null);

  // Edit Document Modal
  let showEditModal = $state(false);
  let editingDoc = $state<{ id: string; title: string; description: string | null } | null>(null);
  let editTitle = $state('');
  let editDescription = $state('');
  let isEditProcessing = $state(false);
  let editErrorMessage = $state(''); 

  // TX Copy Feedback
  let copiedTxId = $state<string | null>(null);

  let confirmingTx = $state(new Set<string>());
  let txStatus = $state(new Map<string, { success: boolean; message: string }>());
  let duplicateFiles = $state(new Set<string>());
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

  // ─────────────────────────────────────────────────────────────
  // ✅ HELPER FUNCTIONS (LENGKAP!)
  // ─────────────────────────────────────────────────────────────

  // ✅ Format owner name display
  function formatOwnerName(
    owner: { username?: string | null; email?: string | null; walletAddress: string } | null | undefined,
    currentUserId?: string,
    ownerId?: string
  ): string {
    const isCurrentUser = currentUserId && ownerId && currentUserId === ownerId;
    if (isCurrentUser) return 'Me';

    if (!owner) {
      if (ownerId) return `${ownerId.slice(0, 8)}...`;
      return 'Unknown';
    }

    if (owner.username) return owner.username;
    if (owner.email) return owner.email;
    return `${owner.walletAddress.slice(0, 6)}...${owner.walletAddress.slice(-4)}`;
  }

  // ✅ Get avatar URL or initial (INI YANG MISSING!)
  function getOwnerAvatar(owner: {
    username?: string | null;
    avatarUrl?: string | null;
    walletAddress: string;
  } | null | undefined): { type: 'image' | 'initial'; value: string } {
    if (!owner) return { type: 'initial', value: '?' };
    if (owner.avatarUrl) return { type: 'image', value: owner.avatarUrl };
    const initial = (owner.username?.[0] || owner.email?.[0] || owner.walletAddress[0] || '?').toUpperCase();
    return { type: 'initial', value: initial };
  }

  function getBlockchainTx(item: Document): string | null {
    return item.blockchainTx || null;
  }


  // ✅ Format TX hash for display
  function formatTxDisplay(tx: string): string {
    if (!tx) return '—';
    if (tx.startsWith('ipfs:')) return tx.replace('ipfs:', '').slice(0, 6) + '...';
    return tx.slice(0, 6) + '...' + tx.slice(-4);
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

  // ✅ Get owner profile URL
  function getOwnerProfileUrl(owner: { id?: string; walletAddress?: string } | null | undefined): string {
    if (!owner) return '#';
    if (owner.id) return `/profile/${owner.id}`;
    if (owner.walletAddress) return `/profile/${owner.walletAddress}`;
    return '#';
  }

  // ✅ Format file size
  function formatFileSize(bytes: number | null | undefined): string {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  // ✅ Format date with relative time
  function formatDate(date: string | Date | null | undefined): string {
    if (!date) return '—';
    
    const inputDate = new Date(date);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const inputDay = new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate());
    
    if (inputDay.getTime() === today.getTime()) {
      return inputDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    if (inputDay.getTime() === yesterday.getTime()) {
      return 'yesterday';
    }
    return inputDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ✅ Copy TX to clipboard with feedback
  async function copyBlockchainTx(tx: string, itemId: string) {
    try {
      await navigator.clipboard.writeText(tx);
      copiedTxId = itemId;
      setTimeout(() => { if (copiedTxId === itemId) copiedTxId = null; }, 1500);
    } catch (err) {
      console.error('Failed to copy TX:', err);
    }
  }

  // ✅ Open file preview modal
  function openFilePreview(item: Document) {
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
      privacy: item.privacy,
      description: item.description ?? null 
    };
    
    if (import.meta.env.DEV) {
      console.log('📦 File preview data:', {
        id: item.id,
        title: item.title,
        description: item.description,
        hasDescription: !!item.description
      });
    }
    
    showFilePreview = true;
  }

  // ✅ Close file preview modal
  function closeFilePreview() {
    showFilePreview = false;
    selectedFile = null;
  }

  // ✅ Open profile modal
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

  // ✅ Close profile modal
  function closeProfileModal() {
    showProfileModal = false;
    selectedProfile = null;
  }

  // ✅ Open edit modal for document
  function openEditModal(item: { id: string; title: string; description?: string | null }) {
    editingDoc = { id: item.id, title: item.title, description: item.description ?? null };
    editTitle = item.title;
    editDescription = item.description ?? '';
    showEditModal = true;
  }

 // FileTable.svelte - Fungsi submitEdit (versi bersih)

// FileTable.svelte - Fungsi submitEdit (FIX LENGKAP)

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
    
    // ✅ RESET STATE DULU, baru close modal:
    editingDoc = null;
    editTitle = '';
    editDescription = '';
    editErrorMessage = '';  // ✅ Clear error
    showEditModal = false;  // ✅ Baru close modal
    
  } catch (error: any) {
    console.error('❌ Failed to update document:', error);
    
    // ✅ ✅ ✅ FIX UTAMA: SET editErrorMessage agar muncul di modal!
    editErrorMessage = 
      error?.response?.message ||  // Dari backend response body
      error?.message ||            // Dari Error instance
      error?.error ||              // Fallback lain
      'Failed to update document';
    
    // ❌ JANGAN reset state atau close modal jika error!
    // Biarkan user lihat error dan bisa edit lagi
    
  } finally {
    isEditProcessing = false;
  }
}

  // ✅ Cancel edit
  function cancelEdit() {
    showEditModal = false;
    editingDoc = null;
  }
// ✅ Helper: Get file type info (icon, color, gradient, label)
function getFileTypeInfo(mimeType: string | null | undefined, fileName?: string): {
  icon: string;
  color: string;
  gradient: string;
  label: string;
  bgHover: string;
} {
  const mime = mimeType?.toLowerCase() || '';
  const ext = fileName?.split('.').pop()?.toLowerCase() || '';
  
  // 🖼️ Images
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif'].includes(ext)) {
    return {
      icon: `<svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" 
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                <circle cx="17" cy="7" r="1" fill="currentColor" opacity="0.6"/>
              </svg>`,
      color: 'text-amber-400',
      gradient: 'from-amber-500/20 to-orange-500/20',
      label: 'IMG',
      bgHover: 'group-hover/file-row:shadow-amber-500/30'
    };
  }
  
  // 📄 PDF
  if (mime === 'application/pdf' || ext === 'pdf') {
    return {
      icon: `<svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 9h.01M12 9h.01M15 9h.01"/></svg>`,
      color: 'text-red-400',
      gradient: 'from-red-500/20 to-rose-500/20',
      label: 'PDF',
      bgHover: 'group-hover/file-row:shadow-red-500/30'
    };
  }
  
  // 📝 Documents (DOC, DOCX, TXT, RTF)
  if (['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'application/rtf'].includes(mime) || ['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) {
    return {
      icon: `<svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 9h.01M12 9h.01M15 9h.01M9 15h.01M12 15h.01"/></svg>`,
      color: 'text-blue-400',
      gradient: 'from-blue-500/20 to-cyan-500/20',
      label: 'DOC',
      bgHover: 'group-hover/file-row:shadow-blue-500/30'
    };
  }
  
  // 📊 Spreadsheet (XLS, XLSX, CSV)
  if (['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'].includes(mime) || ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
    return {
      icon: `<svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`,
      color: 'text-emerald-400',
      gradient: 'from-emerald-500/20 to-green-500/20',
      label: 'XLS',
      bgHover: 'group-hover/file-row:shadow-emerald-500/30'
    };
  }
  
  // 🎬 Video
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mkv', 'avi', 'mov', 'flv'].includes(ext)) {
    return {
      icon: `<svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>`,
      color: 'text-purple-400',
      gradient: 'from-purple-500/20 to-violet-500/20',
      label: 'VID',
      bgHover: 'group-hover/file-row:shadow-purple-500/30'
    };
  }
  
  // 🎵 Audio
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) {
    return {
      icon: `<svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>`,
      color: 'text-pink-400',
      gradient: 'from-pink-500/20 to-rose-500/20',
      label: 'AUD',
      bgHover: 'group-hover/file-row:shadow-pink-500/30'
    };
  }
  
  // 🗜️ Archive (ZIP, RAR, TAR)
  if (['application/zip', 'application/x-rar-compressed', 'application/x-tar', 'application/gzip'].includes(mime) || ['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) {
    return {
      icon: `<svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>`,
      color: 'text-orange-400',
      gradient: 'from-orange-500/20 to-amber-500/20',
      label: 'ZIP',
      bgHover: 'group-hover/file-row:shadow-orange-500/30'
    };
  }
  
  // 💻 Code / Dev Files
  if (['text/html', 'text/css', 'application/javascript', 'application/json', 'application/xml'].includes(mime) || ['html', 'css', 'js', 'ts', 'jsx', 'tsx', 'json', 'xml', 'py', 'php', 'rb', 'go', 'rs'].includes(ext)) {
    return {
      icon: `<svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>`,
      color: 'text-cyan-400',
      gradient: 'from-cyan-500/20 to-teal-500/20',
      label: 'CODE',
      bgHover: 'group-hover/file-row:shadow-cyan-500/30'
    };
  }
  
  // 📦 Default / Unknown
  return {
    icon: `<svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 17v-4m0 0V9m0 4h4m-4 0H8"/></svg>`,
    color: 'text-gray-400',
    gradient: 'from-gray-500/20 to-slate-500/20',
    label: 'FILE',
    bgHover: 'group-hover/file-row:shadow-gray-500/30'
  };
}

async function handleConfirmBlockchain(item: Document) {
  // ✅ Cek lokal: jika sudah ada blockchainTx, tidak perlu confirm lagi
  if (getBlockchainTx(item)) {
    txStatus = new Map(txStatus).set(item.id, { success: false, message: '✅ Sudah on-chain!' });
    setTimeout(() => txStatus.delete(item.id), 2000);
    return;
  }

  // ✅ Cek state: jika sedang diproses, skip
  if (confirmingTx.has(item.id)) return;
  
  try {
    // ✅ Reassign untuk trigger re-render Svelte 5
    confirmingTx = new Set(confirmingTx).add(item.id);
    txStatus = new Map(txStatus).set(item.id, { success: false, message: 'Preparing...' });
    
    // 1. Minta data blockchain dari backend
    const response = await storageService.triggerBlockchainConfirmation(item.id);
    
    if (!response.success || !response.data?.blockchainData) {
      // ✅ Backend mungkin reject karena file sudah ada di chain
      if (response.message?.includes('sudah pernah') || response.message?.includes('already')) {
        throw new Error('CONTRACT_REVERT: File sudah pernah direcord');
      }
      throw new Error(response.message || 'Failed to prepare blockchain data');
    }
    
    txStatus = new Map(txStatus).set(item.id, { success: false, message: 'Confirm in wallet...' });
    
    // 2. Sign TX via MetaMask (frontend hanya tanda-tangan, tidak query chain)
    const txResult = await recordFileOnChain(response.data.blockchainData, {
      onStatus: (status) => {
        txStatus = new Map(txStatus).set(item.id, { 
          success: false, 
          message: status.replace('✅', '').trim() 
        });
      }
    });
    
    txStatus = new Map(txStatus).set(item.id, { success: false, message: 'Updating database...' });
    
    // 3. Notify backend bahwa TX confirmed
    await storageService.confirmDocumentOnChain(
      item.id,
      txResult.txHash,
      txResult.blockNumber
    );
    
    // 4. ✅ SUCCESS: Update UI
    txStatus = new Map(txStatus).set(item.id, { success: true, message: '✅ Confirmed!' });
    
    // 🔄 ROBUST REFRESH STRATEGY
    setTimeout(async () => {
      await onRefresh?.();
      
      window.dispatchEvent(new CustomEvent('decentrashare:refresh', {
        detail: { type: 'document', id: item.id, action: 'confirmed' }
      }));
      
      items = [...items]; // Force reactivity Svelte 5
      
      setTimeout(() => {
        const newTxStatus = new Map(txStatus);
        newTxStatus.delete(item.id);
        txStatus = newTxStatus;
        
        const newConfirmingTx = new Set(confirmingTx);
        newConfirmingTx.delete(item.id);
        confirmingTx = newConfirmingTx;
      }, 3000);
      
    }, 500);
    
     } catch (err: any) {
    console.error(`Confirm blockchain failed for ${item.id}:`, err);
    
    const rawMsg = err.message || err.reason || '';
    
    // ✅ Jika error karena file sudah ada di chain → simpan ke cache permanen
    if (rawMsg.includes('sudah pernah di-upload') || rawMsg.includes('already uploaded')) {
      duplicateFiles.add(item.id); // ← Tambahkan ke Set agar badge permanen
      
      txStatus = new Map(txStatus).set(item.id, { 
        success: false, 
        message: '📁 Sudah tercatat di jaringan' 
      });
      
      // Auto-clear txStatus setelah 3 detik (badge permanen tetap ada via duplicateFiles)
      setTimeout(() => {
        const newTxStatus = new Map(txStatus);
        newTxStatus.delete(item.id);
        txStatus = newTxStatus;
        
        const newConfirmingTx = new Set(confirmingTx);
        newConfirmingTx.delete(item.id);
        confirmingTx = newConfirmingTx;
      }, 3000);
      return; // Kelar, jangan lanjut ke error handling lain
    } 
  }
}
</script>

<!-- ✅ TEMPLATE (sama seperti sebelumnya, hanya pastikan ItemMenu pass onEdit) -->
<div>
  <table class="w-full text-left border-collapse">
    
    <!-- THEAD -->
    <thead class="bg-white/5 text-[10px] text-gray-400 uppercase tracking-widest border-b border-white/10">
      <tr>
        <th class="px-6 py-4 w-14">
          {#if selectionMode}
            <div class="relative w-5 h-5">
              <input 
                type="checkbox"
                checked={
                  (viewMode === 2 ? folders : []).length + items.length > 0 &&
                  [...(viewMode === 2 ? folders : []), ...items]
                    .every(i => selectedItems.includes(i.id))
                }
                onchange={(e) => {
                  e.stopPropagation();
                  const currentViewIds = [
                    ...(viewMode === 2 ? folders.map(f => f.id) : []),
                    ...items.map(i => i.id)
                  ];
                  if (e.target.checked) {
                    currentViewIds.forEach(id => {
                      if (!selectedItems.includes(id)) onToggleSelect?.(id);
                    });
                  } else {
                    currentViewIds.forEach(id => {
                      if (selectedItems.includes(id)) onToggleSelect?.(id);
                    });
                  }
                }}
                class="w-5 h-5 rounded-full border-2 border-gray-500/50 bg-white/10
                       checked:bg-blue-600 checked:border-blue-600
                       cursor-pointer appearance-none transition-all duration-200
                       opacity-0"
              />
              <span 
                class="absolute inset-0 flex items-center justify-center rounded-full border-2 pointer-events-none w-5 h-5
                       {
                         (viewMode === 2 ? folders : []).length + items.length > 0 &&
                         [...(viewMode === 2 ? folders : []), ...items]
                           .every(i => selectedItems.includes(i.id))
                           ? 'bg-blue-600 border-blue-600' 
                           : 'bg-white/10 border-gray-500/50'
                       }
                       transition-all duration-200"
              >
                {#if 
                  (viewMode === 2 ? folders : []).length + items.length > 0 &&
                  [...(viewMode === 2 ? folders : []), ...items]
                    .every(i => selectedItems.includes(i.id))
                }
                  <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                  </svg>
                {/if}
              </span>
            </div>
          {/if}
        </th>
        <th class="pl-4 pr-2 py-4 text-left font-semibold w-[450px] max-w-[450px]">Name</th>
        <th class="hidden xl:table-cell px-4 py-4 text-center font-semibold">Owner</th>
        <th class="hidden md:table-cell px-4 py-4 text-center font-semibold">Size</th>
        <th class="hidden xl:table-cell px-4 py-4 text-center font-semibold">{trashMode ? 'Deleted at' : 'Modified'}</th>
        {#if trashMode}
          <th class="hidden xl:table-cell px-4 py-4 text-center font-semibold">Auto delete</th>
        {/if}
        <th class="hidden lg:table-cell px-4 py-4 text-center font-semibold">Blockchain Tx</th>
        <th class="px-6 py-4 text-center font-semibold">Actions</th>
      </tr>
    </thead>
    
    <!-- TBODY -->
    <tbody class="divide-y divide-white/5">
      
      <!-- FOLDERS -->
      {#if viewMode === 2}
        {#each folders as folder}  
          <tr 
            class="group hover:bg-white/[0.04] transition-all duration-200 cursor-pointer select-none
                   {selectionMode && selectedItems.includes(folder.id) 
                     ? 'bg-blue-500/10 border-l-4 border-blue-500' 
                     : 'border-l-4 border-transparent'}"
            onclick={(e) => {
              if (selectionMode) {
                e.preventDefault();
                e.stopPropagation();
                const row = e.currentTarget as HTMLElement;
                row.style.transform = 'scale(0.99)';
                setTimeout(() => { row.style.transform = ''; }, 100);
                onToggleSelect?.(folder.id);
                return;
              }
              if ((e.target as HTMLElement).closest('[data-checkbox]')) {
                e.stopPropagation();
                return;
              }
              openFolder(folder);
            }}
          >
            <!-- Checkbox -->
            <td class="px-6 py-4">
              {#if selectionMode}
                <div class="relative w-5 h-5">
                  <input 
                    type="checkbox"
                    data-checkbox
                    checked={selectedItems.includes(folder.id)}
                    onchange={(e) => { e.stopPropagation(); onToggleSelect?.(folder.id); }}
                    onclick={(e) => e.stopPropagation()}
                    class="w-5 h-5 rounded-full border-2 border-gray-500/50 bg-white/10
                           checked:bg-blue-600 checked:border-blue-600
                           cursor-pointer appearance-none transition-all duration-200 opacity-0"
                  />
                  <span 
                    class="absolute inset-0 flex items-center justify-center rounded-full border-2 pointer-events-none w-5 h-5
                           {selectedItems.includes(folder.id) 
                             ? 'bg-blue-600 border-blue-600' 
                             : 'bg-white/10 border-gray-500/50'}
                           transition-all duration-200"
                  >
                    {#if selectedItems.includes(folder.id)}
                      <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                      </svg>
                    {/if}
                  </span>
                </div>
              {/if}
            </td>
            
            <!-- Name -->
            <!-- Name Column - Updated with Complex Folder Icon -->
<td class="pl-4 pr-2 py-4 w-[360px] max-w-[360px]">
  <div class="flex items-center gap-3 min-w-0">
    
    <!-- 📁 Complex Folder Icon Container (Scaled for Table) -->
    <div class="relative w-10 h-10 flex-shrink-0">
      <div class="absolute inset-0 rounded-[14px] blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-amber-400/40 via-orange-400/30 to-amber-600/40"></div>
      {#if selectionMode && selectedItems.includes(folder.id)}
        <div class="absolute inset-0 rounded-[14px] blur-md bg-blue-500/30 animate-pulse"></div>
      {/if}
      <div class="relative w-10 h-10 rounded-[14px] bg-gradient-to-br from-white/10 via-white/5 to-white/[0.02] backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.1)_inset] group-hover:scale-105 group-hover:border-amber-400/40 transition-all duration-300 overflow-visible">
        <svg class="w-7 h-7 drop-shadow-sm" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="folderGrad1Tbl" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f59e0b" />
              <stop offset="50%" stop-color="#f97316" />
              <stop offset="100%" stop-color="#ea580c" />
            </linearGradient>
            <linearGradient id="folderGrad2Tbl" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="white" stop-opacity="0.4" />
              <stop offset="50%" stop-color="white" stop-opacity="0.1" />
              <stop offset="100%" stop-color="white" stop-opacity="0" />
            </linearGradient>
            <filter id="folderGlowTbl" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feFlood flood-color="#f59e0b" flood-opacity="0.3" result="glowColor" />
              <feComposite in="glowColor" in2="blur" operator="in" result="softGlow" />
              <feMerge>
                <feMergeNode in="softGlow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path d="M15 30 C15 25, 20 20, 25 20 L40 20 L48 28 L85 28 C90 28, 95 33, 95 38 L95 80 C95 85, 90 90, 85 90 L15 90 C10 90, 5 85, 5 80 L5 30 Z" fill="url(#folderGrad1Tbl)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" filter="url(#folderGlowTbl)" />
          <path d="M25 20 L40 20 L48 28 L38 28 C33 28, 28 25, 25 20 Z" fill="url(#folderGrad1Tbl)" stroke="rgba(255,255,255,0.4)" stroke-width="1" />
          <path d="M15 30 C15 25, 20 20, 25 20 L40 20 L48 28 L85 28 C90 28, 95 33, 95 38 L95 80 C95 85, 90 90, 85 90 L15 90 C10 90, 5 85, 5 80 L5 30 Z" fill="url(#folderGrad2Tbl)" class="opacity-60" />
          <path d="M18 32 C18 28, 22 24, 26 24 L39 24 L46 30 L83 30 C87 30, 91 34, 91 38 L91 78 C91 82, 87 86, 83 86 L18 86 C14 86, 10 82, 10 78 L10 32 Z" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.8" />
          <g class="opacity-70">
            <rect x="24" y="48" width="52" height="6" rx="1.5" fill="white" fill-opacity="0.15" />
            <rect x="28" y="57" width="44" height="6" rx="1.5" fill="white" fill-opacity="0.1" />
          </g>
          <g class="opacity-80">
            <circle cx="76" cy="36" r="1.5" fill="white" fill-opacity="0.6" />
          </g>
        </svg>
        <div class="absolute inset-0 rounded-[14px] opacity-0 group-hover:opacity-100 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none" style="background-size: 200% 100%;"></div>
      </div>
    </div>

    <!-- Folder Name Text -->
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2 min-w-0">
        <span class="block text-sm font-semibold text-white/90 uppercase tracking-wide truncate" title={folder.name}>
          {folder.name}
        </span>
        {#if folder.accessRole}
          <span class="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider {folder.accessRole === 'EDITOR' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : folder.accessRole === 'ADMIN' ? 'bg-purple-500/10 text-purple-300 border-purple-500/20' : 'bg-blue-500/10 text-blue-300 border-blue-500/20'}">
            {folder.accessRole === 'EDITOR' ? 'Editor' : folder.accessRole === 'ADMIN' ? 'Admin' : 'Viewer'}
          </span>
        {/if}
      </div>
    </div>
  </div>
</td>

            <!-- Owner -->
            <td class="hidden xl:table-cell px-4 py-4 text-center">
              {#if folder.owner || folder.ownerId}  
                {@const avatar = getOwnerAvatar(folder.owner)}  
                {@const isCurrentUser = currentUserId && folder.ownerId && currentUserId === folder.ownerId}  
                
                <button 
                  class="group/owner flex items-center justify-center gap-2 
                         hover:scale-[1.02] active:scale-[0.98] 
                         hover:bg-white/5 hover:rounded-lg 
                         transition-all duration-200 ease-out
                         focus:outline-none focus:ring-2 focus:ring-blue-500/50
                         text-left w-full"
                  title={folder.owner?.walletAddress || folder.ownerId}  
                  onclick={(e) => {
                    e.stopPropagation();
                    openProfileModal(folder.owner, folder.ownerId);  
                  }}
                >
                  <div class="relative">
                    {#if avatar.type === 'image'}
                      <img 
                        src={avatar.value} 
                        alt={formatOwnerName(folder.owner, currentUserId, folder.ownerId)}  
                        class="w-6 h-6 rounded-full object-cover border border-white/10 
                               group-hover/owner:border-blue-400/50 group-hover/owner:shadow-[0_0_12px_rgba(59,130,246,0.4)]
                               transition-all duration-200"
                        onerror={(e) => { 
                          const el = e.target as HTMLImageElement;
                          el.style.display = 'none';
                          el.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <div class="hidden w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 
                                  flex items-center justify-center text-[10px] font-bold text-white
                                  group-hover/owner:shadow-[0_0_12px_rgba(59,130,246,0.4)]
                                  transition-shadow duration-200">
                        {avatar.value}
                      </div>
                    {:else}
                      <div class="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 
                                  flex items-center justify-center text-[10px] font-bold text-white
                                  group-hover/owner:shadow-[0_0_12px_rgba(59,130,246,0.4)]
                                  transition-shadow duration-200">
                        {avatar.value}
                      </div>
                    {/if}
                    <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full 
                                 bg-blue-500 border-2 border-[#1a1a1e] opacity-0 
                                 group-hover/owner:opacity-100 transition-opacity duration-200"></span>
                  </div>
                  
                  <span class="text-xs truncate max-w-[100px] transition-colors duration-200 {isCurrentUser ? 'text-blue-400 font-semibold' : 'text-gray-300 group-hover/owner:text-blue-300 group-hover/owner:font-medium'}">
                    {formatOwnerName(folder.owner, currentUserId, folder.ownerId)}
                  </span>
                </button>
              {:else}
                <span class="text-xs text-gray-600 italic">Unknown</span>
              {/if}
            </td>
            
            <!-- Size -->
            <td class="hidden md:table-cell px-4 py-4 text-center">
              <span class="text-xs text-gray-500 font-medium">—</span>
            </td>

            <!-- Modified -->
            <td class="hidden xl:table-cell px-4 py-4 text-center">
              <span class="text-xs text-gray-500 whitespace-nowrap"
                    title={(trashMode ? folder.deletedAt : folder.updatedAt)?.toString() || folder.createdAt?.toString()}>
                {formatDate((trashMode ? folder.deletedAt : folder.updatedAt) || folder.createdAt)}
              </span>
            </td>
            
            {#if trashMode}
              <td class="hidden xl:table-cell px-4 py-4 text-center">
                <span class="inline-flex text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap bg-red-500/10 text-red-300 border border-red-500/20" title="Item akan dihapus otomatis setelah 60 hari di Trash">
                  {formatTrashRetentionCountdown(folder.deletedAt)}
                </span>
              </td>
            {/if}

            <!-- IPFS -->
            <td class="hidden lg:table-cell px-4 py-4 text-center">
              <span class="text-xs text-gray-500 font-medium">—</span>
            </td>

            <!-- Actions -->
            <td class="px-6 py-4 text-center">
              {#if !selectionMode}
                 <div class="inline-flex justify-end" data-item-menu onclick={(e) => e.stopPropagation()}>
                  <ItemMenu
                    itemId={folder.id}
                    itemType="folder"
                    itemName={folder.name}
                    isOwner={!publicExploreMode && currentUserId === folder.ownerId}
                    onRename={publicExploreMode ? undefined : onRename}
                    onShare={publicExploreMode ? undefined : onShare}
                    onMove={publicExploreMode ? undefined : onMove}
                    onRestore={publicExploreMode ? undefined : onRestore}
                    trashMode={trashMode}
                    onDelete={publicExploreMode ? undefined : (id, type, name) => onDeleteConfirm?.(id, type, name)}
                    onDownload={onDownload}
                  />
                </div>
              {/if}
            </td>
          </tr>
        {/each}
      {/if}

      <!-- DOCUMENTS -->
      {#each items as item}
        {@const theme = getFileTheme(item.mimeType)}
        
        <tr 
          class="group/file-row hover:bg-white/[0.06] transition-all duration-200 cursor-pointer select-none
               {selectionMode && selectedItems.includes(item.id) 
                 ? 'bg-blue-500/10 border-l-4 border-blue-500' 
                 : 'border-l-4 border-transparent hover:border-l-blue-400/30'}
               hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)]" 
          onclick={(e) => {
            if (selectionMode) {
              e.stopPropagation();
              const row = e.currentTarget as HTMLElement;
              row.style.transform = 'scale(0.99)';
              setTimeout(() => { row.style.transform = ''; }, 100);
              onToggleSelect?.(item.id);
              return;
            }
            if ((e.target as HTMLElement).closest('[data-checkbox]')) {
              e.stopPropagation();
              return;
            }
            if ((e.target as HTMLElement).closest('[data-item-menu]')) {
              e.stopPropagation();
              return;
            }
            e.stopPropagation(); 
            openFilePreview(item);
          }}
        >
          <!-- Checkbox -->
          <td class="px-6 py-4">
            {#if selectionMode}
              <div class="relative w-5 h-5">
                <input 
                  type="checkbox"
                  data-checkbox
                  checked={selectedItems.includes(item.id)}
                  onchange={(e) => { e.stopPropagation(); onToggleSelect?.(item.id); }}
                  onclick={(e) => e.stopPropagation()}
                  class="w-5 h-5 rounded-full border-2 border-gray-500/50 bg-white/10
                         checked:bg-blue-600 checked:border-blue-600
                         cursor-pointer appearance-none transition-all duration-200 opacity-0"
                />
                <span 
                  class="absolute inset-0 flex items-center justify-center rounded-full border-2 pointer-events-none w-5 h-5
                         {selectedItems.includes(item.id) 
                           ? 'bg-blue-600 border-blue-600' 
                           : 'bg-white/10 border-gray-500/50'}
                         transition-all duration-200"
                >
                  {#if selectedItems.includes(item.id)}
                    <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                    </svg>
                  {/if}
                </span>
              </div>
            {/if}
          </td>
          
          <!-- Name -->
        <td class="pl-4 pr-2 py-4 w-[360px] max-w-[360px]">
          {#if true}
            {@const fileInfo = getFileTypeInfo(item.mimeType, item.fileName)}
            
            <div class="flex items-center gap-3 min-w-0">
              
              <!-- 🎨 File Type Icon with Glassmorphism -->
              <div class="relative w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
                          bg-gradient-to-br {fileInfo.gradient}
                          border border-white/10 backdrop-blur-sm
                          {fileInfo.color}
                          group-hover/file-row:scale-110 
                          {fileInfo.bgHover}
                          shadow-[0_4px_12px_rgba(0,0,0,0.15)]
                          transition-all duration-200 ease-out">
                
                <!-- ✨ Inner Glow -->
                <div class="absolute inset-0 rounded-lg bg-white/5 opacity-0 group-hover/file-row:opacity-100 transition-opacity"></div>
                
                <!-- Icon SVG (rendered as innerHTML) -->
                {@html fileInfo.icon}
                
                <!-- ✨ Badge Label -->
                <span class="absolute -top-1 -right-1 text-[8px] font-bold 
                            bg-black/60 backdrop-blur-sm text-white 
                            px-1 py-0.5 rounded-[3px] opacity-0 group-hover/file-row:opacity-100
                            transition-opacity duration-200">
                  {fileInfo.label}
                </span>
              </div>

              <!-- File Info Text -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 min-w-0">
                  <p
                    class="text-sm font-medium text-gray-200 truncate
                           group-hover/file-row:text-white group-hover/file-row:underline decoration-blue-400/50 underline-offset-4
                           transition-all duration-200"
                    title={item.title}
                  >
                    {item.title}
                  </p>
                  {#if item.accessRole}
                    <span class="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider {item.accessRole === 'EDITOR' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : item.accessRole === 'ADMIN' ? 'bg-purple-500/10 text-purple-300 border-purple-500/20' : 'bg-blue-500/10 text-blue-300 border-blue-500/20'}">
                      {item.accessRole === 'EDITOR' ? 'Editor' : item.accessRole === 'ADMIN' ? 'Admin' : 'Viewer'}
                    </span>
                  {/if}
                </div>
                <p class="text-[10px] text-gray-500 uppercase font-medium tracking-wide
                          group-hover/file-row:text-gray-400 transition-colors">
                  {item.fileName?.split('.').pop()?.toUpperCase() || 'FILE'} • {formatFileSize(item.fileSize)}
                </p>
              </div>
            </div>
          {/if}
        </td>
          <!-- Owner -->
          <td class="hidden xl:table-cell px-4 py-4 text-center">
            {#if item.owner || item.ownerId}  
              {@const avatar = getOwnerAvatar(item.owner)}  
              {@const isCurrentUser = currentUserId && item.ownerId && currentUserId === item.ownerId}  
              
              <button 
                class="group/owner flex items-center justify-center gap-2 
                       hover:scale-[1.02] active:scale-[0.98] 
                       hover:bg-white/5 hover:rounded-lg 
                       transition-all duration-200 ease-out
                       focus:outline-none focus:ring-2 focus:ring-blue-500/50
                       text-left w-full"
                title={item.owner?.walletAddress || item.ownerId}  
                onclick={(e) => {
                  e.stopPropagation();
                  openProfileModal(item.owner, item.ownerId);  
                }}
              >
                <div class="relative">
                  {#if avatar.type === 'image'}
                    <img 
                      src={avatar.value} 
                      alt={formatOwnerName(item.owner, currentUserId, item.ownerId)}  
                      class="w-6 h-6 rounded-full object-cover border border-white/10 
                             group-hover/owner:border-blue-400/50 group-hover/owner:shadow-[0_0_12px_rgba(59,130,246,0.4)]
                             transition-all duration-200"
                      onerror={(e) => { 
                        const el = e.target as HTMLImageElement;
                        el.style.display = 'none';
                        el.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                    <div class="hidden w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 
                                flex items-center justify-center text-[10px] font-bold text-white
                                group-hover/owner:shadow-[0_0_12px_rgba(59,130,246,0.4)]
                                transition-shadow duration-200">
                      {avatar.value}
                    </div>
                  {:else}
                    <div class="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 
                                flex items-center justify-center text-[10px] font-bold text-white
                                group-hover/owner:shadow-[0_0_12px_rgba(59,130,246,0.4)]
                                transition-shadow duration-200">
                      {avatar.value}
                    </div>
                  {/if}
                  <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full 
                               bg-blue-500 border-2 border-[#1a1a1e] opacity-0 
                               group-hover/owner:opacity-100 transition-opacity duration-200"></span>
                </div>
                
                <span class="text-xs truncate max-w-[100px] transition-colors duration-200 {isCurrentUser ? 'text-blue-400 font-semibold' : 'text-gray-300 group-hover/owner:text-blue-300 group-hover/owner:font-medium'}">
                  {formatOwnerName(item.owner, currentUserId, item.ownerId)}
                </span>
              </button>
            {:else}
              <span class="text-xs text-gray-600 italic">Unknown</span>
            {/if}
          </td>
          
          <!-- Size -->
          <td class="hidden md:table-cell px-4 py-4 text-center">
            <span class="text-xs text-gray-400 font-mono whitespace-nowrap">
              {formatFileSize(item.fileSize)}
            </span>
          </td>
          
          <!-- Modified -->
          <td class="hidden xl:table-cell px-4 py-4 text-center">
            <span class="text-xs text-gray-500 whitespace-nowrap" title={(trashMode ? item.deletedAt : item.updatedAt)?.toString() || item.createdAt?.toString()}>
              {formatDate((trashMode ? item.deletedAt : item.updatedAt) || item.createdAt)}
            </span>
          </td>

          {#if trashMode}
            <td class="hidden xl:table-cell px-4 py-4 text-center">
              {#if isPendingOnChain(item)}
                <span class="inline-flex text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap bg-red-500/10 text-red-400 border border-red-500/20" title="File akan otomatis dihapus jika tidak dikonfirmasi sebelum waktu ini habis">
                  Auto delete in: {formatPendingCountdown(item)}
                </span>
              {:else if isPendingExpired(item)}
                <span class="inline-flex text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap bg-red-500/10 text-red-400 border border-red-500/20" title="Batas konfirmasi sudah habis. File akan dihapus otomatis.">
                  Confirmation expired
                </span>
              {:else}
                <span class="inline-flex text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap bg-red-500/10 text-red-300 border border-red-500/20" title="Item akan dihapus otomatis setelah 60 hari di Trash">
                  {formatTrashRetentionCountdown(item.deletedAt)}
                </span>
              {/if}
            </td>
          {/if}

<!-- Blockchain Tx Column - ROBUST: Cek blockchainTx langsung -->
<td class="hidden lg:table-cell px-4 py-4 text-center">
  
  {#if getBlockchainTx(item)}
    {@const blockchainTx = getBlockchainTx(item)!}
    <!-- ✅ Sudah ada TX hash: Show link ke Etherscan -->
    <a
      href={`https://sepolia.etherscan.io/tx/${blockchainTx}`}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1.5 text-xs font-mono
             text-blue-400 bg-white/5 hover:bg-blue-500/10 hover:text-blue-300
             px-2.5 py-1.5 rounded-lg transition-all duration-150 ease-out"
      title="View on Etherscan"
      onclick={(e) => e.stopPropagation()}
    >
      <span class="truncate max-w-[90px]">
        {blockchainTx.slice(0, 6)}...{blockchainTx.slice(-4)}
      </span>
      <svg class="w-3.5 h-3.5 opacity-70 hover:opacity-100 transition-opacity" 
           fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
      </svg>
    </a>
    

  {:else if trashMode || publicExploreMode}
    <span class="text-xs text-gray-600">—</span>
  {:else if isPendingOnChain(item)}
    <div class="flex flex-col items-center gap-1">
      <button
        class="inline-flex items-center gap-1.5 text-xs font-medium
               text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600
               px-3 py-1.5 rounded-lg transition-all duration-150 ease-out
               active:scale-[0.98] disabled:cursor-not-allowed"
        title="Confirm this file on blockchain"
        disabled={confirmingTx?.has(item.id)}
        onclick={async (e) => {
          e.stopPropagation();
          await handleConfirmBlockchain(item);
        }}
      >
        {#if confirmingTx?.has(item.id)}
          <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Confirming...
        {:else}
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5 2a8 8 0 11-16 0 8 8 0 0116 0z"/>
          </svg>
          Confirm
        {/if}
      </button>

      <span class="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" title="File akan otomatis dihapus dari IPFS dan database jika tidak dikonfirmasi dalam 24 jam">
        Need confirmation: {formatPendingCountdown(item)}
      </span>

      {#if txStatus.has(item.id)}
        {@const status = txStatus.get(item.id)}
        {#if status}
          <span class="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap
                       {status.success
                         ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                         : 'bg-red-500/10 text-red-400 border border-red-500/20'}">
            {status.message}
          </span>
        {/if}
      {/if}
    </div>
  {:else if isPendingExpired(item)}
    <span class="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap bg-red-500/10 text-red-400 border border-red-500/20" title="Batas konfirmasi 24 jam sudah habis. File akan dihapus otomatis.">
      Expired - menunggu cleanup
    </span>
  {:else}
    <span class="text-xs text-gray-600">—</span>
  {/if}
</td>
          
          <!-- Actions -->
          <td class="px-6 py-4 text-center">
            {#if !selectionMode}
             <div class="inline-flex justify-end" data-item-menu onclick={(e) => e.stopPropagation()}>
              <ItemMenu
                itemId={item.id}
                itemType="document"
                itemName={item.title}
                itemDescription={item.description}
                isOwner={!publicExploreMode && currentUserId === item.ownerId}
                onRename={publicExploreMode ? undefined : onRename}
                onEdit={publicExploreMode ? undefined : (id, title, description) => openEditModal({ id, title, description })}
                onShare={publicExploreMode ? undefined : onShare}
                onMove={publicExploreMode ? undefined : onMove}
                onRestore={publicExploreMode ? undefined : onRestore}
                trashMode={trashMode}
                onDelete={publicExploreMode ? undefined : (id, type, name) => onDeleteConfirm?.(id, type, name)}
                onDownload={onDownload}
              />
            </div>
            {/if}
          </td>
        </tr>
      {/each}
        
    </tbody>
  </table>
  
  <!-- Modals -->
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
  
  <!-- Edit Document Modal -->
  <EditDocumentModal
    isOpen={showEditModal}
    onClose={cancelEdit}
    initialTitle={editTitle}
    initialDescription={editDescription}
    isProcessing={isEditProcessing}
    errorMessage={editErrorMessage}
    onConfirm={async (title, description) => {
      editTitle = title;
      editDescription = description;
      await submitEdit();
    }}
  />
</div>