<script lang="ts">
  import Navbar from '$lib/components/landing/Navbar.svelte';
  import Hero from '$lib/components/landing/Hero.svelte';
  import Features from '$lib/components/landing/Features.svelte';
  import CTA from '$lib/components/landing/CTA.svelte';
</script>

<div class="min-h-screen bg-[#0a0a0c] overflow-hidden selection:bg-blue-500/30">
  <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-gradient-to-b from-blue-600/20 to-transparent blur-[120px] -z-10"></div>

  <Navbar />
  
  <main>
    <Hero />
    <Features />
    <CTA />
  </main>
</div>