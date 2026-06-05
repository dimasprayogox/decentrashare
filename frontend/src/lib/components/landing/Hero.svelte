<script lang="ts">
  import { fly } from 'svelte/transition';
</script>

<section class="max-w-7xl mx-auto px-10 pt-20 pb-32 text-center relative">
  <div in:fly={{ y: 30, duration: 1000 }}>
    <span class="px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest">
      Web3 File Storage Solution
    </span>
    <h1 class="text-6xl md:text-8xl font-extrabold mt-8 tracking-tighter leading-[1.1] text-white">
      Share Files Without <br/> 
      <span class="bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent italic">Any Worries.</span>
    </h1>
    <p class="mt-8 text-gray-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
      The first decentralized file sharing platform integrating Ethereum security and IPFS speed in the palm of your hand.
    </p>
    
    <div class="mt-12 flex flex-col md:flex-row items-center justify-center gap-4">
      <a href="/login" class="px-10 py-4 bg-white text-black font-bold rounded-2xl hover:scale-105 active:scale-95 transition-all text-lg shadow-[0_0_40px_rgba(255,255,255,0.1)]">
        Get Started — Free
      </a>
    </div>
  </div>
</section>