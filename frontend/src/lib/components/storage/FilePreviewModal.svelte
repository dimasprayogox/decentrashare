<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { onMount } from 'svelte';
  import mammoth from 'mammoth/mammoth.browser';
  import * as XLSX from 'xlsx';
  import { storageService } from '$lib/services/storage/storage';

  type PreviewCategory = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'docx' | 'spreadsheet' | 'other';
  type PreviewFile = {
    id: string;
    title: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    ipfsHash?: string;
    fileUrl?: string;
    downloadUrl: string;
    privacy: 'PRIVATE' | 'PUBLIC' | 'LINK_ONLY' | 'SPECIFIC_USER';
    requiresAuth?: boolean;
    description?: string | null;
  };

  let {
    isOpen = false,
    onClose,
    file
  }: {
    isOpen: boolean;
    onClose: () => void;
    file: PreviewFile | null;
  } = $props();

  let isLoading = $state(false);
  let loadError = $state<string | null>(null);
  let previewBlobUrl = $state<string | null>(null);
  let loadedFileId = $state<string | null>(null);
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

  function formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function getFileExtension(fileName: string): string {
    return fileName.split('.').pop()?.toUpperCase() || 'FILE';
  }

  function getFileCategory(mimeType: string, fileName = ''): PreviewCategory {
    const mime = mimeType.toLowerCase();
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(extension)) return 'audio';
    if (mime === 'application/pdf' || extension === 'pdf') return 'pdf';
    if (['docx'].includes(extension) || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (['xlsx', 'xls', 'csv'].includes(extension) || ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'].includes(mime)) return 'spreadsheet';
    if (
      mime.startsWith('text/') ||
      ['application/json', 'application/xml', 'application/javascript', 'application/typescript'].includes(mime) ||
      ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts', 'jsx', 'tsx', 'py', 'go', 'rs', 'java', 'php', 'rb', 'sol'].includes(extension)
    ) return 'text';
    return 'other';
  }

  function getPrivacyStyle(privacy: string): { bg: string; text: string; label: string } {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      PRIVATE: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Private' },
      PUBLIC: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Public' },
      LINK_ONLY: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Link Only' },
      SPECIFIC_USER: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Shared' }
    };
    return styles[privacy] || { bg: 'bg-gray-500/10', text: 'text-gray-400', label: privacy };
  }

  function clearPreviewState() {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    previewBlobUrl = null;
    loadedFileId = null;
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
    loadError = null;
    isLoading = false;
  }

  function updateSheetRows(sheetName: string) {
    if (!workbook) return;
    activeSheet = sheetName;
    const sheet = workbook.Sheets[sheetName];
    sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false }).slice(0, 200) as Array<Array<string | number | boolean | null>>;
  }

  async function loadPreview(nextFile: PreviewFile) {
    const category = getFileCategory(nextFile.mimeType, nextFile.fileName);
    clearPreviewState();
    loadedFileId = nextFile.id;
    isLoading = true;

    try {
      const blob = category === 'image'
        ? await storageService.fetchDocumentPreviewBlob(nextFile.id, 'image/*')
        : await storageService.fetchDocumentPreviewBlob(nextFile.id, nextFile.mimeType || '*/*');

      if (file?.id !== nextFile.id) return;
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
      loadError = error instanceof Error ? error.message : 'Failed to load preview';
    } finally {
      isLoading = false;
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

  async function downloadFile() {
    if (!file) return;
    try {
      isLoading = true;
      loadError = null;
      await storageService.downloadDocument(file.id);
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'Failed to download file';
    } finally {
      isLoading = false;
    }
  }

  function openInNewTab() {
    if (file?.id) window.open(`/storage/document/${file.id}`, '_blank', 'noopener,noreferrer');
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;
    if (event.key === 'Escape') onClose();
    if (event.key === '+' || event.key === '=') zoomLevel = Math.min(zoomLevel + 0.25, 3);
    if (event.key === '-' || event.key === '_') zoomLevel = Math.max(zoomLevel - 0.25, 0.5);
    if (event.key === '0') zoomLevel = 1;
  }

  $effect(() => {
    if (!isOpen || !file) {
      clearPreviewState();
      return;
    }
    if (loadedFileId === file.id) return;
    void loadPreview(file);
  });

  $effect(() => {
    pdfPage;
    zoomLevel;
    pdfDocument;
    pdfCanvas;
    void renderPdfPage();
  });

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if isOpen && file}
  {@const category = getFileCategory(file.mimeType, file.fileName)}
  {@const privacyStyle = getPrivacyStyle(file.privacy)}
  <div
    class="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 backdrop-blur-md"
    transition:fade={{ duration: 200 }}
    onclick={onClose}
    role="dialog"
    aria-modal="true"
    aria-labelledby="file-preview-title"
    tabindex="-1"
  >
    <div
      class="relative bg-gradient-to-br from-[#1a1a1e] to-[#121214] rounded-3xl border border-white/10 shadow-2xl shadow-black/50 w-full max-w-6xl max-h-[90vh] mx-4 flex flex-col"
      in:scale={{ duration: 250 }}
      onclick={(event) => event.stopPropagation()}
    >
      <div class="flex items-center justify-between p-4 border-b border-white/10">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/20 text-blue-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 id="file-preview-title" class="text-white font-semibold truncate">{file.title}</h2>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide {privacyStyle.bg} {privacyStyle.text}">{privacyStyle.label}</span>
            </div>
            <p class="text-gray-500 text-xs">{getFileExtension(file.fileName)} • {formatFileSize(file.fileSize)}</p>
          </div>
        </div>
        <button onclick={onClose} class="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-xl transition-all" aria-label="Close preview">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        {#if isLoading}
          <div class="min-h-[420px] flex flex-col items-center justify-center gap-4 text-gray-300">
            <div class="w-10 h-10 rounded-full border-2 border-white/10 border-t-blue-400 animate-spin"></div>
            <p class="text-sm">Loading preview...</p>
          </div>
        {:else if loadError}
          <div class="min-h-[420px] flex flex-col items-center justify-center text-center">
            <p class="text-red-400 text-sm mb-2">{loadError}</p>
            <button onclick={downloadFile} class="text-blue-400 hover:underline text-sm">Download instead</button>
          </div>
        {:else if category === 'image' && previewBlobUrl}
          <div class="flex flex-col items-center">
            <img src={previewBlobUrl} alt={file.title} class="max-w-full max-h-[65vh] object-contain transition-transform duration-200" style="transform: scale({zoomLevel})" />
          </div>
        {:else if category === 'pdf'}
          <div class="flex flex-col items-center gap-4">
            <div class="flex items-center gap-2">
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
          <div class="prose prose-invert max-w-none rounded-xl border border-white/10 bg-white/[0.03] p-6 overflow-auto max-h-[65vh]">
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
            <div class="max-h-[65vh] overflow-auto">
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
            <video controls class="max-w-full max-h-[65vh] rounded-xl bg-black"><source src={previewBlobUrl} type={file.mimeType} />Your browser does not support video preview.</video>
          </div>
        {:else if category === 'audio' && previewBlobUrl}
          <div class="flex flex-col items-center py-12">
            <div class="w-24 h-24 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mb-6">
              <svg class="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
            </div>
            <audio controls class="w-full max-w-md"><source src={previewBlobUrl} type={file.mimeType || 'audio/mpeg'} />Your browser does not support audio preview.</audio>
          </div>
        {:else if category === 'text'}
          <div class="rounded-xl overflow-hidden border border-white/10 bg-black/30">
            <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.03]"><span class="text-xs font-bold uppercase tracking-widest text-gray-400">Text Preview</span><span class="text-xs text-gray-600">{getFileExtension(file.fileName)}</span></div>
            <pre class="max-h-[65vh] overflow-auto p-4 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap font-mono">{textContent}</pre>
          </div>
        {:else}
          <div class="min-h-[420px] flex flex-col items-center justify-center text-center">
            <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-6">
              <svg class="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <h3 class="text-white font-semibold text-lg mb-2">{file.title}</h3>
            <p class="text-gray-400 text-sm mb-6">{getFileExtension(file.fileName)} file • {formatFileSize(file.fileSize)}</p>
            <p class="text-gray-500 text-sm mb-6 max-w-md">This digital file type cannot be previewed directly yet. Download it to view in your preferred application.</p>
          </div>
        {/if}

        {#if file.description}
          <div class="mt-6 pt-6 border-t border-white/10">
            <h3 class="text-sm font-medium text-gray-400 mb-3">Description</h3>
            <div class="p-4 bg-white/[0.03] rounded-xl border border-white/5"><p class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{file.description}</p></div>
          </div>
        {/if}
      </div>

      <div class="flex items-center justify-end gap-3 p-4 border-t border-white/10">
        <button onclick={openInNewTab} disabled={!file?.id} class="px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white rounded-xl transition-colors text-sm flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          Open in New Tab
        </button>
        <button onclick={downloadFile} disabled={isLoading} class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-xl transition-colors text-sm flex items-center gap-2 disabled:cursor-not-allowed">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          Download
        </button>
      </div>
    </div>
  </div>
{/if}
