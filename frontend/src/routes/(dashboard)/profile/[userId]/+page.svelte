<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import Breadcrumbs from '$lib/components/storage/Breadcrumbs.svelte';
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
  let viewMode = $state(1);
  let currentFolderId = $state<string | null>(null);

  const userId = $derived(page.params.userId);
  const currentFolder = $derived(currentFolderId ? folders.find((folder) => folder.id === currentFolderId) ?? null : null);
  const visibleFolders = $derived(folders.filter((folder) => folder.parentId === currentFolderId));
  const visibleDocuments = $derived(documents.filter((document) => document.folderId === currentFolderId));
  const resultCount = $derived(visibleFolders.length + visibleDocuments.length);
  const totalResultCount = $derived(folders.length + documents.length);
  const breadcrumbs = $derived.by(() => {
    if (!currentFolder) return [];

    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const path: { id: string; name: string }[] = [];
    let cursor: Folder | undefined = currentFolder;

    while (cursor) {
      path.unshift({ id: cursor.id, name: cursor.name });
      cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined;
    }

    return path;
  });

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

  function normalizeWebsiteUrl(value?: string | null) {
    const website = value?.trim();
    if (!website) return '';
    return /^https?:\/\//i.test(website) ? website : `https://${website}`;
  }

  function getWebsiteDisplay(value?: string | null) {
    const normalized = normalizeWebsiteUrl(value);
    if (!normalized) return '';

    try {
      return new URL(normalized).hostname.replace(/^www\./, '');
    } catch {
      return value?.trim() || '';
    }
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

  function openFolder(folder: { id?: string } | null) {
    currentFolderId = folder?.id ?? null;
  }

  function goBackFolder() {
    if (!currentFolder) return;
    currentFolderId = currentFolder.parentId ?? null;
  }

  async function downloadPublicItem(id: string, type: 'document' | 'folder') {
    if (type === 'folder') {
      await storageService.downloadFolder(id);
      return;
    }

    await storageService.downloadDocument(id);
  }

  onMount(() => {
    void loadProfile();
  });
</script>

<div>
  <div class="relative w-full flex-1 p-4 sm:p-6 md:p-10 overflow-y-auto max-w-[1600px] mx-auto">
    <button onclick={() => history.back()} class="mb-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/[0.06] hover:text-white">
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
      Back
    </button>

    <div class="">
      <div class="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500"></div>

      {#if isLoading}
        <div class="flex min-h-[300px] flex-col items-center justify-center p-6 md:p-8">
          <div class="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-blue-500"></div>
          <p class="mt-4 text-sm text-gray-400">Loading profile...</p>
        </div>
      {:else if errorMessage}
        <div class="flex min-h-[300px] flex-col items-center justify-center p-6 text-center md:p-8">
          <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-300">!</div>
          <p class="font-semibold text-white">Unable to load profile</p>
          <p class="mt-1 text-sm text-gray-400">{errorMessage}</p>
          <button onclick={loadProfile} class="mt-5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500">Try Again</button>
        </div>
      {:else if user}
        <div class="border-b border-white/5 px-5 py-4 md:px-6 md:py-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-3">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-cyan-500">
                <svg class="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <div>
                <h1 class="text-base font-semibold text-white md:text-lg">Public Profile</h1>
                <p class="hidden text-xs text-gray-500 sm:block">Profile details and public content</p>
              </div>
            </div>

            <div class="sm:text-right">
              <p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Joined</p>
              <p class="mt-1 text-sm font-medium text-gray-200">{formatDate(user.createdAt)}</p>
            </div>
          </div>
        </div>

        <div class="space-y-6 p-5 md:p-6">
          <section class="grid grid-cols-1 items-start gap-8 border-b border-white/5 pb-6 md:grid-cols-[280px_1fr]">
            <div class="flex flex-col items-center text-center">
              <div class="h-35 w-35 overflow-hidden rounded-full border-4 border-white/10 bg-gradient-to-br from-blue-500/20 to-purple-500/20 shadow-lg shadow-black/20 md:h-45 md:w-45">
                {#if user.avatarUrl}
                  <img src={user.avatarUrl} alt={user.username || 'Profile avatar'} class="h-full w-full object-cover" />
                {:else}
                  <div class="flex h-full w-full items-center justify-center bg-white/[0.03] text-5xl font-bold text-white">{getInitial(user.username, user.walletAddress)}</div>
                {/if}
              </div>
              <h2 class="mt-4 text-xl font-semibold text-white">{user.username || 'Anonymous'}</h2>
              <p class="mt-1 font-mono text-sm font-medium text-blue-400" title={user.walletAddress}>{formatWallet(user.walletAddress)}</p>
              {#if currentUserId === user.id}
                <span class="mt-2 inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">You</span>
              {/if}
            </div>

            <div class="space-y-4">
              <div class="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Bio</p>
                <p class="mt-2 whitespace-pre-line text-sm leading-6 text-gray-300">{user.bio?.trim() }</p>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Website</p>
                  {#if user.website?.trim()}
                    <a href={normalizeWebsiteUrl(user.website) as `http${string}` | `https${string}`} target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex max-w-full items-center gap-2 text-sm font-semibold text-blue-300 transition-colors hover:text-blue-200">
                      <span class="truncate">{getWebsiteDisplay(user.website)}</span>
                      <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  {:else}
                    
                  {/if}
                </div>

                <div class="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Email</p>
                  <p class="mt-2 truncate text-sm font-medium text-gray-300">{user.email || 'Email has not been added yet.'}</p>
                </div>
              </div>

              <div class="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 class="text-base font-semibold text-white md:text-lg">Public Content</h2>
                  <p class="text-sm text-gray-500">{folders.length} folder{folders.length === 1 ? '' : 's'} • {documents.length} file{documents.length === 1 ? '' : 's'}</p>
                </div>
                <ViewSwitcher bind:viewMode />
              </div>
            </div>
          </section>

          <section>
            <header class="mb-5 flex items-center gap-3">
              {#if currentFolder}
                <button onclick={goBackFolder} class="shrink-0 rounded-xl p-2 text-gray-400 transition-all hover:bg-white/10 hover:text-white" title="Back to parent folder">
                  <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </button>
              {/if}

              <div class="min-w-0">
                <Breadcrumbs {breadcrumbs} currentFolder={currentFolder ? { id: currentFolder.id, name: currentFolder.name } : null} navigateTo={openFolder} />
                <h2 class="truncate text-2xl font-black tracking-tight text-white md:text-3xl">{currentFolder ? currentFolder.name : 'All Files'}</h2>
              </div>
            </header>

            {#if viewMode === 1}
              <section class="mb-10">
                <div class="mb-4 flex items-center justify-between">
                  <h3 class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Folders</h3>
                  <span class="text-[10px] text-gray-600">{visibleFolders.length} item{visibleFolders.length === 1 ? '' : 's'}</span>
                </div>
                {#if visibleFolders.length > 0}
                  <FileGrid folders={visibleFolders} items={[]} viewMode={2} openFolder={openFolder} handleDeleteFolder={noop} handleDelete={noop} {getFileTheme} selectedItems={[]} selectionMode={false} currentUserId={currentUserId} onToggleSelect={noop} onRefresh={loadProfile} publicExploreMode={true} onDownload={downloadPublicItem} />
                {:else}
                  <p class="pl-2 text-sm italic text-gray-600">No folders yet</p>
                {/if}
              </section>

              <section>
                <div class="mb-4 flex items-center justify-between">
                  <h3 class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Documents</h3>
                  <span class="text-[10px] text-gray-600">{visibleDocuments.length} item{visibleDocuments.length === 1 ? '' : 's'}</span>
                </div>
                {#if visibleDocuments.length > 0}
                  <FileTable folders={[]} items={visibleDocuments} viewMode={1} openFolder={openFolder} handleDeleteFolder={noop} handleDelete={noop} {getFileTheme} selectedItems={[]} selectionMode={false} currentUserId={currentUserId} onToggleSelect={noop} onRefresh={loadProfile} publicExploreMode={true} onDownload={downloadPublicItem} />
                {:else}
                  <p class="pl-2 text-sm italic text-gray-600">No documents yet</p>
                {/if}
              </section>
            {:else if viewMode === 2}
              {#if resultCount > 0}
                <FileTable folders={visibleFolders} items={visibleDocuments} viewMode={2} openFolder={openFolder} handleDeleteFolder={noop} handleDelete={noop} {getFileTheme} selectedItems={[]} selectionMode={false} currentUserId={currentUserId} onToggleSelect={noop} onRefresh={loadProfile} publicExploreMode={true} onDownload={downloadPublicItem} />
              {:else}
                <div class="rounded-2xl border border-white/5 bg-white/[0.02] py-16 text-center">
                  <p class="font-semibold text-white">No public content in this folder yet</p>
                  <p class="mt-1 text-sm text-gray-500">Open another folder or return to storage root to view public items.</p>
                </div>
              {/if}
            {:else}
              {#if resultCount > 0}
                <FileGrid folders={visibleFolders} items={visibleDocuments} viewMode={2} openFolder={openFolder} handleDeleteFolder={noop} handleDelete={noop} {getFileTheme} selectedItems={[]} selectionMode={false} currentUserId={currentUserId} onToggleSelect={noop} onRefresh={loadProfile} publicExploreMode={true} onDownload={downloadPublicItem} />
              {:else}
                <div class="rounded-2xl border border-white/5 bg-white/[0.02] py-16 text-center">
                  <p class="font-semibold text-white">No public content in this folder yet</p>
                  <p class="mt-1 text-sm text-gray-500">Open another folder or return to storage root to view public items.</p>
                </div>
              {/if}
            {/if}
          </section>
        </div>
      {/if}
    </div>
  </div>
</div>
