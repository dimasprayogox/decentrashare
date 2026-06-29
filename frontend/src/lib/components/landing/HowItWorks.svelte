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

<section id="how" class="relative mx-auto max-w-6xl px-6 py-28">
  <div use:inView class="reveal mb-16 text-center">
    <h2 class="mt-4 text-4xl font-extrabold tracking-tight text-white md:text-5xl">
      Simple Steps to
      <span class="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Protect Your Creations</span>
    </h2>
    <p class="mx-auto mt-5 max-w-2xl text-lg text-gray-400">
      Store, verify, and share your digital creations securely in just a few simple steps.
    </p>
  </div>

  <div class="relative">
    <!-- connecting line -->
    <div class="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-white/15 to-transparent lg:block"></div>

    <div class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {#each steps as s, i}
        <div
          use:inView
          class="reveal relative text-center group"
          style="--reveal-delay: {i * 130}ms"
        >
          <div class="relative mx-auto mb-6 flex h-18 w-18 items-center justify-center">
            <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 blur-md opacity-70 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div class="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-[#0c0c10] group-hover:border-blue-500/30 group-hover:scale-105 transition-all duration-300">
              <svg class="h-7 w-7 text-blue-300 group-hover:text-white transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d={s.icon} />
              </svg>
            </div>
            <span class="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 text-xs font-bold text-white shadow-md ring-2 ring-black">
              {s.step}
            </span>
          </div>
          <h3 class="mb-2 text-lg font-bold text-white group-hover:text-blue-300 transition-colors duration-300">{s.title}</h3>
          <p class="text-sm leading-relaxed text-gray-500 group-hover:text-gray-400 transition-colors duration-300">{s.desc}</p>
        </div>
      {/each}
    </div>
  </div>
</section>
