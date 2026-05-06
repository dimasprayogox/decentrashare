<script lang="ts">
  let { viewMode = $bindable() } = $props();
</script>

<div class="flex bg-white/5 p-1 rounded-2xl border border-white/10 ml-2">
  {#each [1, 2, 3] as mode}
    <button 
      onclick={() => viewMode = mode} 
      class="p-2 rounded-xl transition-all {viewMode === mode ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/40' : 'text-gray-500 hover:text-white'}"
    >
      {#if mode === 1}
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
      {:else if mode === 2}
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/></svg>
      {:else}
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/></svg>
      {/if}
    </button>
  {/each}
</div>