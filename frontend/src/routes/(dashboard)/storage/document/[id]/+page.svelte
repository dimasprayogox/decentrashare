<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import mammoth from 'mammoth/mammoth.browser';
  import * as XLSX from 'xlsx';
  import ProfilePreviewModal from '$lib/components/storage/ProfilePreviewModal.svelte';
  import { storageService } from '$lib/services/storage/storage';
  import type { Document } from '$lib/types/storage';

  type PreviewCategory = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'docx' | 'spreadsheet' | 'other';

  let documentDetail = $state<Document | null>(null);
  let isLoading = $state(true);
  let isPreviewLoading = $state(false);
  let isDownloading = $state(false);
  let errorMessage = $state('');
  let previewError = $state('');
  let previewBlobUrl = $state<string | null>(null);
  let textContent = $state('');
  let documentHtml = $state('');
  let sheetNames = $state<string[]>([]);
  let activeSheet = $state('');
  let sheetRows = $state<Array<Array<string | number | boolean | null>>>([]);
  let workbook = $state<XLSX.WorkBook | null>(null);
  let pdfDocument = $state<any>(null);
  let pdfPage = $state(1);
  let pdfPageCount = $state(0);
  let zoomLevel = $state(1);
  let pdfCanvas = $state<HTMLCanvasElement | null>(null);
  let publicSearchQuery = $state('');
  let publicSearchResults = $state<Document[]>([]);
  let isPublicSearchLoading = $state(false);
  let publicSearchError = $state('');
  let hasPublicSearchSubmitted = $state(false);
  let publicSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  let showProfileModal = $state(false);

  const documentId = $derived(page.params.id);

  function formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatDate(value?: string | Date | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getFileExtension(fileName = ''): string {
    return fileName.split('.').pop()?.toUpperCase() || 'FILE';
  }

  function getFileCategory(mimeType = '', fileName = ''): PreviewCategory {
    const mime = mimeType.toLowerCase();
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(extension)) return 'audio';
    if (mime === 'application/pdf' || extension === 'pdf') return 'pdf';
    if (extension === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (['xlsx', 'xls', 'csv'].includes(extension) || ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'].includes(mime)) return 'spreadsheet';
    if (
      mime.startsWith('text/') ||
      ['application/json', 'application/xml', 'application/javascript', 'application/typescript'].includes(mime) ||
      ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts', 'jsx', 'tsx', 'py', 'go', 'rs', 'java', 'php', 'rb', 'sol'].includes(extension)
    ) return 'text';
    return 'other';
  }

  function getPrivacyStyle(privacy?: string) {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      PRIVATE: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Private' },
      PUBLIC: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Public' },
      LINK_ONLY: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Link Only' },
      SPECIFIC_USER: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Specific User' }
    };
    return styles[privacy || ''] || { bg: 'bg-gray-500/10', text: 'text-gray-400', label: privacy || 'Unknown' };
  }

  function getOwnerName(owner: Document['owner']): string {
    if (!owner) return 'Unknown owner';
    return owner.username || owner.walletAddress || owner.id;
  }

  function getResultOwnerInitial(owner: Document['owner']): string {
    return getOwnerName(owner).slice(0, 1).toUpperCase();
  }

  function getFileTypeLabel(file: Document): string {
    return getFileExtension(file.fileName) || file.mimeType || 'FILE';
  }

  function shortAddress(value?: string | null): string {
    if (!value) return '—';
    if (value.length <= 16) return value;
    return `${value.slice(0, 8)}...${value.slice(-6)}`;
  }

  function clearPreview() {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    previewBlobUrl = null;
    textContent = '';
    documentHtml = '';
    sheetNames = [];
    activeSheet = '';
    sheetRows = [];
    workbook = null;
    pdfDocument = null;
    pdfPage = 1;
    pdfPageCount = 0;
    zoomLevel = 1;
    previewError = '';
  }

  function updateSheetRows(sheetName: string) {
    if (!workbook) return;
    activeSheet = sheetName;
    const sheet = workbook.Sheets[sheetName];
    sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false }).slice(0, 200) as Array<Array<string | number | boolean | null>>;
  }

  async function loadPreview(file: Document) {
    clearPreview();
    isPreviewLoading = true;

    try {
      const category = getFileCategory(file.mimeType, file.fileName);
      const blob = category === 'image'
        ? await storageService.fetchDocumentPreviewBlob(file.id, 'image/*')
        : await storageService.fetchDocumentPreviewBlob(file.id, file.mimeType || '*/*');

      previewBlobUrl = URL.createObjectURL(blob);

      if (category === 'text') {
        if (blob.size > 1_000_000) throw new Error('File is too large to preview inline');
        textContent = (await blob.text()).slice(0, 1_000_000);
      }

      if (category === 'docx') {
        const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
        documentHtml = result.value;
      }

      if (category === 'spreadsheet') {
        const data = await blob.arrayBuffer();
        workbook = XLSX.read(data, { type: 'array' });
        sheetNames = workbook.SheetNames;
        if (sheetNames.length > 0) updateSheetRows(sheetNames[0]);
      }

      if (category === 'pdf') {
        const [pdfjsLib, worker] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.mjs?url')
        ]);
        pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;
        const data = await blob.arrayBuffer();
        pdfDocument = await pdfjsLib.getDocument({ data }).promise;
        pdfPageCount = pdfDocument.numPages;
        pdfPage = 1;
      }
    } catch (error) {
      previewError = error instanceof Error ? error.message : 'Failed to load preview';
    } finally {
      isPreviewLoading = false;
    }
  }

  async function renderPdfPage() {
    if (!pdfDocument || !pdfCanvas) return;
    const page = await pdfDocument.getPage(pdfPage);
    const viewport = page.getViewport({ scale: zoomLevel });
    const canvas = pdfCanvas;
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
  }

  async function loadDocument() {
    try {
      isLoading = true;
      errorMessage = '';
      clearPreview();

      const response = await storageService.getDocumentDetail(documentId);
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Document not found');
      }

      documentDetail = response.data;
      await loadPreview(response.data);
    } catch (error: any) {
      if (error.status === 403 || error.message?.includes('Access denied')) {
        errorMessage = 'You do not have access to this folder / items';
      } else {
        errorMessage = error instanceof Error ? error.message : 'Failed to load document';
      }
      documentDetail = null;
    } finally {
      isLoading = false;
    }
  }

  async function downloadDocument() {
    if (!documentDetail || isDownloading) return;

    try {
      isDownloading = true;
      await storageService.downloadDocument(documentDetail.id, documentDetail.fileName);
    } finally {
      isDownloading = false;
    }
  }

  async function searchPublicDocuments() {
    const query = publicSearchQuery.trim();
    hasPublicSearchSubmitted = Boolean(query);

    if (query.length < 2) {
      publicSearchResults = [];
      publicSearchError = query.length === 1 ? 'Type at least 2 characters to search.' : '';
      isPublicSearchLoading = false;
      return;
    }

    try {
      isPublicSearchLoading = true;
      publicSearchError = '';
      const response = await storageService.searchPublicDocuments(query, 12);
      if (!response.success) throw new Error(response.message || 'Failed to search public documents.');
      publicSearchResults = (response.data || []).filter(item => item.id !== documentId);
    } catch (error) {
      publicSearchResults = [];
      publicSearchError = error instanceof Error ? error.message : 'Failed to search public documents.';
    } finally {
      isPublicSearchLoading = false;
    }
  }

  function handlePublicSearchInput() {
    if (publicSearchTimeout) clearTimeout(publicSearchTimeout);
    publicSearchTimeout = setTimeout(() => {
      void searchPublicDocuments();
    }, 300);
  }

  function clearPublicSearch() {
    if (publicSearchTimeout) clearTimeout(publicSearchTimeout);
    publicSearchQuery = '';
    publicSearchResults = [];
    publicSearchError = '';
    hasPublicSearchSubmitted = false;
    isPublicSearchLoading = false;
  }

  function openPublicDocument(id: string) {
    goto(`/storage/document/${id}`);
  }

  function goBackToOrigin() {
    if (window.history.length > 1) {
      history.back();
      return;
    }

    goto('/storage');
  }

  $effect(() => {
    pdfPage;
    zoomLevel;
    pdfDocument;
    pdfCanvas;
    void renderPdfPage();
  });

  onMount(() => {
    void loadDocument();
    return () => clearPreview();
  });

  onDestroy(() => {
    if (publicSearchTimeout) clearTimeout(publicSearchTimeout);
  });
</script>

<main class="min-h-full p-4 sm:p-6 md:p-10 max-w-[1600px] mx-auto">
  <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <button onclick={goBackToOrigin} class="mb-4 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        Back
      </button>
      <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Document Preview</h1>
    </div>

    {#if documentDetail}
      <button onclick={downloadDocument} disabled={isDownloading} class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:bg-blue-600/60">
        {#if isDownloading}
          <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          Downloading...
        {:else}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Download
        {/if}
      </button>
    {/if}
  </div>

  {#if isLoading}
    <div class="min-h-[520px] flex flex-col items-center justify-center rounded-[32px] border border-white/5 bg-white/[0.01] text-gray-300">
      <div class="w-10 h-10 rounded-full border-2 border-white/10 border-t-blue-400 animate-spin mb-4"></div>
      <p>Loading document...</p>
    </div>
  {:else if errorMessage}
    <div class="min-h-[420px] flex flex-col items-center justify-center rounded-[32px] border border-red-500/20 bg-red-500/10 text-center px-6">
      <p class="text-red-400 font-semibold mb-2">{errorMessage}</p>
      <button onclick={goBackToOrigin} class="text-sm text-blue-400 hover:underline">Go back</button>
    </div>
  {:else if documentDetail}
    {@const category = getFileCategory(documentDetail.mimeType, documentDetail.fileName)}
    {@const privacyStyle = getPrivacyStyle(documentDetail.privacy)}

    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
      <section class="rounded-[32px] border border-white/10 bg-[#111115] overflow-hidden min-h-[640px]">
        <div class="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div class="min-w-0">
            <h2 class="text-white font-bold truncate">{documentDetail.title}</h2>
          </div>
          <span class="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium uppercase tracking-wide {privacyStyle.bg} {privacyStyle.text}">{privacyStyle.label}</span>
        </div>

        <div class="p-4">
          {#if isPreviewLoading}
            <div class="min-h-[520px] flex flex-col items-center justify-center gap-4 text-gray-300">
              <div class="w-10 h-10 rounded-full border-2 border-white/10 border-t-blue-400 animate-spin"></div>
              <p class="text-sm">Loading preview...</p>
            </div>
          {:else if previewError}
            <div class="min-h-[520px] flex flex-col items-center justify-center text-center">
              <p class="text-red-400 text-sm mb-2">{previewError}</p>
              <button onclick={downloadDocument} class="text-blue-400 hover:underline text-sm">Download instead</button>
            </div>
          {:else if category === 'image' && previewBlobUrl}
            <div class="flex flex-col items-center overflow-auto max-h-[72vh]">
              <img src={previewBlobUrl} alt={documentDetail.title} class="max-w-full object-contain transition-transform duration-200" style="transform: scale({zoomLevel})" />
            </div>
          {:else if category === 'pdf'}
            <div class="flex flex-col items-center gap-4">
              <div class="flex flex-wrap items-center justify-center gap-2">
                <button onclick={() => pdfPage = Math.max(1, pdfPage - 1)} class="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 disabled:opacity-40" disabled={pdfPage <= 1}>Prev</button>
                <span class="text-xs text-gray-400">Page {pdfPage} / {pdfPageCount}</span>
                <button onclick={() => pdfPage = Math.min(pdfPageCount, pdfPage + 1)} class="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 disabled:opacity-40" disabled={pdfPage >= pdfPageCount}>Next</button>
                <button onclick={() => zoomLevel = Math.max(0.5, zoomLevel - 0.25)} class="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300">−</button>
                <span class="text-xs text-gray-500 w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
                <button onclick={() => zoomLevel = Math.min(3, zoomLevel + 0.25)} class="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300">+</button>
              </div>
              <div class="max-w-full overflow-auto rounded-xl bg-white p-3">
                <canvas bind:this={pdfCanvas}></canvas>
              </div>
            </div>
          {:else if category === 'docx'}
            <div class="prose prose-invert max-w-none rounded-xl border border-white/10 bg-white/[0.03] p-6 overflow-auto max-h-[72vh]">
              {@html documentHtml || '<p>No document content found.</p>'}
            </div>
          {:else if category === 'spreadsheet'}
            <div class="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
              {#if sheetNames.length > 1}
                <div class="flex gap-2 p-3 border-b border-white/10 overflow-x-auto">
                  {#each sheetNames as sheetName}
                    <button onclick={() => updateSheetRows(sheetName)} class="px-3 py-1.5 rounded-lg text-xs {activeSheet === sheetName ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}">{sheetName}</button>
                  {/each}
                </div>
              {/if}
              <div class="max-h-[72vh] overflow-auto">
                <table class="w-full text-left text-sm">
                  <tbody>
                    {#each sheetRows as row, rowIndex}
                      <tr class="border-b border-white/5 {rowIndex === 0 ? 'bg-white/5 text-white font-semibold' : 'text-gray-300'}">
                        {#each row as cell}
                          <td class="px-3 py-2 border-r border-white/5 whitespace-nowrap">{cell ?? ''}</td>
                        {/each}
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {:else if category === 'video' && previewBlobUrl}
            <div class="flex justify-center">
              <video controls class="max-w-full max-h-[72vh] rounded-xl bg-black"><source src={previewBlobUrl} type={documentDetail.mimeType} />Your browser does not support video preview.</video>
            </div>
          {:else if category === 'audio' && previewBlobUrl}
            <div class="min-h-[520px] flex flex-col items-center justify-center py-12">
              <div class="w-28 h-28 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mb-6">
                <svg class="w-12 h-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
              </div>
              <h3 class="text-white font-semibold mb-2">{documentDetail.title}</h3>
              <p class="text-gray-500 text-sm mb-6">{getFileExtension(documentDetail.fileName)} audio • {formatFileSize(documentDetail.fileSize)}</p>
              <audio controls class="w-full max-w-md"><source src={previewBlobUrl} type={documentDetail.mimeType || 'audio/mpeg'} />Your browser does not support audio preview.</audio>
            </div>
          {:else if category === 'text'}
            <div class="rounded-xl overflow-hidden border border-white/10 bg-black/30">
              <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.03]"><span class="text-xs font-bold uppercase tracking-widest text-gray-400">Text Preview</span><span class="text-xs text-gray-600">{getFileExtension(documentDetail.fileName)}</span></div>
              <pre class="max-h-[72vh] overflow-auto p-4 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap font-mono">{textContent}</pre>
            </div>
          {:else}
            <div class="min-h-[520px] flex flex-col items-center justify-center text-center">
              <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-6">
                <svg class="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <h3 class="text-white font-semibold text-lg mb-2">{documentDetail.title}</h3>
              <p class="text-gray-400 text-sm mb-6">{getFileExtension(documentDetail.fileName)} file • {formatFileSize(documentDetail.fileSize)}</p>
              <p class="text-gray-500 text-sm mb-6 max-w-md">This file type cannot be previewed directly yet. Download it to view in your preferred application.</p>
            </div>
          {/if}
        </div>
      </section>

      <aside class="space-y-4">
        <section class="overflow-hidden rounded-[28px] border border-white/10 bg-[#111115] shadow-xl shadow-black/20">
          <div class="border-b border-white/10 bg-white/[0.03] px-3 py-3">
            <h2 class="mt-1 text-lg font-black text-white">Document Info</h2>
          </div>

          <div class="space-y-4 p-5">
            <div class="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Title</p>
              <p class="mt-2 break-words text-sm font-semibold leading-6 text-white">{documentDetail.title}</p>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Size</p>
                <p class="mt-2 text-sm font-semibold text-gray-200">{formatFileSize(documentDetail.fileSize)}</p>
              </div>
              <div class="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Type</p>
                <p class="mt-2 truncate text-sm font-semibold text-gray-200" title={documentDetail.mimeType || getFileExtension(documentDetail.fileName)}>{getFileExtension(documentDetail.fileName)}</p>
              </div>
            </div>

            <div class="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Created</p>
              <p class="mt-2 text-sm font-semibold text-gray-200">{formatDate(documentDetail.createdAt)}</p>
            </div>

            <div class="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Owner</p>
              <button onclick={() => showProfileModal = true} class="group mt-3 flex w-full items-center gap-3 rounded-xl text-left transition-colors hover:bg-blue-500/10" disabled={!documentDetail.owner}>
                {#if documentDetail.owner?.avatarUrl}
                  <img src={documentDetail.owner.avatarUrl} alt={getOwnerName(documentDetail.owner)} class="h-11 w-11 rounded-full object-cover ring-2 ring-white/10 transition-all group-hover:ring-blue-400/60 group-hover:shadow-[0_0_14px_rgba(59,130,246,0.35)]" />
                {:else}
                  <div class="flex h-11 w-11 items-center justify-center rounded-full bg-blue-500/15 font-bold text-blue-300 ring-2 ring-white/10 transition-all group-hover:ring-blue-400/60 group-hover:shadow-[0_0_14px_rgba(59,130,246,0.35)]">{getOwnerName(documentDetail.owner).slice(0, 1).toUpperCase()}</div>
                {/if}
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-white transition-colors group-hover:text-blue-200">{getOwnerName(documentDetail.owner)}</p>
                  <p class="truncate text-xs text-gray-500">{shortAddress(documentDetail.owner?.walletAddress)}</p>
                </div>
              </button>
            </div>

            <div class="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div class="mb-3 flex items-center justify-between gap-3">
                <p class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Blockchain</p>
                {#if documentDetail.blockchainTx}
                  <span class="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-1 text-[10px] font-bold text-green-400">Confirmed</span>
                {:else if documentDetail.pendingOnChainUntil && !documentDetail.isOnChain}
                  <span class="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-[10px] font-bold text-yellow-400">Pending</span>
                {/if}
              </div>
              {#if documentDetail.blockchainTx}
                <a href={`https://sepolia.etherscan.io/tx/${documentDetail.blockchainTx}`} target="_blank" rel="noopener noreferrer" class="inline-flex max-w-full items-center gap-2 text-sm font-semibold text-blue-400 transition-colors hover:text-blue-300">
                  <span class="truncate font-mono">{shortAddress(documentDetail.blockchainTx)}</span>
                  <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              {:else if documentDetail.pendingOnChainUntil && !documentDetail.isOnChain}
                <p class="text-sm font-semibold text-yellow-300">Waiting for confirmation</p>
                <p class="mt-1 text-xs text-gray-500">Deadline: {formatDate(documentDetail.pendingOnChainUntil)}</p>
              {:else}
                <p class="text-sm text-gray-500">No blockchain transaction recorded.</p>
              {/if}
            </div>
          </div>
        </section>

        {#if documentDetail.description}
          <section class="rounded-[28px] border border-white/10 bg-[#111115] p-5">
            <h2 class="text-white font-bold mb-3">Description</h2>
            <p class="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{documentDetail.description}</p>
          </section>
        {/if}
      </aside>
    </div>
  {/if}
</main>

<ProfilePreviewModal
  isOpen={showProfileModal}
  onClose={() => showProfileModal = false}
  profile={documentDetail?.owner ? {
    id: documentDetail.owner.id,
    username: documentDetail.owner.username,
    email: documentDetail.owner.email,
    walletAddress: documentDetail.owner.walletAddress,
    avatarUrl: documentDetail.owner.avatarUrl,
    bio: documentDetail.owner.bio,
    website: documentDetail.owner.website
  } : null}
/>
