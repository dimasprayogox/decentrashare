<script lang="ts">
  import { fade } from 'svelte/transition';

  let files = $state([
    { id: 1, name: "Proposal_Project.pdf", size: "2.4 MB", date: "2026-04-20", cid: "QmXoyp..." },
    { id: 2, name: "Research_Paper.docx", size: "1.1 MB", date: "2026-04-22", cid: "QmTzQp..." },
    { id: 3, name: "Presentation_Final.pptx", size: "5.8 MB", date: "2026-04-25", cid: "QmYwRp..." },
  ]);

  let isUploading = $state(false);

  function handleUpload() {
    isUploading = true;
    setTimeout(() => (isUploading = false), 2000);
  }
</script>

<div class="flex min-h-screen bg-[#0a0a0c] text-white font-sans">

  <main class="flex-1 p-10 overflow-y-auto">
    <header class="flex justify-between items-center mb-10">
      <div>
        <h2 class="text-3xl font-bold tracking-tight">File Saya</h2>
        <p class="text-gray-500 text-sm">Kelola dokumen Web3 kamu dengan aman.</p>
      </div>
      
      <button 
        onclick={handleUpload}
        disabled={isUploading}
        class="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-2xl font-bold hover:bg-gray-200 transition-all shadow-xl active:scale-95 disabled:opacity-50"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
        {isUploading ? 'Uploading...' : 'Upload Baru'}
      </button>
    </header>

    <div class="bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
      <table class="w-full text-left">
        <thead class="bg-white/5 text-xs text-gray-400 uppercase tracking-widest">
          <tr>
            <th class="px-6 py-4 font-semibold">Nama File</th>
            <th class="px-6 py-4 font-semibold text-center">Ukuran</th>
            <th class="px-6 py-4 font-semibold">Tanggal Diunggah</th>
            <th class="px-6 py-4 font-semibold">IPFS CID</th>
            <th class="px-6 py-4"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
          {#each files as file (file.id)}
            <tr in:fade class="hover:bg-white/[0.03] transition-colors group">
              <td class="px-6 py-5 flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                </div>
                <span class="font-medium">{file.name}</span>
              </td>
              <td class="px-6 py-5 text-gray-400 text-sm text-center font-mono">{file.size}</td>
              <td class="px-6 py-5 text-gray-500 text-sm">{file.date}</td>
              <td class="px-6 py-5">
                <code class="text-[10px] bg-white/5 px-2 py-1 rounded text-blue-400/80">{file.cid}</code>
              </td>
              <td class="px-6 py-5 text-right">
                <button class="p-2 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-all">
                   <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </main>
</div>