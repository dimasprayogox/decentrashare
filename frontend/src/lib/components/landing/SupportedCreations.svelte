<script lang="ts">
  import { onMount } from 'svelte';
  import { inView } from '$lib/utils/inView';
  import logo from '$lib/assets/logo.png';

  interface TimelineItem {
    id: number;
    title: string;
    date: string;
    content: string;
    category: string;
    icon: string;
    relatedIds: number[];
    status: 'completed' | 'in-progress' | 'pending';
    energy: number;
  }

  const timelineData: TimelineItem[] = [
    {
      id: 1,
      title: "Images & Artworks",
      date: "PNG, JPG, WEBP, GIF, HEIC",
      content: "High-resolution graphics, digital art, iPhone HEIC photos, and NFT assets anchored immutably to IPFS.",
      category: "Graphics",
      icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
      relatedIds: [2, 3],
      status: "completed",
      energy: 100
    },
    {
      id: 2,
      title: "Video & Motion",
      date: "MP4, WEBM, MOV",
      content: "High-definition video streams, iPhone MOV recordings, motion animations, and film renders stored with Web3 proof.",
      category: "Video",
      icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
      relatedIds: [1, 4],
      status: "completed",
      energy: 100
    },
    {
      id: 3,
      title: "Audio & Music",
      date: "MP3, WAV, OGG",
      content: "Lossless audio recordings, voice tracks, and music stems with smart contract protection.",
      category: "Audio",
      icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
      relatedIds: [1, 4],
      status: "completed",
      energy: 100
    },
    {
      id: 4,
      title: "Documents & Data",
      date: "PDF, TXT, CSV, JSON",
      content: "Encrypted whitepapers, structured datasets, and contracts signed and verified on Ethereum.",
      category: "Document",
      icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
      relatedIds: [2, 3],
      status: "completed",
      energy: 100
    }
  ];

  let activeNodeId = $state<number | null>(null);
  let autoRotate = $state<boolean>(true);
  let rotationAngle = $state<number>(0);
  let expandedItems = $state<Record<number, boolean>>({});
  let pulseEffect = $state<Record<number, boolean>>({});

  onMount(() => {
    const interval = setInterval(() => {
      if (autoRotate) {
        rotationAngle = Number(((rotationAngle + 0.35) % 360).toFixed(3));
      }
    }, 50);

    return () => clearInterval(interval);
  });

  function handleContainerClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains('orbital-container') || target.classList.contains('orbital-track')) {
      activeNodeId = null;
      expandedItems = {};
      pulseEffect = {};
      autoRotate = true;
    }
  }

  function toggleItem(id: number) {
    if (activeNodeId === id) {
      activeNodeId = null;
      expandedItems = {};
      pulseEffect = {};
      autoRotate = true;
    } else {
      activeNodeId = id;
      expandedItems = { [id]: true };
      autoRotate = false;

      const currentItem = timelineData.find((item) => item.id === id);
      const newPulseEffect: Record<number, boolean> = {};
      if (currentItem) {
        currentItem.relatedIds.forEach((relId) => {
          newPulseEffect[relId] = true;
        });
      }
      pulseEffect = newPulseEffect;

      const nodeIndex = timelineData.findIndex((item) => item.id === id);
      const totalNodes = timelineData.length;
      const targetAngle = (nodeIndex / totalNodes) * 360;
      rotationAngle = 270 - targetAngle;
    }
  }

  function calculateNodePosition(index: number, total: number) {
    const angle = ((index / total) * 360 + rotationAngle) % 360;
    const radius = 200;
    const radian = (angle * Math.PI) / 180;

    const x = radius * Math.cos(radian);
    const y = radius * Math.sin(radian);

    const zIndex = Math.round(100 + 50 * Math.cos(radian));
    const opacity = Math.max(0.45, Math.min(1, 0.45 + 0.55 * ((1 + Math.sin(radian)) / 2)));

    return { x, y, angle, zIndex, opacity };
  }

  function isRelatedToActive(itemId: number): boolean {
    if (!activeNodeId) return false;
    const currentItem = timelineData.find((item) => item.id === activeNodeId);
    return currentItem ? currentItem.relatedIds.includes(itemId) : false;
  }

  function getStatusStyles(status: TimelineItem['status']): string {
    switch (status) {
      case 'completed':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'in-progress':
        return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
      case 'pending':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      default:
        return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
    }
  }
</script>

<section id="supported-creations" class="relative mx-auto max-w-6xl px-6 py-28 isolate">
  <!-- Soft background ambient glows -->
  <div class="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[600px] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-blue-600/10 via-cyan-500/10 to-transparent blur-[140px]"></div>

  <!-- Header -->
  <div use:inView class="reveal text-center mb-12">

    <h2 class="mt-2 text-4xl font-extrabold tracking-tight text-white md:text-5xl lg:text-6xl">
      Supported <span class="bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-400 bg-clip-text text-transparent">Digital Creations</span>
    </h2>
    <p class="mx-auto mt-4 max-w-2xl text-base text-gray-400 md:text-lg leading-relaxed">
      Seamlessly store, encrypt, and verify your creations on IPFS & Ethereum. Click any node to view supported formats.
    </p>
  </div>

  <!-- Radial Orbital Timeline Container -->
  <div
    use:inView
    class="reveal orbital-container relative w-full h-[580px] flex flex-col items-center justify-center select-none"
    onclick={handleContainerClick}
    role="region"
    aria-label="Radial Orbital Timeline"
  >
    <div class="orbital-track relative w-full h-full flex items-center justify-center">
      <!-- Circular Glowing Background with Transparent Gradient Edges -->
      <div class="pointer-events-none absolute w-[520px] h-[520px] rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.18)_0%,rgba(59,130,246,0.08)_40%,rgba(10,10,12,0)_75%)] animate-pulse" style="animation-duration: 4s;"></div>
      <div class="pointer-events-none absolute w-[440px] h-[440px] rounded-full border border-cyan-500/20 bg-[radial-gradient(circle,rgba(14,165,233,0.06)_0%,transparent_70%)]"></div>
      <div class="pointer-events-none absolute w-[580px] h-[580px] rounded-full border border-blue-500/10 bg-[radial-gradient(circle,rgba(99,102,241,0.04)_0%,transparent_80%)]"></div>

      <!-- Central Glowing Core Orb -->
      <div class="absolute w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 animate-pulse flex items-center justify-center z-10 shadow-xl shadow-cyan-500/50">
        <div class="absolute w-28 h-28 rounded-full border border-cyan-400/40 animate-ping opacity-70 pointer-events-none"></div>
        <div class="absolute w-32 h-32 rounded-full border border-blue-400/30 animate-ping opacity-50 pointer-events-none" style="animation-delay: 0.5s"></div>
        <div class="w-16 h-16 rounded-full bg-[#080d1a]/95 backdrop-blur-md border-2 border-cyan-400/50 flex items-center justify-center p-2 overflow-hidden shadow-2xl shadow-cyan-500/30">
          <img src={logo} alt="DecentraShare" class="w-full h-full object-contain drop-shadow" />
        </div>
      </div>

      <!-- Orbital Track Ring -->
      <div class="orbital-track absolute w-[400px] h-[400px] rounded-full border border-cyan-400/25 bg-gradient-to-br from-cyan-500/5 via-blue-500/5 to-transparent shadow-[0_0_60px_rgba(6,182,212,0.12)] pointer-events-none"></div>

      <!-- Orbiting Nodes -->
      {#each timelineData as item, index}
        {@const position = calculateNodePosition(index, timelineData.length)}
        {@const isExpanded = expandedItems[item.id]}
        {@const isRelated = isRelatedToActive(item.id)}
        {@const isPulsing = pulseEffect[item.id]}

        <div
          class="absolute transition-all duration-700 cursor-pointer flex flex-col items-center justify-center"
          style="transform: translate({position.x}px, {position.y}px); z-index: {isExpanded ? 200 : position.zIndex}; opacity: {isExpanded ? 1 : position.opacity};"
          onclick={(e) => {
            e.stopPropagation();
            toggleItem(item.id);
          }}
          role="button"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              toggleItem(item.id);
            }
          }}
        >
          <!-- Energy aura / pulse background -->
          <div
            class="absolute rounded-full -inset-1 {isPulsing ? 'animate-pulse duration-1000' : ''}"
            style="background: radial-gradient(circle, rgba(34,211,238,0.25) 0%, rgba(34,211,238,0) 70%); width: {item.energy * 0.5 + 40}px; height: {item.energy * 0.5 + 40}px; left: {-((item.energy * 0.5 + 40) - 40) / 2}px; top: {-((item.energy * 0.5 + 40) - 40) / 2}px;"
          ></div>

          <!-- Icon Circle Button -->
          <div
            class="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 transform border-2 {isExpanded ? 'bg-cyan-400 text-black border-white scale-150 shadow-xl shadow-cyan-400/50' : isRelated ? 'bg-cyan-500/40 text-white border-cyan-300 animate-pulse' : 'bg-[#0e131f] text-cyan-300 border-white/30 hover:border-cyan-400 hover:scale-110'}"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d={item.icon} />
            </svg>
          </div>

          <!-- Node Title Label -->
          <div
            class="absolute top-13 whitespace-nowrap text-xs font-bold tracking-wider transition-all duration-300 pointer-events-none {isExpanded ? 'text-cyan-300 scale-125 font-extrabold' : 'text-gray-300'}"
          >
            {item.title}
          </div>

          <!-- Popup Interactive Card when expanded -->
          {#if isExpanded}
            <div
              class="absolute top-20 left-1/2 -translate-x-1/2 w-64 bg-[#080d19]/95 backdrop-blur-2xl border border-cyan-400/40 shadow-2xl shadow-cyan-500/25 rounded-2xl p-4 text-center z-50 animate-fadeIn"
              onclick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={item.title}
            >
              <div class="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-cyan-400"></div>

              <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-[10px] font-bold uppercase tracking-wider mb-2">
                <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                Supported Data Formats
              </div>

              <h3 class="text-sm font-bold text-white mb-3">{item.title}</h3>

              <!-- Supported Format Badges Cloud -->
              <div class="flex flex-wrap items-center justify-center gap-1.5">
                {#each item.date.split(', ') as fmt}
                  <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-cyan-200 font-mono text-xs font-bold tracking-wide shadow-sm hover:border-cyan-400/50 hover:bg-cyan-500/10 transition-colors">
                    <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                    {fmt}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
  .animate-fadeIn {
    animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
</style>
