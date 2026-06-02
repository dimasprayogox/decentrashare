<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { Folder } from '$lib/types/storage';

  type MoveTarget = { id: string; type: 'folder' | 'document'; name: string; parentId?: string | null };
  type MoveFolderRow = { folder: Folder; depth: number };

  let {
    isOpen,
    targets = [],
    destinationLabel,
    targetLabel,
    targetFolderId,
    visibleFolders = [],
    isProcessing = false,
    error = '',
    notice = '',
    isInvalidDestination,
    isFolderExpanded,
    isFolderLoading,
    getDestinationMeta,
    getDestinationDisabledReason,
    getChildren,
    onSelectRoot,
    onToggleFolder,
    onSelectFolder,
    onCancel,
    onMove
  }: {
    isOpen: boolean;
    targets: MoveTarget[];
    destinationLabel: string;
    targetLabel: string;
    targetFolderId: string | null;
    visibleFolders: MoveFolderRow[];
    isProcessing?: boolean;
    error?: string;
    notice?: string;
    isInvalidDestination: (folderId: string | null) => boolean;
    isFolderExpanded: (folderId: string) => boolean;
    isFolderLoading: (folderId: string) => boolean;
    getDestinationMeta: (folder: Folder) => string;
    getDestinationDisabledReason: (folder: Folder) => string;
    getChildren: (folderId: string | null) => Folder[];
    onSelectRoot: () => void;
    onToggleFolder: (folderId: string) => void | Promise<void>;
    onSelectFolder: (folder: Folder, disabled: boolean, reason: string) => void;
    onCancel: () => void;
    onMove: () => void | Promise<void>;
  } = $props();
</script>

{#if isOpen}
  <div class="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade>
    <div class="bg-[#111115] rounded-[32px] border border-white/10 shadow-2xl shadow-black/60 w-full max-w-2xl max-h-[86vh] overflow-hidden" in:scale>
      <div class="p-6 border-b border-white/10 bg-gradient-to-br from-blue-600/15 via-white/[0.03] to-transparent">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-4 min-w-0">
            <div class="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-400/20 flex items-center justify-center shrink-0">
              <svg class="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
            </div>
            <div class="min-w-0">
              <h3 class="text-white font-black text-xl tracking-tight">Move Item</h3>
              <p class="text-sm text-gray-400 truncate">{targetLabel} -> {destinationLabel}</p>
            </div>
          </div>
          <button onclick={onCancel} class="p-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/10 transition-colors" disabled={isProcessing} aria-label="Close move modal">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <div class="p-6 space-y-4 overflow-y-auto max-h-[calc(86vh-220px)]">
        {#if notice}
          <p class="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-3" role="status">{notice}</p>
        {/if}

        <div class="space-y-2 max-h-72 overflow-y-auto mb-4 pr-1">
          <button onclick={onSelectRoot} class="w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-colors {targetFolderId === null ? 'bg-blue-600/20 border-blue-500/50 text-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}" disabled={isProcessing}>
            <span><span class="block font-medium">Root</span><span class="block text-xs text-gray-500">Privacy will be set to PRIVATE</span></span>
            {#if targetFolderId === null}<span class="text-blue-400">Selected</span>{/if}
          </button>

          {#if visibleFolders.length === 0}
            <div class="px-4 py-6 text-center rounded-xl border border-dashed border-white/10 bg-white/[0.02]"><p class="text-sm text-gray-400">No destination folders found.</p><p class="text-xs text-gray-600 mt-1">Choose Root or create a folder first.</p></div>
          {/if}

          {#each visibleFolders as row (row.folder.id)}
            {@const invalidDestination = isInvalidDestination(row.folder.id)}
            {@const permissionError = getDestinationDisabledReason(row.folder)}
            {@const disabledDestination = invalidDestination || Boolean(permissionError)}
            <div class="flex items-stretch gap-2" style={`margin-left: ${row.depth * 1.25}rem`}>
              <button onclick={() => onToggleFolder(row.folder.id)} class="w-11 rounded-xl border border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center" disabled={isProcessing} title="Show subfolders">
                {#if isFolderLoading(row.folder.id)}<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>{:else}<svg class="w-4 h-4 transition-transform {isFolderExpanded(row.folder.id) ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>{/if}
              </button>
              <button onclick={() => onSelectFolder(row.folder, disabledDestination, permissionError)} class="flex-1 flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all {disabledDestination ? 'bg-red-500/5 border-red-500/20 text-gray-600 cursor-not-allowed' : targetFolderId === row.folder.id ? 'bg-blue-600/20 border-blue-500/50 text-white shadow-lg shadow-blue-500/10' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}" disabled={isProcessing || disabledDestination}>
                <span class="min-w-0"><span class="flex items-center gap-2 font-medium truncate"><svg class="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>{row.folder.name}</span><span class="block text-xs text-gray-500">{invalidDestination ? 'Invalid destination' : permissionError || getDestinationMeta(row.folder)}</span></span>
                {#if targetFolderId === row.folder.id}<span class="text-blue-400 text-xs font-semibold">Selected</span>{/if}
              </button>
            </div>
            {#if isFolderExpanded(row.folder.id) && getChildren(row.folder.id).length === 0 && !isFolderLoading(row.folder.id)}<p class="py-1 text-xs text-gray-600 italic" style={`margin-left: ${(row.depth + 1) * 1.25 + 3.5}rem`}>No subfolders</p>{/if}
          {/each}
        </div>

        {#if error}<p class="text-xs text-red-400 ml-1 mb-4 flex items-center gap-1" role="alert" aria-live="polite"><svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>{error}</span></p>{/if}

        <div class="flex gap-3">
          <button onclick={onCancel} class="flex-1 h-10 bg-white/5 text-white rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50" disabled={isProcessing}>Cancel</button>
          <button onclick={onMove} class="flex-1 h-10 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-bold" disabled={isProcessing || isInvalidDestination(targetFolderId)}>
            {#if isProcessing}<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>{:else}Move Here{/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
