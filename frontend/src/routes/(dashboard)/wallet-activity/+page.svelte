<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { ethers } from 'ethers';
  import { PUBLIC_ETHERSCAN_API_KEY } from '$env/static/public';

  // ── State ──
  let isLoading = $state(true);
  let web3Loading = $state(true);
  let isConnected = $state(false);
  let walletAddress = $state<string | null>(null);
  let allTxLogs = $state<any[]>([]);
  let searchQuery = $state('');
  let methodFilter = $state('ALL');
  
  // Pagination
  let currentPage = $state(1);
  let pageSize = $state(10);
  const PAGE_SIZE_OPTIONS = [10, 25, 50];

  // Copy indicator
  let copiedId = $state<string | null>(null);

  // Etherscan API Key from environment variables
  const ETHERSCAN_API_KEY = PUBLIC_ETHERSCAN_API_KEY;

  // ── Check Wallet Connection ──
  async function checkWalletConnection() {
    web3Loading = true;
    if (typeof window === 'undefined' || !window.ethereum) {
      isConnected = false;
      walletAddress = null;
      web3Loading = false;
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_accounts", []);
      if (accounts.length > 0) {
        walletAddress = accounts[0];
        isConnected = true;
      } else {
        walletAddress = null;
        isConnected = false;
      }
    } catch (err) {
      console.warn('[WalletActivity] Error checking wallet connection:', err);
      walletAddress = null;
      isConnected = false;
    } finally {
      web3Loading = false;
    }
  }

  // ── Load Transactions from Etherscan ──
  async function loadTransactions() {
    if (!walletAddress) {
      allTxLogs = [];
      isLoading = false;
      return;
    }

    isLoading = true;
    try {
      // Query Etherscan for transaction history of the connected ewallet address on Sepolia
      const url = `https://api.etherscan.io/v2/api?chainid=11155111&module=account&action=txlist&address=${walletAddress}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
      const res = await fetch(url);
      const json = await res.json();
      
      if (json.status === '1' && Array.isArray(json.result)) {
        allTxLogs = json.result.map((tx: any) => {
          const isDecentraShare = tx.to && tx.to.toLowerCase() === '0xa56de256d4afd0cdf9860fccd281147b67f6ae85';
          const selector = tx.input ? tx.input.slice(0, 10).toLowerCase() : '';
          let method = 'Transfer';

          const isBulk = selector === '0x85e48dd2' || tx.functionName?.includes('recordFilesBatch') || tx.functionName?.includes('getStakePercentage');
          const isSingle = selector === '0x23c83113' || tx.functionName?.includes('recordFile');

          if (isBulk) {
            method = 'recordFile';
          } else if (isSingle) {
            method = 'recordFile';
          } else if (isDecentraShare) {
            if (tx.functionName) {
              method = tx.functionName.split('(')[0];
            } else {
              method = 'Contract Call';
            }
          } else {
            if (tx.functionName) {
              method = tx.functionName.split('(')[0];
            } else if (tx.input && tx.input !== '0x') {
              method = 'Contract Call';
            } else {
              method = 'Transfer';
            }
          }

          // Calculate gas fee cost in ETH using BigInt to prevent integer overflow
          let costEth = '0.000000 ETH';
          try {
            const priceVal = BigInt(tx.gasPrice || '0');
            const usedVal = BigInt(tx.gasUsed || '0');
            const costWei = priceVal * usedVal;
            costEth = parseFloat(ethers.formatEther(costWei)).toFixed(6) + ' ETH';
          } catch (calcErr) {
            console.warn('[WalletActivityPage] Error calculating cost for tx:', tx.hash, calcErr);
          }

          return {
            id: tx.hash,
            hash: tx.hash,
            method,
            gasUsed: Number(tx.gasUsed).toLocaleString(),
            cost: costEth,
            time: tx.timeStamp,
            status: tx.isError === '0' ? 'Confirmed' : 'Failed'
          };
        });
      } else {
        allTxLogs = [];
      }
    } catch (err) {
      console.error('[WalletActivityPage] Failed to fetch transaction logs from Etherscan:', err);
      allTxLogs = [];
    } finally {
      isLoading = false;
    }
  }

  function handleAccountsChanged(accounts: string[]) {
    if (accounts.length > 0) {
      walletAddress = accounts[0];
      isConnected = true;
    } else {
      walletAddress = null;
      isConnected = false;
    }
    loadTransactions();
  }

  onMount(async () => {
    await checkWalletConnection();
    await loadTransactions();

    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', () => window.location.reload());
    }

    return () => {
      if (typeof window !== 'undefined' && window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    };
  });

  // Extract unique methods for filter
  const methodTypes = $derived([
    { value: 'ALL', label: 'All Methods' },
    ...Array.from(new Set(allTxLogs.map(tx => tx.method))).map(m => ({ value: m, label: m }))
  ]);

  // Filter & Search Logic
  const filteredTxs = $derived(
    allTxLogs.filter(tx => {
      const searchLower = searchQuery.trim().toLowerCase();
      const matchesSearch = !searchLower || 
        tx.hash.toLowerCase().includes(searchLower) ||
        tx.method.toLowerCase().includes(searchLower);

      const matchesMethod = methodFilter === 'ALL' || tx.method === methodFilter;

      return matchesSearch && matchesMethod;
    })
  );

  // Pagination Logic
  const totalPages = $derived(Math.max(1, Math.ceil(filteredTxs.length / pageSize)));
  const paginatedTxs = $derived(
    filteredTxs.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );

  function setPage(page: number) {
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
    }
  }

  // ── Helpers ──
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
</script>

<div class="space-y-8" in:fade={{ duration: 250 }}>
  <!-- Page Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div class="flex flex-col sm:flex-row sm:items-center gap-3">
      <h1 class="text-2xl font-extrabold text-white tracking-tight">Wallet Activity</h1>
    </div>
    
    <!-- Controls (Search, Filter, Refresh) in a single responsive row -->
    <div class="flex flex-wrap items-center gap-3">

      {#if isConnected && walletAddress}
        <a href="https://sepolia.etherscan.io/address/{walletAddress}" target="_blank" rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 hover:text-blue-400 hover:bg-white/10 transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          View on Etherscan
        </a>
      {/if}

      <!-- Refresh Button -->
      <button
        onclick={loadTransactions}
        disabled={isLoading || !isConnected}
        class="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-[20px] font-medium text-xs hover:bg-white/10 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
        title="Refresh transaction logs"
      >
        {#if isLoading && isConnected}
          Refreshing...
        {:else}
          Refresh
        {/if}
      </button>

    </div>
  </div>

  <!-- Transactions Table Section -->
  <div class="rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.01] to-transparent overflow-hidden shadow-xl">
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm border-collapse">
        <thead>
          <tr class="border-b border-white/5 text-gray-500 font-bold uppercase bg-white/[0.005]">
            <th class="p-4">blockchain tx</th>
            <th class="p-4">Method</th>
            <th class="p-4">Gas Used</th>
            <th class="p-4">Gas Cost</th>
            <th class="p-4">Time</th>
            <th class="p-4 text-center">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5 font-medium">
          {#if web3Loading}
            <tr>
              <td colspan="6" class="p-8 text-center text-gray-500 animate-pulse">Checking wallet connection...</td>
            </tr>
          {:else if !isConnected}
            <tr>
              <td colspan="6" class="p-8 text-center text-gray-500">
                <div class="flex flex-col items-center justify-center py-4">
                  <svg class="w-8 h-8 text-blue-500/40 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                  <p class="text-gray-400">Wallet is not connected</p>
                  <p class="text-xs text-gray-500 mt-1">Please connect your MetaMask wallet using the button in the top header.</p>
                </div>
              </td>
            </tr>
          {:else if isLoading}
            <tr>
              <td colspan="6" class="p-8 text-center text-gray-500 animate-pulse">Fetching transaction history...</td>
            </tr>
          {:else if paginatedTxs.length === 0}
            <tr>
              <td colspan="6" class="p-8 text-center text-gray-500">No transaction history found on Sepolia for this wallet.</td>
            </tr>
          {:else}
            {#each paginatedTxs as tx (tx.id)}
              <tr class="hover:bg-white/[0.015] transition-colors">
                <td class="p-4">
                  <div class="flex items-center gap-2">
                    <a href="https://sepolia.etherscan.io/tx/{tx.hash}" target="_blank" rel="noopener noreferrer" class="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1">
                      {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
                      <svg class="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                      </svg>
                    </a>
                  </div>
                </td>
                <td class="p-4">
                  {#if tx.method === 'Transfer'}
                    <span class="font-mono px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-xs text-green-400">
                      {tx.method}
                    </span>
                  {:else}
                    <span class="font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
                      {tx.method}
                    </span>
                  {/if}
                </td>
                <td class="p-4 font-mono text-xs text-gray-400">{tx.gasUsed} gas</td>
                <td class="p-4 text-gray-300 font-mono">{tx.cost}</td>
                <td class="p-4 text-xs text-gray-500" title={formatFullDate(tx.time)}>
                  {formatTimestamp(tx.time)}
                </td>
                <td class="p-4 text-center">
                  {#if tx.status === 'Confirmed'}
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 text-[10px] font-black uppercase tracking-wider">
                      {tx.status}
                    </span>
                  {:else}
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-black uppercase tracking-wider">
                      {tx.status}
                    </span>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Pagination Footer -->
    {#if isConnected && filteredTxs.length > 0}
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-white/5 bg-white/[0.005]">
        <div class="flex items-center gap-2 text-xs text-gray-500">
          <span>Show</span>
          <select
            bind:value={pageSize}
            class="bg-[#121214] border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300 focus:border-blue-500/50 outline-none"
          >
            {#each PAGE_SIZE_OPTIONS as size}
              <option value={size}>{size}</option>
            {/each}
          </select>
          <span>entries</span>
          <span class="mx-2">|</span>
          <span>Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredTxs.length)} of {filteredTxs.length} entries</span>
        </div>

        <div class="flex items-center gap-1">
          <button
            onclick={() => setPage(currentPage - 1)}
            disabled={currentPage === 1}
            class="px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] text-xs text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-50 transition-all cursor-pointer"
          >
            Previous
          </button>
          {#each Array(totalPages) as _, idx}
            {@const pageNum = idx + 1}
            <button
              onclick={() => setPage(pageNum)}
              class="w-8 h-8 rounded-lg border text-xs font-semibold transition-all cursor-pointer
                     {currentPage === pageNum ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' : 'border-white/5 bg-white/[0.02] text-gray-400 hover:text-white hover:bg-white/5'}"
            >
              {pageNum}
            </button>
          {/each}
          <button
            onclick={() => setPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            class="px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] text-xs text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-50 transition-all cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
