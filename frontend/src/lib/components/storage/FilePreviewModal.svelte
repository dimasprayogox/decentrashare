<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { storageService } from '$lib/services/storage/storage';
  
  // Props
  let {
    isOpen = false,
    onClose,
    file
  }: {
    isOpen: boolean;
    onClose: () => void;
    file: {
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
      description?: string | null;  // ✅ Tambah prop description
    } | null;
  } = $props();

  // Local state
  let isLoading = $state(false);
  let loadError = $state<string | null>(null);
  let zoomLevel = $state(1);
  let imageBlobUrl = $state<string | null>(null);
  let currentFileId = $state<string | null>(null);
  let publicImageLoaded = $state(false);

  // ✅ Effect: Fetch image preview via service for private files
  $effect(() => {
    if (!isOpen || !file) {
      if (imageBlobUrl) {
        URL.revokeObjectURL(imageBlobUrl);
        imageBlobUrl = null;
      }
      currentFileId = null;
      publicImageLoaded = false;
      return;
    }

    if (getFileCategory(file.mimeType) !== 'image') return;

    if (file.requiresAuth) {
      if (currentFileId !== file.id) {
        isLoading = true;
        loadError = null;
        currentFileId = file.id;
        if (imageBlobUrl) {
          URL.revokeObjectURL(imageBlobUrl);
          imageBlobUrl = null;
        }
      }
      
      const fetchingFileId = file.id;
      
      storageService.fetchImagePreview(file.id)
        .then(blobUrl => {
          if (fetchingFileId === currentFileId && file?.id === fetchingFileId) {
            if (imageBlobUrl && imageBlobUrl !== blobUrl) {
              URL.revokeObjectURL(imageBlobUrl);
            }
            imageBlobUrl = blobUrl;
            isLoading = false;
          }
        })
        .catch(err => {
          if (fetchingFileId === currentFileId && file?.id === fetchingFileId) {
            console.error('❌ Failed to fetch image preview:', err);
            loadError = err.message || 'Failed to load image';
            isLoading = false;
          }
        });
      return;
    } else {
      if (currentFileId !== file.id) {
        isLoading = true;
        loadError = null;
        currentFileId = file.id;
        publicImageLoaded = false;
      }
    }
  });

  // ✅ Helper: Format file size
  function formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  // ✅ Helper: Get file type category
  function getFileCategory(mimeType: string): 'image' | 'video' | 'pdf' | 'audio' | 'document' | 'other' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
         'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
         .includes(mimeType)) return 'document';
    return 'other';
  }

  // ✅ Helper: Get file extension
  function getFileExtension(fileName: string): string {
    return fileName.split('.').pop()?.toUpperCase() || 'FILE';
  }

  // ✅ NEW: Get privacy badge style
  function getPrivacyStyle(privacy: string): { bg: string; text: string; label: string } {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      'PRIVATE': { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Private' },
      'PUBLIC': { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Public' },
      'LINK_ONLY': { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Link Only' },
      'SPECIFIC_USER': { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Shared' }
    };
    return styles[privacy] || { bg: 'bg-gray-500/10', text: 'text-gray-400', label: privacy };
  }

  // ✅ Helper: Open file in new tab
  function openInNewTab(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // ✅ Download: Delegate to service
  async function downloadFile() {
    if (!file) return;
    try {
      isLoading = true;
      loadError = null;
      await storageService.downloadDocument(file.id);
    } catch (err: any) {
      loadError = err.message || 'Failed to download file';
      console.error('Download error:', err);
    } finally {
      isLoading = false;
    }
  }

  // ✅ Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'Escape') onClose();
    if (file && getFileCategory(file.mimeType) === 'image') {
      if (e.key === '+' || e.key === '=') zoomLevel = Math.min(zoomLevel + 0.25, 3);
      if (e.key === '-' || e.key === '_') zoomLevel = Math.max(zoomLevel - 0.25, 0.5);
      if (e.key === '0') zoomLevel = 1;
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  // ✅ Reset state saat modal ditutup
  $effect(() => {
    if (!isOpen) {
      isLoading = false;
      loadError = null;
      zoomLevel = 1;
      publicImageLoaded = false;
    }
  });
</script>

{#if isOpen && file}
  <!-- ✅ Backdrop -->
  <div 
    class="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 backdrop-blur-md"
    transition:fade={{ duration: 200 }}
    onclick={onClose}
    role="dialog"
    aria-modal="true"
    aria-labelledby="file-preview-title"
  >
    <!-- ✅ Modal Content -->
    <div 
      class="relative bg-gradient-to-br from-[#1a1a1e] to-[#121214] rounded-3xl border border-white/10 shadow-2xl 
             shadow-black/50 w-full max-w-5xl max-h-[90vh] mx-4 flex flex-col"
      in:scale={{ duration: 250 }}
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Decorative glow -->
      <div class="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <!-- ✅ Header: Title + Privacy Badge -->
      <div class="flex items-center justify-between p-4 border-b border-white/10">
        <div class="flex items-center gap-3 min-w-0">
          <!-- File Icon -->
          <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                      {getFileCategory(file.mimeType) === 'image' ? 'bg-purple-500/20 text-purple-400' : 
                       getFileCategory(file.mimeType) === 'video' ? 'bg-red-500/20 text-red-400' :
                       getFileCategory(file.mimeType) === 'pdf' ? 'bg-orange-500/20 text-orange-400' :
                       getFileCategory(file.mimeType) === 'audio' ? 'bg-green-500/20 text-green-400' :
                       'bg-blue-500/20 text-blue-400'}">
            {#if getFileCategory(file.mimeType) === 'image'}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            {:else if getFileCategory(file.mimeType) === 'video'}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            {:else if getFileCategory(file.mimeType) === 'pdf'}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            {:else if getFileCategory(file.mimeType) === 'audio'}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
            {:else}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            {/if}
          </div>
          
          <!-- File Info: Title + Privacy Badge -->
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 id="file-preview-title" class="text-white font-semibold truncate">{file.title}</h2>
              
              <!-- ✅ Privacy Badge (Svelte 5 compatible) -->
              {#if true}
                {@const privacyStyle = getPrivacyStyle(file.privacy)}
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide {privacyStyle.bg} {privacyStyle.text}">
                  {privacyStyle.label}
                </span>
              {/if}
            </div>
            <p class="text-gray-500 text-xs">{getFileExtension(file.fileName)} • {formatFileSize(file.fileSize)}</p>
          </div>
        </div>
        
        <!-- Close Button -->
        <button onclick={onClose} class="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-xl transition-all" aria-label="Close preview">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- ✅ Content Area (Scrollable) -->
      <div class="flex-1 overflow-y-auto p-4">
        
        {#if getFileCategory(file.mimeType) === 'image'}
          <!-- ✅ IMAGE Preview -->
          <div class="flex flex-col items-center">
            <div class="relative max-w-full overflow-hidden rounded-xl bg-black/20">
              {#if isLoading}
                <div class="w-[400px] h-[400px] flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/60 via-black/40 to-transparent rounded-xl border border-white/5 backdrop-blur-sm">
                  <div class="relative w-10 h-10">
                    <div class="absolute inset-0 rounded-full border-2 border-white/10"></div>
                    <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-400 border-r-purple-400 animate-spin"></div>
                    <div class="absolute inset-2 rounded-full bg-blue-500/10 animate-pulse"></div>
                  </div>
                  <div class="text-center space-y-1.5">
                    <p class="text-sm text-gray-200 font-medium tracking-wide">Loading preview...</p>
                  </div>
                </div>
              {:else if loadError}
                <div class="w-full h-[400px] flex flex-col items-center justify-center text-gray-400 bg-black/20 rounded-xl">
                  <svg class="w-10 h-10 text-red-400/80 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <p class="text-sm mb-1 font-medium">{loadError}</p>
                  <p class="text-xs text-gray-500 mb-4">File may be private or unavailable</p>
                  <button onclick={downloadFile} class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm transition-colors flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    Download Instead
                  </button>
                </div>
              {:else}
                {#if file.requiresAuth}
                  {#if imageBlobUrl}
                    <img src={imageBlobUrl} alt={file.title} class="max-w-full max-h-[60vh] object-contain transition-transform duration-200" style="transform: scale({zoomLevel})" key={file.id} />
                  {/if}
                {:else}
                  <img src={file.fileUrl} alt={file.title} class="max-w-full max-h-[60vh] object-contain transition-transform duration-200" style="transform: scale({zoomLevel})" key={file.id} onload={() => { isLoading = false; publicImageLoaded = true; }} onerror={(e) => { loadError = 'Failed to load image from source'; isLoading = false; }} />
                {/if}
              {/if}
            </div>
            
            {#if !isLoading && !loadError && ((file.requiresAuth && imageBlobUrl) || (!file.requiresAuth && (file.fileUrl || publicImageLoaded)))}
              <div class="flex items-center gap-2 mt-4">
                <button onclick={() => zoomLevel = Math.max(zoomLevel - 0.25, 0.5)} class="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 transition-colors" title="Zoom out (-)">−</button>
                <span class="text-xs text-gray-500 w-12 text-center font-mono">{Math.round(zoomLevel * 100)}%</span>
                <button onclick={() => zoomLevel = Math.min(zoomLevel + 0.25, 3)} class="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-300 transition-colors" title="Zoom in (+)">+</button>
                <button onclick={() => zoomLevel = 1} class="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-gray-400 transition-colors" title="Reset zoom">Reset</button>
              </div>
              <p class="text-[10px] text-gray-600 mt-2">Tip: Use + / - keys to zoom, ESC to close</p>
            {/if}
          </div>
        
        {:else if getFileCategory(file.mimeType) === 'video'}
          <div class="flex flex-col items-center">
            <video controls class="max-w-full max-h-[60vh] rounded-xl bg-black" onerror={() => { loadError = 'Video preview not available'; }}>
              <source src={file.fileUrl} type={file.mimeType} />
              Your browser does not support the video tag.
            </video>
            {#if loadError}
              <p class="text-red-400 text-sm mt-2">{loadError}</p>
              <button onclick={() => window.location.href = file.downloadUrl} class="mt-2 text-blue-400 hover:underline">Download instead</button>
            {/if}
          </div>

        {:else if getFileCategory(file.mimeType) === 'pdf'}
          <div class="flex flex-col items-center">
            <div class="w-full max-h-[60vh] rounded-xl overflow-hidden bg-black/30">
              <iframe src={`https://docs.google.com/gview?url=${encodeURIComponent(file.fileUrl)}&embedded=true`} class="w-full h-full min-h-[400px] border-0" title={file.title}></iframe>
            </div>
            {#if loadError}
              <p class="text-xs text-gray-500 mt-2">Preview failed. <button class="text-blue-400 hover:underline" onclick={() => window.location.href = file.downloadUrl}>Download file</button></p>
            {/if}
          </div>
            
        {:else if getFileCategory(file.mimeType) === 'audio'}
          <div class="flex flex-col items-center py-8">
            <div class="w-24 h-24 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mb-6">
              <svg class="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
            </div>
            <audio controls class="w-full max-w-md">
              <source src={file.fileUrl || file.downloadUrl} type={file.mimeType} />
              Your browser does not support the audio element.
            </audio>
          </div>
            
        {:else}
          <div class="flex flex-col items-center py-8 text-center">
            <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-6">
              <svg class="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <h3 class="text-white font-semibold text-lg mb-2">{file.title}</h3>
            <p class="text-gray-400 text-sm mb-6">{getFileExtension(file.fileName)} file • {formatFileSize(file.fileSize)}</p>
            <p class="text-gray-500 text-sm mb-6 max-w-md">This file type cannot be previewed directly. Download to view in your preferred application.</p>
          </div>
        {/if}

        <!-- ✅ DESCRIPTION / BIO - Display BELOW preview -->
        {#if file.description}
          <div class="mt-6 pt-6 border-t border-white/10">
            <h3 class="text-sm font-medium text-gray-400 mb-3">Description</h3>
            <div class="p-4 bg-white/[0.03] rounded-xl border border-white/5">
              <p class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                {file.description}
              </p>
            </div>
          </div>
        {/if}
        
      </div>

      <!-- ✅ Footer Actions -->
      <div class="flex items-center justify-end gap-3 p-4 border-t border-white/10">
        <button onclick={() => openInNewTab(file.fileUrl || file.downloadUrl)} class="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors text-sm flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          Open in New Tab
        </button>
        <button onclick={downloadFile} disabled={isLoading} class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-xl transition-colors text-sm flex items-center gap-2 disabled:cursor-not-allowed">
          {#if isLoading}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Downloading...
          {:else}
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Download
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.file-preview-modal-content) {
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.2) transparent;
  }
  :global(.file-preview-modal-content::-webkit-scrollbar) { width: 6px; }
  :global(.file-preview-modal-content::-webkit-scrollbar-track) { background: transparent; }
  :global(.file-preview-modal-content::-webkit-scrollbar-thumb) { background: rgba(255,255,255,0.2); border-radius: 3px; }
</style>