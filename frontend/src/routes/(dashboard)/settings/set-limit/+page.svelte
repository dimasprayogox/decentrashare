<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { adminService } from '$lib/services/admin/admin';
  import type { AdminUser, AdminPagination } from '$lib/types/admin';

  // ── State ──
  let users = $state<AdminUser[]>([]);
  let pagination = $state<AdminPagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  let isLoading = $state(true);
  let isRefreshing = $state(false);
  let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Filters ──
  let searchQuery = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Storage limit modal ──
  let editingUser = $state<AdminUser | null>(null);
  let limitValue = $state<number>(0);
  let limitUnit = $state<'MB' | 'GB'>('GB');
  let isSavingLimit = $state(false);

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

  onMount(() => loadUsers(1));

  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadUsers(1), 350);
  }
  function goToPage(p: number) {
    if (p < 1 || p > pagination.totalPages || p === pagination.page) return;
    loadUsers(p);
  }

  // ── Storage limit ──
  function openLimitModal(user: AdminUser) {
    if (user.role === 'ADMIN') return; // admin = unlimited, tidak bisa di-set
    editingUser = user;
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
  }

  const limitBytesPreview = $derived(
    limitUnit === 'GB'
      ? Math.floor(limitValue * 1024 * 1024 * 1024)
      : Math.floor(limitValue * 1024 * 1024)
  );

  async function saveStorageLimit() {
    if (!editingUser) return;
    const target = editingUser;

    if (!Number.isFinite(limitValue) || limitValue < 0) {
      message = { type: 'error', text: 'Storage limit must be a non-negative number' };
      return;
    }
    if (limitBytesPreview < target.storage.usedBytes) {
      message = { type: 'error', text: `Limit cannot be lower than used storage (${formatBytes(target.storage.usedBytes)})` };
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
        message = { type: 'error', text: res?.message || 'Failed to update storage limit' };
      }
    } catch (err: any) {
      message = { type: 'error', text: err?.message || 'Failed to update storage limit' };
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
          <p class="text-xs text-gray-500">Set per-user storage quota (admins are always unlimited)</p>
        </div>
      </div>
      <div class="text-sm text-gray-400">
        <span class="font-semibold text-white">{pagination.total}</span> total users
      </div>
    </div>

    <!-- Quick link to manage users -->
    <div class="mb-5">
      <a href="/settings/users" class="inline-flex items-center gap-2 text-xs text-blue-300 hover:text-blue-200 transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
        Manage user roles →
      </a>
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

    <!-- Search -->
    <div class="mb-5">
      <div class="relative">
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
              <tr class="text-left text-gray-500 border-b border-white/5 text-xs uppercase tracking-wider">
                <th class="px-4 py-3 font-medium">User</th>
                <th class="px-4 py-3 font-medium">Role</th>
                <th class="px-4 py-3 font-medium">Storage Usage</th>
                <th class="px-4 py-3 font-medium hidden md:table-cell">Files</th>
                <th class="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each users as user (user.id)}
                <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <!-- User -->
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                      <div class="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center shrink-0">
                        {#if user.avatarUrl}
                          <img src={user.avatarUrl} alt="" class="w-full h-full object-cover" />
                        {:else}
                          <span class="text-sm font-bold text-blue-300">{getInitial(user)}</span>
                        {/if}
                      </div>
                      <div class="min-w-0">
                        <p class="font-medium text-white truncate">{user.username || 'No username'}</p>
                        <p class="text-xs text-gray-500 truncate font-mono">{formatAddress(user.walletAddress)}</p>
                      </div>
                    </div>
                  </td>

                  <!-- Role -->
                  <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                      {user.role === 'ADMIN'
                        ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                        : 'bg-white/5 text-gray-300 border border-white/10'}">
                      {user.role}
                    </span>
                  </td>

                  <!-- Storage -->
                  <td class="px-4 py-3 min-w-[200px]">
                    {#if user.role === 'ADMIN' || user.storageLimit === null}
                      <div class="flex items-center gap-1.5 text-xs">
                        <svg class="w-3.5 h-3.5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                        </svg>
                        <span class="text-purple-300 font-medium">Unlimited</span>
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
                  <td class="px-4 py-3 hidden md:table-cell text-gray-400">
                    {user._count?.documents ?? 0}
                  </td>

                  <!-- Actions -->
                  <td class="px-4 py-3">
                    <div class="flex items-center justify-end">
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
        {#if pagination.totalPages > 1}
          <div class="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <p class="text-xs text-gray-500">Page {pagination.page} of {pagination.totalPages}</p>
            <div class="flex items-center gap-1">
              <button type="button" onclick={() => goToPage(pagination.page - 1)} disabled={pagination.page <= 1}
                class="px-3 py-1.5 text-xs text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
              <button type="button" onclick={() => goToPage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                class="px-3 py-1.5 text-xs text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
            </div>
          </div>
        {/if}
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
      <div class="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500"></div>
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
            type="number"
            min="0"
            step={limitUnit === 'GB' ? '0.5' : '1'}
            class="flex-1 h-10 px-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
          />
          <select
            bind:value={limitUnit}
            aria-label="Storage limit unit"
            class="h-10 px-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50 text-sm"
          >
            <option value="MB">MB</option>
            <option value="GB">GB</option>
          </select>
        </div>
        <p class="mt-2 text-xs text-gray-500">= {formatBytes(limitBytesPreview)} ({limitBytesPreview.toLocaleString()} bytes)</p>

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
