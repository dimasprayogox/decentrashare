<script lang="ts">
  import { fade } from 'svelte/transition';
  import ProfilePreviewModal from '$lib/components/storage/ProfilePreviewModal.svelte';
  import { storageService } from '$lib/services/storage/storage';

  let validationFile = $state<File | null>(null);
  let validationResult = $state<{
    hash: string;
    existsOnChain: boolean;
    error?: string;
    document?: {
      title?: string;
      fileName?: string;
      blockchainTx?: string | null;
      uploadedAt?: string | Date;
      owner?: { id?: string; username?: string | null; email?: string | null; walletAddress?: string | null; avatarUrl?: string | null };
    } | null;
  } | null>(null);
  let isValidatingDocument = $state(false);
  let validationError = $state('');
  let showProfileModal = $state(false);

  async function calculateFileHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function formatOwner(owner?: { id?: string; username?: string | null; email?: string | null; walletAddress?: string | null; avatarUrl?: string | null } | null) {
    if (!owner) return 'Unknown owner';
    return owner.username || owner.email || (owner.walletAddress ? `${owner.walletAddress.slice(0, 8)}...${owner.walletAddress.slice(-6)}` : 'Unknown owner');
  }

  function getOwnerInitial(owner?: { username?: string | null; email?: string | null; walletAddress?: string | null } | null) {
    return (owner?.username?.trim()?.[0] || owner?.email?.trim()?.[0] || owner?.walletAddress?.[0] || '?').toUpperCase();
  }

  function openOwnerProfile(owner?: { id?: string } | null) {
    if (!owner?.id) return;
    showProfileModal = true;
  }

  function getSepoliaTxUrl(txHash?: string | null) {
    return txHash ? `https://sepolia.etherscan.io/tx/${txHash}` : '';
  }

  function formatValidationDate(value?: string | Date | null) {
    if (!value) return 'Unknown date';
    return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function formatSize(bytes?: number) {
    if (!bytes) return '—';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${sizes[index]}`;
  }

  async function validateDocumentOnChain() {
    if (!validationFile || isValidatingDocument) return;

    try {
      isValidatingDocument = true;
      validationError = '';
      validationResult = null;
      const hash = await calculateFileHash(validationFile);
      const response = await storageService.checkHashesOnChain([hash]);
      validationResult = response.data?.[0] ?? { hash, existsOnChain: false };
    } catch (error) {
      validationError = error instanceof Error ? error.message : 'Failed to validate document.';
    } finally {
      isValidatingDocument = false;
    }
  }
</script>

<svelte:head>
  <title>Validate Document | DecentraShare</title>
</svelte:head>

<main class="validate-page relative mx-auto w-full max-w-[1600px] flex-1 overflow-y-auto p-4 sm:p-6 md:p-10" in:fade>
  <section class="relative mb-8 overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-blue-600/10 via-white/[0.03] to-purple-600/10 p-6 shadow-2xl shadow-black/20 md:p-8">
    <div class="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl"></div>
    <div class="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-purple-500/10 blur-3xl"></div>

    <div class="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
      <div>
        <p class="mb-3 text-xs font-black uppercase tracking-[0.35em] text-blue-300/80">Blockchain Validator</p>
        <h1 class="text-3xl font-black tracking-tight text-white md:text-5xl">Validate Document</h1>
        <p class="mt-4 max-w-2xl text-sm leading-7 text-gray-300 md:text-base">Check an original file against the smart contract before uploading. DecentraShare calculates the SHA-256 hash locally, then verifies whether that content already exists on-chain.</p>
      </div>

      <div class="rounded-[28px] border border-white/10 bg-black/20 p-5 backdrop-blur-xl">
        <label class="relative flex min-h-32 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-center transition-colors hover:border-blue-400/40 hover:bg-blue-500/10">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          </div>
          <div class="max-w-full">
            <p class="truncate text-sm font-semibold text-white">{validationFile ? validationFile.name : 'Choose original file'}</p>
            <p class="mt-1 text-xs text-gray-500">{validationFile ? formatSize(validationFile.size) : ''}</p>
          </div>
          <input
            type="file"
            class="absolute inset-0 cursor-pointer opacity-0"
            disabled={isValidatingDocument}
            onchange={(event) => {
              validationFile = event.currentTarget.files?.[0] ?? null;
              validationResult = null;
              validationError = '';
            }}
          />
        </label>

        <button onclick={validateDocumentOnChain} disabled={!validationFile || isValidatingDocument} class="mt-4 h-12 w-full rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white transition-all hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-gray-500">
          {isValidatingDocument ? 'Checking blockchain...' : 'Check File'}
        </button>
      </div>
    </div>
  </section>

  <div class="">
    <section class="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/10 md:p-6">
      <div class="mb-5 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-black text-white">Validation Result</h2>
        </div>
        {#if isValidatingDocument}<div class="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>{/if}
      </div>

      {#if validationError}
        <div class="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{validationError}</div>
      {:else if validationResult}
        <div class="rounded-2xl border {validationResult.error ? 'border-red-500/20 bg-red-500/10' : validationResult.existsOnChain ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-yellow-500/20 bg-yellow-500/10'} p-5">
          <p class="text-base font-bold {validationResult.error ? 'text-red-300' : validationResult.existsOnChain ? 'text-emerald-300' : 'text-yellow-300'}">
            {validationResult.error ? 'Unable to check blockchain status' : validationResult.existsOnChain ? 'File found on blockchain' : 'File not found on blockchain'}
          </p>
          {#if validationResult.error}<p class="mt-1 text-sm text-red-200/80">{validationResult.error}</p>{/if}
          <p class="mt-3 break-all rounded-xl bg-black/20 p-3 font-mono text-xs text-gray-400">SHA-256: {validationResult.hash}</p>

          {#if validationResult.document}
            <div class="mt-5 grid gap-3 md:grid-cols-3">
              <button onclick={() => openOwnerProfile(validationResult.document?.owner)} class="rounded-xl border border-white/10 bg-black/20 p-3 text-left transition-colors hover:border-blue-400/40 hover:bg-blue-500/10 disabled:cursor-default disabled:hover:border-white/10 disabled:hover:bg-black/20" disabled={!validationResult.document.owner?.id}>
                <p class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Owner</p>
                <div class="mt-2 flex min-w-0 items-center gap-3">
                  <div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-bold text-white keep-white">
                    {#if validationResult.document.owner?.avatarUrl}
                      <img src={validationResult.document.owner.avatarUrl} alt={formatOwner(validationResult.document.owner)} class="h-full w-full object-cover" />
                    {:else}
                      {getOwnerInitial(validationResult.document.owner)}
                    {/if}
                  </div>
                  <p class="truncate text-sm font-semibold text-white">{formatOwner(validationResult.document.owner)}</p>
                </div>
              </button>
              <div class="rounded-xl border border-white/10 bg-black/20 p-3">
                <p class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Uploaded</p>
                <p class="mt-1 text-sm font-semibold text-white">{formatValidationDate(validationResult.document.uploadedAt)}</p>
              </div>
              <div class="rounded-xl border border-white/10 bg-black/20 p-3">
                <p class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Blockchain TX</p>
                {#if validationResult.document.blockchainTx}
                  <a href={getSepoliaTxUrl(validationResult.document.blockchainTx) as `https://${string}`} target="_blank" rel="noopener noreferrer" class="mt-1 inline-flex max-w-full items-center gap-2 font-mono text-sm font-semibold text-blue-300 transition-colors hover:text-blue-200" title={validationResult.document.blockchainTx}>
                    <span class="truncate">{validationResult.document.blockchainTx}</span>
                    <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                {:else}
                  <p class="mt-1 truncate font-mono text-sm font-semibold text-gray-400">Not confirmed yet</p>
                {/if}
              </div>
            </div>
          {:else if validationResult.existsOnChain}
            <p class="mt-4 text-sm text-gray-400">The hash exists on-chain, but no local document metadata was found.</p>
          {/if}
        </div>
      {:else}
        <div class="rounded-2xl border border-white/5 bg-black/20 py-16 text-center">
          <p class="font-semibold text-white">No file checked yet</p>
          <p class="mt-1 text-sm text-gray-500">Choose a file and run validation to see the blockchain status.</p>
        </div>
      {/if}
    </section>
  </div>
</main>

<ProfilePreviewModal
  isOpen={showProfileModal}
  onClose={() => showProfileModal = false}
  profile={validationResult?.document?.owner ? {
    id: validationResult.document.owner.id || '',
    username: validationResult.document.owner.username,
    email: validationResult.document.owner.email,
    walletAddress: validationResult.document.owner.walletAddress || '',
    avatarUrl: validationResult.document.owner.avatarUrl
  } : null}
/>
