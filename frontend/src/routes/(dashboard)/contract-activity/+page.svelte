<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { adminService } from '$lib/services/admin/admin';
  import ProfilePreviewModal from '$lib/components/storage/ProfilePreviewModal.svelte';
  import type { AdminUser } from '$lib/types/admin';

  // ── Props ──
  let { data } = $props<{ data?: { role?: 'USER' | 'ADMIN' } }>();
  const isAdmin = $derived(data?.role === 'ADMIN');

  // ── Constants ──
  const CONTRACT_ADDRESS = '0xa56DE256D4AfD0CdF9860FccD281147B67F6ae85';
  const ETHERSCAN_API_KEY = 'DNGS1KV4YIDHDQ8UXSV1VURVCUTGPHISNH';

  // ── State ──
  let isLoading = $state(true);
  let transactions = $state<any[]>([]);
  let allUsersMap = $state<Map<string, AdminUser>>(new Map());
  let currentPage = $state(1);
  let pageSize = $state(10);
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
  let hasMore = $state(true);

  // ── Profile Modal ──
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

  function openProfileModal(user: any) {
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
  function formatTxMethod(tx: any): string {
    if (tx.functionName) {
      const name = tx.functionName.split('(')[0];
      return name || 'Contract Call';
    }
    const input = tx.input || '';
    if (!input || input === '0x') return 'Transfer';
    const selectors: Record<string, string> = {
      '0x23c83113': 'recordFile',
      '0x85e48dd2': 'recordFilesBatch',
    };
    const selector = input.slice(0, 10);
    return selectors[selector] || `${selector}…`;
  }

  function formatEthValue(wei: string): string {
    const eth = Number(wei) / 1e18;
    if (eth === 0) return '0 ETH';
    return eth.toFixed(6) + ' ETH';
  }

  function formatGasCost(gasUsed: string, gasPrice: string): string {
    const cost = (Number(gasUsed) * Number(gasPrice)) / 1e18;
    if (cost === 0) return '0 ETH';
    return cost.toFixed(6) + ' ETH';
  }

  function formatTimestamp(ts: string): string {
    const d = new Date(Number(ts) * 1000);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatFullDate(ts: string): string {
    const d = new Date(Number(ts) * 1000);
    return d.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  function formatAddress(addr: string): string {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  // ── Data Loading ──
  async function loadTransactions(page: number) {
    isLoading = true;
    try {
      const url = `https://api.etherscan.io/v2/api?chainid=11155111&module=account&action=txlist&address=${CONTRACT_ADDRESS}&startblock=0&endblock=99999999&page=${page}&offset=${pageSize}&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.status === '1' && Array.isArray(json.result)) {
        transactions = json.result;
        hasMore = json.result.length === pageSize;
      } else {
        transactions = [];
        hasMore = false;
      }
    } catch (err) {
      console.error('[ContractActivity] Failed to load:', err);
      transactions = [];
      hasMore = false;
    } finally {
      isLoading = false;
    }
  }

  async function loadUsers() {
    try {
      const res = await adminService.listUsers({ page: 1, limit: 100 });
      if (res?.success && res.data) {
        allUsersMap = new Map(res.data.users.map(u => [u.walletAddress.toLowerCase(), u]));
      }
    } catch (err) {
      console.error('[ContractActivity] Failed to load users:', err);
    }
  }

  function goToPage(page: number) {
    if (page < 1) return;
    currentPage = page;
    loadTransactions(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function changePageSize(newSize: number) {
    pageSize = newSize;
    currentPage = 1;
    loadTransactions(1);
  }

  onMount(() => {
    loadTransactions(1);
    loadUsers();
  });
</script>

<svelte:head>
  <title>Smart Contract Activity | DecentraShare</title>
</svelte:head>

{#if !isAdmin}
  <div class="w-full min-h-[60vh] flex items-center justify-center" in:fade>
    <div class="text-center space-y-4">
      <div class="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
        <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
      </div>
      <h2 class="text-lg font-bold text-white">Access Denied</h2>
      <p class="text-sm text-gray-400">This page is only available to platform administrators.</p>
      <a href="/dashboard" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors">
        ← Back to Dashboard
      </a>
    </div>
  </div>
{:else}
  <div class="w-full max-w-[1400px] mx-auto space-y-6" in:fly={{ y: 20, duration: 400 }}>
    
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
        </div>
        <div>
          <h1 class="text-lg md:text-xl font-semibold text-white">Smart Contract Activity</h1>
          <p class="text-xs text-gray-500 font-mono">{formatAddress(CONTRACT_ADDRESS)}</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[9px] font-black px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 uppercase tracking-widest">Sepolia Testnet</span>
        <a href="https://sepolia.etherscan.io/address/{CONTRACT_ADDRESS}" target="_blank" rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          View on Etherscan
        </a>
      </div>
    </div>

    <!-- Table -->
    <div class="relative backdrop-blur-2xl bg-[#0a0a0f]/80 border border-white/10 rounded-2xl shadow-xl overflow-hidden">
      {#if isLoading}
        <div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 animate-pulse"></div>
      {/if}

      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm border-collapse">
          <thead>
            <tr class="border-b border-white/5 text-gray-500 text-xs uppercase tracking-wider">
              <th class="px-4 py-3.5 font-medium">Tx Hash</th>
              <th class="px-4 py-3.5 font-medium">Block</th>
              <th class="px-4 py-3.5 font-medium">Method</th>
              <th class="px-4 py-3.5 font-medium">From</th>
              <th class="px-4 py-3.5 font-medium hidden md:table-cell">Gas Used</th>
              <th class="px-4 py-3.5 font-medium hidden lg:table-cell">Gas Cost</th>
              <th class="px-4 py-3.5 font-medium hidden lg:table-cell">Value</th>
              <th class="px-4 py-3.5 font-medium">Time</th>
              <th class="px-4 py-3.5 font-medium text-center">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            {#if isLoading}
              {#each Array(5) as _}
                <tr><td colspan="9" class="p-4"><div class="h-5 w-full bg-white/5 rounded animate-pulse"></div></td></tr>
              {/each}
            {:else if transactions.length === 0}
              <tr>
                <td colspan="9" class="p-12 text-center">
                  <div class="space-y-3">
                    <svg class="w-10 h-10 text-gray-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    <p class="text-gray-500 text-sm">No transactions found for this contract.</p>
                  </div>
                </td>
              </tr>
            {:else}
              {#each transactions as tx (tx.hash)}
                {@const matchedUser = allUsersMap.get(tx.from.toLowerCase())}
                <tr class="hover:bg-white/[0.02] transition-colors">
                  <!-- Tx Hash -->
                  <td class="px-4 py-3">
                    <a href="https://sepolia.etherscan.io/tx/{tx.hash}" target="_blank" rel="noopener noreferrer"
                      class="font-mono text-[11px] text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 transition-colors">
                      {tx.hash.slice(0, 10)}...{tx.hash.slice(-6)}
                      <svg class="w-2.5 h-2.5 opacity-60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                    </a>
                  </td>

                  <!-- Block -->
                  <td class="px-4 py-3">
                    <a href="https://sepolia.etherscan.io/block/{tx.blockNumber}" target="_blank" rel="noopener noreferrer"
                      class="font-mono text-[11px] text-gray-400 hover:text-blue-400 transition-colors">
                      {tx.blockNumber}
                    </a>
                  </td>

                  <!-- Method -->
                  <td class="px-4 py-3">
                    <span class="font-mono px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-300">
                      {formatTxMethod(tx)}
                    </span>
                  </td>

                  <!-- From -->
                  <td class="px-4 py-3">
                    {#if matchedUser}
                      <button
                        type="button"
                        onclick={() => openProfileModal(matchedUser)}
                        class="group/from flex items-center gap-2 p-1 rounded-lg hover:bg-white/5 transition-all duration-200 cursor-pointer text-left focus:outline-none"
                      >
                        <div class="w-6 h-6 rounded-full overflow-hidden bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 group-hover/from:border-blue-400/40 flex items-center justify-center shrink-0 transition-all duration-200">
                          {#if matchedUser.avatarUrl}
                            <img src={matchedUser.avatarUrl} alt="" class="w-full h-full object-cover" />
                          {:else}
                            <span class="text-[9px] font-bold text-blue-300">{(matchedUser.username || matchedUser.walletAddress || 'U').charAt(0).toUpperCase()}</span>
                          {/if}
                        </div>
                        <span class="text-[11px] text-gray-300 group-hover/from:text-blue-400 transition-colors truncate max-w-[100px]">
                          {matchedUser.username || formatAddress(tx.from)}
                        </span>
                      </button>
                    {:else}
                      <a href="https://sepolia.etherscan.io/address/{tx.from}" target="_blank" rel="noopener noreferrer"
                        class="font-mono text-[11px] text-gray-400 hover:text-blue-400 transition-colors">
                        {formatAddress(tx.from)}
                      </a>
                    {/if}
                  </td>

                  <!-- Gas Used -->
                  <td class="px-4 py-3 hidden md:table-cell font-mono text-[11px] text-gray-400">
                    {Number(tx.gasUsed).toLocaleString()}
                  </td>

                  <!-- Gas Cost -->
                  <td class="px-4 py-3 hidden lg:table-cell font-mono text-[11px] text-gray-500">
                    {formatGasCost(tx.gasUsed, tx.gasPrice)}
                  </td>

                  <!-- Value -->
                  <td class="px-4 py-3 hidden lg:table-cell font-mono text-[11px] text-gray-500">
                    {formatEthValue(tx.value)}
                  </td>

                  <!-- Time -->
                  <td class="px-4 py-3 text-[11px] text-gray-500" title={formatFullDate(tx.timeStamp)}>
                    {formatTimestamp(tx.timeStamp)}
                  </td>

                  <!-- Status -->
                  <td class="px-4 py-3 text-center">
                    {#if tx.txreceipt_status === '1' || tx.isError === '0'}
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Success
                      </span>
                    {:else}
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-black uppercase tracking-wider">
                        <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                        Failed
                      </span>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      {#if !isLoading && transactions.length > 0}
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-4 border-t border-white/5 bg-white/[0.015]">
          <div class="flex items-center gap-4">
            <div class="text-xs text-gray-500">
              Page <span class="text-gray-200 font-semibold">{currentPage}</span> ·
              Showing <span class="text-gray-200 font-semibold">{transactions.length}</span> transactions
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-gray-500 uppercase tracking-wider">Rows</span>
              <select
                value={pageSize}
                onchange={(e) => changePageSize(Number(e.currentTarget.value))}
                class="h-7 px-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 text-[10px] cursor-pointer hover:bg-white/10 transition-all"
              >
                {#each PAGE_SIZE_OPTIONS as size}
                  <option class="bg-[#0a0a0f] text-white" value={size}>{size}</option>
                {/each}
              </select>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button
              type="button"
              onclick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              class="w-8 h-8 flex items-center justify-center text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
            </button>

            {#each Array(Math.min(5, currentPage + (hasMore ? 1 : 0))) as _, i}
              {@const pageNum = Math.max(1, currentPage - 2) + i}
              {#if pageNum >= 1 && (pageNum <= currentPage || (pageNum === currentPage + 1 && hasMore))}
                <button
                  type="button"
                  onclick={() => goToPage(pageNum)}
                  class="min-w-8 h-8 px-2.5 flex items-center justify-center text-xs rounded-lg border transition-all
                    {pageNum === currentPage
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 font-semibold shadow-[0_0_10px_rgba(59,130,246,0.25)]'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'}"
                >
                  {pageNum}
                </button>
              {/if}
            {/each}

            <button
              type="button"
              onclick={() => goToPage(currentPage + 1)}
              disabled={!hasMore}
              class="w-8 h-8 flex items-center justify-center text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Profile Preview Modal -->
<ProfilePreviewModal
  isOpen={showProfileModal}
  onClose={closeProfileModal}
  profile={selectedProfile}
/>
