<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { storageService } from '$lib/services/storage/storage';
  import type { PrivacyLevel, ShareableUser } from '$lib/types/storage';

  type Target = { id: string; type: 'folder' | 'document'; name: string; privacy: PrivacyLevel };
  type FolderRole = 'VIEWER' | 'EDITOR';

  let {
    isOpen,
    targets = [],
    onClose,
    onCompleted
  }: {
    isOpen: boolean;
    targets: Target[];
    onClose: () => void;
    onCompleted: (message: string) => void;
  } = $props();

  let targetPrivacy = $state<Record<string, PrivacyLevel>>({});
  let applyAllPrivacy = $state<PrivacyLevel>('PRIVATE');
  let accessMode = $state<'all' | 'individual'>('all');
  let activeTargetId = $state<string | null>(null);
  let searchQuery = $state('');
  let searchResults = $state<ShareableUser[]>([]);
  let globalUsers = $state<ShareableUser[]>([]);
  let globalRoles = $state<Record<string, FolderRole>>({});
  let targetUsers = $state<Record<string, ShareableUser[]>>({});
  let targetRoles = $state<Record<string, Record<string, FolderRole>>>({});
  let isSearching = $state(false);
  let isProcessing = $state(false);
  let errorMessage = $state('');
  let isDropdownOpen = $state(false);
  let openItemDropdown = $state<string | null>(null);
  let dropdownPosition = $state({ top: 0, left: 0, width: 0 });
  let itemDropdownPositions = $state<Record<string, { top: number; left: number; width: number }>>({});
  let searchTimeout: ReturnType<typeof setTimeout>;
  let dropdownRef: HTMLDivElement | undefined;

  const privacyConfig: Record<PrivacyLevel, { icon: string; label: string; description: string; color: string; gradient: string }> = {
    PRIVATE: {
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>`,
      label: 'Private', description: 'Only owners can access', color: 'text-gray-400', gradient: 'from-gray-500/20 to-slate-500/20'
    },
    PUBLIC: {
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
      label: 'Public', description: 'Anyone can view & download', color: 'text-emerald-400', gradient: 'from-emerald-500/20 to-green-500/20'
    },
    LINK_ONLY: {
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
      label: 'Link Only', description: 'Only people with the link', color: 'text-blue-400', gradient: 'from-blue-500/20 to-cyan-500/20'
    },
    SPECIFIC_USER: {
      icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      label: 'Specific Users', description: 'Share with selected people only', color: 'text-violet-400', gradient: 'from-violet-500/20 to-purple-500/20'
    }
  };

  const folderCount = $derived(targets.filter(t => t.type === 'folder').length);
  const documentCount = $derived(targets.filter(t => t.type === 'document').length);
  const hasMixed = $derived(folderCount > 0 && documentCount > 0);
  const specificTargets = $derived(targets.filter(t => getTargetPrivacy(t.id) === 'SPECIFIC_USER'));
  const activeTarget = $derived(targets.find(t => t.id === activeTargetId) || specificTargets[0] || null);
  const hasSpecific = $derived(specificTargets.length > 0);
  const hasSpecificFolders = $derived(specificTargets.some(t => t.type === 'folder'));

  $effect(() => {
    if (!isOpen) return;
    targetPrivacy = Object.fromEntries(targets.map(target => [target.id, target.privacy]));
    applyAllPrivacy = 'PRIVATE';
    activeTargetId = targets.find(target => target.privacy === 'SPECIFIC_USER')?.id ?? targets[0]?.id ?? null;
    accessMode = 'all';
    searchQuery = '';
    searchResults = [];
    globalUsers = [];
    globalRoles = {};
    targetUsers = {};
    targetRoles = {};
    errorMessage = '';
    isDropdownOpen = false;
    openItemDropdown = null;
  });

  $effect(() => {
    if (!isDropdownOpen && !openItemDropdown) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
        isDropdownOpen = false;
        openItemDropdown = null;
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  });

  function initial(username?: string) { return username?.charAt(0).toUpperCase() || '?'; }
  function icon(type: Target['type']) {
    if (type === 'folder') {
      return `<svg class="w-7 h-7 drop-shadow-sm" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="folderGradBulk" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f59e0b" />
            <stop offset="50%" stop-color="#f97316" />
            <stop offset="100%" stop-color="#ea580c" />
          </linearGradient>
          <linearGradient id="folderGrad2Bulk" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="white" stop-opacity="0.4" />
            <stop offset="50%" stop-color="white" stop-opacity="0.1" />
            <stop offset="100%" stop-color="white" stop-opacity="0" />
          </linearGradient>
          <filter id="folderGlowBulk" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feFlood flood-color="#f59e0b" flood-opacity="0.3" result="glowColor" />
            <feComposite in="glowColor" in2="blur" operator="in" result="softGlow" />
            <feMerge>
              <feMergeNode in="softGlow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d="M15 30 C15 25, 20 20, 25 20 L40 20 L48 28 L85 28 C90 28, 95 33, 95 38 L95 80 C95 85, 90 90, 85 90 L15 90 C10 90, 5 85, 5 80 L5 30 Z" fill="url(#folderGradBulk)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" filter="url(#folderGlowBulk)" />
        <path d="M25 20 L40 20 L48 28 L38 28 C33 28, 28 25, 25 20 Z" fill="url(#folderGradBulk)" stroke="rgba(255,255,255,0.4)" stroke-width="1" />
        <path d="M15 30 C15 25, 20 20, 25 20 L40 20 L48 28 L85 28 C90 28, 95 33, 95 38 L95 80 C95 85, 90 90, 85 90 L15 90 C10 90, 5 85, 5 80 L5 30 Z" fill="url(#folderGrad2Bulk)" class="opacity-60" />
        <path d="M18 32 C18 28, 22 24, 26 24 L39 24 L46 30 L83 30 C87 30, 91 34, 91 38 L91 78 C91 82, 87 86, 83 86 L18 86 C14 86, 10 82, 10 78 L10 32 Z" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.8" />
        <g class="opacity-70">
          <rect x="24" y="48" width="52" height="6" rx="1.5" fill="white" fill-opacity="0.15" />
          <rect x="28" y="57" width="44" height="6" rx="1.5" fill="white" fill-opacity="0.1" />
        </g>
        <g class="opacity-80">
          <circle cx="76" cy="36" r="1.5" fill="white" fill-opacity="0.6" />
        </g>
      </svg>`;
    } else {
      return `<svg class="w-5 h-5 drop-shadow-sm" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="url(#docGrad)" stroke="rgba(59, 130, 246, 0.6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="14 2 14 8 20 8" fill="rgba(96, 165, 250, 0.3)" stroke="rgba(96, 165, 250, 0.6)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="8" y1="13" x2="16" y2="13" stroke="rgba(191, 219, 254, 0.8)" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="8" y1="17" x2="16" y2="17" stroke="rgba(191, 219, 254, 0.6)" stroke-width="1.2" stroke-linecap="round"/>
        <defs>
          <linearGradient id="docGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#60a5fa" stop-opacity="0.2"/>
          </linearGradient>
        </defs>
      </svg>`;
    }
  }
  function getTargetPrivacy(id: string): PrivacyLevel {
    return accessMode === 'all' ? applyAllPrivacy : (targetPrivacy[id] || targets.find(t => t.id === id)?.privacy || 'PRIVATE');
  }
  function setTargetPrivacy(id: string, privacy: PrivacyLevel) { targetPrivacy = { ...targetPrivacy, [id]: privacy }; }
  function calculateDropdownPosition(element: HTMLElement): { top: number; left: number; width: number } {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 250;
    const spacing = 8;
    const spaceBelow = viewportHeight - rect.bottom;
    let positionTop = spaceBelow < dropdownHeight
      ? Math.max(rect.top - dropdownHeight - spacing, 8)
      : rect.bottom + spacing;
    let positionLeft = Math.max(rect.left, 16);
    return { top: positionTop, left: positionLeft, width: rect.width };
  }
  function toggleDropdown() {
    isDropdownOpen = !isDropdownOpen;
    if (isDropdownOpen && dropdownRef) {
      setTimeout(() => {
        if (dropdownRef) dropdownPosition = calculateDropdownPosition(dropdownRef);
      }, 0);
    }
  }
  function toggleItemDropdown(itemId: string, event: MouseEvent) {
    const newState = openItemDropdown === itemId ? null : itemId;
    openItemDropdown = newState;
    if (newState && event.currentTarget instanceof HTMLElement) {
      const element = event.currentTarget as HTMLElement;
      itemDropdownPositions = { ...itemDropdownPositions, [itemId]: calculateDropdownPosition(element) };
    }
  }
  function selectApplyAllPrivacy(level: PrivacyLevel) {
    applyAllPrivacy = level;
    isDropdownOpen = false;
  }
  function selectItemPrivacy(itemId: string, level: PrivacyLevel) {
    setTargetPrivacy(itemId, level);
    openItemDropdown = null;
  }
  function getGlobalRole(userId: string): FolderRole { return globalRoles[userId] || 'VIEWER'; }
  function setGlobalRole(userId: string, role: FolderRole) { globalRoles = { ...globalRoles, [userId]: role }; }
  function usersForTarget(targetId: string) { return targetUsers[targetId] || []; }
  function roleForTarget(targetId: string, userId: string): FolderRole { return targetRoles[targetId]?.[userId] || 'VIEWER'; }
  function setRoleForTarget(targetId: string, userId: string, role: FolderRole) {
    targetRoles = { ...targetRoles, [targetId]: { ...(targetRoles[targetId] || {}), [userId]: role } };
  }

  function toggleGlobalUser(user: ShareableUser) {
    if (globalUsers.some(u => u.id === user.id)) {
      globalUsers = globalUsers.filter(u => u.id !== user.id);
      const roles = { ...globalRoles };
      delete roles[user.id];
      globalRoles = roles;
      return;
    }
    globalUsers = [...globalUsers, user];
    if (hasSpecificFolders) setGlobalRole(user.id, 'VIEWER');
  }

  function toggleTargetUser(targetId: string, user: ShareableUser) {
    const current = usersForTarget(targetId);
    if (current.some(u => u.id === user.id)) {
      targetUsers = { ...targetUsers, [targetId]: current.filter(u => u.id !== user.id) };
      const roles = { ...(targetRoles[targetId] || {}) };
      delete roles[user.id];
      targetRoles = { ...targetRoles, [targetId]: roles };
      return;
    }
    targetUsers = { ...targetUsers, [targetId]: [...current, user] };
    if (targets.find(t => t.id === targetId)?.type === 'folder') setRoleForTarget(targetId, user.id, 'VIEWER');
  }

  function missingSpecificTargets() {
    if (!hasSpecific) return [];
    if (accessMode === 'all') return globalUsers.length === 0 ? ['all'] : [];
    return specificTargets.filter(t => usersForTarget(t.id).length === 0).map(t => t.name);
  }

  async function performSearch() {
    if (searchQuery.trim().length < 2) { searchResults = []; return; }
    try {
      isSearching = true;
      errorMessage = '';
      const exclude = accessMode === 'all'
        ? globalUsers.map(user => user.id)
        : activeTarget ? usersForTarget(activeTarget.id).map(user => user.id) : [];
      const res = await storageService.searchUsersForShare(searchQuery, { excludeSharedUserIds: exclude });
      searchResults = res.success ? res.data.users : [];
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Gagal mencari user.';
    } finally {
      isSearching = false;
    }
  }

  function handleSearchInput() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => void performSearch(), 300);
  }

  async function save() {
    const missing = missingSpecificTargets();
    if (missing.length > 0) {
      errorMessage = accessMode === 'all' ? 'Pilih minimal satu user untuk Specific Users.' : `Pilih minimal satu user untuk: ${missing.join(', ')}`;
      return;
    }

    const folders = targets.filter(t => t.type === 'folder');
    const documents = targets.filter(t => t.type === 'document');
    const specificFolders = folders.filter(t => getTargetPrivacy(t.id) === 'SPECIFIC_USER');
    const specificDocuments = documents.filter(t => getTargetPrivacy(t.id) === 'SPECIFIC_USER');

    try {
      isProcessing = true;
      errorMessage = '';

      if (documents.length > 0) {
        await storageService.updateDocumentsPrivacy(documents.map(target => ({ documentId: target.id, newPrivacy: getTargetPrivacy(target.id) })));
      }
      if (folders.length > 0) {
        await Promise.all(folders.map(target => storageService.updateFolderPrivacy(target.id, { newPrivacy: getTargetPrivacy(target.id) })));
      }
      if (specificDocuments.length > 0) {
        await storageService.shareDocuments(specificDocuments.map(target => ({
          documentId: target.id,
          targetUsers: accessMode === 'all' ? globalUsers.map(user => user.id) : usersForTarget(target.id).map(user => user.id)
        })));
      }
      if (specificFolders.length > 0) {
        await storageService.shareFolders(specificFolders.map(target => {
          const users = accessMode === 'all' ? globalUsers : usersForTarget(target.id);
          return {
            itemId: target.id,
            itemType: 'folder' as const,
            targetUsers: users.map(user => ({
              userId: user.id,
              role: accessMode === 'all' ? getGlobalRole(user.id) : roleForTarget(target.id, user.id)
            }))
          };
        }));
      }

      onCompleted(`${targets.length} item berhasil diupdate.`);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Gagal mengupdate share item.';
    } finally {
      isProcessing = false;
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-[10000] flex items-center justify-center p-4" role="dialog" aria-modal="true" transition:fade>
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={onClose}></div>
    <div class="relative bg-[#1a1a1e] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden" in:scale>
      <div class="flex items-center justify-between p-4 border-b border-white/10 bg-gradient-to-br from-violet-600/10 via-white/[0.03] to-transparent">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center text-violet-300 shrink-0">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <div class="min-w-0">
            <h3 class="text-lg font-semibold text-white truncate">Bulk Share</h3>
            <p class="text-xs text-gray-500">{folderCount} folder · {documentCount} document</p>
          </div>
        </div>
        <button onclick={onClose} class="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" disabled={isProcessing} aria-label="Close">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="p-4 space-y-5 max-h-[72vh] overflow-y-auto">
        <section>
          <label class="block text-sm font-medium text-gray-300 mb-2">Share mode</label>
          <div class="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.03] p-1 border border-white/10">
            <button onclick={() => accessMode = 'all'} class="px-4 py-2.5 rounded-lg text-sm font-semibold transition-all {accessMode === 'all' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}" disabled={isProcessing}>
              <div class="flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Apply to all
              </div>
            </button>
            <button onclick={() => accessMode = 'individual'} class="px-4 py-2.5 rounded-lg text-sm font-semibold transition-all {accessMode === 'individual' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}" disabled={isProcessing}>
              <div class="flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                Individual
              </div>
            </button>
          </div>
        </section>

        {#if accessMode === 'all'}
          <section>
            <label class="block text-sm font-medium text-gray-300 mb-2">Privacy</label>
            <div class="relative" bind:this={dropdownRef}>
              <button onclick={toggleDropdown} class="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all" disabled={isProcessing}>
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br {privacyConfig[applyAllPrivacy].gradient} {privacyConfig[applyAllPrivacy].color}">{@html privacyConfig[applyAllPrivacy].icon}</div>
                  <div class="text-left min-w-0">
                    <span class="text-sm font-medium text-white block">{privacyConfig[applyAllPrivacy].label}</span>
                    <span class="text-xs text-gray-500 block truncate">{privacyConfig[applyAllPrivacy].description}</span>
                  </div>
                </div>
                <svg class="w-5 h-5 text-gray-400 transition-transform {isDropdownOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>
              {#if isDropdownOpen}
                <div style="position: fixed; top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; width: {dropdownPosition.width}px; z-index: 10001; max-height: 300px; overflow-y: auto;" class="bg-[#1a1a1e] border border-white/10 rounded-xl shadow-2xl py-1">
                  {#each Object.entries(privacyConfig) as [level, config]}
                    <button onclick={() => selectApplyAllPrivacy(level as PrivacyLevel)} class="w-full flex items-center gap-3 px-4 py-3 text-left {applyAllPrivacy === level ? 'bg-blue-500/10 border-l-2 border-blue-500' : 'hover:bg-white/5'} transition-all" disabled={isProcessing}>
                      <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br {config.gradient} {config.color}">{@html config.icon}</div>
                      <div class="flex-1 min-w-0"><span class="text-sm font-medium text-white block">{config.label}</span><span class="text-xs text-gray-500 block">{config.description}</span></div>
                      {#if applyAllPrivacy === level}<svg class="w-5 h-5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>{/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </section>
        {:else}
          <section>
            <label class="block text-sm font-medium text-gray-300 mb-2">Privacy</label>
            <div>
              {#each targets as target (target.id)}
                {@const privacy = getTargetPrivacy(target.id)}
                {@const config = privacyConfig[privacy]}
                {@const targetSpecificUsers = usersForTarget(target.id)}
                <div class="border-t border-white/10 first:border-t-0"></div>
                <div class="px-3 py-3 \space-y-3">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">{@html icon(target.type)}</div>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm text-white font-medium truncate">{target.name}</p>
                      <p class="text-[10px] text-gray-500 capitalize">{target.type}</p>
                    </div>
                   </div>
                  <div class="relative">
                    <button onclick={(e) => toggleItemDropdown(target.id, e)} class="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left" disabled={isProcessing}>
                      <div class="flex items-center gap-2 min-w-0">
                        <span class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br {config.gradient} {config.color}">{@html config.icon}</span>
                        <span class="text-[11px] text-gray-200 font-bold truncate">{config.label}</span>
                      </div>
                      <svg class="w-4 h-4 text-gray-400 transition-transform shrink-0 {openItemDropdown === target.id ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    {#if openItemDropdown === target.id && itemDropdownPositions[target.id]}
                      <div style="position: fixed; top: {itemDropdownPositions[target.id].top}px; left: {itemDropdownPositions[target.id].left}px; width: {itemDropdownPositions[target.id].width}px; z-index: 10001; max-height: 250px; overflow-y: auto;" class="bg-[#1a1a1e] border border-white/10 rounded-xl shadow-2xl py-1">
                        {#each Object.entries(privacyConfig) as [level, option]}
                          <button onclick={() => selectItemPrivacy(target.id, level as PrivacyLevel)} class="w-full flex items-center gap-3 px-4 py-3 text-left {privacy === level ? 'bg-blue-500/10 border-l-2 border-blue-500' : 'hover:bg-white/5'} transition-all" disabled={isProcessing}>
                            <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br {option.gradient} {option.color}">{@html option.icon}</div>
                            <div class="flex-1 min-w-0">
                              <span class="text-sm font-medium text-white block">{option.label}</span>
                              <span class="text-xs text-gray-500 block">{option.description}</span>
                            </div>
                            {#if privacy === level}<svg class="w-5 h-5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>{/if}
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>

                  {#if privacy === 'SPECIFIC_USER'}
                    <div class="space-y-3">
                      <div class="flex items-center gap-2">
                        {#if targetSpecificUsers.length > 0}
                          <span class="ml-auto px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-500/20 to-purple-500/20 border border-violet-500/30 text-[10px] font-medium text-violet-200">{targetSpecificUsers.length}</span>
                        {/if}
                      </div>

                      {#if targetSpecificUsers.length > 0}
                        <div class="space-y-1.5">
                          {#each targetSpecificUsers as user (user.id)}
                            <div class="group flex items-center gap-2.5 p-2.5 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5 hover:border-violet-500/30 hover:from-white/[0.06] hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-200">
                              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-xs font-bold text-white ring-2 ring-white/10 group-hover:ring-violet-400/50 transition-all shadow-lg shadow-violet-900/20 shrink-0 overflow-hidden">
                                {#if user.avatarUrl}
                                  <img src={user.avatarUrl} alt={user.username} class="w-full h-full object-cover" onerror={(e) => { const el = e.target as HTMLImageElement; el.style.display = 'none'; if (el.nextElementSibling) el.nextElementSibling.classList.remove('hidden'); }} />
                                  <span class="hidden text-xs font-bold text-white">{initial(user.username)}</span>
                                {:else}
                                  {initial(user.username)}
                                {/if}
                              </div>
                              <div class="min-w-0 flex-1">
                                <p class="text-xs font-semibold text-white truncate group-hover:text-violet-100 transition-colors">{user.username}</p>
                                <p class="text-[9px] text-gray-500 font-mono bg-white/5 px-1.5 py-0.5 rounded truncate inline-block">{user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}</p>
                              </div>
                              {#if target.type === 'folder'}
                                <select value={roleForTarget(target.id, user.id)} onchange={(e) => setRoleForTarget(target.id, user.id, e.currentTarget.value as FolderRole)} class="text-[10px] bg-white/5 border border-white/10 rounded-full px-2.5 py-1 text-gray-300 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all shrink-0" disabled={isProcessing}>
                                  <option value="VIEWER" class="bg-[#1a1a1e]">Viewer</option>
                                  <option value="EDITOR" class="bg-[#1a1a1e]">Editor</option>
                                </select>
                              {/if}
                              <button onclick={() => toggleTargetUser(target.id, user)} class="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 hover:shadow-[0_0_12px_rgba(248,113,113,0.15)] transition-all duration-200 shrink-0" disabled={isProcessing}><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <div class="flex items-center gap-2 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                          <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                          <p class="text-[10px] text-gray-500">No users selected yet</p>
                        </div>
                      {/if}

                      <div class="relative">
                        <input value={activeTargetId === target.id ? searchQuery : ''} oninput={(e) => { activeTargetId = target.id; searchQuery = e.currentTarget.value; handleSearchInput(); }} onfocus={() => activeTargetId = target.id} class="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 hover:bg-white/[0.07] transition-all" placeholder="Search users..." disabled={isProcessing} autocomplete="off" />
                        {#if isSearching && activeTargetId === target.id}<div class="absolute right-3 top-1/2 -translate-y-1/2"><div class="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div></div>{/if}
                      </div>

                      {#if searchResults.length > 0 && activeTargetId === target.id}
                        <div class="border border-white/10 rounded-xl max-h-36 overflow-y-auto bg-black/20 backdrop-blur-sm">
                          {#each searchResults as user (user.id)}
                            <button onclick={() => toggleTargetUser(target.id, user)} class="w-full flex items-center gap-2.5 p-2.5 hover:bg-white/5 transition-all text-left group" disabled={isProcessing}>
                              <div class="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0 group-hover:scale-110 transition-transform overflow-hidden">
                                {#if user.avatarUrl}
                                  <img src={user.avatarUrl} alt={user.username} class="w-full h-full object-cover" onerror={(e) => { const el = e.target as HTMLImageElement; el.style.display = 'none'; if (el.nextElementSibling) el.nextElementSibling.classList.remove('hidden'); }} />
                                  <span class="hidden text-[10px] font-bold text-white">{initial(user.username)}</span>
                                {:else}
                                  {initial(user.username)}
                                {/if}
                              </div>
                              <div class="min-w-0 flex-1"><p class="text-xs font-semibold text-white truncate group-hover:text-violet-200 transition-colors">{user.username}</p><p class="text-[9px] text-gray-500 truncate">{user.walletAddress}</p></div>
                              {#if targetSpecificUsers.some(u => u.id === user.id)}<svg class="w-4 h-4 text-violet-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>{:else}<svg class="w-4 h-4 text-gray-500 shrink-0 group-hover:text-violet-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>{/if}
                            </button>
                          {/each}
                        </div>
                      {:else if searchQuery.trim().length >= 2 && !isSearching && activeTargetId === target.id}
                        <div class="flex items-center justify-center gap-2 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                          <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                          <p class="text-[10px] text-gray-500">No users found</p>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </section>
        {/if}

        {#if hasSpecific && accessMode === 'all'}
          <section class="space-y-4 pt-2 border-t border-white/10">
            <div>
              <h4 class="text-sm font-semibold text-white">People with access</h4>
              <p class="text-[10px] text-gray-500">
                {accessMode === 'all' ? 'Users will be applied to all items with Specific Users privacy' : 'Select users for each item individually'}
              </p>
            </div>

            {#if accessMode === 'individual'}
              <div class="space-y-2">
                <p class="text-xs font-medium text-gray-400">Choose item:</p>
                <div class="max-h-32 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/5">
                  {#each specificTargets as target (target.id)}
                    <button onclick={() => activeTargetId = target.id} class="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors {activeTarget?.id === target.id ? 'bg-violet-500/10 text-violet-200' : 'text-gray-300'}" disabled={isProcessing}>
                      <span class="flex items-center gap-2 min-w-0"><span>{icon(target.type)}</span><span class="text-xs font-medium truncate">{target.name}</span></span>
                      <span class="text-[10px] text-gray-500">{usersForTarget(target.id).length} user</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            {#if accessMode === 'all' && globalUsers.length > 0}
              <UserRows users={globalUsers} showRole={hasSpecificFolders} getRole={getGlobalRole} setRole={setGlobalRole} removeUser={toggleGlobalUser} {initial} {isProcessing} />
            {:else if accessMode === 'individual' && activeTarget}
              {@const currentUsers = usersForTarget(activeTarget.id)}
              <div>
                <p class="text-xs font-medium text-gray-400 mb-2">Users for {activeTarget.name}:</p>
                {#if currentUsers.length > 0}
                  <UserRows users={currentUsers} showRole={activeTarget.type === 'folder'} getRole={(userId: string) => roleForTarget(activeTarget.id, userId)} setRole={(userId: string, role: FolderRole) => setRoleForTarget(activeTarget.id, userId, role)} removeUser={(user: ShareableUser) => toggleTargetUser(activeTarget.id, user)} {initial} {isProcessing} />
                {:else}
                  <p class="text-xs text-gray-500 mb-2">No users selected for this item.</p>
                {/if}
              </div>
            {/if}

            <div class="relative">
              <input bind:value={searchQuery} oninput={handleSearchInput} class="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all" placeholder={accessMode === 'individual' && activeTarget ? `Search users for ${activeTarget.name}...` : 'Search users by username or wallet...'} disabled={isProcessing || (accessMode === 'individual' && !activeTarget)} autocomplete="off" />
              {#if isSearching}<div class="absolute right-3 top-1/2 -translate-y-1/2"><div class="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div></div>{/if}
            </div>

            {#if searchResults.length > 0}
              <div class="border border-white/10 rounded-lg max-h-44 overflow-y-auto bg-black/10">
                {#each searchResults as user (user.id)}
                  <button onclick={() => accessMode === 'individual' && activeTarget ? toggleTargetUser(activeTarget.id, user) : toggleGlobalUser(user)} class="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left">
                    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-xs font-medium text-white shrink-0 overflow-hidden">{#if user.avatarUrl}<img src={user.avatarUrl} alt={user.username} class="w-full h-full rounded-full object-cover" />{:else}{initial(user.username)}{/if}</div>
                    <div class="min-w-0 flex-1"><p class="text-sm font-medium text-white truncate">{user.username}</p><p class="text-xs text-gray-500 truncate">{user.walletAddress}</p></div>
                    <svg class="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                  </button>
                {/each}
              </div>
            {:else if searchQuery.trim().length >= 2 && !isSearching}
              <p class="text-sm text-gray-500 text-center py-2">No users found</p>
            {/if}
          </section>
        {:else}
         
        {/if}

        {#if errorMessage}
          <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-start gap-2" role="alert"><svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>{errorMessage}</span></div>
        {/if}
      </div>

      <div class="flex items-center justify-between p-4 border-t border-white/10 bg-[#151518]">
        <div class="text-[10px] text-gray-500"></div>
        <div class="flex items-center gap-3">
          <button onclick={onClose} disabled={isProcessing} class="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50">Cancel</button>
          <button onclick={save} disabled={isProcessing || missingSpecificTargets().length > 0} class="px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-lg transition-all duration-200 flex items-center gap-2 shadow-lg shadow-blue-500/20 disabled:shadow-none">
            {#if isProcessing}<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Saving...{:else}<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>Save Changes{/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#snippet UserRows(users: ShareableUser[], showRole: boolean, getRole: (userId: string) => FolderRole, setRole: (userId: string, role: FolderRole) => void, removeUser: (user: ShareableUser) => void, initial: (username?: string) => string, isProcessing: boolean)}
  <div class="space-y-2">
    {#each users as user (user.id)}
      <div class="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5">
        <div class="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden">{#if user.avatarUrl}<img src={user.avatarUrl} alt={user.username} class="w-full h-full rounded-full object-cover" />{:else}{initial(user.username)}{/if}</div>
        <div class="min-w-0 flex-1"><p class="text-sm font-semibold text-white truncate">{user.username}</p><p class="text-[10px] text-gray-500 font-mono truncate">{user.walletAddress}</p></div>
        {#if showRole}
          <div class="relative inline-flex items-center shrink-0">
            <select value={getRole(user.id)} onchange={(event) => setRole(user.id, event.currentTarget.value as FolderRole)} class="appearance-none h-8 pl-3 pr-7 rounded-full text-[10px] font-semibold bg-white/5 border border-white/10 text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 cursor-pointer hover:bg-white/10 hover:text-white transition-all" disabled={isProcessing}>
              <option value="VIEWER" class="bg-[#1a1a1e] text-gray-300">Viewer</option>
              <option value="EDITOR" class="bg-[#1a1a1e] text-violet-300">Editor</option>
            </select>
            <svg class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none w-2.5 h-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
          </div>
        {/if}
        <button onclick={() => removeUser(user)} class="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all" aria-label="Remove {user.username}"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
    {/each}
  </div>
{/snippet}
