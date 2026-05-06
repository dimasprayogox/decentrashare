<script lang="ts">
  let { folders, items, viewMode, openFolder, handleDeleteFolder, handleDelete, getFileTheme } = $props();
</script>

<div class="bg-white/[0.02] border border-white/5 rounded-[40px] overflow-hidden shadow-2xl">
  <table class="w-full text-left border-collapse">
    <thead class="bg-white/5 text-[10px] text-gray-500 uppercase tracking-widest">
      <tr>
        <th class="px-8 py-5">Name</th>
        <th class="hidden md:table-cell px-4 py-5 text-center">Size</th>
        <th class="hidden lg:table-cell px-4 py-5 text-center">IPFS Hash</th>
        <th class="px-8 py-5 text-right">Action</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-white/5">
      {#if viewMode === 2}
        {#each folders as folder}
          <tr class="hover:bg-white/[0.03] transition-all group cursor-pointer" onclick={() => openFolder(folder)}>
            <td class="px-8 py-6 flex items-center gap-4">
              <div class="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path></svg>
              </div>
              <span class="text-sm font-bold text-white uppercase">{folder.name}</span>
            </td>
            <td class="hidden md:table-cell px-4 py-6 text-center text-gray-700">—</td>
            <td class="hidden lg:table-cell px-4 py-6 text-center text-gray-700">—</td>
            <td class="px-8 py-6 text-right">
              <button onclick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }} class="p-2 text-gray-600 hover:text-red-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
            </td>
          </tr>
        {/each}
      {/if}

      {#each items as item (item.id)}
        {@const theme = getFileTheme(item.mimeType)}
        <tr class="hover:bg-white/[0.03] transition-all group">
          <td class="px-8 py-6 flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center {theme.color}">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </div>
            <div>
              <p class="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">{item.title}</p>
              <p class="text-[9px] text-gray-500 uppercase font-bold">{item.fileName.split('.').pop()} File</p>
            </div>
          </td>
          <td class="hidden md:table-cell px-4 py-6 text-gray-400 text-center text-xs">{(item.fileSize / (1024 * 1024)).toFixed(2)} MB</td>
          <td class="hidden lg:table-cell px-4 py-6 text-center text-gray-700 font-mono text-[10px]">{item.ipfsHash.slice(0, 15)}...</td>
          <td class="px-8 py-6 text-right">
            <button onclick={() => handleDelete(item.id)} class="p-2 text-gray-600 hover:text-red-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>