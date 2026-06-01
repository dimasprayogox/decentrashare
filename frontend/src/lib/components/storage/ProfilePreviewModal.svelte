<script lang="ts">
  import { fade, scale, fly } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  
  // Props
  type Profile = {
    id: string;
    username?: string | null;
    email?: string | null;
    walletAddress: string;
    avatarUrl?: string | null;
    bio?: string | null;
    website?: string | null;
    joinedAt?: string | Date;
  };

  let {
    isOpen = false,
    onClose,
    profile,
    profiles,
    currentUserId
  }: {
    isOpen: boolean;
    onClose: () => void;
    profile: Profile | null;
    profiles?: Profile[];
    currentUserId?: string;
  } = $props();

  const visibleProfiles = $derived(profiles?.length ? profiles : (profile ? [profile] : []));
  const isMultiProfile = $derived(visibleProfiles.length > 1);

  // Local state
  let copySuccess = $state(false);
  let isImageError = $state(false);

  // ✅ Helper: Format wallet address
  function formatWallet(address: string): string {
    return `${address.slice(0, 10)}...${address.slice(-6)}`;
  }

  // ✅ Helper: Get avatar initial
  function getInitial(name?: string | null, wallet?: string): string {
    return (name?.[0] || wallet?.[0] || '?').toUpperCase();
  }

  // ✅ Helper: Copy wallet to clipboard
  async function copyWallet(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      copySuccess = true;
      setTimeout(() => { copySuccess = false; }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  // ✅ Keyboard: ESC to close
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      onClose();
    }
  }

  // ✅ Mount/Unmount: Add/remove keyboard listener
  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  // ✅ Reset state when modal closes
  $effect(() => {
    if (!isOpen) {
      copySuccess = false;
      isImageError = false;
    }
  });
</script>

{#if isOpen && visibleProfiles.length > 0}
  <div
    class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
    transition:fade={{ duration: 200 }}
    onclick={onClose}
    role="dialog"
    aria-modal="true"
    aria-labelledby="profile-modal-title"
  >
    <div
      class="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a1a1e] to-[#121214] p-6 shadow-2xl shadow-black/50 {visibleProfiles.length === 1 ? 'max-w-sm' : 'max-w-5xl'}"
      in:scale={{ duration: 250 }}
      onclick={(e) => e.stopPropagation()}
    >
      <div class="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <button onclick={onClose} class="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/[0.03] text-gray-500 transition-all hover:border-white/10 hover:bg-white/10 hover:text-white" aria-label="Close modal">
        <svg class="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>

      {#if visibleProfiles.length > 1}
        <div class="mb-6 pr-10 text-center">
          <h2 id="profile-modal-title" class="mt-2 text-2xl font-black text-white">Folder owners</h2>
        </div>
      {/if}

      <div class="{visibleProfiles.length === 1 ? '' : 'max-h-[72vh] overflow-y-auto pr-1'}">
        <div class="grid gap-4 {visibleProfiles.length === 1 ? 'grid-cols-1' : visibleProfiles.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'}">
          {#each visibleProfiles as item (item.id)}
            <section class="relative text-center {visibleProfiles.length === 1 ? '' : 'rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/20'}">
              <div class="flex flex-col items-center mb-5">
                <div class="relative">
                  {#if item.avatarUrl && !isImageError}
                    <img src={item.avatarUrl} alt={item.username || 'User avatar'} class="w-20 h-20 rounded-full object-cover border-4 border-white/10 shadow-lg shadow-black/30" onerror={() => { isImageError = true; }} />
                  {:else}
                    <div class="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-black/30">
                      {getInitial(item.username, item.walletAddress)}
                    </div>
                  {/if}
                  <span class="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-4 border-[#1a1a1e] rounded-full"></span>
                </div>

                <h2 id="profile-modal-title" class="mt-4 text-white font-bold text-xl text-center">
                  {item.username || 'Anonymous'}
                  {#if currentUserId === item.id}<span class="ml-2 text-blue-400 text-sm font-normal">(Saya)</span>{/if}
                </h2>

                <div class="mt-2 flex items-center gap-2">
                  <span class="text-gray-500 text-xs font-mono bg-white/5 px-3 py-1.5 rounded-full">{formatWallet(item.walletAddress)}</span>
                  <button onclick={() => copyWallet(item.walletAddress)} class="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-white/10 rounded-lg transition-all" title="Copy wallet address" aria-label="Copy wallet address">
                    {#if copySuccess}
                      <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    {:else}
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                    {/if}
                  </button>
                </div>
              </div>

              {#if item.bio}<div class="mb-5 px-2"><p class="text-gray-300 text-sm text-center leading-relaxed">{item.bio}</p></div>{/if}

              <button onclick={() => { window.location.href = `/profile/${item.id}`; }} class="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-500 hover:to-purple-500 active:scale-[0.98] transition-all duration-150 font-medium text-sm flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                View Profile
              </button>
            </section>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>