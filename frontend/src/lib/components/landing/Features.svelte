<script lang="ts">
  import { inView } from '$lib/utils/inView';

  const features = [
    {
      title: 'Secure Digital Storage',
      desc: 'Store your digital creations securely on IPFS while keeping ownership records on the Ethereum blockchain.',
      gradient: 'from-blue-500/20 to-blue-600/10 dark:to-cyan-500/20',
      ring: 'group-hover:border-blue-500/40',
      icon: 'globe'
    },
    {
      title: 'Blockchain Ownership',
      desc: 'Every uploaded digital work is linked to blockchain metadata, helping preserve ownership and authenticity.',
      gradient: 'from-blue-600/20 to-indigo-500/20',
      ring: 'group-hover:border-blue-500/40',
      icon: 'shield'
    },
    {
      title: 'Wallet Authentication',
      desc: 'Sign in securely with your crypto wallet without creating traditional usernames or passwords.',
      gradient: 'from-pink-500/20 to-rose-500/20',
      ring: 'group-hover:border-pink-500/40',
      icon: 'wallet'
    },
    {
      title: 'Flexible Privacy Control',
      desc: 'Choose whether your digital creations are Private, Public, Link Only, or shared with specific users.',
      gradient: 'from-emerald-500/20 to-teal-500/20',
      ring: 'group-hover:border-emerald-500/40',
      icon: 'lock'
    },
    {
      title: 'Easy & Secure Sharing',
      desc: 'Share digital creations safely while maintaining full control over who can access your files.',
      gradient: 'from-amber-500/20 to-orange-500/20',
      ring: 'group-hover:border-amber-500/40',
      icon: 'share'
    },
    {
      title: 'Verified File Integrity',
      desc: 'Blockchain verification ensures your digital creations remain authentic and unchanged after upload.',
      gradient: 'from-sky-500/20 to-blue-500/20',
      ring: 'group-hover:border-sky-500/40',
      icon: 'check'
    }
  ];

  const paths: Record<string, string> = {
    globe: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zM3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18',
    shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    wallet: 'M3 10h18M7 15h.01M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
    lock: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    share: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z',
    check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
  };
</script>

<section id="features" class="relative mx-auto max-w-6xl px-6 py-28">
  <div use:inView class="reveal mb-16 text-center">
    <h2 class="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-5xl">
      Protecting
      <span class="bg-gradient-to-r from-blue-600 to-blue-500 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">Digital Creations</span>
    </h2>
    <p class="mx-auto mt-5 max-w-2xl text-lg text-slate-600 dark:text-gray-400">
      Securely store, manage, and share your digital creations using Ethereum blockchain and decentralized IPFS storage.
    </p>
  </div>

  <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
    {#each features as feature, i}
      <div
        use:inView
        class="reveal group relative overflow-hidden rounded-3xl border border-slate-200/60 dark:border-white/5 bg-white/70 dark:bg-[#0c0c10]/40 p-8 transition-all duration-500 hover:-translate-y-1.5 hover:border-slate-300 dark:hover:border-white/15 hover:bg-slate-100/30 dark:hover:bg-[#121217]/60 shadow-xl shadow-slate-100/50 dark:shadow-black/30 backdrop-blur-sm"
        style="--reveal-delay: {(i % 3) * 120}ms"
      >
        <!-- hover glow -->
        <div class="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br {feature.gradient} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"></div>

        <div class="relative mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br {feature.gradient} ring-1 ring-slate-200 dark:ring-white/10 group-hover:scale-105 group-hover:rotate-3 transition-all duration-500">
          <svg class="h-7 w-7 text-slate-700 dark:text-white transition-colors duration-500 group-hover:text-blue-600 dark:group-hover:text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d={paths[feature.icon]} />
          </svg>
        </div>

        <h3 class="relative mb-3 text-xl font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors duration-300">{feature.title}</h3>
        <p class="relative text-sm leading-relaxed text-slate-500 dark:text-gray-400 transition-colors duration-300 group-hover:text-slate-750 dark:group-hover:text-gray-300">
          {feature.desc}
        </p>
      </div>
    {/each}
  </div>
</section>
