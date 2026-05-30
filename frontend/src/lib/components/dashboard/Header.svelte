<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/state'; // ✅ Svelte 5
  import { userService } from '$lib/services/settings/profile';

  let { userAddress = "0x00...000" } = $props();
  let searchQuery = $state("");
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  let showSortDropdown = $state(false);

  type SortField = 'name' | 'updatedAt' | 'deletedAt';
  type SortDirection = 'asc' | 'desc';

  let activeSortField = $state<SortField>('updatedAt');
  let activeSortDirection = $state<SortDirection>('desc');

  // ── User Profile State ──
  let profile = $state({ username: '', avatarUrl: '', email: '' });
  let isLoadingProfile = $state(true);

  // ── Dynamic Page Title Mapping ──
  const PAGE_TITLES: Record<string, { main: string; sub?: string }> = {
    '/dashboard': { main: 'Main', sub: 'Dashboard' },
    '/storage': { main: 'Storage', sub: 'My Files' },
    '/shared': { main: 'Shared', sub: 'With Me' },
    '/settings': { main: 'Settings', sub: '' },
    '/settings/profile': { main: 'Settings/', sub: 'Profile' },
    '/settings/security': { main: 'Settings/', sub: 'Security' },
    '/settings/notifications': { main: 'Settings/', sub: 'Notifications' },
    '/login': { main: 'Welcome', sub: 'Back' },
    '/register': { main: 'Join', sub: 'DecentraShare' },
  };

  // ✅ CORRECT: Extract path first, then derive pageTitle
  // Step 1: Derived path (normalize trailing slash)
  const currentPath = $derived(page.url.pathname.replace(/\/$/, '') || '/dashboard');
  const showSortControl = $derived(currentPath.startsWith('/storage') || currentPath.startsWith('/shared') || currentPath.startsWith('/trash'));
  const modifiedDateField = $derived<SortField>(currentPath.startsWith('/trash') ? 'deletedAt' : 'updatedAt');
  const sortFields = $derived([
    { field: 'name' as const, label: 'Title' },
    { field: modifiedDateField, label: 'Date modified' }
  ]);

  // Step 2: Derived pageTitle based on currentPath
  const pageTitle = $derived(
    PAGE_TITLES[currentPath] || 
    PAGE_TITLES[`/${currentPath.split('/')[1]}`] || 
    { main: 'DecentraShare', sub: '' }
  );

  // ── Load User Profile ──
  onMount(async () => {
    try {
      const res = await userService.getProfile();
      if (res?.success && res?.data) {
        profile = {
          username: res.data.username || '',
          avatarUrl: res.data.avatarUrl || '',
          email: res.data.email || ''
        };
      }
    } catch (err) {
      console.error("Failed to load header profile:", err);
    } finally {
      isLoadingProfile = false;
    }
  });

  function getInitials(): string {
    const name = profile.username || profile.email || userAddress || 'U';
    return name.charAt(0).toUpperCase();
  }

  onDestroy(() => {
    if (searchTimeout) clearTimeout(searchTimeout);
  });

  function emitSearchQuery(query: string) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('decentrashare:search', { detail: { query } }));
  }

  function emitSort() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('decentrashare:sort', {
      detail: { field: activeSortField, direction: activeSortDirection }
    }));
  }

  function applySortField(field: SortField) {
    activeSortField = field;
    emitSort();
  }

  function applySortDirection(direction: SortDirection) {
    activeSortDirection = direction;
    emitSort();
  }

  function updateSearchQuery() {
    if (searchTimeout) clearTimeout(searchTimeout);

    const query = searchQuery.trim();
    if (query.length === 1) return;

    searchTimeout = setTimeout(() => {
      emitSearchQuery(query);
    }, 300);
  }

  $effect(() => {
    if (!showSortDropdown) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest?.('[data-header-sort-container]')) {
        showSortDropdown = false;
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  });
</script>

<header class="h-20 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl sticky top-0 z-[60] flex items-center justify-between px-4 md:px-8 w-full gap-4">
    
    <div class="flex items-center gap-4 flex-1 min-w-0">
        <div class="lg:hidden w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shrink-0">D</div>
        
        <!-- ✅ Dynamic Title with Debug Fallback -->
        <h2 class="text-sm md:text-lg font-semibold text-white truncate mr-2">
          {#if pageTitle?.sub}
            <span class="hidden sm:inline text-gray-400">{pageTitle?.main}</span> {pageTitle?.sub}
          {:else}
            {pageTitle?.main || 'DecentraShare'}
          {/if}
        </h2>
        
        <div class="hidden sm:flex items-center gap-2 w-full max-w-md">
            <div class="relative flex-1">
                <span class="absolute inset-y-0 left-4 flex items-center text-gray-500">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </span>
                <input
                    type="search"
                    bind:value={searchQuery}
                    oninput={updateSearchQuery}
                    placeholder="Cari file atau folder..."
                    class="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-11 pr-4 text-sm text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all"
                />
            </div>

            {#if showSortControl}
                <div class="relative" data-header-sort-container>
                    <button
                        onclick={() => showSortDropdown = !showSortDropdown}
                        class="w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 text-white rounded-2xl hover:bg-white/10 transition-all"
                        title="Sort"
                        aria-label="Sort files"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/></svg>
                    </button>

                    {#if showSortDropdown}
                        <div class="absolute right-0 mt-2 w-64 bg-[#1a1a1e] border border-white/10 rounded-xl shadow-2xl py-2 z-[70] overflow-hidden">
                            <div class="px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Sort by</div>
                            {#each sortFields as option (option.field)}
                                <button onclick={() => applySortField(option.field)} class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors {activeSortField === option.field ? 'bg-blue-500/10 text-blue-300' : ''}">
                                    <span>{option.label}</span>
                                    {#if activeSortField === option.field}
                                        <svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                                    {/if}
                                </button>
                            {/each}

                            <div class="my-2 border-t border-white/10"></div>
                            <div class="px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Order</div>
                            <button onclick={() => applySortDirection('asc')} class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors {activeSortDirection === 'asc' ? 'bg-blue-500/10 text-blue-300' : ''}">
                                <span>{activeSortField === 'name' ? 'A - Z' : 'Ascending'}</span>
                                {#if activeSortDirection === 'asc'}
                                    <svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                                {/if}
                            </button>
                            <button onclick={() => applySortDirection('desc')} class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors {activeSortDirection === 'desc' ? 'bg-blue-500/10 text-blue-300' : ''}">
                                <span>{activeSortField === 'name' ? 'Z - A' : 'Descending'}</span>
                                {#if activeSortDirection === 'desc'}
                                    <svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                                {/if}
                            </button>
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>

    <div class="flex items-center gap-2 md:gap-4 shrink-0">
        
        <div class="flex items-center border-r border-white/10 pr-2 md:pr-4 gap-1">
            <button title="Notifikasi" class="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all relative">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                <span class="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full border-2 border-[#0a0a0c]"></span>
            </button>
            <a href="/settings" title="Pengaturan" class="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </a>
        </div>

        <!-- Bagian User Info -->
        <div class="flex items-center gap-3 pl-2">
            <div class="hidden sm:flex flex-col items-end">
                <span class="text-xs font-semibold text-white leading-none truncate max-w-[150px]">
                    @{profile.username || userAddress}
                </span>
            </div>

            <div class="relative group">
                <button class="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 p-[2px] active:scale-95 transition-transform">
                    <div class="w-full h-full rounded-full bg-[#0a0a0c] flex items-center justify-center overflow-hidden">
                        {#if profile.avatarUrl}
                            <img src={profile.avatarUrl} alt="Avatar" class="w-full h-full object-cover" />
                        {:else}
                            <span class="text-sm font-bold text-white">{getInitials()}</span>
                        {/if}
                    </div>
                </button>

                <div class="absolute right-0 mt-2 w-56 bg-[#121214] border border-white/10 rounded-2xl shadow-2xl p-2 hidden group-hover:block transition-all">
                    <div class="px-3 py-2 mb-1 border-b border-white/5">
                        <p class="text-sm font-semibold text-white truncate">@{profile.username || 'User'}</p>
                        <p class="text-xs text-gray-500 truncate">{profile.email || 'user@example.com'}</p>
                    </div>
                    
                    <a href="/settings/profile" class="w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                        Profil Saya
                    </a>
                    <hr class="border-white/5 my-1" />
                    <button class="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-all flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                        Logout
                    </button>
                </div>
            </div>
        </div>
    </div>
</header>