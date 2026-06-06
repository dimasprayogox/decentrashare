<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { storageService } from '$lib/services/storage/storage';

  // ── State ──
  let isLoading = $state(true);
  let allLogs = $state<any[]>([]);
  let searchQuery = $state('');
  let actionFilter = $state('ALL');
  let entityFilter = $state('ALL');
  
  // Pagination
  let currentPage = $state(1);
  let pageSize = $state(10);
  const PAGE_SIZE_OPTIONS = [10, 25, 50];

  // Copy indicator
  let copiedId = $state<string | null>(null);

  // Expanded row (untuk menampilkan detail document/folder yang tercatat)
  let expandedId = $state<string | null>(null);

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  function truncateHash(hash: string, head = 10, tail = 8): string {
    if (!hash) return '';
    if (hash.length <= head + tail + 3) return hash;
    return `${hash.slice(0, head)}...${hash.slice(-tail)}`;
  }

  // ── Actions List ──
  const actionTypes = [
    { value: 'ALL', label: 'All Actions' },
    { value: 'UPLOAD_IPFS', label: 'Upload' },
    { value: 'CREATE', label: 'Create' },
    { value: 'DOWNLOAD', label: 'Download' },
    { value: 'BULK_DOWNLOAD', label: 'Download' },
    { value: 'SHARE', label: 'Share' },
    { value: 'REVOKE', label: 'Revoke' },
    { value: 'RENAME', label: 'Rename' },
    { value: 'MOVE', label: 'Move' },
    { value: 'CHANGE_PRIVACY', label: 'Privacy' },
    { value: 'ARCHIVE', label: 'Archive' },
    { value: 'RESTORE', label: 'Restore' },
    { value: 'PERMANENT_DELETE', label: 'Delete' },
    { value: 'BLOCKCHAIN_CONFIRM', label: 'Blockchain' },
    { value: 'BLOCKCHAIN_CONFIRM_BATCH', label: 'Blockchain Confirm' },
  ];

  // ── Load Data ──
  async function loadLogs() {
    isLoading = true;
    try {
      const res = await storageService.getActivityLogs(50);
      if (res?.success && Array.isArray(res.data)) {
        allLogs = res.data;
      } else {
        allLogs = [];
      }
    } catch (err) {
      console.error('[ActivityPage] Failed to fetch activity logs:', err);
      allLogs = [];
    } finally {
      isLoading = false;
    }
  }

  // ── Computations & Stats ──
  const totalLogsCount = $derived(allLogs.length);
  const uploadsCount = $derived(allLogs.filter(l => l.action === 'UPLOAD' || l.action === 'UPLOAD_IPFS').length);
  const sharesCount = $derived(allLogs.filter(l => l.action === 'SHARE').length);
  const deletesCount = $derived(allLogs.filter(l => l.action === 'PERMANENT_DELETE' || l.action === 'ARCHIVE').length);

  // Filter & Search Logic
  const filteredLogs = $derived(
    allLogs.filter(log => {
      // 1. Search Query Match
      const searchLower = searchQuery.trim().toLowerCase();
      const matchesSearch = !searchLower || 
        (log.entityName && log.entityName.toLowerCase().includes(searchLower)) ||
        (log.details && log.details.toLowerCase().includes(searchLower)) ||
        (log.fileHash && log.fileHash.toLowerCase().includes(searchLower)) ||
        (log.ipfsHash && log.ipfsHash.toLowerCase().includes(searchLower)) ||
        (log.blockchainTx && log.blockchainTx.toLowerCase().includes(searchLower));

      // 2. Action Filter Match
      const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;

      // 3. Entity Filter Match
      const matchesEntity = entityFilter === 'ALL' || log.entityType === entityFilter;

      return matchesSearch && matchesAction && matchesEntity;
    })
  );

  // Pagination Logic
  const totalPages = $derived(Math.max(1, Math.ceil(filteredLogs.length / pageSize)));
  const paginatedLogs = $derived(
    filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );

  function setPage(page: number) {
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
    }
  }

  
  // ── Helpers ──
  function toDate(ts: string): Date {
    // Dukung ISO string (activity log: createdAt) maupun unix detik (string angka)
    if (/^\d+$/.test(String(ts).trim())) return new Date(Number(ts) * 1000);
    return new Date(ts);
  }

  function formatTimestamp(ts: string): string {
    const d = toDate(ts);
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
    const d = toDate(ts);
    return d.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  function getActionBadgeTheme(action: string) {
    switch (action) {
      case 'UPLOAD':
      case 'UPLOAD_IPFS':
        return { bg: 'bg-blue-500/10 border-blue-500/20 text-blue-400', label: 'Upload', icon: 'text-blue-400', iconBg: 'bg-blue-500/10' };
      case 'CREATE':
        return { bg: 'bg-blue-500/10 border-blue-500/20 text-blue-400', label: 'Create', icon: 'text-blue-400', iconBg: 'bg-blue-500/10' };
      case 'DOWNLOAD':
        return { bg: 'bg-sky-500/10 border-sky-500/20 text-sky-400', label: 'Download', icon: 'text-sky-400', iconBg: 'bg-sky-500/10' };
      case 'BULK_DOWNLOAD':
        return { bg: 'bg-sky-500/10 border-sky-500/20 text-sky-400', label: 'Bulk Download', icon: 'text-sky-400', iconBg: 'bg-sky-500/10' };
      case 'SHARE':
        return { bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', label: 'Share', icon: 'text-emerald-400', iconBg: 'bg-emerald-500/10' };
      case 'REVOKE':
        return { bg: 'bg-rose-500/10 border-rose-500/20 text-rose-400', label: 'Revoke', icon: 'text-rose-400', iconBg: 'bg-rose-500/10' };
      case 'RENAME':
      case 'MOVE':
        return { bg: 'bg-amber-500/10 border-amber-500/20 text-amber-400', label: action === 'RENAME' ? 'Rename' : 'Move', icon: 'text-amber-400', iconBg: 'bg-amber-500/10' };
      case 'CHANGE_PRIVACY':
        return { bg: 'bg-teal-500/10 border-teal-500/20 text-teal-400', label: 'Privacy', icon: 'text-teal-400', iconBg: 'bg-teal-500/10' };
      case 'ARCHIVE':
        return { bg: 'bg-orange-500/10 border-orange-500/20 text-orange-400', label: 'Archive', icon: 'text-orange-400', iconBg: 'bg-orange-500/10' };
      case 'RESTORE':
        return { bg: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400', label: 'Restore', icon: 'text-cyan-400', iconBg: 'bg-cyan-500/10' };
      case 'PERMANENT_DELETE':
        return { bg: 'bg-red-500/10 border-red-500/20 text-red-400', label: 'Permanent Delete', icon: 'text-red-400', iconBg: 'bg-red-500/10' };
      case 'CONFIRM_CHAIN':
      case 'BLOCKCHAIN_CONFIRM':
        return { bg: 'bg-purple-500/10 border-purple-500/20 text-purple-400', label: 'Blockchain', icon: 'text-purple-400', iconBg: 'bg-purple-500/10' };
      case 'BLOCKCHAIN_CONFIRM_BATCH':
        return { bg: 'bg-purple-500/10 border-purple-500/20 text-purple-400', label: 'Blockchain Confirm', icon: 'text-purple-400', iconBg: 'bg-purple-500/10' };
      case 'ADMIN_UPDATE_ROLE':
        return { bg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400', label: 'Role Update', icon: 'text-indigo-400', iconBg: 'bg-indigo-500/10' };
      case 'ADMIN_UPDATE_STORAGE_LIMIT':
        return { bg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400', label: 'Limit Update', icon: 'text-indigo-400', iconBg: 'bg-indigo-500/10' };
      default:
        return { bg: 'bg-gray-500/10 border-gray-500/20 text-gray-400', label: action.replace(/_/g, ' '), icon: 'text-gray-400', iconBg: 'bg-white/5' };
    }
  }

  function getActionIcon(action: string, color = 'text-blue-400'): string {
    const cls = `w-4 h-4 ${color}`;
    switch (action) {
      case 'UPLOAD':
      case 'UPLOAD_IPFS':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>`;
      case 'CREATE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>`;
      case 'DOWNLOAD':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>`;
      case 'BULK_DOWNLOAD':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11V5a2 2 0 00-2-2H7a2 2 0 00-2 2v6m14 0H5m14 0l-3 3m-8-3l3 3m1 0v6m-4-3l4 3 4-3"/></svg>`;
      case 'SHARE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 10.742l4.632-2.316m0 0a3 3 0 102.686-2.686 3 3 0 00-2.686 2.686zm-4.632 2.316a3 3 0 11-4.737 3.535 3 3 0 014.737-3.535zm0 0l4.632 2.316m0 0a3 3 0 102.686 2.686 3 3 0 00-2.686-2.686z"/></svg>`;
      case 'REVOKE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>`;
      case 'RENAME':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>`;
      case 'MOVE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>`;
      case 'ARCHIVE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>`;
      case 'RESTORE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v6h6M3.51 13a9 9 0 102.13-9.36L3 7"/></svg>`;
      case 'PERMANENT_DELETE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-8 0h10"/></svg>`;
      case 'CONFIRM_CHAIN':
      case 'BLOCKCHAIN_CONFIRM':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>`;
      case 'BLOCKCHAIN_CONFIRM_BATCH':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`;
      case 'CHANGE_PRIVACY':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>`;
      case 'ADMIN_UPDATE_ROLE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>`;
      case 'ADMIN_UPDATE_STORAGE_LIMIT':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/></svg>`;
      default:
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>`;
    }
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      setTimeout(() => { copiedId = null; }, 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  }

  // Ringkas JSON detail bulk menjadi teks pendek, mis. "6 files · 2.5 GB" atau "6 files processed"
  function formatDetails(details: string | null | undefined): string {
    if (!details) return '—';

    const trimmed = details.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return details;

    try {
      const data = JSON.parse(trimmed);

      const count =
        data.downloadedCount ?? data.uploadedCount ?? data.sharedCount ??
        data.movedCount ?? data.successCount ?? data.processedCount ??
        data.confirmedCount ??
        (Array.isArray(data.files) ? data.files.length : undefined) ??
        data.requestedCount ?? data.totalRequested ?? data.total;

      if (count === undefined) return '—';
      return `${count} ${count === 1 ? 'file' : 'files'}`;
    } catch {
      return details;
    }
  }

  // Ambil data terstruktur dari field details (untuk ditampilkan di panel detail)
  function parseDetails(details: string | null | undefined): {
    files: { id?: string; name: string }[];
    path?: string;
    txHash?: string;
    raw?: string;
  } {
    if (!details) return { files: [] };
    const trimmed = details.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return { files: [], raw: details };
    }
    try {
      const data = JSON.parse(trimmed);
      const files = Array.isArray(data.files)
        ? data.files.map((f: any) => (typeof f === 'string' ? { name: f } : { id: f?.id, name: f?.name ?? 'Unnamed' }))
        : [];
      return { files, path: data.path, txHash: data.txHash };
    } catch {
      return { files: [], raw: details };
    }
  }

  function parseRename(details: string | null | undefined): { from: string; to: string } | null {
    if (!details) return null;
    const match = details.match(/(?:Document|Folder) renamed from (.+?) to (.+?)$/i);
    if (match) {
      return { from: match[1], to: match[2] };
    }
    return null;
  }

  function parseMove(details: string | null | undefined): string | null {
    if (!details) return null;
    const match = details.match(/(?:Document|Folder) moved to (.+?)$/i);
    if (match) {
      return match[1];
    }
    return null;
  }

  onMount(() => {
    loadLogs();

    function handleActivitySearch(e: Event) {
      const detail = (e as CustomEvent).detail;
      searchQuery = detail?.query ?? '';
      currentPage = 1;
    }
    function handleActivityFilter(e: Event) {
      const detail = (e as CustomEvent).detail;
      actionFilter = detail?.action ?? 'ALL';
      entityFilter = detail?.entity ?? 'ALL';
      currentPage = 1;
    }

    window.addEventListener('decentrashare:activity-search', handleActivitySearch);
    window.addEventListener('decentrashare:activity-filter', handleActivityFilter);

    return () => {
      window.removeEventListener('decentrashare:activity-search', handleActivitySearch);
      window.removeEventListener('decentrashare:activity-filter', handleActivityFilter);
    };
  });
</script>

<svelte:head>
  <title>Activity Log | DecentraShare</title>
</svelte:head>

<div class="w-full max-w-[1400px] mx-auto space-y-8" in:fly={{ y: 20, duration: 400 }}>
  
  <!-- Header Section -->
  <div class="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 pb-2">
    <!-- Left: Title & Subtitle -->
    <div class="flex items-center gap-4">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Activity Log</h1>
    </div>
    </div>

    <!-- Right: Active filters indicator + Refresh -->
    <div class="flex flex-wrap items-center gap-3 w-full xl:w-auto">
      <!-- Active filter chips -->
      {#if searchQuery || actionFilter !== 'ALL' || entityFilter !== 'ALL'}
        <div class="flex flex-wrap items-center gap-2">
          {#if searchQuery}
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              "{searchQuery}"
            </span>
          {/if}
          {#if actionFilter !== 'ALL'}
            <span class="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs">
              {actionTypes.find(t => t.value === actionFilter)?.label ?? actionFilter}
            </span>
          {/if}
          {#if entityFilter !== 'ALL'}
            <span class="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs">
              {entityFilter === 'DOCUMENT' ? 'Documents' : 'Folders'}
            </span>
          {/if}
        </div>
      {/if}

      <!-- Refresh Button -->
      <button
          onclick={loadLogs}
          disabled={isLoading}
          class="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-[20px] font-medium text-xs hover:bg-white/10 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          title="Refresh activity logs"
        >
                {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
    </div>
  </div>

  

  <!-- Logs Table / List Layout -->
  <div class="backdrop-blur-2xl bg-[#0a0a0f]/80 border border-white/10 rounded-3xl shadow-2xl overflow-hidden relative">
    {#if isLoading}
      <div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 animate-pulse"></div>
    {/if}

    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm border-collapse">
        <thead>
          <tr class="border-b border-white/5 text-gray-500 text-xs uppercase tracking-wider">
            <th class="px-6 py-4 font-semibold w-[25%]">Event</th>
            <th class="px-6 py-4 font-semibold w-[20%]">Document/Folder Name</th>
            <th class="px-6 py-4 font-semibold text-center w-[25%]">Details</th>
            <th class="px-6 py-4 font-semibold w-[15%]">Time</th>
            <th class="px-6 py-4 font-semibold text-center w-[20%]">Status</th>
          </tr> 
        </thead> 
        <tbody class="divide-y divide-white/5">
          {#if isLoading}
            {#each Array(5) as _}
              <tr>
                <td colspan="4" class="px-6 py-5">
                  <div class="h-6 w-full bg-white/5 rounded-xl animate-pulse"></div>
                </td>
              </tr>
            {/each}
          {:else if paginatedLogs.length === 0}
            <tr>
              <td colspan="4" class="px-6 py-16 text-center">
                <div class="space-y-4 max-w-sm mx-auto">
                  <div class="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-gray-400 shadow-inner">
                    <svg class="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <h3 class="text-white font-bold text-lg">No matching logs</h3>
                  <p class="text-gray-500 text-xs leading-relaxed">We couldn't find any activities matching your filters or search query.</p>
                </div>
              </td>
            </tr>
          {:else}
            {#each paginatedLogs as log (log.id)}
              {@const badge = getActionBadgeTheme(log.action)}
              {@const isExpanded = expandedId === log.id}
              <tr class="hover:bg-white/[0.015] transition-all duration-200 {isExpanded ? 'bg-white/[0.015]' : ''}" in:fade>

                <!-- Event (Action) -->
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <span class="w-9 h-9 rounded-xl {badge.iconBg} border border-white/5 flex items-center justify-center shadow-inner shrink-0">
                      {@html getActionIcon(log.action, badge.icon)}
                    </span>
                    <div class="min-w-0 flex-1">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full border text-[12px] font-bold uppercase tracking-wider mb-1 {badge.bg}">
                        {badge.label}
                      </span>
                    </div>
                  </div>
                </td>

                 <!-- Event (Name) -->
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div class="min-w-0 flex-1">
                      <p class="text-gray-200 font-semibold truncate max-w-[250px]" title={log.entityName || 'Unnamed Entity'}>
                        {log.entityName || 'Unnamed Entity'}
                      </p>
                    </div>
                  </div>
                </td>

                <!-- Details -->
                <td class="px-6 py-4 text-center">
                  <button
                    type="button"
                    onclick={() => toggleExpand(log.id)}
                    aria-expanded={isExpanded}
                    aria-label="Toggle recorded details"
                    class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-colors text-[10px] font-semibold"
                  >
                    <span class="inline-flex items-center gap-1">
                      {#if log.entityType === 'FOLDER'}
                        <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                        Folder
                      {:else}
                        <svg class="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                        Document
                      {/if}
                    </span>
                    <svg class="w-3.5 h-3.5 transition-transform {isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                </td>

                <!-- Time -->
                <td class="px-6 py-4 text-xs text-gray-400 font-semibold whitespace-nowrap" title={formatFullDate(log.createdAt)}>
                  {formatTimestamp(log.createdAt)}
                </td>

                <!-- Status -->
                <td class="px-6 py-4 text-center">
                  <div class="flex items-center justify-center">
                    {#if log.blockchainTx}
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium shadow-[0_0_12px_rgba(168,85,247,0.1)]">
                        <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                        Verified
                      </span>
                    {:else if log.ipfsHash}
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium shadow-[0_0_12px_rgba(59,130,246,0.1)]">
                        <span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                        IPFS Synced
                      </span>
                    {:else}
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium shadow-[0_0_12px_rgba(16,185,129,0.1)]">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Completed
                      </span>
                    {/if}
                  </div>
                </td>
              </tr>

              {#if isExpanded}
                {@const parsed = parseDetails(log.details)}
                {@const renameInfo = parseRename(log.details)}
                {@const moveInfo = parseMove(log.details)}
                <tr class="bg-black/20" in:fade={{ duration: 150 }}>
                  <td colspan="5" class="px-6 py-4">
                    <div class="rounded-2xl border border-white/10 bg-white/[0.01] p-5 shadow-inner">
                      
                      <!-- Header Status Aksi -->
                      <div class="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
                        {#if log.action.includes('UPLOAD')}
                          <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                          <span class="text-xs font-bold uppercase tracking-wider text-blue-400">File Uploaded to IPFS</span>
                        {:else if log.action.includes('CONFIRM') || log.blockchainTx}
                          <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                          <span class="text-xs font-bold uppercase tracking-wider text-purple-400">Blockchain Confirmation Complete</span>
                        {:else if log.action === 'RENAME'}
                          <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                          <span class="text-xs font-bold uppercase tracking-wider text-amber-400">Resource Renamed</span>
                        {:else if log.action === 'MOVE'}
                          <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                          <span class="text-xs font-bold uppercase tracking-wider text-amber-400">Resource Moved</span>
                        {:else if log.action === 'SHARE' || log.action === 'REVOKE'}
                          <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                          <span class="text-xs font-bold uppercase tracking-wider text-emerald-400">Access Control Updated</span>
                        {:else if log.action === 'ARCHIVE' || log.action === 'PERMANENT_DELETE'}
                          <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          <span class="text-xs font-bold uppercase tracking-wider text-red-400">Resource Deleted / Archived</span>
                        {:else}
                          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          <span class="text-xs font-bold uppercase tracking-wider text-gray-400">System Activity Event</span>
                        {/if}
                      </div>

                      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                        
                        <!-- DETAIL UMUM -->
                        <div class="space-y-3">
                          <div>
                            <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Target Name</span>
                            <span class="text-gray-200 font-semibold text-sm">{log.entityName || '—'}</span>
                          </div>
                          
                          <div>
                            <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Entity Type</span>
                            <div class="mt-1">
                              <span class="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300 text-[10px] font-bold uppercase">{log.entityType === 'FOLDER' ? 'Folder' : 'Document'}</span>
                            </div>
                          </div>

                          <div>
                            <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Timestamp</span>
                            <span class="text-gray-300 font-medium">{formatFullDate(log.createdAt)}</span>
                          </div>
                        </div>

                        <!-- DETAIL AKSI SPESIFIK -->
                        <div class="space-y-4 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6">
                          
                          <!-- UPLOAD IPFS -->
                          {#if log.action.includes('UPLOAD')}
                            <div class="space-y-3">
                              {#if log.ipfsHash}
                                <div>
                                  <span class="text-[10px] uppercase font-bold text-blue-400 tracking-wider block mb-1">IPFS Storage (CID)</span>
                                  <div class="flex items-center gap-1.5">
                                    <a href={`https://gateway.pinata.cloud/ipfs/${log.ipfsHash}`} target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 hover:underline font-mono text-[11px] break-all">{log.ipfsHash}</a>
                                    <button type="button" onclick={() => copyToClipboard(log.ipfsHash || '', `ipfs-${log.id}`)} class="text-gray-500 hover:text-white transition-colors shrink-0">
                                      {#if copiedId === `ipfs-${log.id}`}
                                        <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                                      {:else}
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                                      {/if}
                                    </button>
                                  </div>
                                </div>
                              {/if}

                              {#if log.fileHash}
                                <div>
                                  <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block mb-0.5">Content Hash (SHA-256)</span>
                                  <div class="flex items-center gap-1.5">
                                    <span class="text-gray-300 font-mono text-[11px] break-all">{log.fileHash}</span>
                                    <button type="button" onclick={() => copyToClipboard(log.fileHash || '', `fh-${log.id}`)} class="text-gray-500 hover:text-white transition-colors shrink-0">
                                      {#if copiedId === `fh-${log.id}`}
                                        <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                                      {:else}
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                                      {/if}
                                    </button>
                                  </div>
                                </div>
                              {/if}
                            </div>

                          <!-- CONFIRM BLOCKCHAIN -->
                          {:else if log.action.includes('CONFIRM') || log.blockchainTx}
                            <div class="space-y-3">
                              {#if log.blockchainTx}
                                <div>
                                  <span class="text-[10px] uppercase font-bold text-purple-400 tracking-wider block mb-1">Blockchain Tx Hash</span>
                                  <div class="flex items-center gap-1.5">
                                    <a href={`https://sepolia.etherscan.io/tx/${log.blockchainTx}`} target="_blank" rel="noopener noreferrer" class="text-purple-400 hover:text-purple-300 hover:underline font-mono text-[11px] break-all">{log.blockchainTx}</a>
                                    <button type="button" onclick={() => copyToClipboard(log.blockchainTx || '', `tx-${log.id}`)} class="text-gray-500 hover:text-white transition-colors shrink-0">
                                      {#if copiedId === `tx-${log.id}`}
                                        <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                                      {:else}
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                                      {/if}
                                    </button>
                                  </div>
                                </div>
                              {/if}

                              <!-- Confirmed File (Single File Fallback) -->
                              {#if !parsed.files || parsed.files.length === 0}
                                <div class="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                                  <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Confirmed File</span>
                                  <div class="flex items-center gap-2">
                                    <svg class="w-3.5 h-3.5 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                                    <span class="text-xs font-semibold text-gray-200 truncate" title={log.entityName}>{log.entityName || 'Unnamed File'}</span>
                                  </div>
                                  {#if log.fileHash}
                                    <div class="text-[10px] font-mono text-gray-400">
                                      <span class="font-bold text-gray-500">HASH:</span> <span class="break-all">{log.fileHash}</span>
                                    </div>
                                  {/if}
                                  {#if log.ipfsHash}
                                    <div class="text-[10px] font-mono text-gray-400">
                                      <span class="font-bold text-gray-500">IPFS:</span> <a href={`https://gateway.pinata.cloud/ipfs/${log.ipfsHash}`} target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 hover:underline break-all">{log.ipfsHash}</a>
                                    </div>
                                  {/if}
                                </div>
                              {/if}

                              <div class="p-3 rounded-xl bg-purple-500/5 border border-purple-500/10">
                                <p class="text-gray-400 text-xs leading-relaxed">This record has been permanently verified and anchored on the Sepolia testnet Ethereum network.</p>
                              </div>
                            </div>

                          <!-- RENAME -->
                          {:else if log.action === 'RENAME' && renameInfo}
                            <div class="space-y-3">
                              <div>
                                <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block mb-1">Sebelum (Before)</span>
                                <div class="px-3 py-2 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-300 text-xs font-semibold line-through break-all">
                                  {renameInfo.from}
                                </div>
                              </div>
                              <div>
                                <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block mb-1">Sesudah (After)</span>
                                <div class="px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-emerald-300 text-xs font-semibold break-all">
                                  {renameInfo.to}
                                </div>
                              </div>
                            </div>

                          <!-- MOVE -->
                          {:else if log.action === 'MOVE' && moveInfo}
                            <div class="space-y-3">
                              <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Perubahan Lokasi</span>
                              <div class="flex items-center gap-3">
                                <span class="text-gray-400">Aksi</span>
                                <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                                <span class="text-gray-200 font-semibold">Dipindahkan ke: <span class="text-amber-400 uppercase font-mono">{moveInfo}</span></span>
                              </div>
                            </div>

                          <!-- SHARE / REVOKE -->
                          {:else if log.action === 'SHARE' || log.action === 'REVOKE'}
                            <div class="space-y-3">
                              <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Access Log</span>
                              <div class="p-3 rounded-xl bg-white/5 border border-white/10 text-gray-300">
                                {parsed.raw ?? log.details}
                              </div>
                            </div>

                          <!-- HAPUS (ARCHIVE ATAU PERMANENT DELETE) -->
                          {:else if log.action === 'ARCHIVE' || log.action === 'PERMANENT_DELETE'}
                            <div class="space-y-3">
                              <span class="text-[10px] uppercase font-bold text-red-400 tracking-wider block">Status Penghapusan</span>
                              <div class="p-3 rounded-xl bg-red-500/5 border border-red-500/10 text-red-300">
                                {#if log.action === 'ARCHIVE'}
                                  Dokumen dipindahkan ke Folder Sampah (Trash) dan semua akses sharing dinonaktifkan sementara.
                                {:else}
                                  Dokumen dan seluruh riwayat aksesnya telah dihapus secara permanen dari sistem.
                                {/if}
                              </div>
                            </div>

                          <!-- DEFAULT DETAILS -->
                          {:else}
                            {#if log.details && !parsed.files.length}
                              <div>
                                <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block mb-1">Details Summary</span>
                                <div class="text-gray-400 italic break-words leading-relaxed">{parsed.raw ?? formatDetails(log.details)}</div>
                              </div>
                            {/if}
                          {/if}

                          <!-- RECORDED FILES LIST (Selalu muncul jika ada parsed.files) -->
                          {#if parsed.files && parsed.files.length > 0}
                            <div class="space-y-2 mt-4 pt-4 border-t border-white/5">
                              <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">
                                {#if log.action.includes('UPLOAD')}
                                  Uploaded Files
                                {:else if log.action.includes('CONFIRM')}
                                  Confirmed Files
                                {:else if log.action.includes('DOWNLOAD')}
                                  Downloaded Files
                                {:else}
                                  Recorded Items
                                {/if}
                                ({parsed.files.length})
                              </span>
                              <div class="rounded-xl border border-white/10 bg-black/20 divide-y divide-white/5 max-h-52 overflow-y-auto">
                                {#each parsed.files as file, i (file.id ?? file.name + i)}
                                  <div class="flex items-center gap-2.5 px-3 py-2">
                                    <span class="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 text-[10px] font-bold text-blue-300">{i + 1}</span>
                                    <svg class="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                                    <span class="flex-1 min-w-0 text-gray-300 text-xs truncate" title={file.name}>{file.name}</span>
                                    {#if file.id}
                                      <span class="text-[9px] text-gray-600 font-mono shrink-0">{truncateHash(file.id, 6, 4)}</span>
                                    {/if}
                                  </div>
                                {/each}
                              </div>
                            </div>
                          {/if}

                        </div>

                      </div>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Pagination Footer -->
    {#if !isLoading && filteredLogs.length > 0}
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-white/5 bg-white/[0.01]">
        
        <!-- Left details -->
        <div class="flex items-center gap-4">
          <p class="text-xs text-gray-500">
            Showing <span class="text-gray-200 font-semibold">{paginatedLogs.length}</span> of <span class="text-gray-200 font-semibold">{filteredLogs.length}</span> logs
          </p>
          
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Rows per page:</span>
            <select
              bind:value={pageSize}
              onchange={() => currentPage = 1}
              class="h-8 px-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 text-xs cursor-pointer hover:bg-white/10 transition-all"
            >
              {#each PAGE_SIZE_OPTIONS as size}
                <option class="bg-[#0a0a0f] text-white" value={size}>{size}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- Right pagination controls -->
        <div class="flex items-center gap-1.5">
          <!-- Prev button -->
          <button
            onclick={() => setPage(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Previous page"
            class="w-8 h-8 flex items-center justify-center text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <!-- Pages -->
          {#each Array(totalPages) as _, idx}
            {@const pageNum = idx + 1}
            <button
              onclick={() => setPage(pageNum)}
              class="min-w-8 h-8 px-2 flex items-center justify-center text-xs rounded-lg border font-semibold transition-all
                {pageNum === currentPage
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'}"
            >
              {pageNum}
            </button>
          {/each}

          <!-- Next button -->
          <button
            onclick={() => setPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="Next page"
            class="w-8 h-8 flex items-center justify-center text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

      </div>
    {/if}
  </div>

</div>
