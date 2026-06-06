<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { adminService } from '$lib/services/admin/admin';
  import ProfilePreviewModal from '$lib/components/storage/ProfilePreviewModal.svelte';
  import type { AdminUser, AdminPagination } from '$lib/types/admin';

  // ── State ──
  let users = $state<AdminUser[]>([]);
  let pagination = $state<AdminPagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  let isLoading = $state(true);
  let isRefreshing = $state(false);
  let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Filters & Sort (dropdown gaya Google Drive seperti di Header) ──
  let searchQuery = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  let roleFilter = $state<'' | 'USER' | 'ADMIN'>('');
  type SortField = 'name' | 'usage';
  type SortDir = 'asc' | 'desc';
  let sortField = $state<SortField>('name');
  let sortDir = $state<SortDir>('asc');
  let showSortDropdown = $state(false);

  // ── Pagination limit selector ──
  const paginationOptions = [5, 10, 20, 50, 100];
  let limitSelectorOpen = $state(false);

  // Daftar user yang sudah diurutkan (client-side, pada data yang tampil)
  const sortedUsers = $derived.by(() => {
    const list = [...users];
    const nameOf = (u: AdminUser) => (u.username || u.walletAddress || '').toLowerCase();
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortField === 'usage') {
      list.sort((a, b) => ((a.storage?.usedBytes ?? 0) - (b.storage?.usedBytes ?? 0)) * dir);
    } else {
      list.sort((a, b) => nameOf(a).localeCompare(nameOf(b)) * dir);
    }
    return list;
  });

  // Label untuk grup "Show"
  const roleOptions = [
    { value: '' as const, label: 'All users' },
    { value: 'USER' as const, label: 'User only' },
    { value: 'ADMIN' as const, label: 'Admin only' },
  ];

  function applyRoleFilter(value: '' | 'USER' | 'ADMIN') {
    if (value === roleFilter) return;
    roleFilter = value;
    loadUsers(1); // filter role di sisi server
  }
  function applySortField(field: SortField) {
    sortField = field;
  }
  function applySortDir(dir: SortDir) {
    sortDir = dir;
  }

  // ── Storage limit modal ──
  let editingUser = $state<AdminUser | null>(null);
  let limitValue = $state<number>(0);
  let limitUnit = $state<'MB' | 'GB'>('GB');
  let isSavingLimit = $state(false);
  let limitError = $state<string | null>(null); // Error khusus di dalam modal set-limit

  // ── Profile preview modal ──
  type Profile = {
    id: string;
    username?: string | null;
    email?: string | null;
    walletAddress: string;
    avatarUrl?: string | null;
    bio?: string | null;
    website?: string | null;
    joinedAt?: string | Date;
  };
  let showProfileModal = $state(false);
  let selectedProfile = $state<Profile | null>(null);

  function openProfileModal(user: AdminUser) {
    selectedProfile = {
      id: user.id,
      username: user.username,
      email: user.email,
      walletAddress: user.walletAddress,
      avatarUrl: user.avatarUrl,
      joinedAt: user.createdAt,
    };
    showProfileModal = true;
  }
  function closeProfileModal() {
    showProfileModal = false;
    selectedProfile = null;
  }

  // ── Helpers ──
  function formatBytes(bytes: number | null): string {
    if (bytes === null) return 'Unlimited';
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function formatAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function getInitial(u: AdminUser): string {
    return (u.username || u.walletAddress || 'U').charAt(0).toUpperCase();
  }

  // ── Data loading ──
  async function loadUsers(page = 1) {
    if (!isLoading) isRefreshing = true;
    try {
      const res = await adminService.listUsers({
        query: searchQuery.trim() || undefined,
        role: roleFilter || undefined,
        page,
        limit: pagination.limit,
      });
      if (res?.success && res.data) {
        users = res.data.users;
        pagination = res.data.pagination;
      } else {
        message = { type: 'error', text: res?.message || 'Failed to load users' };
      }
    } catch (err: any) {
      message = { type: 'error', text: err?.message || 'Failed to load users' };
    } finally {
      isLoading = false;
      isRefreshing = false;
    }
  }

  function changeLimit(newLimit: number) {
    pagination.limit = newLimit;
    loadUsers(1);
    limitSelectorOpen = false;
  }

  onMount(() => loadUsers(1));

  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadUsers(1), 350);
  }
  function goToPage(p: number) {
    if (p < 1 || p > pagination.totalPages || p === pagination.page) return;
    loadUsers(p);
  }

  // Daftar nomor halaman yang ditampilkan (dengan ellipsis bila banyak)
  const pageNumbers = $derived.by<(number | '...')[]>(() => {
    const total = pagination.totalPages;
    const current = pagination.page;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages: (number | '...')[] = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push('...');
    pages.push(total);
    return pages;
  });

  // Tutup dropdown sort saat klik di luar
  $effect(() => {
    if (!showSortDropdown) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest?.('[data-sort-container]')) {
        showSortDropdown = false;
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  });

  // Tutup limit selector saat klik di luar
  $effect(() => {
    if (!limitSelectorOpen) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest?.('[data-limit-selector]')) {
        limitSelectorOpen = false;
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  });

  // ── Storage limit ──
  function openLimitModal(user: AdminUser) {
    if (user.role === 'ADMIN') return; // admin = unlimited, tidak bisa di-set
    editingUser = user;
    limitError = null;
    const baseBytes = user.storageLimit ?? 5 * 1024 * 1024 * 1024;
    if (baseBytes >= 1024 * 1024 * 1024) {
      limitUnit = 'GB';
      limitValue = Number((baseBytes / (1024 * 1024 * 1024)).toFixed(2));
    } else {
      limitUnit = 'MB';
      limitValue = Number((baseBytes / (1024 * 1024)).toFixed(0));
    }
  }

  function closeLimitModal() {
    editingUser = null;
    limitValue = 0;
    limitError = null;
  }

  const limitBytesPreview = $derived(
    limitUnit === 'GB'
      ? Math.floor(limitValue * 1024 * 1024 * 1024)
      : Math.floor(limitValue * 1024 * 1024)
  );

  async function saveStorageLimit() {
    if (!editingUser) return;
    const target = editingUser;
    limitError = null;

    if (!Number.isFinite(limitValue) || limitValue < 0) {
      limitError = 'Storage limit must be a non-negative number';
      return;
    }
    if (limitBytesPreview < target.storage.usedBytes) {
      limitError = `Limit cannot be lower than used storage (${formatBytes(target.storage.usedBytes)})`;
      return;
    }

    isSavingLimit = true;
    try {
      const payload = limitUnit === 'GB'
        ? { storageLimitGB: limitValue }
        : { storageLimitBytes: Math.floor(limitValue * 1024 * 1024) };

      const res = await adminService.updateStorageLimit(target.id, payload);
      if (res?.success && res.data) {
        users = users.map((u) =>
          u.id === target.id ? { ...u, storageLimit: res.data.storageLimit, storage: res.data.storage } : u
        );
        message = { type: 'success', text: `Storage limit updated for ${target.username || formatAddress(target.walletAddress)}` };
        closeLimitModal();
      } else {
        limitError = res?.message || 'Failed to update storage limit';
      }
    } catch (err: any) {
      limitError = err?.message || 'Failed to update storage limit';
    } finally {
      isSavingLimit = false;
    }
  }
</script>

<svelte:head><title>Storage Limits • DecentraShare</title></svelte:head>

<div class="w-full min-h-[calc(100vh-4rem)]">
  <div class="max-w-7xl mx-auto" in:fly={{ y: 20, duration: 400 }}>

    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
          </svg>
        </div>
        <div>
          <h1 class="text-lg md:text-xl font-semibold text-white">Storage Limits</h1>
        </div>
      </div>
      <div class="text-sm text-gray-400">
        <span class=" text-blue-400">{pagination.total}</span> total users
      </div>
    </div>

    <!-- Message banner -->
    {#if message}
      <div in:fade={{ duration: 200 }}
           class="mb-4 p-3 rounded-lg text-sm flex items-start gap-3
                  {message.type === 'success'
                    ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'}">
        <span class="flex-1">{message.text}</span>
        <button type="button" aria-label="Dismiss message" onclick={() => (message = null)} class="opacity-60 hover:opacity-100 transition-opacity">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    {/if}

    <!-- Search + Sort (dropdown gaya Google Drive) -->
    <div class="mb-5 flex items-center gap-3">
      <div class="relative flex-1">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m1.1-5.4a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"/>
        </svg>
        <input
          bind:value={searchQuery}
          oninput={onSearchInput}
          type="text"
          placeholder="Search by username, email, or wallet address..."
          class="w-full h-10 pl-10 pr-4 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
        />
      </div>

      <!-- Sort control -->
      <div class="relative shrink-0" data-sort-container>
        <button
          type="button"
          onclick={() => (showSortDropdown = !showSortDropdown)}
          class="h-10 px-3 flex items-center gap-2 bg-white/5 border border-white/10 text-gray-300 rounded-lg hover:bg-white/10 hover:text-white transition-all text-sm"
          aria-label="Filter and sort users"
          aria-expanded={showSortDropdown}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/></svg>
          <span class="hidden sm:inline">Filter & Sort</span>
        </button>

        {#if showSortDropdown}
          <div in:fade={{ duration: 120 }}
               class="absolute right-0 mt-2 w-64 bg-[#1a1a1e] border border-white/10 rounded-xl shadow-2xl py-2 z-[70] overflow-hidden">

            <!-- Show (filter role) -->
            <div class="px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Show</div>
            {#each roleOptions as opt (opt.value)}
              <button onclick={() => applyRoleFilter(opt.value)}
                      class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/10 hover:text-white {roleFilter === opt.value ? 'bg-blue-500/10 text-blue-300' : 'text-gray-300'}">
                <span>{opt.label}</span>
                {#if roleFilter === opt.value}
                  <svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                {/if}
              </button>
            {/each}

            <div class="my-2 border-t border-white/10"></div>

            <!-- Sort by -->
            <div class="px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Sort by</div>
            <button onclick={() => applySortField('name')}
                    class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/10 hover:text-white {sortField === 'name' ? 'bg-blue-500/10 text-blue-300' : 'text-gray-300'}">
              <span>Name</span>
              {#if sortField === 'name'}
                <svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              {/if}
            </button>
            <button onclick={() => applySortField('usage')}
                    class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/10 hover:text-white {sortField === 'usage' ? 'bg-blue-500/10 text-blue-300' : 'text-gray-300'}">
              <span>Storage usage</span>
              {#if sortField === 'usage'}
                <svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              {/if}
            </button>

            <div class="my-2 border-t border-white/10"></div>

            <!-- Order -->
            <div class="px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Order</div>
            <button onclick={() => applySortDir('asc')}
                    class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/10 hover:text-white {sortDir === 'asc' ? 'bg-blue-500/10 text-blue-300' : 'text-gray-300'}">
              <span>{sortField === 'usage' ? 'Low → High' : 'A → Z'}</span>
              {#if sortDir === 'asc'}
                <svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              {/if}
            </button>
            <button onclick={() => applySortDir('desc')}
                    class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/10 hover:text-white {sortDir === 'desc' ? 'bg-blue-500/10 text-blue-300' : 'text-gray-300'}">
              <span>{sortField === 'usage' ? 'High → Low' : 'Z → A'}</span>
              {#if sortDir === 'desc'}
                <svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              {/if}
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Table -->
    <div class="relative backdrop-blur-2xl bg-[#0a0a0f]/80   rounded-2xl shadow-xl overflow-hidden">
      {#if isRefreshing}
        <div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-blue-500 to-cyan-500 animate-pulse"></div>
      {/if}

      {#if isLoading}
        <div class="p-12 flex flex-col items-center justify-center" in:fade>
          <div class="w-10 h-10 rounded-full border-2 border-white/10 border-t-blue-500 animate-spin"></div>
          <p class="mt-4 text-gray-400 text-sm">Loading users...</p>
        </div>
      {:else if users.length === 0}
        <div class="p-12 text-center text-gray-500" in:fade>
          <p class="text-sm">No users found.</p>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-gray-500 border-b border-white/5 text-xs uppercase tracking-wider">
                <th class="px-4 py-3 font-medium text-left">User</th>
                <th class="px-4 py-3 font-medium text-center">Role</th>
                <th class="px-4 py-3 font-medium text-left">Storage Usage</th>
                <th class="px-4 py-3 font-medium hidden md:table-cell text-center">Files</th>
                <th class="px-4 py-3 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each sortedUsers as user (user.id)}
                <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <!-- User -->
                  <td class="px-4 py-3">
                    <button
                      type="button"
                      onclick={() => openProfileModal(user)}
                      title={user.walletAddress}
                      class="group/owner flex items-left gap-3 px-2 py-1.5 rounded-lg
                             hover:bg-white/5 hover:scale-[1.02] active:scale-[0.98]
                             focus:outline-none focus:ring-2 focus:ring-blue-500/50
                             transition-all duration-200 ease-out"
                    >
                      <div class="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-blue-500/20 to-blue-500/20 border border-white/10 group-hover/owner:border-blue-400/50 group-hover/owner:shadow-[0_0_12px_rgba(59,130,246,0.4)] flex items-center justify-center shrink-0 transition-all duration-200">
                        {#if user.avatarUrl}
                          <img src={user.avatarUrl} alt="" class="w-full h-full object-cover" />
                        {:else}
                          <span class="text-sm font-bold text-blue-300">{getInitial(user)}</span>
                        {/if}
                      </div>
                      <div class="min-w-0 text-left">
                        <p class="font-medium text-white truncate group-hover/owner:text-blue-300 transition-colors">{user.username || 'No username'}</p>
                        <p class="text-xs text-gray-500 truncate font-mono">{formatAddress(user.walletAddress)}</p>
                      </div>
                    </button>
                  </td>

                  <!-- Role -->
                  <td class="px-4 py-3 text-center">
                    <span class="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-medium
                      {user.role === 'ADMIN'
                        ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                        : 'bg-white/5 text-gray-300 border border-white/10'}">
                      {user.role}
                    </span>
                  </td>

                  <!-- Storage -->
                  <td class="px-4 py-3 min-w-[200px]">
                    {#if user.role === 'ADMIN' || user.storageLimit === null}
                      <div class="flex items-center justify-left gap-1.5 text-xs">
                        <svg class="w-3.5 h-3.5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                        </svg>
                        <span class="text-blue-300 font-medium">Unlimited</span>
                        <span class="text-gray-500">· {formatBytes(user.storage.usedBytes)} used</span>
                      </div>
                    {:else}
                      <div class="space-y-1.5">
                        <div class="flex justify-between text-xs">
                          <span class="text-gray-400">{formatBytes(user.storage.usedBytes)}</span>
                          <span class="text-gray-500">/ {formatBytes(user.storageLimit)}</span>
                        </div>
                        <div class="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            class="h-full rounded-full transition-all duration-500
                              {user.storage.usagePercent >= 90
                                ? 'bg-gradient-to-r from-red-500 to-orange-500'
                                : 'bg-gradient-to-r from-blue-500 to-cyan-500'}"
                            style="width: {Math.min(100, user.storage.usagePercent)}%">
                          </div>
                        </div>
                      </div>
                    {/if}
                  </td>

                  <!-- Files -->
                  <td class="px-4 py-3 hidden md:table-cell text-gray-400 text-center">
                    {user._count?.documents ?? 0}
                  </td>

                  <!-- Actions -->
                  <td class="px-4 py-3">
                    <div class="flex items-center justify-center">
                      {#if user.role === 'ADMIN'}
                        <span class="text-xs text-gray-500 italic">Unlimited (admin)</span>
                      {:else}
                        <button
                          type="button"
                          onclick={() => openLimitModal(user)}
                          class="px-3 py-1.5 text-xs font-medium text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-colors whitespace-nowrap"
                        >
                          Set Limit
                        </button>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-white/5">
          <p class="text-xs text-gray-500">
            Showing <span class="text-gray-300 font-medium">{users.length}</span> of {pagination.total} users
            {#if pagination.totalPages > 1}
              · page <span class="text-gray-300 font-medium">{pagination.page}</span> of {pagination.totalPages}
            {/if}
          </p>
          <div class="flex items-center gap-4">
            <!-- Pagination limit selector (bottom) -->
            <div class="relative shrink-0" data-limit-selector>
              <button
                type="button"
                onclick={() => (limitSelectorOpen = !limitSelectorOpen)}
                class="px-3 py-1.5 text-xs font-medium text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-all"
                aria-label="Select items per page"
                aria-expanded={limitSelectorOpen}
              >
                <svg class="w-3.5 h-3.5 inline mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
                {pagination.limit} / page
              </button>

              {#if limitSelectorOpen}
                <div in:fade={{ duration: 120 }}
                     class="absolute right-0 mt-2 w-32 bg-[#1a1a1e] border border-white/10 rounded-xl shadow-2xl py-2 z-50 overflow-hidden">
                  {#each paginationOptions as option}
                    <button onclick={() => changeLimit(option)}
                            class="w-full px-4 py-2.5 text-left text-xs transition-colors hover:bg-blue-500/10 hover:text-blue-300 {pagination.limit === option ? 'bg-blue-500/20 text-blue-300' : 'text-gray-300'}">
                      {option} per page
                    </button>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Pagination controls (only show if totalPages > 1) -->
            {#if pagination.totalPages > 1}
              <div class="flex items-center gap-1">
                <!-- Prev -->
                <button type="button" onclick={() => goToPage(pagination.page - 1)} disabled={pagination.page <= 1}
                  aria-label="Previous page"
                  class="w-7 h-7 flex items-center justify-center text-xs text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>

                <!-- Page numbers -->
                {#each pageNumbers as p}
                  {#if p === '...'}
                    <span class="w-7 h-7 flex items-center justify-center text-xs text-gray-600">…</span>
                  {:else}
                    <button type="button" onclick={() => goToPage(p)}
                      aria-label={`Go to page ${p}`}
                      aria-current={p === pagination.page ? 'page' : undefined}
                      class="min-w-7 h-7 px-2 flex items-center justify-center text-xs rounded-lg border transition-colors
                        {p === pagination.page
                          ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 font-semibold'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}">
                      {p}
                    </button>
                  {/if}
                {/each}

                <!-- Next -->
                <button type="button" onclick={() => goToPage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                  aria-label="Next page"
                  class="w-7 h-7 flex items-center justify-center text-xs text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- ── Storage Limit Modal ── -->
{#if editingUser}
  <div class="fixed inset-0 z-[120] flex items-center justify-center p-4" in:fade={{ duration: 150 }}>
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={closeLimitModal} aria-hidden="true"></div>
    <div class="relative w-full max-w-md bg-[#0a0a0f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
         in:fly={{ y: 20, duration: 200 }}>
      <div class="h-1 bg-gradient-to-r from-blue-500 via-blue-500 to-cyan-500"></div>
      <div class="p-6">
        <h2 class="text-lg font-semibold text-white mb-1">Set Storage Limit</h2>
        <p class="text-xs text-gray-500 mb-5">
          {editingUser.username || formatAddress(editingUser.walletAddress)} · currently using {formatBytes(editingUser.storage.usedBytes)}
        </p>

        <label for="limit-input" class="block text-sm font-medium text-gray-300 mb-2">New limit</label>
        <div class="flex gap-2">
          <input
            id="limit-input"
            bind:value={limitValue}
            oninput={() => (limitError = null)}
            type="number"
            min="0"
            step={limitUnit === 'GB' ? '0.5' : '1'}
            class="flex-1 h-10 px-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
          />
          <select
            bind:value={limitUnit}
            onchange={() => (limitError = null)}
            aria-label="Storage limit unit"
            class="h-10 px-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50 text-sm"
          >
            <option class="bg-[#0a0a0f] text-white" value="MB">MB</option>
            <option class="bg-[#0a0a0f] text-white" value="GB">GB</option>
          </select>
        </div>
        <p class="mt-2 text-xs text-gray-500">= {formatBytes(limitBytesPreview)} ({limitBytesPreview.toLocaleString()} bytes)</p>

        {#if limitError}
          <div in:fade={{ duration: 150 }}
               class="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
            <svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span class="flex-1">{limitError}</span>
          </div>
        {/if}

        <div class="flex justify-end gap-2 mt-6">
          <button type="button" onclick={closeLimitModal}
            class="px-4 h-10 bg-white/5 border border-white/10 text-gray-400 rounded-lg text-sm hover:bg-white/10 transition-colors">Cancel</button>
          <button type="button" onclick={saveStorageLimit} disabled={isSavingLimit}
            class="px-4 h-10 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50">
            {isSavingLimit ? 'Saving...' : 'Save Limit'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ── Profile Preview Modal ── -->
<ProfilePreviewModal
  isOpen={showProfileModal}
  onClose={closeProfileModal}
  profile={selectedProfile}
/>
