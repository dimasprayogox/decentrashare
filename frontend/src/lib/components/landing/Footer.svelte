<script lang="ts">
  import logo from '$lib/assets/logo.png';
</script>

<footer class="mx-auto max-w-6xl px-6 pb-12 pt-10 border-t border-white/5 relative z-10 bg-[#0a0a0c]">
  <div class="flex flex-col items-center justify-between gap-6 md:flex-row">
    <div class="flex items-center gap-2.5">
      <div class="h-8 w-8 overflow-hidden rounded-lg bg-white/[0.03] ring-1 ring-white/10 transition-transform duration-300 hover:scale-105">
        <img src={logo} alt="DecentraShare" class="h-full w-full object-contain p-1" />
      </div>
      <span class="font-bold text-white">Decentra<span class="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Share</span></span>
    </div>
    <div class="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
      <a href="#features" class="transition-colors hover:text-white hover:underline decoration-blue-500/50 underline-offset-4">Features</a>
      <a href="#how" class="transition-colors hover:text-white hover:underline decoration-blue-500/50 underline-offset-4">How it Works</a>
      <a href="#supported-creations" class="transition-colors hover:text-white hover:underline decoration-blue-500/50 underline-offset-4">Supported Formats</a>
      <a href="#faq" class="transition-colors hover:text-white hover:underline decoration-blue-500/50 underline-offset-4">FAQ</a>
    </div>
    <p class="text-sm text-gray-500">&copy; 2026 DecentraShare. All rights reserved.</p>
  </div>
</footer>
