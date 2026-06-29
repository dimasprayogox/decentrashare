<script lang="ts">
  import Navbar from '$lib/components/landing/Navbar.svelte';
  import Hero from '$lib/components/landing/Hero.svelte';
  import Features from '$lib/components/landing/Features.svelte';
  import HowItWorks from '$lib/components/landing/HowItWorks.svelte';
  import FAQ from '$lib/components/landing/FAQ.svelte';
  import SupportedCreations from '$lib/components/landing/SupportedCreations.svelte';
  import Footer from '$lib/components/landing/Footer.svelte';

  // Staggered background elements (mixture of mini cards and raw icons representing digital creative works)
  const backgroundItems = [
    // --- MINI CARDS (8 items) ---
    { isCard: true, name: 'cinematic_trailer.mp4', size: '118 MB', type: 'video', status: 'Encrypted', left: 6, delay: 0, duration: 22, sway: -20, rot: -8 },
    { isCard: true, name: 'indie_album_art.png', size: '3.2 MB', type: 'image', status: 'On-Chain', left: 78, delay: 2.5, duration: 25, sway: 15, rot: 6 },
    { isCard: true, name: 'acoustic_beat.mp3', size: '8.4 MB', type: 'audio', status: 'Encrypted', left: 18, delay: 5, duration: 28, sway: 25, rot: -12 },
    { isCard: true, name: 'raw_portrait.jpg', size: '14.5 MB', type: 'image', status: 'Encrypted', left: 86, delay: 7.5, duration: 20, sway: -20, rot: 14 },
    { isCard: true, name: 'screenplay_final.pdf', size: '1.8 MB', type: 'pdf', status: 'On-Chain', left: 44, delay: 10, duration: 32, sway: 10, rot: -6 },
    { isCard: true, name: 'motion_effects.mov', size: '84.1 MB', type: 'video', status: 'Encrypted', left: 62, delay: 12.5, duration: 26, sway: -15, rot: 8 },
    { isCard: true, name: 'podcast_voice.wav', size: '32.1 MB', type: 'audio', status: 'On-Chain', left: 32, delay: 16, duration: 29, sway: -10, rot: 5 },
    { isCard: true, name: '3d_landscape.png', size: '7.8 MB', type: 'image', status: 'Encrypted', left: 72, delay: 19.5, duration: 27, sway: 12, rot: -10 },
    
    // --- RAW FLOATING ICONS (12 items for a denser, more organic look) ---
    { isCard: false, type: 'video', left: 12, delay: 1, duration: 24, size: 34, sway: 20, rot: 40 },
    { isCard: false, type: 'audio', left: 70, delay: 3.5, duration: 30, size: 30, sway: -10, rot: -30 },
    { isCard: false, type: 'pdf', left: 30, delay: 6, duration: 27, size: 26, sway: 15, rot: 45 },
    { isCard: false, type: 'image', left: 52, delay: 8.5, duration: 29, size: 32, sway: -12, rot: -25 },
    { isCard: false, type: 'video', left: 85, delay: 11, duration: 23, size: 28, sway: 15, rot: 15 },
    { isCard: false, type: 'audio', left: 4, delay: 13.5, duration: 28, size: 32, sway: -20, rot: -15 },
    { isCard: false, type: 'pdf', left: 58, delay: 15, duration: 25, size: 30, sway: 10, rot: 35 },
    { isCard: false, type: 'image', left: 24, delay: 17.5, duration: 31, size: 26, sway: -15, rot: -20 },
    { isCard: false, type: 'video', left: 48, delay: 21, duration: 26, size: 32, sway: 18, rot: 25 },
    { isCard: false, type: 'audio', left: 92, delay: 23, duration: 22, size: 28, sway: -10, rot: -40 },
    { isCard: false, type: 'pdf', left: 15, delay: 25, duration: 33, size: 30, sway: 25, rot: 10 },
    { isCard: false, type: 'image', left: 66, delay: 27, duration: 28, size: 34, sway: -15, rot: -15 }
  ];
</script>

<svelte:head>
  <title>DecentraShare — Decentralized File Sharing on Web3</title>
  <meta
    name="description"
    content="DecentraShare is a decentralized file-sharing platform combining Ethereum-grade security with IPFS speed. Own your data, control every access."
  />
</svelte:head>

<div class="relative min-h-screen overflow-x-hidden bg-[#0a0a0c] text-white selection:bg-blue-500/30">
  <!-- Dynamic Full-Page Grid Backdrop with Dense Circular Masking Spots (Bulatan Lebih Sering Muncul) -->
  <div
    class="pointer-events-none absolute inset-0 z-0 opacity-60"
    style="
      background-image:
        linear-gradient(to right, rgba(255,255,255,0.22) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255,255,255,0.22) 1px, transparent 1px);
      background-size: 40px 40px;
      mask-image: 
        radial-gradient(circle 500px at 50% 6%, black 25%, transparent 85%),
        radial-gradient(circle 450px at 20% 18%, black 20%, transparent 80%),
        radial-gradient(circle 500px at 80% 32%, black 25%, transparent 85%),
        radial-gradient(circle 450px at 25% 46%, black 20%, transparent 80%),
        radial-gradient(circle 520px at 75% 60%, black 25%, transparent 85%),
        radial-gradient(circle 480px at 30% 74%, black 20%, transparent 80%),
        radial-gradient(circle 550px at 70% 86%, black 25%, transparent 85%),
        radial-gradient(circle 500px at 50% 96%, black 25%, transparent 85%);
      -webkit-mask-image: 
        radial-gradient(circle 500px at 50% 6%, black 25%, transparent 85%),
        radial-gradient(circle 450px at 20% 18%, black 20%, transparent 80%),
        radial-gradient(circle 500px at 80% 32%, black 25%, transparent 85%),
        radial-gradient(circle 450px at 25% 46%, black 20%, transparent 80%),
        radial-gradient(circle 520px at 75% 60%, black 25%, transparent 85%),
        radial-gradient(circle 480px at 30% 74%, black 20%, transparent 80%),
        radial-gradient(circle 550px at 70% 86%, black 25%, transparent 85%),
        radial-gradient(circle 500px at 50% 96%, black 25%, transparent 85%);
    "
  ></div>

  <!-- Soft circular dark overlays (bulatan peneduh) for organic depth -->
  <div class="pointer-events-none absolute left-1/2 top-[700px] z-0 h-[350px] w-[350px] -translate-x-1/2 rounded-full bg-[#0a0a0c] blur-2xl opacity-70"></div>
  <div class="pointer-events-none absolute right-10 top-[2000px] z-0 h-[400px] w-[400px] rounded-full bg-[#0a0a0c] blur-2xl opacity-70"></div>
  <div class="pointer-events-none absolute left-10 top-[3400px] z-0 h-[400px] w-[400px] rounded-full bg-[#0a0a0c] blur-2xl opacity-70"></div>

  <!-- Navbar -->
  <div class="relative z-[100]">
    <Navbar />
  </div>

  <!-- Main content wrapper containing rising background items -->
  <div class="relative overflow-hidden isolate z-10">
    <!-- Rising transparent file cards & raw floating icons across sections -->
    <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {#each backgroundItems as item}
        {#if item.isCard}
          <div
            class="absolute rounded-xl border border-white/5 bg-white/[0.03] p-3 shadow-lg shadow-black/20 animate-float-up-fade text-left text-gray-400 select-none opacity-30 dark:opacity-15"
            style="
              left: {item.left}%;
              width: 140px;
              --duration: {item.duration}s;
              --delay: {item.delay}s;
              --sway: {item.sway}px;
              --rot: {item.rot}deg;
            "
          >
            <span class="absolute top-2 right-2 text-[8px] font-bold px-1 py-0.5 rounded-full border border-white/5 bg-white/[0.03] text-gray-500 scale-90 origin-top-right">
              {item.status}
            </span>
            <div class="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 ring-1 ring-white/10">
              {#if item.type === 'pdf'}
                <svg class="h-4 w-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              {:else if item.type === 'audio'}
                <svg class="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
              {:else if item.type === 'video'}
                <svg class="h-4 w-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              {:else}
                <svg class="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              {/if}
            </div>
            <div class="truncate text-[10px] font-bold text-gray-200">{item.name}</div>
            <div class="text-[8px] text-gray-500 mt-0.5">{item.size}</div>
          </div>
        {:else}
          <div
            class="absolute animate-float-up-fade"
            style="
              left: {item.left}%;
              width: {item.size}px;
              height: {item.size}px;
              --duration: {item.duration}s;
              --delay: {item.delay}s;
              --sway: {item.sway}px;
              --rot: {item.rot}deg;
            "
          >
            {#if item.type === 'pdf'}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-full h-full text-pink-400/25"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M16 13H8M16 17H8"/></svg>
            {:else if item.type === 'audio'}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-full h-full text-emerald-400/25"><path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
            {:else if item.type === 'video'}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-full h-full text-red-400/25"><path d="M23 7a2 2 0 0 0-2.45-1.45L16 7V5a2 2 0 0 0-2-2H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2l4.55 1.45A2 2 0 0 0 23 17V7z"/></svg>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-full h-full text-amber-400/25"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            {/if}
          </div>
        {/if}
      {/each}
    </div>

    <!-- Landing Sections -->
    <main class="relative z-10">
      <Hero />
      <Features />
      <HowItWorks />
      <SupportedCreations />
      <FAQ />
    </main>
  </div>

  <!-- Footer (Outside background container, clean footer at bottom) -->
  <Footer />
</div>
