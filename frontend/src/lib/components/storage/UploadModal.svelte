<script lang="ts">
  import { fade, scale, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { storageService } from '$lib/services/storage/storage';
  import type { 
    UploadFilesResponse, 
    BatchConfirmationResponse,
    BatchBlockchainPayload,
    BatchTriggerResponse 
  } from '$lib/types/storage';
  import { recordFilesBatchOnChain, tryBatchWithSingleFallback, recordFileOnChain } from '$lib/services/web3/blockchain'; 
  
  // ── Props (Svelte 5 Style) ──
  let {
    isOpen,
    onClose,
    onUploaded,
    folderId = null
  }: {
    isOpen: boolean;
    onClose: () => void;
    onUploaded: () => void;
    folderId?: string | null;
  } = $props();

  // ── State ──────────────────────────────────────────────────
  let isDragging = $state(false);
  let files = $state<File[]>([]);
  let isUploading = $state(false);
  
  // ✅ NEW: Metadata per-file (title & description)
  let fileMetadata = $state<Record<string, { title: string; description: string }>>({});
  
  // ✅ Inline feedback states
  let uploadError = $state("");
  let uploadSuccess = $state("");
  let fileErrors = $state<Record<number, string>>({});
  let fileStatuses = $state<Record<number, 'ready' | 'uploaded' | 'duplicate' | 'error'>>({});
  let uploadStatus = $state("");
  
  // ✅ NEW: Batch confirmation state
  let isConfirmingBatch = $state(false);
  let confirmationProgress = $state(0);
  
  // ✅ Validation config
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  const MAX_FILES = 10;                     // ✅ Max 10 files per upload
  const ALLOWED_TYPES = [
    'application/pdf',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/ogg',
    'text/plain', 'text/csv', 'application/json'
  ];

  // ── Helpers ────────────────────────────────────────────────
  
  function formatTitle(fileName: string): string {
    const name = fileName.replace(/\.[^/.]+$/, "");
    return name
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(word => {
        if (word.length <= 2) return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ')
      .slice(0, 50);
  }

  function validateFile(file: File): string | null {
    if (file.size > MAX_FILE_SIZE) return `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImageFile = file.type.startsWith('image/') && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    const isVideoFile = file.type.startsWith('video/') && ['mp4', 'webm'].includes(ext);
    const isAudioFile = (file.type.startsWith('audio/') || ['application/octet-stream', ''].includes(file.type)) && ['mp3', 'wav', 'ogg'].includes(ext);

    if (!ALLOWED_TYPES.includes(file.type) && !isImageFile && !isVideoFile && !isAudioFile) {
      const extensionLabel = ext ? `.${ext}` : 'unknown extension';
      return `${extensionLabel} files are not supported for upload in DecentraShare.`;
    }
    return null;
  }

  function setUploadError(message: string) {
    uploadError = message;
    uploadSuccess = "";
  }

  function setUploadSuccess(message: string) {
    uploadSuccess = message;
    uploadError = "";
  }

  function getDuplicateMessage(count: number): string {
    return count === 1
      ? 'File ini sudah dimiliki/upload oleh pengguna lain di sistem. Karena DecentraShare melindungi karya digital dari duplikasi, file tidak bisa diupload ulang.'
      : `${count} file sudah dimiliki/upload oleh pengguna lain di sistem. Karena DecentraShare melindungi karya digital dari duplikasi, file-file tersebut tidak bisa diupload ulang.`;
  }

  function clearFeedback() {
    uploadError = "";
    uploadSuccess = "";
    fileErrors = {};
    fileStatuses = {};
  }

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ── File Handlers ─────────────────────────────────────────

  function handleFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    clearFeedback();
    
    const array = Array.from(newFiles);
    const validFiles: File[] = [];
    const currentCount = files.length;
    const remainingSlots = MAX_FILES - currentCount;
    
    if (currentCount >= MAX_FILES) {
      setUploadError(`Maximum ${MAX_FILES} files allowed. Please remove some files first.`);
      return;
    }
    
    array.forEach((file, index) => {
      if (validFiles.length + currentCount >= MAX_FILES) {
        fileErrors[files.length + validFiles.length] = `Limit ${MAX_FILES} files reached`;
        return;
      }
      
      const error = validateFile(file);
      if (error) {
        fileErrors[files.length + validFiles.length] = error;
      } else {
        validFiles.push(file);
      }
    });
    
    if (validFiles.length > 0) files = [...files, ...validFiles];
    
    const rejected = array.length - validFiles.length;
    if (rejected > 0) {
      if (remainingSlots < array.length) {
        setUploadError(`Only ${remainingSlots} more file${remainingSlots > 1 ? 's' : ''} allowed. ${rejected} file${rejected > 1 ? 's were' : ' was'} rejected.`);
      } else {
        const rejectedMessages = array
          .map((file) => {
            const error = validateFile(file);
            return error ? `${file.name}: ${error}` : '';
          })
          .filter(Boolean);
        setUploadError(rejectedMessages.length > 0 ? rejectedMessages.join(' ') : `${rejected} file${rejected > 1 ? 's' : ''} rejected due to validation errors`);
      }
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    handleFiles(e.dataTransfer?.files || null);
  }

  function removeFile(index: number) {
    const file = files[index];
    const metaKey = `${file.name}_${file.size}_${file.lastModified}`;
    
    files = files.filter((_, i) => i !== index);
    delete fileMetadata[metaKey];
    
    const newErrors = { ...fileErrors };
    delete newErrors[index];
    fileErrors = newErrors;

    const newStatuses = { ...fileStatuses };
    delete newStatuses[index];
    fileStatuses = newStatuses;

    if (uploadError?.includes('Maximum') || uploadError?.includes('allowed') || uploadError?.includes('Limit')) {
      clearFeedback();
    }
  }

  function clearAllFiles() {
    files = [];
    fileMetadata = {};
    fileErrors = {};
    fileStatuses = {};
    clearFeedback();
  }

  // ── Upload Handler ─────────────────────────────────────────

  async function startUpload() {
    if (files.length === 0) return;
    
    try {
      isUploading = true;
      clearFeedback();
      setUploadStatus('📤 Uploading files to IPFS...');
      
      const rawFiles = $state.snapshot(files);
      const rawMetadata = $state.snapshot(fileMetadata);
      
      // ── PHASE 1: Upload ke Backend/IPFS ───────────────────
      const formData = new FormData();
      rawFiles.forEach(file => formData.append('files', file));
      if (folderId) formData.append('folderId', folderId);

      const metadataArray = rawFiles.map(file => {
        const metaKey = `${file.name}_${file.size}_${file.lastModified}`;
        const meta = rawMetadata[metaKey] || { title: '', description: '' };
        return { fileName: file.name, title: meta.title?.trim(), description: meta.description?.trim() };
      });
      formData.append('metadata', JSON.stringify(metadataArray));

      // ✅ Panggil API Upload
      const uploadResult = await storageService.uploadMultipleFiles(formData) as BatchConfirmationResponse;

      if (!uploadResult.success) {
        throw new Error(uploadResult.message || 'Upload failed');
      }

      const { results, summary, blockchainPayload, folderId: returnedFolderId } = uploadResult;
      fileStatuses = results.reduce<Record<number, 'ready' | 'uploaded' | 'duplicate' | 'error'>>((statuses, result, index) => {
        statuses[index] = result.status;
        return statuses;
      }, {});

      if (summary.duplicate > 0 && summary.uploaded === 0) {
        setUploadError(getDuplicateMessage(summary.duplicate));
        return;
      }

      if (summary.duplicate > 0 && summary.uploaded > 0) {
        let msg = `${summary.uploaded} file baru berhasil diupload.`;
        msg += ` ${summary.duplicate} file duplikat ditolak karena karya digital tersebut sudah ada di sistem.`;
        if (summary.error > 0) msg += ` ${summary.error} file gagal diproses.`;
        setUploadSuccess(msg);
      } else if (summary.uploaded > 0) {
        setUploadSuccess(`${summary.uploaded} file berhasil diupload.`);
      }

      // ── PHASE 2: Batch Blockchain Confirmation (JIKA ADA FILE BARU) ─────
      if (summary.uploaded > 0 && blockchainPayload?.length > 0) {
        await handleBatchBlockchainConfirmation(blockchainPayload, returnedFolderId);
      }

      // Reset state & refresh parent hanya untuk upload yang benar-benar masuk
      if (summary.uploaded > 0) {
        files = [];
        fileMetadata = {};
        fileErrors = {};
        onUploaded?.();
        // setTimeout(() => { if (uploadSuccess) onClose?.(); }, 5000);
      }
      
    } catch (error: any) {
      console.error("Upload Error:", error);
      setUploadError(error?.message || 'Failed to upload files');
    } finally {
      isUploading = false;
      isConfirmingBatch = false;
      setUploadStatus('');
    }
  }
  
 // ✅ Handle batch blockchain confirmation - FIXED VERSION
async function handleBatchBlockchainConfirmation(
  payload: Array<{ fileName: string; ipfsHash: string; fileHash: string; fileSize: string; timestamp: string; documentId: string }>,
  folderId?: string | null
) {
  try {
    isConfirmingBatch = true;
    confirmationProgress = 25;
    setUploadStatus('🔐 Preparing blockchain confirmation...');
    
    // ✅ 1. Trigger backend untuk prepare batch data
    const documentIds = payload.map(p => p.documentId);
    const triggerResponse = await storageService.triggerBatchBlockchainConfirmation(documentIds) as BatchTriggerResponse;
    
    if (!triggerResponse.success || !triggerResponse.data) {
      throw new Error(triggerResponse.message || 'Failed to prepare batch confirmation');
    }
    
    // ✅ Handle case: all files already on-chain
    if (triggerResponse.data?.skipConfirmation) {
      setUploadSuccess(prev => `${prev} • ✅ All files already on-chain!`);
      return;
    }
    
    confirmationProgress = 50;
    
    const { contractAddress, abi, functionName, args, docIds, skippedCount } = triggerResponse.data;
    
    // ✅ 2. Prepare payload untuk blockchain call
    const batchPayload: BatchBlockchainPayload = {
      contractAddress,
      abi,
      functionName,
      args,
      items: payload.map(p => ({ cid: p.ipfsHash, fileName: p.fileName, fileHash: p.fileHash })),
      documentIds: docIds
    };
    
    confirmationProgress = 75;
    setUploadStatus('⏳ Confirm in wallet...');
    
    // 🎯 EARLY RETURN FOR SINGLE FILE - FIXED ARG EXTRACTION
if (payload.length === 1) {
  console.log('[Web3] 🎯 Single file detected, using direct recordFileOnChain...');
  
  // ✅ Unwrap ABI
  const rawAbi = Array.isArray(batchPayload.abi) 
    ? batchPayload.abi 
    : (batchPayload.abi as any)?.abi;
  
  // ✅ CORRECT: Extract from parallel arrays [cids[], names[], hashes[]]
  const [cids, fileNames, fileHashes] = batchPayload.args as [string[], string[], string[]];
  const cid = cids[0]?.trim();
  const fileName = fileNames[0]?.trim();
  const fileHash = fileHashes[0]?.trim();
  
  // ✅ Validate before send
  if (!cid || !fileName || !fileHash) {
    throw new Error('Invalid payload: missing required fields');
  }
  
  // ✅ Gunakan 'singleTxResult' (bukan 'txResult') untuk hindari conflict
  const singleTxResult = await recordFileOnChain({
    cid,
    fileName,
    fileHash,
    contractAddress: batchPayload.contractAddress,
    abi: rawAbi,
    functionName: 'recordFile',
    args: [cid, fileName, fileHash]  // ← ✅ Array of 3 strings
  }, {
    onStatus: (status) => setUploadStatus(status),
    onTxHash: (txHash) => {
      console.log('✅ Single TX hash:', txHash);
      confirmationProgress = 90;
    }
  });
  
  confirmationProgress = 100;
  setUploadStatus('✅ Confirmed on-chain!');
  
  // ✅ Update DB
  await storageService.confirmBatchComplete(singleTxResult.txHash, docIds);
  setUploadSuccess(prev => `${prev} • 🔗 1/1 confirmed!`);
  
  return; // ← ✅ EXIT EARLY
}
    // ✅ Jika >1 file, pakai batch + fallback - SATU-SATUNYA deklarasi 'txResult' di sini
    console.log('[Web3] 📦 Multiple files detected, using batch with fallback...');
    
    const txResult = await tryBatchWithSingleFallback(batchPayload, {
      onStatus: (status) => setUploadStatus(status),
      onTxHash: (txHash) => {
        console.log('Batch TX hash:', txHash);
        confirmationProgress = 90;
      }
    });
    
    confirmationProgress = 100;
    setUploadStatus('✅ Confirmed on-chain!');
    
    // ✅ Handle fallback result
    const confirmedCount = txResult.fallback ? txResult.fileCount : docIds.length;
    const fallbackNote = txResult.fallback ? ' (via fallback)' : '';
    
    // ✅ Notify backend
    await storageService.confirmBatchComplete(txResult.txHash, docIds);
    
    // ✅ Update success message
    const totalProcessed = confirmedCount + (skippedCount || 0);
    setUploadSuccess(prev => `${prev} • 🔗 ${confirmedCount}/${totalProcessed} confirmed${fallbackNote}!`);
    
  } catch (error: any) {
    console.error('Batch confirmation error:', error);
    
    if (error.message?.includes('CONTRACT_ERROR: DuplicateContent')) {
      setUploadError('⚠️ File content already registered');
    } else if (error.message?.includes('CONTRACT_ERROR: DuplicateCID')) {
      setUploadError('⚠️ IPFS CID already registered');
    } else if (error.message === 'TRANSACTION_REJECTED') {
      setUploadSuccess(prev => `${prev} • ⚠️ Skipped by user`);
    } else if (error.message === 'INSUFFICIENT_FUNDS') {
      setUploadError('⚠️ Insufficient ETH for gas');
    } else if (error.message === 'WRONG_NETWORK') {
      setUploadError('⚠️ Switch to Sepolia');
    } else {
      setUploadSuccess(prev => `${prev} • ⚠️ Pending`);
    }
  } finally {
    isConfirmingBatch = false;
    confirmationProgress = 0;
  }
}
  
  // Helper untuk status progress
  function setUploadStatus(status: string) {
    if (status && !status.startsWith('✅') && !status.startsWith('⚠️')) {
      uploadError = status;
      uploadSuccess = "";
    }
  }

  // ── Modal Lifecycle ───────────────────────────────────────
  $effect(() => {
    if (!isOpen) { 
      clearFeedback(); 
      isDragging = false;
      isConfirmingBatch = false;
      confirmationProgress = 0;
    } else { 
      clearFeedback(); 
    }
  });

  $effect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isUploading && !isConfirmingBatch) onClose?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });
</script>

{#if isOpen}
  <div class="fixed inset-0 z-[999] flex items-center justify-center p-4 md:p-6">
    <!-- Backdrop -->
    <div transition:fade={{ duration: 200, easing: cubicOut }} 
         class="absolute inset-0 bg-black/80 backdrop-blur-md" 
         onclick={onClose}></div>

    <!-- Modal -->
    <div in:scale={{ start: 0.95, duration: 250, easing: cubicOut }} 
         out:fade={{ duration: 150 }}
         class="relative w-full max-w-xl bg-[#1a1a1e] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
         role="dialog" aria-modal="true" aria-labelledby="upload-modal-title">
      
      <!-- Header -->
      <div class="p-6 md:p-8 border-b border-white/5">
        <div class="flex justify-between items-start">
          <div>
            <h3 id="upload-modal-title" class="text-xl font-bold text-white">Upload to DecentraShare</h3>
          </div>
          <button onclick={onClose} 
                  disabled={isUploading || isConfirmingBatch} 
                  class="p-2 text-gray-500 hover:text-white transition-colors disabled:opacity-50" 
                  aria-label="Close">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="p-6 md:p-8">
        <!-- Status Progress -->
        {#if uploadStatus && !uploadStatus.startsWith('✅') && !uploadStatus.startsWith('⚠️')}
          <div class="mb-4 px-4 py-3 rounded-xl border bg-blue-500/10 border-blue-500/20 text-blue-400 flex items-center gap-3" role="status">
            <svg class="w-5 h-5 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <p class="text-sm flex-1">{uploadStatus}</p>
            {#if isConfirmingBatch}
              <span class="text-xs font-mono">{confirmationProgress}%</span>
            {/if}
          </div>
          
          <!-- Progress Bar untuk Batch Confirmation -->
          {#if isConfirmingBatch}
            <div class="w-full bg-gray-700/50 rounded-full h-1.5 mb-4 overflow-hidden">
              <div class="bg-gradient-to-r from-purple-500 to-blue-500 h-1.5 rounded-full transition-all duration-300" 
                   style="width: {confirmationProgress}%"></div>
            </div>
          {/if}
        {/if}
        
        <!-- ✅ Inline Feedback Banner -->
        {#if uploadError || uploadSuccess}
          <div transition:slide={{ axis: 'y', duration: 150 }}
               class="mb-6 px-4 py-3 rounded-xl border flex items-start gap-3 {uploadError ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}"
               role="alert" aria-live="polite">
            {#if uploadError}
              <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            {:else}
              <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
            {/if}
            <p class="text-sm flex-1">{uploadError || uploadSuccess}</p>
            <button onclick={clearFeedback} class="p-1 hover:bg-white/10 rounded" aria-label="Dismiss">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        {/if}

        <!-- Drop Zone -->
        <label ondragover={(e) => { e.preventDefault(); isDragging = true; }} 
               ondragleave={() => isDragging = false} 
               ondrop={handleDrop}
               class="group border-2 border-dashed {isDragging ? 'border-blue-500 bg-blue-500/5' : 'border-white/10 hover:border-white/20'} rounded-2xl p-8 md:p-10 text-center transition-all cursor-pointer block relative disabled:opacity-50"
               aria-disabled={isUploading || isConfirmingBatch || files.length >= MAX_FILES}>
          <input type="file" 
                 multiple 
                 disabled={isUploading || isConfirmingBatch || files.length >= MAX_FILES}
                 class="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed" 
                 onchange={(e) => handleFiles(e.currentTarget.files)} 
                 aria-label="Select files"/>
          
          <div class="w-16 h-16 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-500 group-hover:scale-110 transition-transform">
            {#if isUploading || isConfirmingBatch}
              <svg class="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            {:else}
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
              </svg>
            {/if}
          </div>
          {#if isConfirmingBatch}
            <p class="text-white font-medium">Confirming on blockchain...</p>
            <p class="text-gray-500 text-[10px] uppercase tracking-widest mt-2 font-bold">1 wallet signature for all files</p>
          {:else if isUploading}
            <p class="text-white font-medium">Uploading to IPFS...</p>
            <p class="text-gray-500 text-[10px] uppercase tracking-widest mt-2 font-bold">Please wait</p>
          {:else}
            <p class="text-white font-medium">Click or drag files here</p>
            <p class="text-gray-500 text-[10px] uppercase tracking-widest mt-2 font-bold">
              Max {MAX_FILES} files • {MAX_FILE_SIZE / 1024 / 1024}MB each • PDF, images, MP4/WebM, MP3/WAV/OGG, text/CSV/JSON
            </p>
            {#if files.length > 0}
              <p class="text-[9px] text-blue-400 mt-1">
                {MAX_FILES - files.length} slot{MAX_FILES - files.length !== 1 ? 's' : ''} remaining
              </p>
            {/if}
          {/if}
        </label>

        <!-- File List with Metadata Inputs -->
        {#if files.length > 0}
          <div class="mt-6">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-medium text-gray-300">{files.length} file{files.length > 1 ? 's' : ''} selected</h4>
              <button onclick={clearAllFiles} 
                      disabled={isUploading || isConfirmingBatch} 
                      class="text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50">
                Clear all
              </button>
            </div>
            
            <!-- ✅ Warning banner when at max limit -->
            {#if files.length >= MAX_FILES}
              <div class="mt-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-[10px] text-yellow-400 flex items-center gap-2">
                <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <span>Maximum {MAX_FILES} files reached. Remove files to add more.</span>
              </div>
            {/if}
            
            <div class="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              {#each files as file, i (file.name + file.size + file.lastModified)}
                {@const metaKey = `${file.name}_${file.size}_${file.lastModified}`}
                {@const meta = fileMetadata[metaKey] || { title: '', description: '' }}
                 
                <div transition:slide={{ axis: 'y', duration: 150, easing: cubicOut }}
                     class="flex flex-col p-3 bg-white/[0.03] border {fileStatuses[i] === 'duplicate' ? 'border-yellow-500/30' : fileStatuses[i] === 'error' ? 'border-red-500/30' : 'border-white/5'} rounded-xl">
                  
                  <!-- Header: File Info + Remove + Status Badge -->
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                      <!-- Icon -->
                      <div class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 shrink-0">
                        {#if file.type.startsWith('image/')}
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                          </svg>
                        {:else if file.type.startsWith('video/')}
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                          </svg>
                        {:else if file.type === 'application/pdf'}
                          <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                          </svg>
                        {:else}
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                          </svg>
                        {/if}
                      </div>
                      
                      <!-- Name + Size + Status -->
                      <div class="truncate min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <p class="text-sm text-gray-200 truncate">{file.name}</p>
                          {#if fileStatuses[i] === 'duplicate'}
                            <span class="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-[8px] rounded border border-yellow-500/30">Duplicate</span>
                          {:else if fileStatuses[i] === 'error'}
                            <span class="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[8px] rounded border border-red-500/30">Error</span>
                          {:else if fileStatuses[i] === 'uploaded'}
                            <span class="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[8px] rounded border border-blue-500/30">Uploaded</span>
                          {:else if !isUploading && !isConfirmingBatch}
                            <span class="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[8px] rounded border border-green-500/30">Ready</span>
                          {/if}
                        </div>
                        <p class="text-[10px] text-gray-500 font-mono">
                          {formatSize(file.size)}
                        </p>
                      </div>
                    </div>
                    
                    <!-- Remove Button -->
                    <button onclick={() => { removeFile(i); delete fileMetadata[metaKey]; }} 
                            disabled={isUploading || isConfirmingBatch} 
                            class="p-2 text-gray-600 hover:text-red-400 transition-colors disabled:opacity-50" 
                            aria-label={`Remove ${file.name}`}>
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                  
                  <!-- ✅ Expandable Metadata Inputs -->
                  <div class="mt-3 pt-3 border-t border-white/5">
                    <!-- Title Input -->
                    <div class="mb-2">
                      <label class="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                        Title <span class="text-gray-600">(optional)</span>
                      </label>
                      <input 
                        type="text" 
                        value={meta.title}
                        oninput={(e) => {
                          fileMetadata[metaKey] = { 
                            ...meta, 
                            title: (e.target as HTMLInputElement).value 
                          };
                        }}
                        placeholder="Leave empty to use filename"
                        disabled={isUploading || isConfirmingBatch}
                        class="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 disabled:opacity-50 transition-colors"
                      />
                      {#if !meta.title.trim() && !fileErrors[i]?.includes('Exists')}
                        <p class="text-[10px] text-gray-600 mt-1 italic">
                          Preview: {formatTitle(file.name)}
                        </p>
                      {/if}
                    </div>
                    
                    <!-- Description Input -->
                    <div>
                      <label class="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                        Description <span class="text-gray-600">(optional)</span>
                      </label>
                      <textarea 
                        value={meta.description}
                        oninput={(e) => {
                          const val = (e.target as HTMLTextAreaElement).value;
                          if (val.length <= 500) {
                            fileMetadata[metaKey] = { ...meta, description: val };
                          }
                        }}
                        placeholder="Add context, credits, or story..."
                        disabled={isUploading || isConfirmingBatch}
                        rows={2}
                        maxlength={500}
                        class="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 disabled:opacity-50 transition-colors resize-none"
                      />
                      {#if meta.description.length > 450}
                        <p class="text-[9px] text-gray-600 text-right mt-1">
                          {meta.description.length}/500
                        </p>
                      {/if}
                    </div>
                  </div>
                  
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Upload Button -->
        <button disabled={files.length === 0 || isUploading || isConfirmingBatch} 
                onclick={startUpload}
                class="w-full mt-8 h-14 bg-blue-600 disabled:bg-white/5 disabled:text-gray-500 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all active:scale-[0.98] shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3 disabled:cursor-not-allowed">
          {#if isConfirmingBatch}
            <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span>Confirming on-chain...</span>
          {:else if isUploading}
            <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span>Uploading...</span>
          {:else}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            <span>Upload {files.length > 0 ? `${files.length} File${files.length > 1 ? 's' : ''}` : ''}</span>
          {/if}
        </button>
        
        <p class="text-[10px] text-gray-600 text-center mt-4">
          Supported: PDF, DOC, Images, Videos • Max {MAX_FILE_SIZE / 1024 / 1024}MB each
        </p>
        
        {#if isConfirmingBatch}
          <p class="text-[9px] text-purple-400/80 text-center mt-2">
            🔐 Single wallet signature for all files
          </p>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
</style>