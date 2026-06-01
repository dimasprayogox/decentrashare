<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  import FileGrid from '$lib/components/storage/FileGrid.svelte';
  import FileTable from '$lib/components/storage/FileTable.svelte';
  import ViewSwitcher from '$lib/components/storage/ViewSwitcher.svelte';
  import { storageService } from '$lib/services/storage/storage';
  import type { Document, Folder } from '$lib/types/storage';

  type PublicUser = {
    id: string;
    username?: string | null;
    email?: string | null;
    walletAddress: string;
    avatarUrl?: string | null;
    bio?: string | null;
    website?: string | null;
    createdAt?: string;
  };

  let user = $state<PublicUser | null>(null);
  let folders = $state<Folder[]>([]);
  let documents = $state<Document[]>([]);
  let currentUserId = $state<string | null>(null);
  let isLoading = $state(true);
  let errorMessage = $state('');
  let viewMode = $state(2);

  const userId = $derived(page.params.userId);
  const resultCount = $derived(folders.length + documents.length);

  function getInitial(name?: string | null, wallet?: string) {
    return (name?.trim()?.[0] || wallet?.[0] || '?').toUpperCase();
  }

  function formatWallet(address?: string) {
    if (!address) return '—';
    return `${address.slice(0, 10)}...${address.slice(-6)}`;
  }

  function formatDate(value?: string | Date | null) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function getFileTheme(mimeType: string) {
    if (mimeType.includes('image')) return { color: 'text-purple-500 bg-purple-500/10' };
    if (mimeType.includes('video')) return { color: 'text-red-500 bg-red-500/10' };
    if (mimeType.includes('pdf') || mimeType.includes('document')) return { color: 'text-orange-500 bg-orange-500/10' };
    return { color: 'text-blue-500 bg-blue-500/10' };
  }

  async function loadProfile() {
    if (!userId) return;
    try {
      isLoading = true;
      errorMessage = '';
      const [profileResponse, meResponse] = await Promise.all([
        storageService.getPublicProfile(userId),
        storageService.getCurrentUser().catch(() => null)
      ]);

      if (!profileResponse.success || !profileResponse.data) {
        throw new Error(profileResponse.message || 'Failed to load profile.');
      }

      user = profileResponse.data.user;
      folders = profileResponse.data.folders;
      documents = profileResponse.data.documents;
      currentUserId = meResponse?.data?.id ?? null;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load profile.';
    } finally {
      isLoading = false;
    }
  }

  function noop() {}

  onMount(() => {
    void loadProfile();
  });
</script>

<main class="relative mx-auto w-full max-w-[1600px] flex-1 overflow-y-auto p-4 sm:p-6 md:p-10">
  <button onclick={() => history.back()} class="mb-6 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-bold text-gray-300 transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-white">
    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
    Back
  </button>

  {#if isLoading}
    <div class="flex min-h-[50vh] flex-col items-center justify-center rounded-[32px] border border-white/5 bg-white/[0.01] text-center">
      <div class="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      <p class="text-gray-400">Loading public profile...</p>
    </div>
  {:else if errorMessage}
    <div class="rounded-[32px] border border-red-500/20 bg-red-500/[0.03] py-20 text-center">
      <p class="font-semibold text-red-300">{errorMessage}</p>
      <button onclick={loadProfile} class="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-red-200 transition-colors hover:bg-red-500/20">Try again</button>
    </div>
  {:else if user}
    <section class="relative mb-8 overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 shadow-2xl shadow-black/20 md:p-8">
      <div class="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl"></div>
      <div class="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-purple-500/10 blur-3xl"></div>

      <div class="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div class="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div class="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-white/10 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 shadow-xl shadow-black/30">
            {#if user.avatarUrl}
              <img src={user.avatarUrl} alt={user.username || 'Profile avatar'} class="h-full w-full object-cover" />
            {:else}
              <div class="flex h-full w-full items-center justify-center text-3xl font-black text-white">{getInitial(user.username, user.walletAddress)}</div>
            {/if}
            <span class="absolute bottom-1 right-1 h-5 w-5 rounded-full border-4 border-[#1a1a1e] bg-green-500"></span>
          </div>

          <div class="min-w-0">
            <p class="mb-2 text-xs font-black uppercase tracking-[0.35em] text-blue-400/80">Public profile</p>
            <h1 class="truncate text-3xl font-black text-white md:text-4xl">
              {user.username || 'Anonymous'}
              {#if currentUserId === user.id}<span class="ml-2 text-base font-semibold text-blue-400">(Saya)</span>{/if}
            </h1>
            <p class="mt-2 inline-flex rounded-full bg-white/5 px-3 py-1.5 font-mono text-xs text-gray-400" title={user.walletAddress}>{formatWallet(user.walletAddress)}</p>
            {#if user.bio}<p class="mt-4 max-w-2xl text-sm leading-relaxed text-gray-300">{user.bio}</p>{/if}
            {#if user.website}<a href={user.website} target="_blank" rel="noopener noreferrer" class="mt-3 inline-flex text-sm font-semibold text-blue-300 hover:text-blue-200">{user.website}</a>{/if}
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3 text-center">
          <div class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p class="text-2xl font-black text-white">{folders.length}</p>
            <p class="text-xs text-gray-500">Folders</p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p class="text-2xl font-black text-white">{documents.length}</p>
            <p class="text-xs text-gray-500">Files</p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p class="text-sm font-black text-white">{formatDate(user.createdAt)}</p>
            <p class="text-xs text-gray-500">Joined</p>
          </div>
        </div>
      </div>
    </section>

    <section class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-xs font-black uppercase tracking-[0.35em] text-blue-400/80">Public content</p>
        <h2 class="mt-1 text-2xl font-black text-white">{resultCount} item{resultCount === 1 ? '' : 's'}</h2>
      </div>
      <ViewSwitcher bind:viewMode />
    </section>

    {#if resultCount === 0}
      <div class="rounded-[32px] border border-white/5 bg-white/[0.01] py-20 text-center">
        <p class="font-bold text-white">No public folders or documents yet.</p>
        <p class="mt-1 text-sm text-gray-500">Public items from this user will appear here.</p>
      </div>
    {:else if viewMode === 3}
      <FileGrid folders={folders} items={documents} viewMode={2} openFolder={() => {}} handleDeleteFolder={noop} handleDelete={noop} {getFileTheme} selectedItems={[]} selectionMode={false} currentUserId={currentUserId} onToggleSelect={noop} onRefresh={loadProfile} publicExploreMode={true} onDownload={(id, type) => type === 'folder' ? storageService.downloadFolder(id) : storageService.downloadDocument(id)} />
    {:else}
      <FileTable folders={folders} items={documents} viewMode={2} openFolder={() => {}} handleDeleteFolder={noop} handleDelete={noop} {getFileTheme} selectedItems={[]} selectionMode={false} currentUserId={currentUserId} onToggleSelect={noop} onRefresh={loadProfile} publicExploreMode={true} onDownload={(id, type) => type === 'folder' ? storageService.downloadFolder(id) : storageService.downloadDocument(id)} />
    {/if}
  {/if}
</main>
