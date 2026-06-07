<script lang="ts">
  import Navbar from '$lib/components/landing/Navbar.svelte';
  import Hero from '$lib/components/landing/Hero.svelte';
  import Features from '$lib/components/landing/Features.svelte';
  import HowItWorks from '$lib/components/landing/HowItWorks.svelte';
  import Stats from '$lib/components/landing/Stats.svelte';
  import CTA from '$lib/components/landing/CTA.svelte';
</script>

<svelte:head>
  <title>DecentraShare — Decentralized File Sharing on Web3</title>
  <meta
    name="description"
    content="DecentraShare is a decentralized file-sharing platform combining Ethereum-grade security with IPFS speed. Own your data, control every access."
  />
</svelte:head>

<div class="relative min-h-screen overflow-x-hidden bg-[#0a0a0c] text-white selection:bg-blue-500/30">
  <!-- top ambient glow -->
  <div class="pointer-events-none absolute left-1/2 top-0 -z-10 h-[700px] w-full max-w-5xl -translate-x-1/2 bg-gradient-to-b from-blue-600/20 via-purple-600/10 to-transparent blur-[120px]"></div>

  <Navbar />

  <main>
    <Hero />
    <Features />
    <HowItWorks />
    <Stats />
    <CTA />
  </main>
</div>
