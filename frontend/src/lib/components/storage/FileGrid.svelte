<script lang="ts">
  let { folders, items, openFolder, handleDeleteFolder, handleDelete, getFileTheme } = $props();
</script>

<div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-6">
  {#each folders as folder}
    <div class="group relative bg-white/[0.02] border border-white/5 rounded-[40px] p-6 hover:bg-white/[0.05] transition-all flex flex-col items-center text-center cursor-pointer shadow-xl" onclick={() => openFolder(folder)}>
      <div class="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-[24px] mb-4 flex items-center justify-center group-hover:scale-110 transition-transform">
        <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path></svg>
      </div>
      <h4 class="text-xs font-bold text-white truncate w-full uppercase">{folder.name}</h4>
      <button onclick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }} class="absolute top-4 right-4 p-1.5 opacity-0 group-hover:opacity-100 text-red-500/30 hover:text-red-500 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
      </button>
    </div>
  {/each}

  {#each items as item}
    {@const theme = getFileTheme(item.mimeType)}
    <div class="group relative bg-white/[0.02] border border-white/5 rounded-[40px] p-6 hover:bg-white/[0.05] transition-all flex flex-col items-center text-center shadow-xl">
      <div class="w-16 h-16 {theme.color} rounded-[24px] mb-4 flex items-center justify-center group-hover:scale-110 transition-transform">
        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
      </div>
      <h4 class="text-xs font-medium text-gray-300 truncate w-full">{item.title}</h4>
      <span class="text-[8px] text-gray-600 mt-1 uppercase font-bold">{(item.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
      <button onclick={() => handleDelete(item.id)} class="absolute top-4 right-4 p-1.5 opacity-0 group-hover:opacity-100 text-red-500/30 hover:text-red-500 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
      </button>
    </div>
  {/each}
</div>