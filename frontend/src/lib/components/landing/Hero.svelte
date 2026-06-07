<script lang="ts">
  import { fly, fade } from 'svelte/transition';

  // Pre-computed positions for the floating particles.
  const particles = Array.from({ length: 14 }, (_, i) => ({
    left: (i * 7 + 5) % 100,
    delay: (i * 0.6) % 8,
    duration: 6 + (i % 5),
    size: 2 + (i % 3)
  }));
</script>

<section class="relative overflow-hidden pt-40 pb-28 md:pt-48 md:pb-36">
  <!-- Animated grid backdrop -->
  <div
    class="pointer-events-none absolute inset-0 -z-10 opacity-[0.18]"
    style="
      background-image:
        linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px);
      background-size: 40px 40px;
      animation: grid-pan 3s linear infinite;
      mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 75%);
    "
  ></div>

  <!-- Floating orbs -->
  <div class="animate-float-slow pointer-events-none absolute -left-20 top-24 -z-10 h-72 w-72 rounded-full bg-blue-600/20 blur-[110px]"></div>
  <div class="animate-float-slower pointer-events-none absolute right-0 top-40 -z-10 h-80 w-80 rounded-full bg-purple-600/20 blur-[120px]"></div>

  <!-- Rising particles -->
  <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
    {#each particles as p}
      <span
        class="absolute bottom-0 rounded-full bg-blue-400/40"
        style="
          left: {p.left}%;
          width: {p.size}px;
          height: {p.size}px;
          animation: rise {p.duration}s linear {p.delay}s infinite;
        "
      ></span>
    {/each}
  </div>

  <div class="mx-auto max-w-5xl px-6 text-center">
    {#if true}
      <div in:fly={{ y: 24, duration: 700 }}>
        <span class="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-blue-300">
          <span class="relative flex h-2 w-2">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
            <span class="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
          </span>
          Powered by Ethereum &amp; IPFS
        </span>
      </div>

      <h1
        in:fly={{ y: 30, duration: 800, delay: 100 }}
        class="mt-8 text-5xl font-extrabold leading-[1.05] tracking-tighter text-white md:text-7xl lg:text-8xl"
      >
        Share Files Without
        <br />
        <span class="animate-gradient-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text italic text-transparent">
          Any Worries.
        </span>
      </h1>

      <p
        in:fly={{ y: 30, duration: 800, delay: 200 }}
        class="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-gray-400 md:text-xl"
      >
        The decentralized file-sharing platform that combines Ethereum-grade security
        with IPFS speed. Own your data, control every access, trust no middleman.
      </p>

      <div
        in:fly={{ y: 30, duration: 800, delay: 300 }}
        class="mt-11 flex flex-col items-center justify-center gap-4 sm:flex-row"
      >
        <a
          href="/login"
          class="group relative flex h-14 w-full items-center justify-center overflow-hidden rounded-2xl bg-white px-9 text-base font-bold text-black shadow-[0_0_50px_rgba(255,255,255,0.15)] transition-transform hover:scale-[1.03] active:scale-95 sm:w-auto"
        >
          <span class="relative z-10">Get Started — Free</span>
          <span class="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-black/5" style="animation: shine 2.5s ease-in-out infinite"></span>
        </a>
        <a
          href="#how"
          class="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-9 text-base font-semibold text-white backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10 sm:w-auto"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          See How it Works
        </a>
      </div>
    {/if}

    <!-- Floating product mockup -->
    <div
      in:fade={{ duration: 900, delay: 500 }}
      class="relative mx-auto mt-20 max-w-4xl"
    >
      <div class="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-r from-blue-600/30 via-purple-600/30 to-pink-600/30 blur-3xl"></div>

      <div class="animate-float-slow overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c10]/90 shadow-2xl backdrop-blur-xl">
        <!-- Window chrome -->
        <div class="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-3">
          <span class="h-3 w-3 rounded-full bg-red-500/70"></span>
          <span class="h-3 w-3 rounded-full bg-yellow-500/70"></span>
          <span class="h-3 w-3 rounded-full bg-green-500/70"></span>
          <div class="ml-3 flex-1 rounded-md bg-white/5 px-3 py-1 text-left text-xs text-gray-500">
            app.decentrashare.io/storage
          </div>
        </div>

        <!-- Fake dashboard body -->
        <div class="grid grid-cols-12 gap-4 p-5 text-left">
          <!-- sidebar -->
          <div class="col-span-3 hidden flex-col gap-2 sm:flex">
            {#each ['My Files', 'Shared', 'Activity', 'Trash'] as item, i}
              <div class="flex items-center gap-2 rounded-lg px-3 py-2 text-xs {i === 0 ? 'bg-blue-500/15 text-blue-300' : 'text-gray-500'}">
                <span class="h-2 w-2 rounded-full {i === 0 ? 'bg-blue-400' : 'bg-white/15'}"></span>
                {item}
              </div>
            {/each}
          </div>
          <!-- file grid -->
          <div class="col-span-12 grid grid-cols-2 gap-3 sm:col-span-9 sm:grid-cols-3">
            {#each Array(6) as _, i}
              <div
                class="group rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-blue-500/30 hover:bg-white/[0.04]"
                style="animation: float-slow {6 + i}s ease-in-out infinite"
              >
                <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/30 to-purple-500/30">
                  <svg class="h-4 w-4 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                </div>
                <div class="mb-2 h-2 w-3/4 rounded-full bg-white/10"></div>
                <div class="h-2 w-1/2 rounded-full bg-white/5"></div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
