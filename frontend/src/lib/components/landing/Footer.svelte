<script lang="ts">
  import logo from '$lib/assets/logo.png';
</script>

<footer class="w-full bg-slate-50 dark:bg-[#08080a] border-t border-slate-200/80 dark:border-white/5 py-12 relative z-10 transition-colors duration-300">
  <div class="mx-auto max-w-6xl px-6 flex flex-col items-center justify-between gap-6 md:flex-row">
    <div class="flex items-center gap-2.5">
      <div class="h-8 w-8 overflow-hidden rounded-lg bg-slate-100 dark:bg-white/[0.03] ring-1 ring-slate-900/10 dark:ring-white/10 transition-transform duration-300 hover:scale-105">
        <img src={logo} alt="DecentraShare" class="h-full w-full object-contain p-1" />
      </div>
      <span class="font-bold text-slate-900 dark:text-white">Decentra<span class="text-blue-600">Share</span></span>
    </div>
    <div class="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-600 dark:text-gray-400">
      <a href="#features" class="transition-colors hover:text-slate-900 dark:hover:text-white hover:underline decoration-blue-500/50 underline-offset-4">Features</a>
      <a href="#how" class="transition-colors hover:text-slate-900 dark:hover:text-white hover:underline decoration-blue-500/50 underline-offset-4">How it Works</a>
      <a href="#supported-creations" class="transition-colors hover:text-slate-900 dark:hover:text-white hover:underline decoration-blue-500/50 underline-offset-4">Supported Formats</a>
      <a href="#faq" class="transition-colors hover:text-slate-900 dark:hover:text-white hover:underline decoration-blue-500/50 underline-offset-4">FAQ</a>
    </div>
    <p class="text-sm text-slate-400 dark:text-gray-500">&copy; 2026 DecentraShare. All rights reserved.</p>
  </div>
</footer>
