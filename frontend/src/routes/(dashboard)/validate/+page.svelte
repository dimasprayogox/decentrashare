<script lang="ts">
  import { fade } from 'svelte/transition';
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
      owner?: { username?: string | null; email?: string | null; walletAddress?: string | null };
    } | null;
  } | null>(null);
  let isValidatingDocument = $state(false);
  let validationError = $state('');

  async function calculateFileHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function formatOwner(owner?: { username?: string | null; email?: string | null; walletAddress?: string | null } | null) {
    if (!owner) return 'Unknown owner';
    return owner.username || owner.email || (owner.walletAddress ? `${owner.walletAddress.slice(0, 8)}...${owner.walletAddress.slice(-6)}` : 'Unknown owner');
  }

  function formatValidationDate(value?: string | Date | null) {
    if (!value) return 'Unknown date';
    return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
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

<main class="relative mx-auto w-full max-w-[1600px] flex-1 overflow-y-auto p-4 sm:p-6 md:p-10" in:fade>
  <header class="mb-8">
    <p class="mb-2 text-xs font-black uppercase tracking-[0.35em] text-blue-400/80">Blockchain Validator</p>
    <h1 class="text-2xl font-black tracking-tight text-white md:text-3xl">Validate Document</h1>
    <p class="mt-2 max-w-2xl text-sm text-gray-500">Check an original file against the blockchain record without uploading it.</p>
  </header>

  <section class="max-w-3xl rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/10 md:p-6">
    <div class="space-y-4">
      <label class="relative flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-4 text-sm text-gray-300 transition-colors hover:border-white/20 hover:bg-white/[0.03]">
        <span class="truncate">{validationFile ? validationFile.name : 'Select original file'}</span>
        <span class="shrink-0 rounded-xl bg-white/10 px-3 py-1 text-xs font-semibold text-white">Browse</span>
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

      <button onclick={validateDocumentOnChain} disabled={!validationFile || isValidatingDocument} class="h-12 w-full rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-gray-500">
        {isValidatingDocument ? 'Checking blockchain...' : 'Check File'}
      </button>

      <p class="text-xs text-gray-500">The file is not uploaded. Only its SHA-256 hash is checked against the smart contract.</p>
    </div>

    {#if validationError}
      <div class="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{validationError}</div>
    {/if}

    {#if validationResult}
      <div class="mt-6 rounded-2xl border {validationResult.error ? 'border-red-500/20 bg-red-500/10' : validationResult.existsOnChain ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-yellow-500/20 bg-yellow-500/10'} p-5">
        <p class="text-base font-bold {validationResult.error ? 'text-red-300' : validationResult.existsOnChain ? 'text-emerald-300' : 'text-yellow-300'}">
          {validationResult.error ? 'Unable to check blockchain status' : validationResult.existsOnChain ? 'File found on blockchain' : 'File not found on blockchain'}
        </p>
        {#if validationResult.error}<p class="mt-1 text-sm text-red-200/80">{validationResult.error}</p>{/if}
        <p class="mt-2 break-all font-mono text-xs text-gray-400">SHA-256: {validationResult.hash}</p>

        {#if validationResult.document}
          <div class="mt-5 grid gap-3 md:grid-cols-3">
            <div class="rounded-xl border border-white/10 bg-black/20 p-3">
              <p class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Owner</p>
              <p class="mt-1 truncate text-sm font-semibold text-white">{formatOwner(validationResult.document.owner)}</p>
            </div>
            <div class="rounded-xl border border-white/10 bg-black/20 p-3">
              <p class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Uploaded</p>
              <p class="mt-1 text-sm font-semibold text-white">{formatValidationDate(validationResult.document.uploadedAt)}</p>
            </div>
            <div class="rounded-xl border border-white/10 bg-black/20 p-3">
              <p class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Blockchain TX</p>
              <p class="mt-1 truncate font-mono text-sm font-semibold text-blue-300" title={validationResult.document.blockchainTx || ''}>{validationResult.document.blockchainTx || 'Not confirmed yet'}</p>
            </div>
          </div>
        {:else if validationResult.existsOnChain}
          <p class="mt-4 text-sm text-gray-400">The hash exists on-chain, but no local document metadata was found.</p>
        {/if}
      </div>
    {/if}
  </section>
</main>
