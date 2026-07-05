<script lang="ts">
  import { inView } from '$lib/utils/inView';
  import { slide } from 'svelte/transition';

const faqs = [
  {
    q: "What is DecentraShare?",
    a: "DecentraShare is a decentralized platform for storing and sharing digital creations. It combines Ethereum blockchain for ownership verification with IPFS decentralized storage to provide secure, transparent, and reliable file management."
  },
  {
    q: "What types of digital creations can I store?",
    a: "You can upload various digital creations such as images, illustrations, design files, documents, videos, and other supported file formats. Each uploaded file is securely stored and linked to blockchain metadata."
  },
  {
    q: "How is my digital creation protected?",
    a: "Your files are stored on IPFS, while their metadata and ownership records are recorded on the Ethereum blockchain. This helps ensure file integrity and makes it easier to verify authenticity."
  },
  {
    q: "Who can access my files?",
    a: "You control who can access your digital creations. DecentraShare supports multiple privacy options, including Private, Public, Link Only, and Specific User sharing."
  },
  {
    q: "Why do I need MetaMask?",
    a: "MetaMask is used as your digital identity to securely access DecentraShare and approve blockchain transactions. It eliminates the need for traditional usernames and passwords."
  },
  {
    q: "Can I verify that my file has not been modified?",
    a: "Yes. Every uploaded file is associated with a unique cryptographic hash stored on the blockchain, allowing its integrity and authenticity to be verified at any time."
  }
];

  let activeIndex = $state<number | null>(null);

  function toggle(i: number) {
    activeIndex = activeIndex === i ? null : i;
  }
</script>

<section id="faq" class="relative mx-auto max-w-4xl px-6 py-24">
  <div class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 h-[500px] w-full max-w-3xl bg-gradient-to-tr from-blue-600/15 via-indigo-600/10 to-transparent blur-[120px]"></div>

  <div class="text-center mb-16">
    <p
      use:inView
      style="--reveal-delay: 100ms"
      class="reveal mt-3 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl md:text-5xl"
    >
      Frequently Asked <span class="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 dark:from-blue-400 dark:via-indigo-400 dark:to-blue-400 bg-clip-text text-transparent">Questions</span>
    </p>
    <p
      use:inView
      style="--reveal-delay: 200ms"
      class="reveal mx-auto mt-4 max-w-xl text-base text-slate-600 dark:text-gray-400"
    >
      Learn how DecentraShare securely stores, protects, and shares your digital creations using blockchain and IPFS.
    </p>
  </div>

  <div class="space-y-4">
    {#each faqs as faq, i}
      <div
        use:inView
        style="--reveal-delay: {i * 100}ms"
        class="reveal group rounded-2xl border border-slate-200 dark:border-white/5 bg-white/70 dark:bg-[#0c0c10]/40 transition-all duration-300 hover:border-slate-300 dark:hover:border-white/10 hover:bg-slate-100/30 dark:hover:bg-[#121217]/60 shadow-lg shadow-slate-100/50 dark:shadow-black/10 backdrop-blur-sm overflow-hidden"
      >
        <button
          type="button"
          onclick={() => toggle(i)}
          class="flex w-full items-center justify-between px-6 py-5 text-left text-base font-bold text-slate-800 dark:text-white transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-300 focus:outline-none cursor-pointer"
        >
          <span>{faq.q}</span>
          <span class="ml-4 flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-gray-400 transition-all duration-300 group-hover:bg-blue-500/10 group-hover:text-blue-400 {activeIndex === i ? 'rotate-180 bg-blue-500/15 text-blue-400' : ''}">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
          </span>
        </button>

        {#if activeIndex === i}
          <div transition:slide={{ duration: 300 }}>
            <div class="border-t border-slate-200/50 dark:border-white/5 px-6 py-5 text-sm leading-relaxed text-slate-600 dark:text-gray-400 bg-slate-50/50 dark:bg-white/[0.01]">
              {faq.a}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</section>
