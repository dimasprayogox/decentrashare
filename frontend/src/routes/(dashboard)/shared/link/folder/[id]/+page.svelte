<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { storageService } from '$lib/services/storage/storage';
  import type { Document, Folder } from '$lib/types/storage';

  let folderDetail = $state<any>(null);
  let documents = $state<Document[]>([]);
  let isLoading = $state(true);
  let isDownloading = $state(false);
  let errorMessage = $state('');

  const folderId = $derived(page.params.id);

  function formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatDate(value?: string | Date | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function getFileIcon(mimeType: string): { icon: string; color: string } {
    if (mimeType.startsWith('image/')) return { icon: '🖼️', color: 'text-purple-400 bg-purple-500/10' };
    if (mimeType.startsWith('video/')) return { icon: '🎬', color: 'text-red-400 bg-red-500/10' };
    if (mimeType.startsWith('audio/')) return { icon: '🎵', color: 'text-green-400 bg-green-500/10' };
    if (mimeType.includes('pdf')) return { icon: '📄', color: 'text-orange-400 bg-orange-500/10' };
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return { icon: '📊', color: 'text-emerald-400 bg-emerald-500/10' };
    if (mimeType.includes('document') || mimeType.includes('word')) return { icon: '📝', color: 'text-blue-400 bg-blue-500/10' };
    return { icon: '📁', color: 'text-gray-400 bg-gray-500/10' };
  }

  async function loadFolder() {
    try {
      isLoading = true;
      errorMessage = '';

      const [detailRes, contentsRes] = await Promise.all([
        storageService.getFolderDetail(folderId),
        storageService.getFolderContents(folderId)
      ]);

      if (!detailRes.success) throw new Error(detailRes.message || 'Folder not found');
      folderDetail = detailRes.data;
      documents = contentsRes.success ? (contentsRes.data || []) : [];
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load folder';
    } finally {
      isLoading = false;
    }
  }

  async function downloadFolder() {
    if (!folderDetail || isDownloading) return;
    try {
      isDownloading = true;
      await storageService.downloadFolder(folderId, folderDetail.name);
    } finally {
      isDownloading = false;
    }
  }

  async function downloadDocument(doc: Document) {
    try {
      await storageService.downloadDocument(doc.id, doc.fileName || doc.title);
    } catch (error) {
      console.error('Download failed:', error);
    }
  }

  function viewDocument(doc: Document) {
    goto(`/shared/link/document/${doc.id}`);
  }

  onMount(() => { void loadFolder(); });
</script>

<main class="min-h-full p-4 sm:p-6 md:p-10 max-w-[1600px] mx-auto">
  <div class="mb-6">
    <button onclick={() => goto('/shared')} class="mb-4 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
      Back to Shared
    </button>
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">
          {#if folderDetail}
            <span class="mr-2">📂</span>{folderDetail.name}
          {:else}
            Shared Folder
          {/if}
        </h1>
        <p class="text-sm text-gray-500 mt-1">This folder was shared with you via link</p>
      </div>
      {#if folderDetail && documents.length > 0}
        <button onclick={downloadFolder} disabled={isDownloading} class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:bg-blue-600/60">
          {#if isDownloading}
            <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Downloading...
          {:else}
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Download All
          {/if}
        </button>
      {/if}
    </div>
  </div>

  {#if isLoading}
    <div class="min-h-[400px] flex flex-col items-center justify-center rounded-[32px] border border-white/5 bg-white/[0.01] text-gray-300">
      <div class="w-10 h-10 rounded-full border-2 border-white/10 border-t-blue-400 animate-spin mb-4"></div>
      <p>Loading folder...</p>
    </div>
  {:else if errorMessage}
    <div class="min-h-[400px] flex flex-col items-center justify-center rounded-[32px] border border-red-500/20 bg-red-500/10 text-center px-6">
      <svg class="w-16 h-16 text-red-400/50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
      <p class="text-red-400 font-semibold mb-2">{errorMessage}</p>
      <button onclick={() => goto('/shared')} class="text-sm text-blue-400 hover:underline">Go to Shared with me</button>
    </div>
  {:else if folderDetail}
    <!-- Folder Info Card -->
    <div class="rounded-[28px] border border-white/10 bg-[#111115] p-5 mb-6">
      <div class="flex items-center gap-4">
        <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-2xl">📂</div>
        <div class="flex-1 min-w-0">
          <h2 class="text-lg font-bold text-white truncate">{folderDetail.name}</h2>
          <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
            {#if folderDetail.owner}
              <span>Owner: <span class="text-gray-300">{folderDetail.owner.username || folderDetail.owner.walletAddress}</span></span>
            {/if}
            <span>{documents.length} file{documents.length !== 1 ? 's' : ''}</span>
            <span>Created {formatDate(folderDetail.createdAt)}</span>
          </div>
        </div>
        <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wide bg-blue-500/10 text-blue-400">Link Only</span>
      </div>
    </div>

    <!-- Documents List -->
    {#if documents.length === 0}
      <div class="min-h-[300px] flex flex-col items-center justify-center rounded-[32px] border border-white/5 bg-white/[0.01] text-center">
        <div class="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 text-3xl">📭</div>
        <p class="text-gray-400 font-semibold">This folder is empty</p>
        <p class="text-gray-600 text-sm mt-1">No files have been added yet</p>
      </div>
    {:else}
      <div class="rounded-[28px] border border-white/10 bg-[#111115] overflow-hidden">
        <div class="border-b border-white/10 bg-white/[0.03] px-5 py-3">
          <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest">Files ({documents.length})</h3>
        </div>
        <div class="divide-y divide-white/5">
          {#each documents as doc}
            {@const fileTheme = getFileIcon(doc.mimeType)}
            <div class="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors group">
              <div class="w-10 h-10 rounded-xl {fileTheme.color} flex items-center justify-center text-lg shrink-0">{fileTheme.icon}</div>
              <div class="flex-1 min-w-0">
                <button onclick={() => viewDocument(doc)} class="text-sm font-semibold text-white hover:text-blue-400 transition-colors truncate block w-full text-left">{doc.title || doc.fileName}</button>
                <div class="flex gap-3 mt-0.5 text-xs text-gray-500">
                  <span>{formatFileSize(doc.fileSize)}</span>
                  <span>{formatDate(doc.createdAt)}</span>
                </div>
              </div>
              <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick={() => viewDocument(doc)} class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 hover:text-white transition-colors">View</button>
                <button onclick={() => downloadDocument(doc)} class="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-xs text-blue-400 hover:text-blue-300 transition-colors">Download</button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</main>
