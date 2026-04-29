<script lang="ts">
  let { userAddress = "0x00...000" } = $props();
  let searchQuery = $state("");
</script>

<header class="h-20 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl sticky top-0 z-[60] flex items-center justify-between px-4 md:px-8 w-full gap-4">
    
    <div class="flex items-center gap-4 flex-1 min-w-0">
        <div class="lg:hidden w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shrink-0">D</div>
        
        <h2 class="text-sm md:text-lg font-semibold text-white truncate mr-2">
          <span class="hidden sm:inline">Main</span> Dashboard
        </h2>
        
        <div class="relative w-full max-w-md hidden sm:block">
            <span class="absolute inset-y-0 left-4 flex items-center text-gray-500">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </span>
            <input 
                type="text" 
                bind:value={searchQuery}
                placeholder="Cari file atau folder..."
                class="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-11 pr-4 text-sm text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all"
            />
        </div>
    </div>

    <div class="flex items-center gap-2 md:gap-4 shrink-0">
        
        <div class="flex items-center border-r border-white/10 pr-2 md:pr-4 gap-1">
            <button title="Notifikasi" class="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all relative">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                <span class="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full border-2 border-[#0a0a0c]"></span>
            </button>
            <a href="/settings" title="Pengaturan" class="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </a>
        </div>

        <div class="flex items-center gap-3 pl-2">
            <div class="hidden sm:flex flex-col items-end">
                <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none mb-1">Terhubung</span>
                <span class="text-xs font-mono text-blue-400 leading-none truncate max-w-[120px]">{userAddress}</span>
            </div>

            <div class="relative group">
                <button class="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 p-[2px] active:scale-95 transition-transform">
                    <div class="w-full h-full rounded-full bg-[#0a0a0c] flex items-center justify-center overflow-hidden">
                        <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path></svg>
                    </div>
                </button>

                <div class="absolute right-0 mt-2 w-48 bg-[#121214] border border-white/10 rounded-2xl shadow-2xl p-2 hidden group-hover:block transition-all">
                    <button class="w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                        Profil Saya
                    </button>
                    <hr class="border-white/5 my-1" />
                    <button class="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-all flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                        Logout
                    </button>
                </div>
            </div>
        </div>
    </div>
</header>