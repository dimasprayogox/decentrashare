<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { adminService } from '$lib/services/admin/admin';
  import ProfilePreviewModal from '$lib/components/storage/ProfilePreviewModal.svelte';
  import type { AdminUser, UserRole, AdminPagination } from '$lib/types/admin';

  // ── State ──
  let users = $state<AdminUser[]>([]);
  let pagination = $state<AdminPagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  let isLoading = $state(true);
  let isRefreshing = $state(false);
  let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Filters ──
  let searchQuery = $state('');
  let roleFilter = $state<'' | UserRole>('');
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Pagination limit selector ──
  const paginationOptions = [5, 10, 20, 50, 100];
  let limitSelectorOpen = $state(false);

  // ── Per-row action state ──
  let savingUserId = $state<string | null>(null);

  // ── Role confirm modal ──
  let roleTarget = $state<AdminUser | null>(null);
  let pendingRole = $state<UserRole>('USER');

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
  function formatAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
  function onRoleFilterChange() { loadUsers(1); }
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

  // ── Role change ──
  function openRoleConfirm(user: AdminUser) {
    roleTarget = user;
    pendingRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
  }

  async function confirmRoleChange() {
    if (!roleTarget) return;
    const target = roleTarget;
    savingUserId = target.id;
    try {
      const res = await adminService.updateUserRole(target.id, pendingRole);
      if (res?.success) {
        const newLimit = res.data?.storageLimit ?? null;
        users = users.map((u) => {
          if (u.id !== target.id) return u;
          const unlimited = newLimit === null;
          return {
            ...u,
            role: pendingRole,
            storageLimit: newLimit,
            storage: {
              usedBytes: u.storage.usedBytes,
              quotaBytes: unlimited ? null : newLimit,
              usagePercent: unlimited || !newLimit ? 0 : Math.min(100, (u.storage.usedBytes / newLimit) * 100),
              unlimited,
            },
          };
        });
        message = {
          type: 'success',
          text: `Role for ${target.username || formatAddress(target.walletAddress)} set to ${pendingRole}`
            + (pendingRole === 'ADMIN' ? ' (storage now unlimited)' : ' (storage reset to 5GB)'),
        };
      } else {
        message = { type: 'error', text: res?.message || 'Failed to update role' };
      }
    } catch (err: any) {
      message = { type: 'error', text: err?.message || 'Failed to update role' };
    } finally {
      savingUserId = null;
      roleTarget = null;
    }
  }
</script>

<svelte:head><title>Manage Users • DecentraShare</title></svelte:head>

<div class="manage-users-page w-full min-h-[calc(100vh-4rem)]">
  <div class="max-w-7xl mx-auto" in:fly={{ y: 20, duration: 400 }}>

    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
          </svg>
        </div>
        <div>
          <h1 class="text-lg md:text-xl font-semibold text-white">Manage Users</h1>
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

    <!-- Filters -->
    <div class="flex flex-col sm:flex-row gap-3 mb-5">
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
      <select
        bind:value={roleFilter}
        onchange={onRoleFilterChange}
        aria-label="Filter by role"
        class="h-10 px-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50 text-sm"
      >
        <option class="bg-[#0a0a0f] text-white" value="">All roles</option>
        <option class="bg-[#0a0a0f] text-white" value="USER">User</option>
        <option class="bg-[#0a0a0f] text-white" value="ADMIN">Admin</option>
      </select>
    </div>

    <!-- Table -->
    <div class="relative backdrop-blur-2xl bg-[#0a0a0f]/80 border border-white/10 rounded-2xl shadow-xl overflow-hidden">
      {#if isRefreshing}
        <div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 animate-pulse"></div>
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
                <th class="px-4 py-3 font-medium text-center">User</th>
                <th class="px-4 py-3 font-medium text-center">Role</th>
                <th class="px-4 py-3 font-medium hidden md:table-cell text-center">Email</th>
                <th class="px-4 py-3 font-medium hidden lg:table-cell text-center">Joined</th>
                <th class="px-4 py-3 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each users as user (user.id)}
                <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <!-- User -->
                  <td class="px-4 py-3">
                    <button
                      type="button"
                      onclick={() => openProfileModal(user)}
                      title={user.walletAddress}
                      class="group/owner mx-auto flex items-center gap-3 px-2 py-1.5 rounded-lg
                             hover:bg-white/5 hover:scale-[1.02] active:scale-[0.98]
                             focus:outline-none focus:ring-2 focus:ring-blue-500/50
                             transition-all duration-200 ease-out"
                    >
                      <div class="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-white/10 group-hover/owner:border-blue-400/50 group-hover/owner:shadow-[0_0_12px_rgba(59,130,246,0.4)] flex items-center justify-center shrink-0 transition-all duration-200">
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

                  <!-- Email -->
                  <td class="px-4 py-3 hidden md:table-cell text-gray-400 text-center">
                    <span class="block truncate max-w-[220px] mx-auto">{user.email || '—'}</span>
                  </td>

                  <!-- Joined -->
                  <td class="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs text-center">
                    {formatDate(user.createdAt)}
                  </td>

                  <!-- Actions -->
                  <td class="px-4 py-3">
                    <div class="flex items-center justify-center">
                      <button
                        type="button"
                        onclick={() => openRoleConfirm(user)}
                        disabled={savingUserId === user.id}
                        class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap disabled:opacity-50
                          {user.role === 'ADMIN'
                            ? 'text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20'
                            : 'text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20'}"
                      >
                        {savingUserId === user.id ? '...' : user.role === 'ADMIN' ? 'Demote to User' : 'Make Admin'}
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Pagination Bar -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-4 border-t border-white/5 bg-white/[0.015]">
          <!-- Left: info + rows-per-page -->
          <div class="flex items-center gap-4 text-xs text-gray-500">
            <span>
              Showing <span class="text-gray-200 font-semibold">{users.length}</span>
              of <span class="text-gray-200 font-semibold">{pagination.total}</span> users
            </span>

            <span class="hidden sm:block w-px h-4 bg-white/10"></span>

            <!-- Rows per page selector -->
            <div class="relative shrink-0 flex items-center gap-2" data-limit-selector>
              <span class="hidden sm:inline text-gray-500">Rows</span>
              <button
                type="button"
                onclick={() => (limitSelectorOpen = !limitSelectorOpen)}
                class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-200 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:border-white/20 transition-all"
                aria-label="Select items per page"
                aria-expanded={limitSelectorOpen}
              >
                {pagination.limit}
                <svg class="w-3.5 h-3.5 text-gray-400 transition-transform {limitSelectorOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>

              {#if limitSelectorOpen}
                <div in:fade={{ duration: 120 }}
                     class="absolute bottom-full left-0 mb-2 w-28 bg-[#1a1a1e] border border-white/10 rounded-xl shadow-2xl py-1.5 z-50 overflow-hidden">
                  {#each paginationOptions as option}
                    <button onclick={() => changeLimit(option)}
                            class="w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-blue-500/10 hover:text-blue-300 {pagination.limit === option ? 'text-blue-300' : 'text-gray-300'}">
                      <span>{option}</span>
                      {#if pagination.limit === option}
                        <svg class="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

          <!-- Right: page navigation -->
          {#if pagination.totalPages > 1}
            <div class="flex items-center gap-1">
              <!-- Prev -->
              <button type="button" onclick={() => goToPage(pagination.page - 1)} disabled={pagination.page <= 1}
                aria-label="Previous page"
                class="w-8 h-8 flex items-center justify-center text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
              </button>

              <!-- Page numbers -->
              {#each pageNumbers as p}
                {#if p === '...'}
                  <span class="w-8 h-8 flex items-center justify-center text-xs text-gray-600">…</span>
                {:else}
                  <button type="button" onclick={() => goToPage(p)}
                    aria-label={`Go to page ${p}`}
                    aria-current={p === pagination.page ? 'page' : undefined}
                    class="min-w-8 h-8 px-2.5 flex items-center justify-center text-xs rounded-lg border transition-all
                      {p === pagination.page
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 font-semibold shadow-[0_0_10px_rgba(59,130,246,0.25)]'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'}">
                    {p}
                  </button>
                {/if}
              {/each}

              <!-- Next -->
              <button type="button" onclick={() => goToPage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                aria-label="Next page"
                class="w-8 h-8 flex items-center justify-center text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- ── Role Confirm Modal ── -->
{#if roleTarget}
  <div class="fixed inset-0 z-[120] flex items-center justify-center p-4" in:fade={{ duration: 150 }}>
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => (roleTarget = null)} aria-hidden="true"></div>
    <div class="relative w-full max-w-md bg-[#0a0a0f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
         in:fly={{ y: 20, duration: 200 }}>
      <div class="h-1 {pendingRole === 'ADMIN' ? 'bg-gradient-to-r from-blue-500 via-blue-500 to-cyan-500' : 'bg-gradient-to-r from-blue-500 to-rose-500'}"></div>
      <div class="p-6">
        <h2 class="text-lg font-semibold text-white mb-1">Change User Role</h2>
        <p class="text-sm text-gray-400 mb-5">
          Set <span class="font-medium text-white">{roleTarget.username || formatAddress(roleTarget.walletAddress)}</span>
          to <span class="font-semibold {pendingRole === 'ADMIN' ? 'text-blue-300' : 'text-rose-400'}">{pendingRole}</span>?
        </p>

        <div class="flex justify-end gap-2">
          <button type="button" onclick={() => (roleTarget = null)}
            class="px-4 h-10 bg-white/5 border border-white/10 text-gray-400 rounded-lg text-sm hover:bg-white/10 transition-colors">Cancel</button>
          <button type="button" onclick={confirmRoleChange}
            class="px-4 h-10 text-white {pendingRole === 'ADMIN' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-rose-600 hover:bg-rose-700'} rounded-lg text-sm font-medium transition-colors">Confirm</button>
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
