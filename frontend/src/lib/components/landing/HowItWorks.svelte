<script lang="ts">
  import { inView } from '$lib/utils/inView';

  const steps = [
    {
      step: '01',
      title: 'Connect Your Wallet',
      desc: 'Sign in with MetaMask in one click. No email, no password — your wallet is your identity.',
      icon: 'M13 10V3L4 14h7v7l9-11h-7z'
    },
    {
      step: '02',
      title: 'Upload & Encrypt',
      desc: 'Drop your files in. They are encrypted locally and pinned to IPFS, returning a unique content hash.',
      icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12'
    },
    {
      step: '03',
      title: 'Anchor On-Chain',
      desc: 'The file hash and access rules are recorded on an Ethereum smart contract — immutable and verifiable.',
      icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4'
    },
    {
      step: '04',
      title: 'Share & Control',
      desc: 'Send a secure link, set roles, expire access, or revoke instantly. You decide who sees what, forever.',
      icon: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z'
    }
  ];
</script>

<section id="how" class="w-full bg-white dark:bg-[#080b11] border-y border-slate-200/80 dark:border-white/5 py-28 relative overflow-hidden transition-colors duration-300">
  <div class="mx-auto max-w-6xl px-6 relative z-10">
    <div use:inView class="reveal mb-16 text-center">
      <h2 class="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-5xl">
        Simple Steps to
        <span class="bg-gradient-to-r from-blue-600 to-blue-500 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">Protect Your Creations</span>
      </h2>
      <p class="mx-auto mt-5 max-w-2xl text-lg text-slate-600 dark:text-gray-400">
        Store, verify, and share your digital creations securely in just a few simple steps.
      </p>
    </div>

    <div class="relative">
      <!-- connecting line -->
      <div class="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-slate-200/85 dark:via-white/10 to-transparent lg:block"></div>

      <div class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {#each steps as s, i}
          <div
            use:inView
            class="reveal relative text-center group"
            style="--reveal-delay: {i * 130}ms"
          >
            <div class="relative mx-auto mb-6 flex h-18 w-18 items-center justify-center">
              <div class="absolute inset-0 rounded-2xl bg-blue-500/10 dark:bg-gradient-to-br dark:from-blue-500/20 dark:to-cyan-500/20 blur-md opacity-70 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div class="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0e131f] group-hover:border-blue-500/40 dark:group-hover:border-cyan-400/40 group-hover:scale-105 transition-all duration-300">
                <svg class="h-7 w-7 text-blue-600 dark:text-cyan-400 group-hover:text-blue-700 dark:group-hover:text-white transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d={s.icon} />
                </svg>
              </div>
              <span class="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 dark:bg-gradient-to-r dark:from-blue-600 dark:to-cyan-500 text-xs font-bold text-white keep-white shadow-md ring-2 ring-white dark:ring-[#080b11]">
                {s.step}
              </span>
            </div>
            <h3 class="mb-2 text-lg font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-cyan-300 transition-colors duration-300">{s.title}</h3>
            <p class="text-sm leading-relaxed text-slate-500 dark:text-gray-400 group-hover:text-slate-700 dark:group-hover:text-gray-305 transition-colors duration-300">{s.desc}</p>
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>
