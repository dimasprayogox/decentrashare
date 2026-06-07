<script lang="ts">
  import { inView } from '$lib/utils/inView';

  const stats = [
    { value: 99.9, suffix: '%', label: 'Network Uptime', decimals: 1 },
    { value: 256, suffix: '-bit', label: 'AES Encryption', decimals: 0 },
    { value: 100, suffix: '%', label: 'You Own the Keys', decimals: 0 },
    { value: 0, suffix: '', label: 'Central Servers', decimals: 0 }
  ];

  // Reactive displayed values, animated up when scrolled into view.
  let display = $state(stats.map(() => 0));

  function runCount() {
    const duration = 1400;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      display = stats.map((s) => s.value * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Trigger the count when the section enters view.
  function watch(node: HTMLElement) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          runCount();
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
</script>

<section id="stats" class="relative mx-auto max-w-6xl px-6 py-20" use:watch>
  <div
    use:inView
    class="reveal relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-10 md:p-14"
  >
    <div class="pointer-events-none absolute -left-20 top-0 h-60 w-60 rounded-full bg-blue-600/10 blur-[100px]"></div>
    <div class="pointer-events-none absolute -right-20 bottom-0 h-60 w-60 rounded-full bg-purple-600/10 blur-[100px]"></div>

    <div class="relative grid grid-cols-2 gap-8 md:grid-cols-4">
      {#each stats as s, i}
        <div class="text-center">
          <div class="text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            <span class="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              {display[i].toFixed(s.decimals)}{s.suffix}
            </span>
          </div>
          <p class="mt-2 text-sm font-medium text-gray-500">{s.label}</p>
        </div>
      {/each}
    </div>
  </div>
</section>
