<script lang="ts">
  import { inView } from '$lib/utils/inView';

  const features = [
    {
      title: 'Truly Decentralized',
      desc: 'Your files live across the IPFS network, not a single vulnerable server. No outages, no single point of failure.',
      gradient: 'from-blue-500/20 to-cyan-500/20',
      ring: 'group-hover:border-blue-500/40',
      icon: 'globe'
    },
    {
      title: 'Blockchain Security',
      desc: 'Every access and transfer is permanently recorded on an Ethereum smart contract. Tamper-proof by design.',
      gradient: 'from-purple-500/20 to-fuchsia-500/20',
      ring: 'group-hover:border-purple-500/40',
      icon: 'shield'
    },
    {
      title: 'No Accounts Needed',
      desc: 'Just connect your crypto wallet to start sharing. Your keys are your identity — nothing else to remember.',
      gradient: 'from-pink-500/20 to-rose-500/20',
      ring: 'group-hover:border-pink-500/40',
      icon: 'wallet'
    },
    {
      title: 'End-to-End Encrypted',
      desc: 'Files are encrypted before they ever leave your device. Only the people you choose can ever read them.',
      gradient: 'from-emerald-500/20 to-teal-500/20',
      ring: 'group-hover:border-emerald-500/40',
      icon: 'lock'
    },
    {
      title: 'Granular Sharing',
      desc: 'Share folders, set roles, expire links, and revoke access at any time — all enforced on-chain.',
      gradient: 'from-amber-500/20 to-orange-500/20',
      ring: 'group-hover:border-amber-500/40',
      icon: 'share'
    },
    {
      title: 'Verifiable Integrity',
      desc: 'Each document carries a cryptographic hash anchored to the blockchain, so you can prove it was never altered.',
      gradient: 'from-indigo-500/20 to-violet-500/20',
      ring: 'group-hover:border-indigo-500/40',
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
    <span class="text-sm font-bold uppercase tracking-widest text-blue-400">Why DecentraShare</span>
    <h2 class="mt-4 text-4xl font-extrabold tracking-tight text-white md:text-5xl">
      Built for a world that
      <span class="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">trusts no one.</span>
    </h2>
    <p class="mx-auto mt-5 max-w-2xl text-lg text-gray-400">
      Every feature is engineered around a single principle: you stay in control of your data.
    </p>
  </div>

  <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
    {#each features as feature, i}
      <div
        use:inView
        class="reveal group relative overflow-hidden rounded-3xl border border-white/5 bg-white/[0.02] p-8 transition-all duration-500 hover:-translate-y-1.5 {feature.ring}"
        style="--reveal-delay: {(i % 3) * 120}ms"
      >
        <!-- hover glow -->
        <div class="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br {feature.gradient} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"></div>

        <div class="relative mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br {feature.gradient} ring-1 ring-white/10">
          <svg class="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d={paths[feature.icon]} />
          </svg>
        </div>

        <h3 class="relative mb-3 text-xl font-bold text-white">{feature.title}</h3>
        <p class="relative text-sm leading-relaxed text-gray-500 transition-colors group-hover:text-gray-400">
          {feature.desc}
        </p>
      </div>
    {/each}
  </div>
</section>
