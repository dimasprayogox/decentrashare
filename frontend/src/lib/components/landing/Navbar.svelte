<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import logo from '$lib/assets/logo.png';
  import { themeController } from '$lib/utils/theme.svelte';

  let scrolled = $state(false);
  let mobileOpen = $state(false);

  const links = [
    { href: '#features', label: 'Features' },
    { href: '#how', label: 'How it Works' },
    { href: '#supported-creations', label: 'Supported Formats' },
    { href: '#faq', label: 'FAQ' }
  ];

  onMount(() => {
    const onScroll = () => (scrolled = window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });
</script>

<header
  class="fixed inset-x-0 top-0 z-[100] px-4 transition-all duration-500 {scrolled ? 'py-3' : 'py-5'}"
>
  <nav
    class="mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-5 py-3 transition-all duration-500 md:px-7 {scrolled
      ? 'border border-slate-200/50 bg-white/80 dark:border-white/10 dark:bg-transparent backdrop-blur-md shadow-xl'
      : 'border border-transparent bg-transparent'}"
  >
    <!-- Brand (Left) -->
    <div class="flex flex-1 justify-start">
      <a href="/" class="group flex items-center gap-2.5">
        <div class="relative h-10 w-10 overflow-hidden rounded-xl bg-slate-900/[0.03] dark:bg-white/[0.03] ring-1 ring-slate-900/10 dark:ring-white/10 transition-transform duration-300 group-hover:scale-105">
          <img src={logo} alt="DecentraShare" class="h-full w-full object-contain p-1" />
        </div>
        <span class="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Decentra<span class="text-blue-600 dark:bg-gradient-to-r dark:from-blue-400 dark:to-cyan-400 dark:bg-clip-text dark:text-transparent">Share</span>
        </span>
      </a>
    </div>

    <!-- Desktop links (Center) -->
    <div class="hidden items-center gap-8 text-sm font-medium text-slate-600 dark:text-gray-400 md:flex">
      {#each links as link}
        <a href={link.href} class="relative transition-colors hover:text-slate-900 dark:hover:text-white group/link">
          <span>{link.label}</span>
          <span class="absolute -bottom-1 left-1/2 h-0.5 w-0 bg-blue-600 dark:bg-gradient-to-r dark:from-blue-400 dark:to-cyan-400 transition-all duration-300 group-hover/link:w-full group-hover/link:left-0"></span>
        </a>
      {/each}
    </div>

    <!-- Desktop CTA (Right) -->
    <div class="hidden flex-1 justify-end items-center gap-4 md:flex">
      <!-- Theme Toggle Button -->
      <button
        onclick={() => themeController.toggle()}
        class="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 transition-all hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 cursor-pointer"
        aria-label="Toggle theme"
      >
        {#if themeController.theme === 'dark'}
          <svg class="h-5 w-5 rotate-0 transition-transform duration-300 dark:-rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        {:else}
          <svg class="h-5 w-5 rotate-0 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        {/if}
      </button>

      <a
        href="/login"
        class="group relative overflow-hidden rounded-full bg-blue-600 dark:bg-gradient-to-r dark:from-blue-600 dark:to-cyan-500 px-6 py-2.5 font-semibold text-white keep-white shadow-lg shadow-blue-600/25 dark:shadow-blue-500/25 transition-all hover:bg-blue-700 dark:hover:shadow-blue-500/45 hover:scale-[1.02] active:scale-[0.98]"
      >
        <span class="relative z-10">Get Started</span>
        <span class="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"></span>
      </a>
    </div>

    <!-- Mobile toggle and Theme Toggle -->
    <div class="flex items-center gap-2 md:hidden">
      <button
        onclick={() => themeController.toggle()}
        class="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 transition-all hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 cursor-pointer"
        aria-label="Toggle theme"
      >
        {#if themeController.theme === 'dark'}
          <svg class="h-5 w-5 rotate-0 transition-transform duration-300 dark:-rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        {:else}
          <svg class="h-5 w-5 rotate-0 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        {/if}
      </button>

      <button
        class="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-white cursor-pointer"
        onclick={() => (mobileOpen = !mobileOpen)}
        aria-label="Toggle menu"
      >
        {#if mobileOpen}
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        {:else}
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
        {/if}
      </button>
    </div>
  </nav>

  <!-- Mobile menu -->
  {#if mobileOpen}
    <div
      transition:fly={{ y: -10, duration: 250 }}
      class="mx-auto mt-2 max-w-6xl rounded-2xl border border-slate-200/50 bg-white/95 dark:border-white/10 dark:bg-[#0a0a0c]/95 p-4 backdrop-blur-xl md:hidden"
    >
      <div class="flex flex-col gap-1">
        {#each links as link}
          <a
            href={link.href}
            onclick={() => (mobileOpen = false)}
            class="rounded-xl px-4 py-3 text-slate-600 dark:text-gray-300 transition-colors hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
          >
            {link.label}
          </a>
        {/each}
        <a
          href="/login"
          class="mt-2 rounded-xl bg-blue-600 dark:bg-gradient-to-r dark:from-blue-600 dark:to-cyan-500 px-4 py-3 text-center font-semibold text-white keep-white hover:bg-blue-700 transition-colors"
        >
          Get Started
        </a>
      </div>
    </div>
  {/if}
</header>
