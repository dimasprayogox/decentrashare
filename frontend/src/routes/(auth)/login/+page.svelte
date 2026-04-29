<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { authService } from '$lib/services'; // Panggil service

  let isLoading = $state(false);
  let statusMessage = $state("Silakan hubungkan wallet Anda.");

  async function connectWallet() {
    isLoading = true;
    statusMessage = "Menghubungkan...";

    try {
      if (!window.ethereum) throw new Error("MetaMask tidak terdeteksi!");
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];

      statusMessage = "Mengambil security nonce...";
      const result = await authService.fetchNonce(address);
      
      if (!result.success) throw new Error("Gagal mengambil data dari server");

      const nonce = result.data.nonce;
      const loginMessage = result.data.loginMessage; 

      statusMessage = "Silakan tanda tangani pesan...";
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [loginMessage, address],
      });

      statusMessage = "Memverifikasi identitas...";
      const loginData = await authService.verifyLogin({ 
          walletAddress: address, 
          signature: signature, 
          nonce: nonce 
      });

      if (loginData.success) {
        const token = loginData.data?.token; 
        
        if (token) {
            localStorage.setItem('session_token', token);
        }

        statusMessage = "Login Berhasil! Mengalihkan...";
        setTimeout(() => {
          window.location.href = '/dashboard'; 
        }, 1000);
      } else {
        throw new Error(loginData.message || "Verifikasi Signature Gagal!");
      }

    } catch (err: any) {
      statusMessage = "Error: " + err.message;
      console.error("Detail Error:", err);
    } finally {
      isLoading = false;
    }
  } 
</script>

<svelte:head>
  <title>Login | DecentraShare Web3</title>
</svelte:head>

<div class="min-h-screen w-full flex items-center justify-center p-4 bg-[#0a0a0c] relative overflow-hidden">
  <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[128px]"></div>

  {#if true}
  <div 
    transition:fly={{ y: 20, duration: 800 }}
    class="w-full max-w-md backdrop-blur-xl bg-white/5 border border-white/10 p-8 rounded-3xl shadow-2xl z-10"
  >
    <div class="text-center mb-10">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-4 border border-white/10">
        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
      </div>
      <h1 class="text-3xl font-extrabold text-white tracking-tight">Decentra<span class="text-blue-400">Share</span></h1>
    </div>

    <div class="space-y-4">
      {#if !isLoading}
        <button 
          onclick={connectWallet}
          class="w-full flex items-center justify-center gap-3.5 h-14 bg-white text-black rounded-2xl font-semibold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Connect MetaMask
        </button>
        
        <button 
          class="w-full h-14 backdrop-blur-sm bg-white/5 border border-white/10 text-white rounded-2xl font-medium hover:bg-white/10 transition-all"
        >
          WalletConnect
        </button>
      {:else}
        <div class="flex flex-col items-center justify-center py-6" in:fade>
            <div class="w-10 h-10 border-4 border-white/10 border-t-blue-500 rounded-full animate-spin mb-4"></div>
            <p class="text-gray-300 text-sm animate-pulse">Menunggu konfirmasi...</p>
        </div>
      {/if}
    </div>

    <div class="mt-8 text-center p-4 rounded-xl bg-black/30 border border-white/5">
      <p class="text-sm text-gray-400">{statusMessage}</p>
    </div>
  </div>
  {/if}
</div>