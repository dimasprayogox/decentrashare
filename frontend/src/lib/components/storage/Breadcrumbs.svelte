<script lang="ts">
  type BreadcrumbFolder = { id: string; name: string };

  let { breadcrumbs, currentFolder, navigateTo, openFolder } = $props<{
    breadcrumbs: BreadcrumbFolder[];
    currentFolder: BreadcrumbFolder | null;
    navigateTo?: (folder: BreadcrumbFolder | null) => void;
    openFolder?: (folder: BreadcrumbFolder | null) => void;
  }>();

  function navigate(folder: BreadcrumbFolder | null) {
    (navigateTo ?? openFolder)?.(folder);
  }
</script>

<nav class="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 no-scrollbar">
  <button
    onclick={() => navigate?.(null)}
    class="text-xs font-black tracking-[0.35em] hover:text-white transition-colors {!currentFolder ? 'text-blue-400' : ''}"
  >
    STORAGE
  </button>

  {#each breadcrumbs as folder, i (folder.id)}
    <span class="text-gray-700">/</span>
    <button
      onclick={() => navigate(folder)}
      class="text-xs hover:text-white transition-colors {i === breadcrumbs.length - 1 ? 'text-blue-400' : ''}"
    >
      {folder.name.toUpperCase()}
    </button>
  {/each}
</nav>