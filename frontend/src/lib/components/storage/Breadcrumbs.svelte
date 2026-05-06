<script lang="ts">
  let { breadcrumbs, currentFolder, navigateTo } = $props();
</script>

<nav class="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 no-scrollbar">
  <button 
    onclick={() => navigateTo(null)} 
    class="hover:text-white transition-colors {!currentFolder ? 'text-blue-400' : ''}"
  >
    My Files
  </button>
  
  {#each breadcrumbs as folder, i}
    <span class="text-gray-700">/</span>
    <button 
      onclick={() => navigateTo(folder)} 
      class="hover:text-white transition-colors {i === breadcrumbs.length - 1 ? 'text-blue-400' : ''}"
    >
      {folder.name}
    </button>
  {/each}
</nav>