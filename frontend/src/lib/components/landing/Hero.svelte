<script lang="ts">
  import { fly, fade } from 'svelte/transition';

  const mockFiles = [
    { name: 'artbook_final.pdf', size: '18.4 MB', type: 'pdf', status: 'Encrypted', color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' },
    { name: 'lofi_synthwave.wav', size: '42.1 MB', type: 'audio', status: 'On-Chain', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    { name: 'short_animation.mp4', size: '88.5 MB', type: 'video', status: 'Encrypted', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
    { name: 'cyberpunk_render.png', size: '3.8 MB', type: 'image', status: 'On-Chain', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    { name: 'documentary_clip.mov', size: '124 MB', type: 'video', status: 'Encrypted', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
    { name: 'album_master.mp3', size: '9.2 MB', type: 'audio', status: 'On-Chain', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' }
  ];

  const sidebarItems = [
    { name: 'Storage', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z', active: true },
    { name: 'Shared With Me', icon: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z', active: false },
    { name: 'Activity Log', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', active: false },
    { name: 'Trash', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16', active: false }
  ];
</script>

<section class="relative overflow-hidden pt-45 pb-24 md:pt-56 md:pb-32 isolate">
  <div class="mx-auto max-w-[88rem] px-6 lg:px-12">
    <div class="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-12 items-center justify-between">
      <!-- Left Column: Hero Text & Buttons -->
      <div class="flex flex-col items-center text-center lg:col-span-6 lg:items-start lg:text-left lg:pr-6">
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
            class="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tighter text-white sm:text-6xl xl:text-7xl"
          >
            Secure Your Creations With
            <br />
            <span class="bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400 bg-clip-text italic text-transparent">
              DecentraShare
            </span>
          </h1>

          <p
            in:fly={{ y: 30, duration: 800, delay: 200 }}
            class="mt-6 max-w-xl text-base leading-relaxed text-gray-400 md:text-lg"
          >
            Store, manage, and share your digital creations securely with Ethereum and IPFS technology.
          </p>

          <div
            in:fly={{ y: 30, duration: 800, delay: 300 }}
            class="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start w-full sm:w-auto"
          >
            <a href="/login" class="shiny-cta">
              <span>Get Started — Free</span>
            </a>
            <a
              href="#how"
              class="flex h-13 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-8 text-base font-semibold text-white backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10 sm:w-auto"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              See How it Works
            </a>
          </div>
        {/if}
      </div>

      <!-- Right Column: System Dashboard Mockup Box (Beside the text) -->
      <div
        in:fade={{ duration: 900, delay: 500 }}
        class="group relative w-full lg:col-span-6 lg:ml-auto"
      >
        <div class="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-cyan-600/20 blur-2xl opacity-50 transition-opacity duration-500 group-hover:opacity-100"></div>

        <div class="overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c10]/90 shadow-2xl backdrop-blur-xl transition-all duration-500 group-hover:-translate-y-2 group-hover:border-blue-500/30 group-hover:shadow-[0_20px_50px_rgba(59,130,246,0.15)] group-hover:animate-float-slow">
          <!-- Window chrome -->
          <div class="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-3">
            <span class="h-3 w-3 rounded-full bg-red-500/70"></span>
            <span class="h-3 w-3 rounded-full bg-yellow-500/70"></span>
            <span class="h-3 w-3 rounded-full bg-green-500/70"></span>
            <div class="ml-3 flex-1 rounded-md bg-white/5 px-3 py-1 text-left text-xs text-gray-500 truncate">
              https://decentrashare.com/storage
            </div>
          </div>

          <!-- Fake dashboard body -->
          <div class="grid grid-cols-12 gap-3 p-4 text-left">
            <!-- sidebar -->
            <div class="col-span-4 hidden flex-col justify-between sm:flex border-r border-white/5 pr-3">
              <div class="flex flex-col gap-1">
                {#each sidebarItems as item}
                  <div class="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-all {item.active ? 'bg-blue-500/10 text-blue-400' : 'text-gray-500'}">
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon} /></svg>
                    <span class="truncate">{item.name}</span>
                  </div>
                {/each}
              </div>

              <!-- Storage progress widget -->
              <div class="mt-6 rounded-xl bg-white/[0.02] border border-white/5 p-2.5 text-[9px]">
                <div class="flex justify-between font-bold text-gray-400 mb-1">
                  <span>Storage</span>
                  <span>65%</span>
                </div>
                <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full" style="width: 65%"></div>
                </div>
                <p class="text-gray-600 mt-1 font-medium">32.4 GB used</p>
              </div>
            </div>

            <!-- file grid -->
            <div class="col-span-12 grid grid-cols-2 gap-2.5 sm:col-span-8">
              {#each mockFiles as file, i}
                <div
                  class="relative rounded-xl border border-white/5 bg-white/[0.02] p-3 transition-all duration-300 hover:border-blue-500/40 hover:bg-white/[0.06] hover:scale-[1.04] hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-500/10"
                >
                  <!-- status badge -->
                  <span class="absolute top-2.5 right-2.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full border border-white/5 bg-white/[0.03] text-gray-500">
                    {file.status}
                  </span>

                  <div class="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 ring-1 ring-white/10 transition-transform duration-300 hover:scale-110">
                    {#if file.type === 'pdf'}
                      <svg class="h-4 w-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    {:else if file.type === 'audio'}
                      <svg class="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                    {:else if file.type === 'video'}
                      <svg class="h-4 w-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    {:else if file.type === 'image'}
                      <svg class="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    {:else}
                      <svg class="h-4 w-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    {/if}
                  </div>
                  <div class="truncate text-[11px] font-bold text-gray-200 mt-1">{file.name}</div>
                  <div class="text-[9px] text-gray-500 mt-0.5">{file.size}</div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  @property --gradient-angle {
    syntax: "<angle>";
    initial-value: 0deg;
    inherits: false;
  }

  @property --gradient-angle-offset {
    syntax: "<angle>";
    initial-value: 0deg;
    inherits: false;
  }

  @property --gradient-percent {
    syntax: "<percentage>";
    initial-value: 5%;
    inherits: false;
  }

  @property --gradient-shine {
    syntax: "<color>";
    initial-value: white;
    inherits: false;
  }

  .shiny-cta {
    --shiny-cta-bg: #0a0a0f;
    --shiny-cta-bg-subtle: #1a1a2e;
    --shiny-cta-fg: #ffffff;
    --shiny-cta-highlight: #3b82f6;
    --shiny-cta-highlight-subtle: #60a5fa;
    --duration: 3s;
    --shadow-size: 2px;
    --transition: 800ms cubic-bezier(0.25, 1, 0.5, 1);

    isolation: isolate;
    position: relative;
    overflow: hidden;
    cursor: pointer;
    outline-offset: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 3.25rem;
    padding: 0 2rem;
    font-family: 'Inter', sans-serif;
    font-size: 1rem;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: -0.01em;
    text-decoration: none;
    border: 1px solid transparent;
    border-radius: 1rem;
    color: var(--shiny-cta-fg);
    background:
      linear-gradient(var(--shiny-cta-bg), var(--shiny-cta-bg)) padding-box,
      conic-gradient(
        from calc(var(--gradient-angle) - var(--gradient-angle-offset)),
        transparent,
        var(--shiny-cta-highlight) var(--gradient-percent),
        var(--gradient-shine) calc(var(--gradient-percent) * 2),
        var(--shiny-cta-highlight) calc(var(--gradient-percent) * 3),
        transparent calc(var(--gradient-percent) * 4)
      ) border-box;
    box-shadow: inset 0 0 0 1px var(--shiny-cta-bg-subtle);
    transition: var(--transition);
    transition-property: transform, box-shadow, --gradient-angle-offset, --gradient-percent, --gradient-shine;
  }

  .shiny-cta::before,
  .shiny-cta::after {
    content: '';
    pointer-events: none;
    position: absolute;
    inset-inline-start: 50%;
    inset-block-start: 50%;
    translate: -50% -50%;
    z-index: -1;
  }

  .shiny-cta:active {
    translate: 0 1px;
  }

  /* Dots pattern */
  .shiny-cta::before {
    --size: calc(100% - var(--shadow-size) * 3);
    --position: 2px;
    --space: calc(var(--position) * 2);
    width: var(--size);
    height: var(--size);
    background: radial-gradient(
      circle at var(--position) var(--position),
      white calc(var(--position) / 4),
      transparent 0
    ) padding-box;
    background-size: var(--space) var(--space);
    background-repeat: space;
    mask-image: conic-gradient(
      from calc(var(--gradient-angle) + 45deg),
      black,
      transparent 10% 90%,
      black
    );
    border-radius: inherit;
    opacity: 0.4;
    z-index: -1;
  }

  /* Inner shimmer */
  .shiny-cta::after {
    width: 100%;
    aspect-ratio: 1;
    background: linear-gradient(
      -50deg,
      transparent,
      var(--shiny-cta-highlight),
      transparent
    );
    mask-image: radial-gradient(circle at bottom, transparent 40%, black);
    opacity: 0.6;
  }

  .shiny-cta span {
    z-index: 1;
    position: relative;
  }


  /* Animate — use global keyframe names directly */
  .shiny-cta {
    animation:
      3s shiny-gradient-angle linear infinite,
      7.5s shiny-gradient-angle linear infinite reverse paused;
    animation-composition: add;
  }

  .shiny-cta::before {
    animation:
      3s shiny-gradient-angle linear infinite,
      7.5s shiny-gradient-angle linear infinite reverse paused;
    animation-composition: add;
  }

  .shiny-cta::after {
    animation:
      3s shiny-shimmer linear infinite,
      7.5s shiny-shimmer linear infinite reverse paused;
    animation-composition: add;
  }

  .shiny-cta:is(:hover, :focus-visible) {
    --gradient-percent: 20%;
    --gradient-angle-offset: 95deg;
    --gradient-shine: var(--shiny-cta-highlight-subtle);
    transform: translateY(-2px) scale(1.03);
    box-shadow:
      0 0 25px rgba(59, 130, 246, 0.4),
      0 0 50px rgba(96, 165, 250, 0.2),
      inset 0 0 0 1px rgba(96, 165, 250, 0.4);
  }

  .shiny-cta:is(:hover, :focus-visible),
  .shiny-cta:is(:hover, :focus-visible)::before,
  .shiny-cta:is(:hover, :focus-visible)::after {
    animation-play-state: running;
  }

  .shiny-cta:active {
    transform: translateY(1px) scale(0.98);
  }

  @keyframes -global-shiny-gradient-angle {
    to {
      --gradient-angle: 360deg;
    }
  }

  @keyframes -global-shiny-shimmer {
    to {
      rotate: 360deg;
    }
  }

  @media (max-width: 639px) {
    .shiny-cta {
      width: 100%;
    }
  }
</style>
