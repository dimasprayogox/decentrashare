<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/state'; // ✅ Svelte 5
  import { userService } from '$lib/services/settings/profile';
  import { authService } from '$lib/services/auth/auth';
  import { ethers } from 'ethers';
  import logo from '$lib/assets/logo.png';
  import { themeController } from '$lib/utils/theme.svelte';

  let { userAddress = "0x00...000" } = $props();
  let searchQuery = $state("");
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  let showSortDropdown = $state(false);

  // ── Activity Log controls (search + filters) ──
  let activitySearchQuery = $state("");
  let activitySearchTimeout: ReturnType<typeof setTimeout> | null = null;
  let activityActionFilter = $state("ALL");
  let activityEntityFilter = $state("ALL");
  let showActivityFilterDropdown = $state(false);

  const activityActionTypes = [
    { value: 'ALL', label: 'All Actions' },
    { value: 'UPLOAD_IPFS', label: 'Upload' },
    { value: 'CREATE', label: 'Create' },
    { value: 'DOWNLOAD', label: 'Download' },
    { value: 'BULK_DOWNLOAD', label: 'Bulk Download' },
    { value: 'SHARE', label: 'Share' },
    { value: 'REVOKE', label: 'Revoke' },
    { value: 'RENAME', label: 'Rename' },
    { value: 'MOVE', label: 'Move' },
    { value: 'CHANGE_PRIVACY', label: 'Privacy' },
    { value: 'ARCHIVE', label: 'Archive' },
    { value: 'RESTORE', label: 'Restore' },
    { value: 'PERMANENT_DELETE', label: 'Delete' },
    { value: 'BLOCKCHAIN_CONFIRM', label: 'Blockchain' },
    { value: 'BLOCKCHAIN_CONFIRM_BATCH', label: 'Blockchain Batch' },
  ];

  const activityEntityTypes = [
    { value: 'ALL', label: 'All Types' },
    { value: 'DOCUMENT', label: 'Documents' },
    { value: 'FOLDER', label: 'Folders' },
  ];

  type SortField = 'name' | 'updatedAt' | 'deletedAt';
  type SortDirection = 'asc' | 'desc';

  let activeSortField = $state<SortField>('updatedAt');
  let activeSortDirection = $state<SortDirection>('desc');

  // ── User Profile State ──
  let profile = $state({ username: '', avatarUrl: '', email: '' });
  let isLoadingProfile = $state(true);
  let isLoggingOut = $state(false);
  let showProfileDropdown = $state(false);

  // ── Web3 Wallet State ──
  let walletAddress = $state<string | null>(null);
  let walletBalance = $state<string>("0.0000");
  let isConnected = $state<boolean>(false);
  let isWeb3Loading = $state<boolean>(true);

  // ── Dynamic Page Title Mapping ──
  const PAGE_TITLES: Record<string, { main: string; sub?: string }> = {
    '/storage': { main: '', sub: 'My Files' },
    '/shared': { main: '', sub: 'Shared With Me' },
    '/trash': { main: '', sub: 'Trash' },
    '/validate': { main: '', sub: 'Validate' },
    '/explore': { main: '', sub: 'Explore' },
    '/activity': { main: '', sub: 'Activity Log' },
    '/wallet-activity': { main: '', sub: 'Wallet Activity' },
    '/settings': { main: 'Settings', sub: '' },
    '/settings/profile': { main: 'Settings', sub: 'Profile' },
  };

  // ✅ CORRECT: Extract path first, then derive pageTitle
  // Step 1: Derived path (normalize trailing slash)
  const currentPath = $derived(page.url.pathname.replace(/\/$/, '') || '/storage');
  const showSortControl = $derived(currentPath.startsWith('/storage') || currentPath.startsWith('/shared') || currentPath.startsWith('/trash'));
  const showActivityControl = $derived(currentPath.startsWith('/activity'));
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

  async function checkWalletConnection() {
    if (typeof window === 'undefined' || !window.ethereum) {
      isWeb3Loading = false;
      isConnected = false;
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_accounts", []);
      
      if (accounts.length > 0) {
        walletAddress = accounts[0];
        isConnected = true;
        const balanceBig = await provider.getBalance(walletAddress);
        walletBalance = parseFloat(ethers.formatEther(balanceBig)).toFixed(4);
      } else {
        walletAddress = null;
        isConnected = false;
        walletBalance = "0.0000";
      }
    } catch (err) {
      console.error("[Header] Failed to load wallet state:", err);
      isConnected = false;
    } finally {
      isWeb3Loading = false;
    }
  }

  async function connectWallet() {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert("MetaMask is not installed!");
      return;
    }
    try {
      isWeb3Loading = true;
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (accounts.length > 0) {
        walletAddress = accounts[0];
        isConnected = true;
        const balanceBig = await provider.getBalance(walletAddress);
        walletBalance = parseFloat(ethers.formatEther(balanceBig)).toFixed(4);
      }
    } catch (err) {
      console.error("[Header] Failed to connect wallet:", err);
    } finally {
      isWeb3Loading = false;
    }
  }

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

    await checkWalletConnection();

    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.on('accountsChanged', checkWalletConnection);
      window.ethereum.on('chainChanged', checkWalletConnection);
    }
  });

  onDestroy(() => {
    if (searchTimeout) clearTimeout(searchTimeout);
    if (activitySearchTimeout) clearTimeout(activitySearchTimeout);
    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.removeListener('accountsChanged', checkWalletConnection);
      window.ethereum.removeListener('chainChanged', checkWalletConnection);
    }
  });

  function getInitials(): string {
    const name = profile.username || profile.email || userAddress || 'U';
    return name.charAt(0).toUpperCase();
  }

  async function handleLogout() {
    if (isLoggingOut) return;
    isLoggingOut = true;
    try {
      await authService.logout();
      authService.clearClientStorage();
      authService.redirectToLogin();
    } catch (error: any) {
      console.error('[Header] Logout failed:', error);
      authService.redirectToLogin();
    } finally {
      isLoggingOut = false;
    }
  }

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

  // ── Activity Log emit helpers ──
  function emitActivitySearch(query: string) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('decentrashare:activity-search', { detail: { query } }));
  }

  function emitActivityFilter() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('decentrashare:activity-filter', {
      detail: { action: activityActionFilter, entity: activityEntityFilter }
    }));
  }

  function updateActivitySearch() {
    if (activitySearchTimeout) clearTimeout(activitySearchTimeout);
    const query = activitySearchQuery.trim();
    if (query.length === 1) return;
    activitySearchTimeout = setTimeout(() => emitActivitySearch(query), 300);
  }

  function applyActivityAction(value: string) {
    activityActionFilter = value;
    emitActivityFilter();
  }

  function applyActivityEntity(value: string) {
    activityEntityFilter = value;
    emitActivityFilter();
  }

  const activeActivityFilterCount = $derived(
    (activityActionFilter !== 'ALL' ? 1 : 0) + (activityEntityFilter !== 'ALL' ? 1 : 0)
  );

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

  $effect(() => {
    if (!showActivityFilterDropdown) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest?.('[data-activity-filter-container]')) {
        showActivityFilterDropdown = false;
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  });

  $effect(() => {
    if (!showProfileDropdown) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest?.('[data-profile-dropdown-container]')) {
        showProfileDropdown = false;
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  });
</script>

{#snippet sortControl()}
    <div class="flex items-center gap-2 w-full max-w-md">
        <div class="relative flex-1">
            <span class="absolute inset-y-0 left-4 flex items-center text-slate-400 dark:text-gray-500">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </span>
            <input
                type="search"
                bind:value={searchQuery}
                oninput={updateSearchQuery}
                placeholder="Search file or folder..."
                class="w-full bg-slate-100/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-2 md:py-2.5 pl-11 pr-4 text-xs md:text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all"
            />
        </div>

        <div class="relative" data-header-sort-container>
            <button
                onclick={() => showSortDropdown = !showSortDropdown}
                class="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center bg-slate-100/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white rounded-xl md:rounded-2xl hover:bg-slate-200/50 dark:hover:bg-white/10 transition-all cursor-pointer"
                title="Sort"
                aria-label="Sort files"
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/></svg>
            </button>

            {#if showSortDropdown}
                <div class="absolute right-0 mt-2 w-60 md:w-64 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl py-2 z-[70] overflow-hidden">
                    <div class="px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-gray-500">Sort by</div>
                    {#each sortFields as option (option.field)}
                        <button onclick={() => applySortField(option.field)} class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors {activeSortField === option.field ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400' : ''}">
                            <span>{option.label}</span>
                            {#if activeSortField === option.field}
                                <svg class="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                            {/if}
                        </button>
                    {/each}

                    <div class="my-2 border-t border-slate-200 dark:border-white/10"></div>
                    <div class="px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-gray-500">Order</div>
                    <button onclick={() => applySortDirection('asc')} class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors {activeSortDirection === 'asc' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400' : ''}">
                        <span>{activeSortField === 'name' ? 'A - Z' : 'A - Z'}</span>
                        {#if activeSortDirection === 'asc'}
                            <svg class="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                        {/if}
                    </button>
                    <button onclick={() => applySortDirection('desc')} class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors {activeSortDirection === 'desc' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400' : ''}">
                        <span>{activeSortField === 'name' ? 'Z - A' : 'Z - A'}</span>
                        {#if activeSortDirection === 'desc'}
                            <svg class="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                        {/if}
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/snippet}

{#snippet activityControl()}
    <div class="flex items-center gap-2 w-full max-w-md">
        <div class="relative flex-1">
            <span class="absolute inset-y-0 left-4 flex items-center text-slate-400 dark:text-gray-500">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </span>
            <input
                type="search"
                bind:value={activitySearchQuery}
                oninput={updateActivitySearch}
                placeholder="Search activity..."
                class="w-full bg-slate-100/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-2 md:py-2.5 pl-11 pr-4 text-xs md:text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all"
            />
        </div>

        <div class="relative" data-activity-filter-container>
            <button
                onclick={() => showActivityFilterDropdown = !showActivityFilterDropdown}
                class="relative w-9 h-9 md:w-10 md:h-10 flex items-center justify-center bg-slate-100/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white rounded-xl md:rounded-2xl hover:bg-slate-200/50 dark:hover:bg-white/10 transition-all cursor-pointer"
                title="Filter activity"
                aria-label="Filter activity"
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L14 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/></svg>
                {#if activeActivityFilterCount > 0}
                    <span class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">{activeActivityFilterCount}</span>
                {/if}
            </button>

            {#if showActivityFilterDropdown}
                <div class="absolute right-0 mt-2 w-60 md:w-64 bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl py-2 z-[70] overflow-hidden">
                    <div class="px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-gray-500">Action</div>
                    <div class="max-h-60 overflow-y-auto">
                        {#each activityActionTypes as option (option.value)}
                            <button onclick={() => applyActivityAction(option.value)} class="w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors {activityActionFilter === option.value ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-300' : ''}">
                                <span>{option.label}</span>
                                {#if activityActionFilter === option.value}
                                    <svg class="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                                {/if}
                            </button>
                        {/each}
                    </div>

                    <div class="my-2 border-t border-slate-200 dark:border-white/10"></div>
                    <div class="px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-gray-500">Type</div>
                    {#each activityEntityTypes as option (option.value)}
                        <button onclick={() => applyActivityEntity(option.value)} class="w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors {activityEntityFilter === option.value ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-300' : ''}">
                            <span>{option.label}</span>
                            {#if activityEntityFilter === option.value}
                                <svg class="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                            {/if}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/snippet}

<header class="min-h-20 border-b border-slate-200/50 dark:border-white/5 bg-slate-50/80 dark:bg-[#0a0a0c]/80 backdrop-blur-xl sticky top-0 z-[60] flex flex-col justify-center px-4 md:px-8 w-full py-3 sm:py-0">
    <div class="flex items-center justify-between w-full gap-4">
        <div class="flex items-center gap-4 flex-1 min-w-0">
            <!-- Brand Logo for mobile -->
            <div class="lg:hidden relative w-10 h-10 rounded-xl overflow-hidden bg-slate-900/[0.03] dark:bg-white/5 border border-slate-200/50 dark:border-white/10 p-1.5 flex items-center justify-center shrink-0">
                <img src={logo} alt="DecentraShare Logo" class="w-full h-full object-contain" />
            </div>
            
            <!-- ✅ Dynamic Title with Debug Fallback -->
            <h2 class="text-sm md:text-lg font-semibold text-slate-900 dark:text-white truncate mr-2">
              {#if pageTitle?.sub}
                <span class="hidden sm:inline text-gray-400">{pageTitle?.main}</span> {pageTitle?.sub}
              {:else}
                {pageTitle?.main || 'DecentraShare'}
              {/if}
            </h2>
            
            {#if showSortControl}
                <div class="hidden sm:flex items-center gap-2 w-full max-w-md">
                    {@render sortControl()}
                </div>
            {/if}

            {#if showActivityControl}
                <div class="hidden sm:flex items-center gap-2 w-full max-w-md">
                    {@render activityControl()}
                </div>
            {/if}
        </div>

        <div class="flex items-center gap-2 md:gap-4 shrink-0">
            <!-- Wallet Status -->
            {#if isConnected}
              <div class="flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/10 backdrop-blur-md shadow-lg transition-all duration-300 group/wallet">
                <span class="text-[9px] md:text-[10px] font-mono text-gray-300 leading-none mt-1 select-all hover:text-white transition-colors">
                    {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : ''}
                </span>

                <!-- Divider (Connected text) - hidden on mobile/tablet -->
                <div class="w-[1px] h-6 bg-white/10 hidden md:block"></div>

                <!-- Wallet details - hidden on mobile/tablet -->
                <div class="flex-col text-left hidden md:flex">
                  <div class="flex items-center gap-1.5">
                    <span class="relative flex h-2 w-2">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span class="text-[9px] font-black text-emerald-400 uppercase tracking-widest leading-none">Connected</span>
                  </div>
                </div>
                
                <!-- Divider -->
                <div class="w-[1px] h-6 bg-white/10"></div>
                
                <!-- Balance -->
                <div class="flex flex-col text-right pr-1">
                   <span class="text-[10px] md:text-[11px] font-extrabold text-slate-800 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-white dark:to-blue-400 leading-none mt-1">
                    {walletBalance} ETH
                  </span>
                </div>
              </div>
            {:else}
              <button
                onclick={connectWallet}
                class="px-3 md:px-4 py-2 rounded-2xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 text-xs font-bold transition-all duration-300 flex items-center gap-1.5 md:gap-2 shadow-lg shadow-blue-500/5 hover:scale-[1.02] cursor-pointer group/btn"
              >
                <!-- Wallet Icon for button -->
                <svg class="w-4 h-4 text-blue-400 group-hover/btn:rotate-6 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                </svg>
                <span class="hidden sm:inline">Connect Wallet</span>
                <span class="sm:hidden">Connect</span>
              </button>
            {/if}

            <!-- Theme Toggle Button -->
            <button
              onclick={() => themeController.toggle()}
              class="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-xl md:rounded-2xl border border-slate-200 bg-white text-slate-800 transition-all hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 cursor-pointer shrink-0"
              aria-label="Toggle theme"
            >
              {#if themeController.theme === 'dark'}
                <svg class="h-4 w-4 md:h-5 md:w-5 rotate-0 transition-transform duration-300 dark:-rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              {:else}
                <svg class="h-4 w-4 md:h-5 md:w-5 rotate-0 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              {/if}
            </button>

            <!-- Divider between wallet details and user info -->
            <div class="w-[1px] h-8 bg-white/10 mx-1 md:mx-2 hidden sm:block"></div>

            <!-- Bagian User Info -->
            <div class="flex items-center gap-3 pl-1 md:pl-2">
                <div class="hidden sm:flex flex-col items-end">
                    <span class="text-xs font-semibold text-white leading-none truncate max-w-[120px] md:max-w-[150px]">
                        @{profile.username || userAddress}
                    </span>
                </div>

                <div class="relative" data-profile-dropdown-container>
                    <button 
                        onclick={() => showProfileDropdown = !showProfileDropdown}
                        class="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 p-[2px] active:scale-95 transition-transform"
                    >
                        <div class="w-full h-full rounded-full bg-slate-100 dark:bg-[#0a0a0c] flex items-center justify-center overflow-hidden">
                            {#if profile.avatarUrl}
                                <img src={profile.avatarUrl} alt="Avatar" class="w-full h-full object-cover" />
                            {:else}
                                <span class="text-sm font-bold text-slate-700 dark:text-white">{getInitials()}</span>
                            {/if}
                        </div>
                    </button>

                    {#if showProfileDropdown}
                        <div class="absolute right-0 mt-2 w-56 bg-[#121214] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl dark:shadow-2xl p-2 transition-all z-[80]">
                            <div class="px-3 py-2 mb-1 border-b border-slate-150 dark:border-white/5">
                                <p class="text-sm font-semibold text-slate-800 dark:text-white truncate">@{profile.username || 'User'}</p>
                                <p class="text-xs text-slate-500 dark:text-gray-550 truncate">{profile.email || 'user@example.com'}</p>
                            </div>
                            
                            <a href="/settings/profile" onclick={() => showProfileDropdown = false} class="w-full text-left px-4 py-2 text-sm text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                                My Profile
                            </a>
                            <hr class="border-slate-150 dark:border-white/5 my-1" />
                            <button
                                onclick={() => { showProfileDropdown = false; handleLogout(); }}
                                disabled={isLoggingOut}
                                class="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-500/5 dark:hover:bg-red-500/10 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {#if isLoggingOut}
                                    <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Logging out...
                                {:else}
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                                    Logout
                                {/if}
                            </button>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    </div>

    <!-- Bottom Row (Mobile Search/Sort/Filter) -->
    {#if showSortControl || showActivityControl}
        <div class="flex sm:hidden w-full mt-3 pt-2 border-t border-white/5">
            {#if showSortControl}
                {@render sortControl()}
            {/if}
            {#if showActivityControl}
                {@render activityControl()}
            {/if}
        </div>
    {/if}
</header>