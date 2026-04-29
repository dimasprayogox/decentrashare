<script>
  const features = [
    { title: "Terdesentralisasi", desc: "File tidak disimpan di satu server, melainkan di jaringan IPFS.", icon: "🌐" },
    { title: "Keamanan Blockchain", desc: "Setiap akses file tercatat permanen di Smart Contract Ethereum.", icon: "🔐" },
    { title: "Tanpa Akun", desc: "Cukup hubungkan Wallet crypto kamu untuk mulai berbagi.", icon: "💳" }
  ];
</script>

<section id="features" class="max-w-7xl mx-auto px-10 py-32 border-t border-white/5">
  <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
    {#each features as feature}
      <div class="p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-blue-500/30 transition-all group">
        <div class="text-4xl mb-6">{feature.icon}</div>
        <h3 class="text-xl font-bold mb-4 text-white">{feature.title}</h3>
        <p class="text-gray-500 leading-relaxed text-sm group-hover:text-gray-400 transition-colors">
          {feature.desc}
        </p>
      </div>
    {/each}
  </div>
</section>