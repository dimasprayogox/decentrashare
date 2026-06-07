<script lang="ts">
  import { inView } from '$lib/utils/inView';
  import logo from '$lib/assets/logo.png';
</script>

<section class="mx-auto max-w-6xl px-6 py-24">
  <div
    use:inView
    class="reveal relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-b from-blue-600/10 via-purple-600/5 to-transparent p-12 text-center md:p-20"
  >
    <!-- animated orbs -->
    <div class="animate-float-slow pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-blue-600/20 blur-[100px]"></div>
    <div class="animate-float-slower pointer-events-none absolute -bottom-16 -right-16 h-72 w-72 rounded-full bg-purple-600/20 blur-[100px]"></div>

    <!-- orbit rings -->
    <div class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-30">
      <div class="animate-spin-slow h-[520px] w-[520px] rounded-full border border-white/10"></div>
    </div>
    <div class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-20">
      <div class="animate-spin-reverse-slow h-[360px] w-[360px] rounded-full border border-dashed border-white/10"></div>
    </div>

    <div class="relative">
      <div class="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
        <img src={logo} alt="DecentraShare" class="h-full w-full object-contain p-2" />
      </div>

      <h2 class="mx-auto max-w-2xl text-4xl font-extrabold tracking-tight text-white md:text-5xl">
        Ready to truly
        <span class="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">own your data?</span>
      </h2>
      <p class="mx-auto mt-5 max-w-xl text-lg text-gray-400">
        Join the future of decentralized storage. Connect your wallet and share your first
        file in under a minute.
      </p>

      <div class="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
        <a
          href="/login"
          class="group relative flex h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 px-10 text-base font-bold text-white shadow-lg shadow-purple-500/30 transition-transform hover:scale-[1.03] active:scale-95 sm:w-auto"
        >
          <svg class="relative z-10 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
          <span class="relative z-10">Connect Wallet Now</span>
          <span class="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"></span>
        </a>
      </div>

      <div class="mt-8 flex items-center justify-center gap-2 text-xs text-gray-500">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
        <span>End-to-end encrypted • Your keys, your files</span>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <footer class="mt-20 border-t border-white/5 pt-10">
    <div class="flex flex-col items-center justify-between gap-6 md:flex-row">
      <div class="flex items-center gap-2.5">
        <div class="h-8 w-8 overflow-hidden rounded-lg bg-white/[0.03] ring-1 ring-white/10">
          <img src={logo} alt="DecentraShare" class="h-full w-full object-contain p-1" />
        </div>
        <span class="font-bold text-white">Decentra<span class="text-blue-400">Share</span></span>
      </div>
      <div class="flex items-center gap-6 text-sm text-gray-500">
        <a href="#features" class="transition-colors hover:text-white">Features</a>
        <a href="#how" class="transition-colors hover:text-white">How it Works</a>
        <a href="/login" class="transition-colors hover:text-white">Dashboard</a>
      </div>
      <p class="text-sm text-gray-600">&copy; 2026 DecentraShare. All rights reserved.</p>
    </div>
  </footer>
</section>
