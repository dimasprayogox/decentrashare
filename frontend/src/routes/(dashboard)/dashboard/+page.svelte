<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { storageService } from '$lib/services/storage/storage';
  import type { Document, Folder } from '$lib/types/storage';

  // ── State ──
  let isLoading = $state(true);
  let totalFiles = $state(0);
  let totalFolders = $state(0);
  let sharedWithMeCount = $state(0);
  let onChainCount = $state(0);
  let storageUsed = $state(0);
  let storageQuota = $state(5 * 1024 * 1024 * 1024);
  let recentFiles = $state<Document[]>([]);
  let recentActivity = $state<Array<{ id: string; action: string; entityName: string; entityType: string; createdAt: string; details?: string | null }>>([]);

  // ── Helpers ──
  function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function getFileIcon(mimeType: string): { icon: string; color: string; bg: string } {
    if (mimeType?.includes('image')) return { icon: '🖼️', color: 'text-purple-400', bg: 'bg-purple-500/10' };
    if (mimeType?.includes('video')) return { icon: '🎬', color: 'text-red-400', bg: 'bg-red-500/10' };
    if (mimeType?.includes('audio')) return { icon: '🎵', color: 'text-pink-400', bg: 'bg-pink-500/10' };
    if (mimeType?.includes('pdf')) return { icon: '📄', color: 'text-orange-400', bg: 'bg-orange-500/10' };
    if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return { icon: '📊', color: 'text-green-400', bg: 'bg-green-500/10' };
    if (mimeType?.includes('presentation') || mimeType?.includes('powerpoint')) return { icon: '📽️', color: 'text-amber-400', bg: 'bg-amber-500/10' };
    if (mimeType?.includes('word') || mimeType?.includes('document')) return { icon: '📝', color: 'text-blue-400', bg: 'bg-blue-500/10' };
    if (mimeType?.includes('zip') || mimeType?.includes('archive') || mimeType?.includes('compressed')) return { icon: '📦', color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
    return { icon: '📎', color: 'text-gray-400', bg: 'bg-white/5' };
  }

  function getActivityIcon(action: string): string {
    switch (action) {
      case 'UPLOAD_IPFS': return '⬆️';
      case 'DOWNLOAD': case 'BULK_DOWNLOAD': return '⬇️';
      case 'PERMANENT_DELETE': return '🗑️';
      case 'BLOCKCHAIN_CONFIRM_BATCH': return '⛓️';
      default: return '📋';
    }
  }

  function getActivityLabel(action: string): string {
    switch (action) {
      case 'UPLOAD_IPFS': return 'Uploaded';
      case 'DOWNLOAD': return 'Downloaded';
      case 'BULK_DOWNLOAD': return 'Bulk downloaded';
      case 'PERMANENT_DELETE': return 'Deleted';
      case 'BLOCKCHAIN_CONFIRM_BATCH': return 'Confirmed on-chain';
      default: return action.replace(/_/g, ' ').toLowerCase();
    }
  }

  const storagePercent = $derived(storageQuota > 0 ? Math.min(100, (storageUsed / storageQuota) * 100) : 0);

  // ── Data Loading ──
  onMount(async () => {
    try {
      const [
        docsRes,
        foldersRes,
        sharedDocsRes,
        sharedFoldersRes,
        usageRes,
        logsRes,
      ] = await Promise.allSettled([
        storageService.getRootDocuments(),
        storageService.getFolders(null),
        storageService.getSharedWithMe(),
        storageService.getSharedFoldersWithMe(),
        storageService.getMyStorageUsage(),
        storageService.getActivityLogs(10),
      ]);

      // Files count (root only as quick indicator)
      if (docsRes.status === 'fulfilled' && docsRes.value?.success && docsRes.value.data) {
        const docs = docsRes.value.data;
        totalFiles = docs.length;
        onChainCount = docs.filter((d: any) => d.isOnChain).length;
        recentFiles = docs
          .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
          .slice(0, 5);
      }

      // Folders count
      if (foldersRes.status === 'fulfilled' && foldersRes.value?.success && foldersRes.value.data) {
        totalFolders = foldersRes.value.data.length;
      }

      // Shared with me
      let sharedDocs = 0;
      let sharedFolders = 0;
      if (sharedDocsRes.status === 'fulfilled' && sharedDocsRes.value?.success && sharedDocsRes.value.data) {
        sharedDocs = sharedDocsRes.value.data.length;
      }
      if (sharedFoldersRes.status === 'fulfilled' && sharedFoldersRes.value?.success && sharedFoldersRes.value.data) {
        sharedFolders = sharedFoldersRes.value.data.length;
      }
      sharedWithMeCount = sharedDocs + sharedFolders;

      // Storage usage
      if (usageRes.status === 'fulfilled' && usageRes.value?.success && usageRes.value.data) {
        storageUsed = usageRes.value.data.usedBytes ?? 0;
        storageQuota = usageRes.value.data.quotaBytes ?? 5 * 1024 * 1024 * 1024;
      }

      // Activity logs
      if (logsRes.status === 'fulfilled' && logsRes.value?.success && logsRes.value.data) {
        recentActivity = logsRes.value.data.slice(0, 8);
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load stats:', err);
    } finally {
      isLoading = false;
    }
  });
</script>

<svelte:head>
  <title>Dashboard | DecentraShare</title>
</svelte:head>

<div class="w-full max-w-[1400px] mx-auto space-y-8" in:fade={{ duration: 200 }}>

  <!-- ═══ WELCOME BANNER ═══ -->
  <div class="relative overflow-hidden rounded-[28px] border border-white/5 bg-gradient-to-br from-blue-600/10 via-purple-600/5 to-transparent p-6 sm:p-8">
    <div class="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
    <div class="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4"></div>
    <div class="relative">
      <p class="text-xs font-black uppercase tracking-[0.3em] text-blue-400/80 mb-2">Dashboard</p>
      <h1 class="text-2xl sm:text-3xl font-black text-white tracking-tight">
        Welcome to <span class="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">DecentraShare</span>
      </h1>
      <p class="text-sm text-gray-500 mt-2 max-w-lg">
        Your decentralized file sharing hub. Upload, share, and verify files on Ethereum & IPFS.
      </p>
    </div>
  </div>

  <!-- ═══ STAT CARDS ═══ -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <!-- Files -->
    <div class="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-5 hover:border-blue-500/20 hover:bg-white/[0.04] transition-all duration-300">
      <div class="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative">
        <div class="flex items-center justify-between mb-3">
          <div class="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-gray-600">Files</span>
        </div>
        {#if isLoading}
          <div class="h-8 w-16 bg-white/5 rounded-lg animate-pulse"></div>
        {:else}
          <p class="text-2xl font-black text-white" in:fly={{ y: 10, duration: 300 }}>{totalFiles}</p>
        {/if}
        <p class="text-xs text-gray-500 mt-1">Root documents</p>
      </div>
    </div>

    <!-- Folders -->
    <div class="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-5 hover:border-purple-500/20 hover:bg-white/[0.04] transition-all duration-300">
      <div class="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative">
        <div class="flex items-center justify-between mb-3">
          <div class="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
          </div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-gray-600">Folders</span>
        </div>
        {#if isLoading}
          <div class="h-8 w-16 bg-white/5 rounded-lg animate-pulse"></div>
        {:else}
          <p class="text-2xl font-black text-white" in:fly={{ y: 10, duration: 300, delay: 50 }}>{totalFolders}</p>
        {/if}
        <p class="text-xs text-gray-500 mt-1">Root folders</p>
      </div>
    </div>

    <!-- Shared -->
    <div class="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-5 hover:border-emerald-500/20 hover:bg-white/[0.04] transition-all duration-300">
      <div class="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative">
        <div class="flex items-center justify-between mb-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-gray-600">Shared</span>
        </div>
        {#if isLoading}
          <div class="h-8 w-16 bg-white/5 rounded-lg animate-pulse"></div>
        {:else}
          <p class="text-2xl font-black text-white" in:fly={{ y: 10, duration: 300, delay: 100 }}>{sharedWithMeCount}</p>
        {/if}
        <p class="text-xs text-gray-500 mt-1">Shared with me</p>
      </div>
    </div>

    <!-- On-Chain -->
    <div class="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-5 hover:border-amber-500/20 hover:bg-white/[0.04] transition-all duration-300">
      <div class="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative">
        <div class="flex items-center justify-between mb-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-gray-600">On-Chain</span>
        </div>
        {#if isLoading}
          <div class="h-8 w-16 bg-white/5 rounded-lg animate-pulse"></div>
        {:else}
          <p class="text-2xl font-black text-white" in:fly={{ y: 10, duration: 300, delay: 150 }}>{onChainCount}</p>
        {/if}
        <p class="text-xs text-gray-500 mt-1">Verified on Ethereum</p>
      </div>
    </div>
  </div>

  <!-- ═══ STORAGE BAR ═══ -->
  <div class="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/></svg>
        </div>
        <div>
          <p class="text-sm font-semibold text-white">Storage Usage</p>
          <p class="text-xs text-gray-500">{formatBytes(storageUsed)} / {formatBytes(storageQuota)}</p>
        </div>
      </div>
      <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
        {storagePercent.toFixed(0)}%
      </span>
    </div>
    <div class="h-2 bg-white/5 rounded-full overflow-hidden">
      <div
        class="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-700 ease-out"
        style="width: {Math.max(storagePercent, 0.5)}%"
      ></div>
    </div>
  </div>

  <!-- ═══ BOTTOM GRID: Recent Files + Activity ═══ -->
  <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">

    <!-- Recent Files (3/5) -->
    <div class="lg:col-span-3 rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
      <div class="flex items-center justify-between p-5 border-b border-white/5">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <h3 class="text-sm font-bold text-white">Recent Files</h3>
        </div>
        <a href="/storage" class="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium">View all →</a>
      </div>

      {#if isLoading}
        <div class="p-5 space-y-3">
          {#each Array(4) as _, i}
            <div class="flex items-center gap-3 animate-pulse">
              <div class="w-10 h-10 rounded-xl bg-white/5"></div>
              <div class="flex-1 space-y-2">
                <div class="h-3 w-36 bg-white/5 rounded"></div>
                <div class="h-2 w-20 bg-white/5 rounded"></div>
              </div>
            </div>
          {/each}
        </div>
      {:else if recentFiles.length === 0}
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <svg class="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
          </div>
          <p class="text-sm text-gray-500">No files uploaded yet</p>
          <a href="/storage" class="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors">Go to Storage →</a>
        </div>
      {:else}
        <div class="divide-y divide-white/5">
          {#each recentFiles as file, i (file.id)}
            {@const ft = getFileIcon(file.mimeType)}
            <div class="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.03] transition-colors" in:fly={{ y: 8, duration: 200, delay: i * 40 }}>
              <div class="w-10 h-10 rounded-xl {ft.bg} flex items-center justify-center text-base shrink-0">{ft.icon}</div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-white truncate">{file.title || file.fileName}</p>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="text-[10px] text-gray-500 font-mono">{formatBytes(file.fileSize)}</span>
                  {#if file.isOnChain}
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">ON-CHAIN</span>
                  {/if}
                </div>
              </div>
              <span class="text-[10px] text-gray-600 shrink-0">{formatDate(file.updatedAt || file.createdAt)}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Recent Activity (2/5) -->
    <div class="lg:col-span-2 rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
      <div class="flex items-center justify-between p-5 border-b border-white/5">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
          </div>
          <h3 class="text-sm font-bold text-white">Activity</h3>
        </div>
      </div>

      {#if isLoading}
        <div class="p-5 space-y-4">
          {#each Array(5) as _, i}
            <div class="flex items-start gap-3 animate-pulse">
              <div class="w-8 h-8 rounded-lg bg-white/5"></div>
              <div class="flex-1 space-y-2">
                <div class="h-3 w-28 bg-white/5 rounded"></div>
                <div class="h-2 w-16 bg-white/5 rounded"></div>
              </div>
            </div>
          {/each}
        </div>
      {:else if recentActivity.length === 0}
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <svg class="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          </div>
          <p class="text-sm text-gray-500">No activity yet</p>
        </div>
      {:else}
        <div class="divide-y divide-white/5">
          {#each recentActivity as log, i (log.id)}
            <div class="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors" in:fly={{ y: 8, duration: 200, delay: i * 30 }}>
              <div class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-sm shrink-0 mt-0.5">
                {getActivityIcon(log.action)}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs text-gray-300">
                  <span class="font-medium text-white">{getActivityLabel(log.action)}</span>
                  <span class="text-gray-500"> · </span>
                  <span class="truncate">{log.entityName}</span>
                </p>
                <p class="text-[10px] text-gray-600 mt-0.5">{formatDate(log.createdAt)}</p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- ═══ QUICK ACTIONS ═══ -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <a href="/storage" class="group flex items-center gap-3 p-4 rounded-2xl border border-white/5 bg-white/[0.02] hover:border-blue-500/20 hover:bg-blue-500/5 transition-all duration-200">
      <div class="w-10 h-10 rounded-xl bg-blue-500/10 group-hover:bg-blue-500/20 flex items-center justify-center transition-colors">
        <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0L8 8m4-4l4 4"/></svg>
      </div>
      <div>
        <p class="text-sm font-semibold text-white">Upload</p>
        <p class="text-[10px] text-gray-500">Add new files</p>
      </div>
    </a>

    <a href="/explore" class="group flex items-center gap-3 p-4 rounded-2xl border border-white/5 bg-white/[0.02] hover:border-emerald-500/20 hover:bg-emerald-500/5 transition-all duration-200">
      <div class="w-10 h-10 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500/20 flex items-center justify-center transition-colors">
        <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
      </div>
      <div>
        <p class="text-sm font-semibold text-white">Explore</p>
        <p class="text-[10px] text-gray-500">Public files</p>
      </div>
    </a>

    <a href="/shared" class="group flex items-center gap-3 p-4 rounded-2xl border border-white/5 bg-white/[0.02] hover:border-purple-500/20 hover:bg-purple-500/5 transition-all duration-200">
      <div class="w-10 h-10 rounded-xl bg-purple-500/10 group-hover:bg-purple-500/20 flex items-center justify-center transition-colors">
        <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
      </div>
      <div>
        <p class="text-sm font-semibold text-white">Shared</p>
        <p class="text-[10px] text-gray-500">With me</p>
      </div>
    </a>

    <a href="/validate" class="group flex items-center gap-3 p-4 rounded-2xl border border-white/5 bg-white/[0.02] hover:border-amber-500/20 hover:bg-amber-500/5 transition-all duration-200">
      <div class="w-10 h-10 rounded-xl bg-amber-500/10 group-hover:bg-amber-500/20 flex items-center justify-center transition-colors">
        <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
      </div>
      <div>
        <p class="text-sm font-semibold text-white">Validate</p>
        <p class="text-[10px] text-gray-500">Check on-chain</p>
      </div>
    </a>
  </div>

</div>
