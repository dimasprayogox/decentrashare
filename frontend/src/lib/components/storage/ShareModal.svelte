<!-- src/lib/components/storage/ShareModal.svelte -->
<script lang="ts">
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { storageService } from '$lib/services/storage/storage';
  import type { 
    ShareableUser, 
    PrivacyLevel,
  } from '$lib/types/storage';
  import RevokeConfirmModal from '$lib/components/storage/RevokeConfirmModal.svelte';

  // ── Props (✅ RUNES MODE) ──
  let {
    itemId,
    itemType,
    itemName,
    currentPrivacy,
    isOpen,
    onClose,
    onShared,
    currentUserId
  }: {
    itemId: string;
    itemType: 'document' | 'folder';
    itemName: string;
    currentPrivacy: PrivacyLevel;
    isOpen: boolean;
    onClose: () => void;
    onShared: () => void;
    currentUserId: string;
  } = $props();

  // ── State ──
  let privacyLevel = $state<PrivacyLevel>(currentPrivacy);
  let isDropdownOpen = $state(false);
  let searchQuery = $state('');
  let searchResults = $state<ShareableUser[]>([]);
  let selectedUsers = $state<string[]>([]); 
  let existingSharedUsers = $state<ShareableUser[]>([]);
  let isLoading = $state(false);
  let isSearching = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');
  let isUpdatingPrivacy = $state(false);
  let isRevokingAccess = $state<string | null>(null);

  let showRevokeModal = $state(false);
  let revokeTarget = $state<{ id: string; username: string } | null>(null);
  let revokeResolve: ((value: boolean) => void) | null = null;

  let userRoles = $state<Record<string, 'VIEWER' | 'EDITOR'>>({});
  let existingUserRoles = $state<Record<string, 'VIEWER' | 'EDITOR'>>({});
  let isUpdatingRole = $state<string | null>(null); 
  let pendingUserRoles = $state<Record<string, 'VIEWER' | 'EDITOR'>>({});  
    
  let toastMessage = $state('');
  let showToast = $state(false);

  let dropdownPosition = $state({ top: 0, left: 0, width: 0 });
  let searchTimeout: ReturnType<typeof setTimeout>;
  let dropdownRef: HTMLDivElement | undefined;

  // ── Privacy Level Config ──
  const privacyConfig: Record<PrivacyLevel, {
    icon: string;
    label: string;
    description: string;
    color: string;
    gradient: string;
  }> = {
    'PRIVATE': {
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
               <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
               <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
               <circle cx="12" cy="16" r="1" fill="currentColor"/>
             </svg>`,
      label: 'Private',
      description: 'Only you can access',
      color: 'text-gray-400',
      gradient: 'from-gray-500/20 to-slate-500/20'
    },
    'PUBLIC': {
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
               <circle cx="12" cy="12" r="10"/>
               <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
             </svg>`,
      label: 'Public',
      description: 'Anyone can view & download',
      color: 'text-emerald-400',
      gradient: 'from-emerald-500/20 to-green-500/20'
    },
    'LINK_ONLY': {
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
               <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
               <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
             </svg>`,
      label: 'Link Only',
      description: 'Only people with the link',
      color: 'text-blue-400',
      gradient: 'from-blue-500/20 to-cyan-500/20'
    },
    'SPECIFIC_USER': {
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
               <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
               <circle cx="9" cy="7" r="4"/>
               <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
               <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
             </svg>`,
      label: 'Specific Users',
      description: 'Share with selected people only',
      color: 'text-violet-400',
      gradient: 'from-violet-500/20 to-purple-500/20'
    }
  };

    const currentConfig = $derived(privacyConfig[privacyLevel]);
    const canShowLinkButton = $derived(privacyLevel === 'PUBLIC' || privacyLevel === 'LINK_ONLY');
  // ── Effects ──
  $effect(() => { privacyLevel = currentPrivacy; });
  $effect(() => { if (isOpen && itemId) loadExistingShares(); });
  $effect(() => {
    if (privacyLevel === 'SPECIFIC_USER' && searchQuery.trim().length >= 2) {
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(performSearch, 300);
    } else { searchResults = []; }
  });
  $effect(() => {
    if (!isDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef && !dropdownRef.contains(e.target as Node)) isDropdownOpen = false;
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  });
  $effect(() => {
    if (showToast) {
      const timer = setTimeout(() => showToast = false, 2500);
      return () => clearTimeout(timer);
    }
  });
  $effect(() => {
    if (isOpen && itemId) {
      privacyLevel = currentPrivacy;
      selectedUsers = [];
      pendingUserRoles = {};
      userRoles = {};
      existingUserRoles = {};
      searchQuery = '';
      searchResults = [];
      errorMessage = '';
      successMessage = '';
      isDropdownOpen = false;
      loadExistingShares();
    }
  });

  // ── Helpers ────────────────────────────────────────────────
  function handleAvatarError(event: Event, username: string) {
  const img = event.target as HTMLImageElement;
  if (img?.parentElement) {
    img.parentElement.innerHTML = `<span class="text-sm font-bold text-white">${getUserInitial(username)}</span>`;
  }
}
  function getUserRole(userId: string): 'VIEWER' | 'EDITOR' {
    return pendingUserRoles[userId] || userRoles[userId] || existingUserRoles[userId] || 'VIEWER';
  }
  function setUserRole(userId: string, role: 'VIEWER' | 'EDITOR') {
    userRoles = { ...userRoles, [userId]: role };
  }
  function clearUserRole(userId: string) {
    const newRoles = { ...userRoles };
    delete newRoles[userId];
    userRoles = newRoles;
  }
  function toggleUser(userId: string) {
    const idx = selectedUsers.indexOf(userId);
    if (idx >= 0) {
      selectedUsers.splice(idx, 1);
      clearUserRole(userId);
    } else {
      selectedUsers.push(userId);
      if (itemType === 'folder') setUserRole(userId, 'VIEWER');
    }
    selectedUsers = [...selectedUsers];
  }
  function removeSelectedUser(userId: string) {
    selectedUsers = selectedUsers.filter(u => u !== userId);
  }
  function toggleDropdown() {
    isDropdownOpen = !isDropdownOpen;
    if (isDropdownOpen) setTimeout(() => { dropdownPosition = calculateDropdownPosition(); }, 0);
  }
  function selectPrivacy(level: PrivacyLevel) {
    privacyLevel = level;
    isDropdownOpen = false;
    if (level !== 'SPECIFIC_USER') selectedUsers = [];
  }
  function showToastFeedback(message: string, type: 'success' | 'error' = 'success') {
    toastMessage = message;
    showToast = true;
  }
  function closeModal() {
    onClose();
    searchQuery = '';
    selectedUsers = [];
    pendingUserRoles = {};
    errorMessage = '';
    successMessage = '';
    isDropdownOpen = false;
    showToast = false;
  }
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (isDropdownOpen) isDropdownOpen = false;
      else closeModal();
    }
  }
  function getUserName(userId: string): string {
    const existing = existingSharedUsers.find(u => u.id === userId);
    if (existing) return existing.username;
    const selected = searchResults.find(u => u.id === userId);
    if (selected) return selected.username;
    return userId.slice(0, 8) + '...';
  }
  function getUserInitial(username: string): string {
    return username?.charAt(0).toUpperCase() || '?';
  }
  function calculateDropdownPosition(): { top: number; left: number; width: number } {
    if (!dropdownRef) return { top: 0, left: 0, width: 0 };
    const rect = dropdownRef.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const dropdownHeight = 250;
    const spacing = 8;
    const spaceBelow = viewportHeight - rect.bottom;
    let positionTop = spaceBelow < dropdownHeight 
      ? Math.max(rect.top - dropdownHeight - spacing, 8)
      : rect.bottom + spacing;
    let positionLeft = rect.left;
    if (positionLeft + rect.width > viewportWidth - 16) positionLeft = viewportWidth - rect.width - 16;
    positionLeft = Math.max(positionLeft, 16);
    return { top: positionTop, left: positionLeft, width: rect.width };
  }

  // ── Search ─────────────────────────────────────────────────
  async function performSearch() {
    if (searchQuery.trim().length < 2) return;
    try {
      isSearching = true;
      errorMessage = '';
      const res = await storageService.searchUsersForShare(searchQuery, {
        excludeSharedUserIds: [...existingSharedUsers.map(u => u.id), ...selectedUsers]
      });
      if (res.success && res.data) searchResults = res.data.users || [];
      else throw new Error(res.message || 'Search failed');
    } catch (err: any) {
      console.error('Search failed:', err);
      errorMessage = err.message || 'Failed to search for users';
      if (import.meta.env.DEV) {
        const mockUsers: ShareableUser[] = [
          { id: 'usr_alice', username: 'alice_crypto', walletAddress: '0x1234...abcd', avatarUrl: null },
          { id: 'usr_bob', username: 'bob_nft', walletAddress: '0x5678...efgh', avatarUrl: null },
          { id: 'usr_charlie', username: 'charlie_web3', walletAddress: '0x9abc...ijkl', avatarUrl: null },
        ];
        const query = searchQuery.toLowerCase();
        searchResults = mockUsers.filter(u => 
          (u.username?.toLowerCase().includes(query) || u.walletAddress.toLowerCase().includes(query)) &&
          u.id !== currentUserId &&
          !existingSharedUsers.some(e => e.id === u.id) &&
          !selectedUsers.includes(u.id)
        );
      }
    } finally { isSearching = false; }
  }

  // ── 📄 DOCUMENT API FUNCTIONS (Bulk) ───────────────────────
  async function updateDocumentPrivacy(newPrivacy: PrivacyLevel): Promise<boolean> {
    if (newPrivacy === currentPrivacy) return true;
    try {
      isUpdatingPrivacy = true;
      errorMessage = '';
      const payload = { updates: [{ documentId: itemId, newPrivacy }] };
      const res = await storageService.updateDocumentsPrivacy(payload.updates);
      if (!res?.success) throw new Error(res?.message || 'Failed to update document privacy');
      if (newPrivacy !== 'SPECIFIC_USER') { selectedUsers = []; existingSharedUsers = []; }
      return true;
    } catch (err: any) {
      console.error('❌ Document privacy update failed:', err);
      errorMessage = err.message || 'Failed to update privacy settings';
      return false;
    } finally { isUpdatingPrivacy = false; }
  }
  async function shareDocumentToUsers(userIds: string[]): Promise<boolean> {
    if (userIds.length === 0) return true;
    try {
      isLoading = true;
      const payload = { shares: [{ documentId: itemId, targetUsers: userIds }] };
      const res = await storageService.shareDocuments(payload.shares);
      if (!res?.success) throw new Error(res?.message || 'Failed to share document');
      return true;
    } catch (err: any) {
      console.error('❌ Document share failed:', err);
      errorMessage = err.message || 'Failed to share document';
      return false;
    } finally { isLoading = false; }
  }
  async function revokeDocumentAccess(userId: string): Promise<boolean> {
    try {
      const payload = { revokes: [{ documentId: itemId, targetUserIds: [userId] }] };
      const res = await storageService.revokeDocumentAccess(payload.revokes);
      if (!res?.success) throw new Error(res?.message || 'Failed to revoke access');
      return true;
    } catch (err: any) {
      console.error('❌ Document revoke failed:', err);
      return false;
    }
  }
  async function loadDocumentSharedUsers() {
    try {
      const res = await storageService.getDocumentSharedUsers([itemId]);
      const doc = res?.data?.[0];
      existingSharedUsers = doc?.sharedWith?.map(s => s.user) || [];
      existingUserRoles = {};
    } catch (err: any) {
      console.error('❌ Failed to load document shared users:', err);
      existingSharedUsers = [];
    }
  }

  // ── 📁 FOLDER API FUNCTIONS (Simple) ───────────────────────
  async function updateFolderPrivacy(newPrivacy: PrivacyLevel): Promise<boolean> {
    if (newPrivacy === currentPrivacy) return true;
    try {
      isUpdatingPrivacy = true;
      errorMessage = '';
      const res = await storageService.updateFolderPrivacy(itemId, { newPrivacy });
      if (!res?.success) throw new Error(res?.message || 'Failed to update folder privacy');
      if (newPrivacy !== 'SPECIFIC_USER') { selectedUsers = []; existingSharedUsers = []; existingUserRoles = {}; }
      return true;
    } catch (err: any) {
      console.error('❌ Folder privacy update failed:', err);
      errorMessage = err.message || 'Failed to update privacy settings';
      return false;
    } finally { isUpdatingPrivacy = false; }
  }
  async function shareFolderToUsers(usersWithRoles: Array<{ userId: string; role: 'VIEWER' | 'EDITOR' }>): Promise<boolean> {
    if (usersWithRoles.length === 0) return true;
    try {
      isLoading = true;
      const res = await storageService.shareFolder(itemId, { targetUsers: usersWithRoles });
      if (!res?.success) throw new Error(res?.message || 'Failed to share folder');
      return true;
    } catch (err: any) {
      console.error('❌ Folder share failed:', err);
      errorMessage = err.message || 'Failed to share folder';
      return false;
    } finally { isLoading = false; }
  }
  async function revokeFolderAccess(userId: string): Promise<boolean> {
    try {
      const res = await storageService.revokeFolderAccess(itemId, userId);
      if (!res?.success) throw new Error(res?.message || 'Failed to revoke access');
      return true;
    } catch (err: any) {
      console.error('❌ Folder revoke failed:', err);
      return false;
    }
  }
  async function loadFolderSharedUsers() {
    try {
      const res = await storageService.getFolderSharedUsers([itemId]);
      const folderData = Array.isArray(res.data) ? res.data[0] : res.data;
      
      if (folderData?.sharedWith?.length > 0) {
        existingSharedUsers = folderData.sharedWith.map((access: any) => access.user);

        existingUserRoles = {};
        for (const access of folderData.sharedWith) {
          existingUserRoles[access.user.id] = access.role || 'VIEWER';
        }
        
        console.log('✅ Loaded folder shared users:', {
          count: existingSharedUsers.length,
          roles: existingUserRoles
        });
      } else {
        existingSharedUsers = [];
        existingUserRoles = {};
      }
    } catch (err: any) {
      console.error('❌ Failed to load folder shared users:', err);
      existingSharedUsers = [];
      existingUserRoles = {};
    }
  }
  async function loadExistingShares() {
    try {
      isLoading = true;
      if (itemType === 'document') await loadDocumentSharedUsers();
      else await loadFolderSharedUsers();
    } catch (err: any) {
      console.error('Failed to load shares:', err);
      existingSharedUsers = []; existingUserRoles = {};
    } finally { isLoading = false; }
  }

  // ✅ NEW: Hanya update local state, TIDAK langsung call API
function handleUserRoleChange(userId: string, newRole: 'VIEWER' | 'EDITOR') {
  if (itemType !== 'folder') return;
  
  const oldRole = existingUserRoles[userId] || 'VIEWER';
  
  // Jika role sama dengan existing dan tidak ada pending, hapus dari pending
  if (newRole === oldRole && !pendingUserRoles[userId]) {
    const newPending = { ...pendingUserRoles };
    delete newPending[userId];
    pendingUserRoles = newPending;
    return;
  }
  
  // Update pending roles
  pendingUserRoles = { ...pendingUserRoles, [userId]: newRole };
}

// ✅ NEW: Function untuk save role changes ke API (dipanggil saat handleShare)
async function handleUpdateUserRoles(): Promise<boolean> {
  if (itemType !== 'folder' || Object.keys(pendingUserRoles).length === 0) return true;
  
  try {
    isLoading = true;
    errorMessage = '';
    
    // Collect users dengan pending role changes
    const usersWithRoles = Object.entries(pendingUserRoles).map(([userId, role]) => ({ 
      userId, 
      role 
    }));
    
    const res = await storageService.shareFolder(itemId, { 
      targetUsers: usersWithRoles 
    });
    
    if (!res?.success) throw new Error(res?.message || 'Failed to update user roles');
    
    // ✅ Merge pending ke existing setelah sukses
    existingUserRoles = { ...existingUserRoles, ...pendingUserRoles };
    pendingUserRoles = {}; // Clear pending
    
    return true;
  } catch (err: any) {
    console.error('❌ Role update failed:', err);
    errorMessage = err.message || 'Failed to update user role';
    showToastFeedback(errorMessage, 'error');
    return false;
  } finally { 
    isLoading = false; 
  }
}

  // ── 🔀 MAIN HANDLERS (Route to correct API) ───────────────
  async function handleUpdatePrivacy() {
    if (privacyLevel === currentPrivacy) return true;
    try {
      isUpdatingPrivacy = true;
      errorMessage = '';
      const success = itemType === 'document' ? await updateDocumentPrivacy(privacyLevel) : await updateFolderPrivacy(privacyLevel);
      if (!success) throw new Error('Privacy update failed');
      successMessage = `Privacy updated to ${privacyConfig[privacyLevel].label}`;
      onShared?.();
      return true;
    } catch (err: any) {
      console.error('Privacy update failed:', err);
      errorMessage = err.message || 'Failed to update privacy settings';
      showToastFeedback(errorMessage, 'error');
      privacyLevel = currentPrivacy;
      return false;
    } finally { isUpdatingPrivacy = false; }
  }
  async function handleShareToUsers() {
    if (selectedUsers.length === 0) return true;
    try {
      isLoading = true;
      errorMessage = '';
      const success = itemType === 'document'
        ? await shareDocumentToUsers(selectedUsers)
        : await shareFolderToUsers(selectedUsers.map(userId => ({ userId, role: getUserRole(userId) })));
      if (!success) throw new Error('Share failed');
      successMessage = `Shared with ${selectedUsers.length} user(s)`;
      await loadExistingShares();
      selectedUsers = []; userRoles = {};
      return true;
    } catch (err: any) {
      console.error('Share failed:', err);
      errorMessage = err.message || 'Failed to share';
      showToastFeedback(errorMessage, 'error');
      return false;
    } finally { isLoading = false; }
  }
  async function executeRevokeAccess(userId: string, username: string): Promise<boolean> {
    try {
      isRevokingAccess = userId;
      const success = itemType === 'document' ? await revokeDocumentAccess(userId) : await revokeFolderAccess(userId);
      if (!success) throw new Error('Failed to revoke access');
      existingSharedUsers = existingSharedUsers.filter(u => u.id !== userId);
      if (itemType === 'folder') { const nr = { ...existingUserRoles }; delete nr[userId]; existingUserRoles = nr; }
      showToastFeedback(`Access revoked for ${username}`);
      if (existingSharedUsers.length === 0 && privacyLevel === 'SPECIFIC_USER') {
        privacyLevel = 'PRIVATE';
        successMessage = 'Access revoked. Privacy status auto-reset to Private.';
      }
      onShared?.();
      return true;
    } catch (err: any) {
      console.error('Revoke failed:', err);
      showToastFeedback(err.message || 'Failed to revoke access', 'error');
      return false;
    } finally { isRevokingAccess = null; }
  }
  async function handleShare() {
    let success = true;
    const isAddingNewUsersToSpecific = privacyLevel === 'SPECIFIC_USER' && selectedUsers.length > 0;

    if (privacyLevel !== currentPrivacy) {
      if (!isAddingNewUsersToSpecific) {
        success = await handleUpdatePrivacy();
        if (!success) return;
      }
    }
    if (isAddingNewUsersToSpecific) {
      success = await handleShareToUsers();
      if (!success) return;
    }
    if (itemType === 'folder' && Object.keys(pendingUserRoles).length > 0) {
      success = await handleUpdateUserRoles();
      if (!success) return;
    }
    if (success) {
      if (!successMessage) successMessage = 'Settings updated successfully';
      onShared?.();
      setTimeout(() => onClose(), 1500);
    }
  }
  async function handleCopyOrShareLink() {
    try {
      const shareUrl = `${window.location.origin}/storage/shared/${itemId}`;
      if (navigator.share && privacyLevel !== 'PRIVATE') {
        await navigator.share({ title: itemName, text: `Check out this ${itemType}: ${itemName}`, url: shareUrl });
        showToastFeedback('🔗 Link shared!');
      } else {
        await navigator.clipboard.writeText(shareUrl);
        showToastFeedback('🔗 Link copied to clipboard!');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const shareUrl = `${window.location.origin}/storage/shared/${itemId}`;
        await navigator.clipboard.writeText(shareUrl);
        showToastFeedback('🔗 Link copied (fallback)');
      }
    }
  }

  // ── Revoke Modal Functions (DECLARED ONLY ONCE) ────────────
  function showRevokeConfirmModal(username: string, userId: string): Promise<boolean> {
    return new Promise((resolve) => {
      revokeTarget = { id: userId, username };
      showRevokeModal = true;
      revokeResolve = resolve;
    });
  }
  async function handleRevokeConfirm() {
    if (!revokeTarget) return;
    showRevokeModal = false;
    if (revokeResolve) { revokeResolve(true); revokeResolve = null; }
    await executeRevokeAccess(revokeTarget.id, revokeTarget.username);
    revokeTarget = null;
  }
  function handleRevokeCancel() {
    showRevokeModal = false;
    if (revokeResolve) { revokeResolve(false); revokeResolve = null; }
    revokeTarget = null;
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-[10000] flex items-center justify-center p-4" role="dialog" aria-modal="true" onkeydown={handleKeydown}>
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" transition:fade={{ duration: 200 }} onclick={closeModal}></div>
    <div class="relative bg-[#1a1a1e] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" transition:fly={{ y: 20, duration: 250, easing: cubicOut }}>
      
    <!-- Header -->
<div class="flex items-center justify-between p-4 border-b border-white/10">
  <!-- Left: Icon + Title -->
  <div class="flex items-center gap-3 min-w-0">
    
    <!-- Icon Container -->
    <div class="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
      {#if itemType === 'folder'}
        <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
      {:else}
        <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
      {/if}
    </div>
    
    <!-- Title Section -->
    <div class="min-w-0">
      <h3 id="share-modal-title" class="text-lg font-semibold text-white truncate">
        {itemName}
      </h3>
      <p class="text-xs text-gray-500 capitalize">
        {itemType} sharing settings
      </p>
    </div>
  </div>
  
  <!-- Right: Close Button -->
  <button 
    onclick={closeModal} 
    class="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex-shrink-0" 
    aria-label="Close modal"
    title="Close"
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
    </svg>
  </button>
</div>

      <!-- Body -->
      <div class="p-4 space-y-5 max-h-[70vh] overflow-y-auto">

        <!-- Privacy Level Dropdown -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Visibility</label>
          <div class="relative" bind:this={dropdownRef}>
            <button onclick={toggleDropdown} class="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50" aria-haspopup="listbox" aria-expanded={isDropdownOpen}>
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br {currentConfig.gradient} {currentConfig.color}">{@html currentConfig.icon}</div>
                <div class="text-left min-w-0">
                  <span class="text-sm font-medium text-white block">{currentConfig.label}</span>
                  <span class="text-xs text-gray-500 block truncate">{currentConfig.description}</span>
                </div>
              </div>
              <svg class="w-5 h-5 text-gray-400 transition-transform duration-200 {isDropdownOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </button>
            {#if isDropdownOpen}
              <div style="position: fixed; top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; width: {dropdownPosition.width}px; z-index: 10001; max-height: 300px; overflow-y: auto;" transition:fly={{ y: -8, duration: 150, easing: cubicOut }} class="bg-[#1a1a1e] border border-white/10 rounded-xl shadow-2xl py-1" role="listbox" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); isDropdownOpen = false; } }} tabindex="-1">
                {#each Object.entries(privacyConfig) as [level, config]}
                  <button onclick={(e) => { e.stopPropagation(); selectPrivacy(level as PrivacyLevel); }} class="w-full flex items-center gap-3 px-4 py-3 text-left {privacyLevel === level ? 'bg-blue-500/10 border-l-2 border-blue-500' : 'hover:bg-white/5'} transition-all duration-150" role="option" aria-selected={privacyLevel === level}>
                    <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br {config.gradient} {config.color}">{@html config.icon}</div>
                    <div class="flex-1 min-w-0"><span class="text-sm font-medium text-white block">{config.label}</span><span class="text-xs text-gray-500 block">{config.description}</span></div>
                    {#if privacyLevel === level}<svg class="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>{/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <!-- People with Access Section -->
{#if privacyLevel === 'SPECIFIC_USER' || existingSharedUsers.length > 0}
  <div class="space-y-4 pt-2">
    <!-- Section Header with Gradient Border -->
    <div class="relative">
      <div class="absolute inset-0 bg-gradient-to-r from-violet-500/20 via-purple-500/10 to-transparent blur-xl opacity-50"></div>
      <div class="relative flex items-center justify-between py-3 border-b border-white/10">
        <div class="flex items-center gap-2.5">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 text-violet-300 ring-1 ring-violet-500/30">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" stroke-width="2" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <div>
            <h4 class="text-sm font-semibold text-white">
              {privacyLevel === 'SPECIFIC_USER' ? 'People with access' : 'Shared with'}
            </h4>
            <p class="text-[10px] text-gray-500">
              {privacyLevel === 'SPECIFIC_USER' ? 'Manage who can view this item' : 'Users who have access'}
            </p>
          </div>
        </div>
        {#if existingSharedUsers.length > 0}
          <span class="inline-flex items-center px-2.5 py-1 rounded-full bg-gradient-to-r from-violet-500/20 to-purple-500/20 border border-violet-500/30 text-xs font-medium text-violet-200">
            {existingSharedUsers.length}
            <span class="ml-1 text-gray-400">{existingSharedUsers.length === 1 ? 'user' : 'users'}</span>
          </span>
        {/if}
      </div>
    </div>
    
    {#if existingSharedUsers.length > 0}
      <!-- Users List with Modern Cards -->
      <div class="space-y-2 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
        {#each existingSharedUsers as user, index}
  <div 
    transition:fly={{ y: 8, duration: 150, easing: cubicOut, delay: index * 30 }}
    class="group relative flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5 hover:border-violet-500/30 hover:from-white/[0.06] hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-200"
  >
    <!-- Animated Background Glow on Hover -->
    <div class="absolute inset-0 bg-gradient-to-r from-violet-500/5 to-purple-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"></div>
    
    <!-- Avatar with Status Ring -->
    <div class="relative flex-shrink-0">
      <div class="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center ring-2 ring-white/10 group-hover:ring-violet-400/50 transition-all shadow-lg shadow-violet-900/20">
        {#if user.avatarUrl}
          <img 
            src={user.avatarUrl} 
            alt={user.username}
            class="w-full h-full rounded-full object-cover"
            onerror={(e) => handleAvatarError(e, user.username)}
          />
        {:else}
          <span class="text-sm font-bold text-white drop-shadow-sm">
            {getUserInitial(user.username)}
          </span>
        {/if}
      </div>
      <!-- Online Indicator -->
      <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#1a1a1e] ring-1 ring-black/20" title="Active"></span>
    </div>
    
    <!-- User Info -->
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <p class="text-sm font-semibold text-white truncate group-hover:text-violet-100 transition-colors">
          {user.username}
        </p>
      </div>
      <!-- Wallet Address -->
      <div class="flex items-center gap-2">
        <p class="text-[10px] text-gray-500 font-mono bg-white/5 px-2 py-0.5 rounded truncate max-w-[180px]">
          {user.walletAddress?.slice(0, 6)}...{user.walletAddress?.slice(-4)}
        </p>
        {#if user.walletAddress}
          <button 
            onclick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(user.walletAddress);
              showToastFeedback('Wallet address copied!');
            }}
            class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-all"
            title="Copy wallet address"
          >
            <svg class="w-3 h-3 text-gray-500 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
          </button>
        {/if}
      </div>
    </div>

    <!-- Right Side Actions: Role Dropdown + Revoke Button -->
    <div class="flex items-center gap-2 flex-shrink-0">
      {#if itemType === 'folder'}
  <!-- Modern Role Dropdown -->
  <div class="relative inline-flex items-center">
    <select
      value={existingUserRoles[user.id] || 'VIEWER'}
      onchange={(e) => handleUserRoleChange(user.id, e.currentTarget.value as 'VIEWER' | 'EDITOR')}
      disabled={isUpdatingRole === user.id}
      class="appearance-none h-7 pl-3 pr-6 rounded-full text-[10px] font-semibold bg-white/5 border border-white/10 text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 cursor-pointer hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed {existingUserRoles[user.id] === 'EDITOR' ? 'role-badge editor' : 'role-badge viewer'}"
      title="Change access role"
      style="min-width: 72px;"
    >
      <option value="VIEWER" class="bg-[#1a1a1e] text-gray-300">Viewer</option>
      <option value="EDITOR" class="bg-[#1a1a1e] text-violet-300">Editor</option>
    </select>
    
    <!-- Custom Arrow Icon - Properly Positioned -->
    <div class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center">
      <svg class="w-2.5 h-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
      </svg>
    </div>
  </div>
{/if}
      
      <!-- Revoke Button with Tooltip -->
      <button
        onclick={() => showRevokeConfirmModal(user.username, user.id)}
        disabled={isRevokingAccess === user.id || isUpdatingRole === user.id}
        class="relative p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 hover:shadow-[0_0_20px_rgba(248,113,113,0.2)] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed group/revoke"
        title="Revoke access"
        aria-label={`Revoke access for ${user.username}`}
      >
        {#if isRevokingAccess === user.id || isUpdatingRole === user.id}
          <svg class="w-4 h-4 animate-spin text-red-400" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        {:else}
          <svg class="w-4 h-4 group-hover/revoke:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        {/if}
      </button>
    </div>
  </div>
{/each}
      </div>
    {:else if privacyLevel === 'SPECIFIC_USER'}
     
    {/if}
  </div>
{/if}
        <!-- User Search Section (Only for SPECIFIC_USER) -->
        {#if privacyLevel === 'SPECIFIC_USER'}
          <div class="space-y-3 pt-2 border-t border-white/10" transition:fly={{ y: 20, duration: 200, easing: cubicOut }}>
            {#if selectedUsers.length > 0}
              <div>
                <p class="text-xs font-medium text-gray-400 mb-2">Will share with:</p>
                <div class="flex flex-wrap gap-2">
                  {#each selectedUsers as userId}
                    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/20 text-violet-300 text-xs rounded-full border border-violet-500/30">
                      <div class="w-4 h-4 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-[8px] font-bold text-white">
                        {getUserName(userId).charAt(0).toUpperCase()}
                      </div>
                      <span class="truncate max-w-[100px]">{getUserName(userId)}</span>
                      {#if itemType === 'folder'}
                        <select 
                          value={getUserRole(userId)} 
                          onchange={(e) => setUserRole(userId, e.currentTarget.value as 'VIEWER' | 'EDITOR')}
                          class="text-[9px] bg-white/10 hover:bg-white/20 border border-white/20 rounded px-1.5 py-0.5 text-violet-200 focus:outline-none cursor-pointer transition-colors"
                        >
                          <option value="VIEWER" class="bg-[#1a1a1e] text-gray-300">Viewer</option>
                          <option value="EDITOR" class="bg-[#1a1a1e] text-violet-300">Editor</option>
                        </select>
                      {/if}
                      <button onclick={() => removeSelectedUser(userId)} class="hover:text-white transition-colors ml-0.5" aria-label="Remove {getUserName(userId)}">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </span>
                  {/each}
                </div>
              </div>
            {/if}
            <div class="relative"><input type="text" bind:value={searchQuery} placeholder="Search users by username or wallet..." class="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all" autocomplete="off"/>{#if isSearching}<div class="absolute right-3 top-1/2 -translate-y-1/2"><div class="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div></div>{/if}</div>
            {#if searchResults.length > 0}
              <div class="border border-white/10 rounded-lg max-h-40 overflow-y-auto">
                {#each searchResults as user (user.id)}
                  <button onclick={() => toggleUser(user.id)} class="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left">
                    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-xs font-medium text-white flex-shrink-0 overflow-hidden">
                      {#if user.avatarUrl}
                        <img src={user.avatarUrl} alt={user.username} class="w-full h-full object-cover" onerror={(e) => handleAvatarError(e, user.username)} />
                      {:else}
                        {getUserInitial(user.username)}
                      {/if}
                    </div>
                    <div class="min-w-0 flex-1"><p class="text-sm font-medium text-white truncate">{user.username}</p><p class="text-xs text-gray-500 truncate">{user.walletAddress}</p></div>
                    {#if itemType === 'folder' && selectedUsers.includes(user.id)}<select value={getUserRole(user.id)} oninput={(e) => setUserRole(user.id, e.currentTarget.value as 'VIEWER' | 'EDITOR')} onclick={(e) => e.stopPropagation()} class="text-xs bg-violet-500/20 border border-violet-500/30 rounded px-2 py-1 text-violet-200 focus:outline-none focus:ring-1 focus:ring-violet-400 cursor-pointer hover:bg-violet-500/30 transition-colors"><option value="VIEWER" class="bg-[#1a1a1e]">Viewer</option><option value="EDITOR" class="bg-[#1a1a1e]">Editor</option></select>{/if}
                    {#if selectedUsers.includes(user.id)}<svg class="w-5 h-5 text-violet-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>{:else}<svg class="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>{/if}
                  </button>
                {/each}
              </div>
            {:else if searchQuery.trim().length >= 2 && !isSearching}<p class="text-sm text-gray-500 text-center py-2">No users found</p>{/if}
          </div>
        {/if}

        <!-- Messages -->
        {#if errorMessage}<div class="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-start gap-2" role="alert"><svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>{errorMessage}</span></div>{/if}
        {#if successMessage}<div class="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400 flex items-start gap-2" role="status"><svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg><span>{successMessage}</span></div>{/if}
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between p-4 border-t border-white/10 bg-[#151518]">
        {#if canShowLinkButton}<button onclick={handleCopyOrShareLink} disabled={isLoading || isUpdatingPrivacy} class="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title={privacyLevel === 'LINK_ONLY' ? 'Copy share link' : 'Share publicly'}><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>{privacyLevel === 'LINK_ONLY' ? 'Copy Link' : 'Share'}</button>{:else}<div></div>{/if}
        <div class="flex items-center gap-3">
          <button onclick={closeModal} disabled={isLoading || isUpdatingPrivacy} class="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50">Cancel</button>
          <button onclick={handleShare} disabled={isLoading || isUpdatingPrivacy || (privacyLevel === 'SPECIFIC_USER' && selectedUsers.length === 0 && privacyLevel !== currentPrivacy)} class="px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-lg transition-all duration-200 flex items-center gap-2 shadow-lg shadow-blue-500/20 disabled:shadow-none">{#if isLoading || isUpdatingPrivacy}<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Saving...{:else}<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>Save Changes{/if}</button>
        </div>
      </div>

      {#if showToast}<div transition:fly={{ y: 20, duration: 200, easing: cubicOut }} class="absolute bottom-20 left-1/2 -translate-x-1/2 px-4 py-2.5 bg-[#1a1a1e] border border-white/10 rounded-xl shadow-2xl text-sm text-white flex items-center gap-2 z-[10002]" role="status"><svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>{toastMessage}</div>{/if}
    </div>
  </div>
  
  <RevokeConfirmModal isOpen={showRevokeModal} username={revokeTarget?.username || ''} itemType={itemType} isProcessing={isRevokingAccess === revokeTarget?.id} onConfirm={handleRevokeConfirm} onCancel={handleRevokeCancel}/>
{/if}