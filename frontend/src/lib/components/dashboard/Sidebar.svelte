<script lang="ts">
  // Snippet/props untuk menu aktif
  let { active = 'dashboard' } = $props();
  
  // State untuk kontrol buka/tutup di mobile
  let isMobileOpen = $state(false);
  const toggleMobile = () => isMobileOpen = !isMobileOpen;

  // Helper untuk styling active
  const activeClass = "bg-blue-600/10 text-blue-400 shadow-[inset_0_0_20px_rgba(37,99,235,0.1)] border-r-2 border-blue-500";
  const inactiveClass = "text-gray-400 hover:bg-white/[0.03] hover:text-gray-200 border-r-2 border-transparent";
</script>

<button 
  onclick={toggleMobile}
  class="lg:hidden fixed bottom-6 right-6 z-[110] w-14 h-14 bg-blue-600/80 backdrop-blur-lg text-white rounded-full shadow-[0_8px_32px_rgba(37,99,235,0.4)] flex items-center justify-center active:scale-90 transition-all border border-white/20"
>
  {#if isMobileOpen}
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
  {:else}
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
  {/if}
</button>

<aside class="
  fixed lg:sticky top-0 left-0 z-[100] h-screen bg-[#0a0a0c] lg:bg-white/[0.01] border-r border-white/5 backdrop-blur-2xl p-6 flex flex-col transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
  {isMobileOpen ? 'w-72 translate-x-0' : 'w-72 -translate-x-full lg:translate-x-0'}
">
  <div class="flex items-center gap-3 mb-12 px-2">
    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/20">D</div>
    <span class="text-2xl font-bold tracking-tighter text-white">Decentra<span class="text-blue-500">Share</span></span>
  </div>

  <nav class="flex-1 space-y-1.5 overflow-y-auto pr-2 custom-scrollbar">
    <a href="/dashboard" class="group flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-300 {active === 'dashboard' ? activeClass : inactiveClass}">
      <svg class="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
      Dashboard
    </a>

    <a href="/storage" class="group flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-300 {active === 'storage' ? activeClass : inactiveClass}">
      <svg class="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path></svg>
      Storage
    </a>
    
    <a href="/shared" class="group flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-300 {active === 'shared' ? activeClass : inactiveClass}">
      <svg class="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
      Dibagikan
    </a>

    <a href="/settings" class="group flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-300 {active === 'settings' ? activeClass : inactiveClass}">
      <svg class="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>
      Settings
    </a>
      <div class="py-2">
        <div class="h-px bg-white/5 w-full"></div>
    </div>

    <button 
      onclick={() => {/* Logika Logout */}}
      class="group w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium text-red-400/80 hover:bg-red-500/10 hover:text-red-400 transition-all duration-300 border-r-2 border-transparent hover:border-red-500/30"
    >
      <svg class="w-5 h-5 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
      Log Out
    </button>
  </nav>

  <div class="mt-auto space-y-4 pt-6 border-t border-white/5">
    <div class="relative overflow-hidden p-5 rounded-3xl bg-white/[0.03] border border-white/5 shadow-2xl">
      <div class="absolute top-0 right-0 w-24 h-24 bg-blue-600/10 blur-[40px] -z-10"></div>
      <div class="flex justify-between items-end mb-3">
          <div>
              <p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Storage</p>
              <p class="text-sm font-bold text-white">1.2 GB <span class="text-gray-500 font-normal">/ 5GB</span></p>
          </div>
          <span class="text-[10px] text-blue-400 font-mono bg-blue-400/10 px-2 py-0.5 rounded-full">24%</span>
      </div>
      <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <div class="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full" style="width: 24%"></div>
      </div>
    </div>

   
  </div>
</aside>

{#if isMobileOpen}
  <div 
    onclick={toggleMobile}
    class="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]"
    aria-hidden="true"
  ></div>
{/if}

<style>
    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 10px;
    }
</style>