<script lang="ts">
  import { fade, fly, scale } from 'svelte/transition';
  import { authService } from '$lib/services';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import logo from '$lib/assets/logo.png';


  type EthereumProvider = {
    request<T = unknown>(args: { method: string; params?: unknown[] }): Promise<T>;
    on?(event: 'accountsChanged', handler: (accounts: string[]) => void): void;
    removeListener?(event: 'accountsChanged', handler: (accounts: string[]) => void): void;
  };

  const getEthereum = () => (window as typeof window & { ethereum?: EthereumProvider }).ethereum;

  // State
  let isLoading = $state(false);
  let statusMessage = $state("Please connect your wallet to continue.");
  let showErrorBanner = $state(false);
  let connectedAddress = $state<string | null>(null);
  let isHovered = $state(false);

  // Helper: Format wallet address
  function formatAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}••••${address.slice(-4)}`;
  }

  // Helper: Copy to clipboard
  async function copyAddress() {
    if (connectedAddress) {
      await navigator.clipboard.writeText(connectedAddress);
      const originalMsg = statusMessage;
      statusMessage = "✓ Address copied!";
      setTimeout(() => { statusMessage = originalMsg; }, 1500);
    }
  }

  // Helper: Dismiss error
  function dismissError() {
    showErrorBanner = false;
    if (!isLoading && !statusMessage.toLowerCase().includes('success')) {
      statusMessage = "Please connect your wallet to continue.";
    }
  }

  async function clearCurrentSession() {
    localStorage.removeItem('session_token');
    authService.clearClientStorage();

    try {
      await authService.logout();
    } catch (err) {
      console.warn('[Login] session clear skipped:', err);
    }
  }

  function handleAccountsChanged(accounts: string[]) {
    connectedAddress = accounts[0] || null;
    showErrorBanner = false;
    statusMessage = connectedAddress
      ? `Wallet switched to ${formatAddress(connectedAddress)}. Please login again.`
      : 'Wallet disconnected. Please connect your wallet to continue.';
    void clearCurrentSession();
  }

  onMount(() => {
    const ethereum = getEthereum();
    ethereum?.on?.('accountsChanged', handleAccountsChanged);

    return () => {
      ethereum?.removeListener?.('accountsChanged', handleAccountsChanged);
    };
  });

  async function connectWallet() {
    isLoading = true;
    statusMessage = "Connecting wallet...";
    showErrorBanner = false;

    try {
      const ethereum = getEthereum();
      if (!ethereum) throw new Error("MetaMask not detected!");

      await clearCurrentSession();

      const accounts = await ethereum.request<string[]>({ method: 'eth_requestAccounts' });
      const activeAccounts = await ethereum.request<string[]>({ method: 'eth_accounts' });
      connectedAddress = activeAccounts[0] || accounts[0];

      if (!connectedAddress) throw new Error('No wallet account selected.');

      console.debug('[Login] selected wallet payload:', {
        walletAddress: connectedAddress.toLowerCase(),
        accounts,
        activeAccounts
      });

      statusMessage = "Fetching security nonce...";
      const result = await authService.fetchNonce(connectedAddress);
      
      if (!result?.success) {
        throw new Error(result?.message || "Failed to fetch data from server");
      }

      const nonce = result.data.nonce;
      const loginMessage = result.data.loginMessage; 

      statusMessage = "Please sign the message in your wallet...";
      const signingAddress = connectedAddress;
      const signature = await ethereum.request<string>({
        method: 'personal_sign',
        params: [loginMessage, signingAddress],
      });

      const latestAccounts = await ethereum.request<string[]>({ method: 'eth_accounts' });
      const latestAddress = latestAccounts[0];
      if (!latestAddress || latestAddress.toLowerCase() !== signingAddress.toLowerCase()) {
        throw new Error('Wallet changed during login. Please try again with the selected wallet.');
      }

      statusMessage = "Verifying identity...";
      const loginPayload = {
          walletAddress: signingAddress.toLowerCase(),
          signature: signature,
          nonce: nonce
      };
      console.debug('[Login] verify payload:', {
        walletAddress: loginPayload.walletAddress,
        nonce: loginPayload.nonce,
        hasSignature: Boolean(loginPayload.signature)
      });
      const loginData = await authService.verifyLogin(loginPayload);

      if (loginData?.success) {
        const token = loginData.data?.token; 
        if (token) localStorage.setItem('session_token', token);

        statusMessage = "Login successful! Redirecting...";
        setTimeout(() => { window.location.href = '/storage'; }, 1200);
      } else {
        throw new Error(loginData?.message || "Signature verification failed!");
      }

    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error('An unknown error occurred');
      const errorData = err as { status?: number; data?: unknown };
      const userMessage = error.message || 'An unknown error occurred';
      const statusCode = errorData.status ? ` (Status: ${errorData.status})` : '';
      statusMessage = `Error: ${userMessage}`;
      showErrorBanner = true;

      console.error('🔴 [Login Error]', {
        message: error.message, status: errorData.status, data: errorData.data
      });
    } finally {
      isLoading = false;
    }
  } 
</script>

<svelte:head>
  <title>Login | DecentraShare Web3</title>
</svelte:head>

<div class="min-h-screen w-full flex items-center justify-center p-4 bg-[#0a0a0c] relative overflow-hidden">
  
  <!-- Animated Background Orbs -->
  <div class="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px] animate-pulse"></div>
  <div class="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] animate-pulse" style="animation-delay: 1s"></div>
  <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[120px]"></div>

  <!-- Main Card -->
  <div 
    in:fly={{ y: 40, duration: 700, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}
    class="w-full max-w-md relative"
  >
    <!-- Glow effect behind card -->
    <div class="absolute -inset-1 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-blue-600/20 rounded-3xl blur-xl opacity-50"></div>
    
    <div 
      class="relative backdrop-blur-2xl bg-[#0a0a0c]/80 border border-white/10 p-8 rounded-3xl shadow-2xl shadow-black/50"
      onmouseenter={() => isHovered = true}
      onmouseleave={() => isHovered = false}
    >
      
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-18 h-18 rounded-2xl bg-white/[0.02] transition-transform duration-300 overflow-hidden" 
             class:scale-105={isHovered}>
          <img src={logo} alt="DecentraShare Logo" class="w-full h-full object-contain" />
        </div>

        <h1 class="text-3xl font-bold text-white tracking-tight">
          Decentra<span class="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Share</span>
        </h1>
        <p class="text-gray-400 mt-2 text-sm">Secure Web3 File Sharing</p>
      </div>

      <!-- Connected Wallet Badge -->
      {#if connectedAddress && !isLoading}
        <div in:fade={{ duration: 250 }} class="mb-6">
          <div class="flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
            <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
            <span class="text-sm text-gray-300 font-mono tracking-wide">{formatAddress(connectedAddress)}</span>
            <button 
              onclick={copyAddress}
              class="ml-2 px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-white/5 rounded-lg transition-colors"
              title="Copy address"
            >
              Copy
            </button>
          </div>
        </div>
      {/if}

      <!-- Action Buttons -->
      <div class="space-y-3">
        {#if !isLoading}
          <button 
            onclick={connectWallet}
            class="group w-full relative overflow-hidden flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl font-semibold text-base transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/30 active:scale-[0.99]"
          >
            <!-- Shine effect on hover -->
            <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
            
            <svg class="w-5 h-5 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
            </svg>
            <span class="relative z-10">Connect MetaMask</span>
          </button>
        {:else}
          <!-- Loading State -->
          <div class="flex flex-col items-center justify-center py-8" in:fade>
            <div class="relative">
              <!-- Animated spinner ring -->
              <div class="w-14 h-14 rounded-full border-4 border-white/10 border-t-blue-500 animate-spin"></div>
              <div class="absolute inset-0 w-14 h-14 rounded-full border-4 border-transparent border-b-purple-500/60 animate-spin" style="animation-duration: 1.5s; animation-direction: reverse"></div>
              <!-- Center dot -->
              <div class="absolute inset-0 flex items-center justify-center">
                <div class="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
              </div>
            </div>
            <p class="mt-5 text-gray-300 text-sm font-medium">{statusMessage}</p>
            <!-- Dots animation -->
            <div class="mt-4 flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style="animation-delay: 100ms"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-pink-500 animate-bounce" style="animation-delay: 200ms"></span>
            </div>
          </div>
        {/if}
      </div>

      <!-- Error Banner -->
      {#if showErrorBanner || statusMessage.toLowerCase().includes('error') || statusMessage.toLowerCase().includes('failed')}
        <div 
          in:slide={{ axis: 'y', duration: 200 }}
          class="mt-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-3"
        >
          <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span class="flex-1 leading-relaxed">{statusMessage}</span>
          <button 
            onclick={dismissError}
            class="text-red-400/60 hover:text-red-400 transition-colors p-1 -mr-1 -mt-1"
            title="Dismiss"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      {/if}

      <!-- Status Message Footer -->
      {#if !showErrorBanner && !statusMessage.toLowerCase().includes('error')}
        <div class="mt-8 pt-6 border-t border-white/5">
          <p class="text-center text-sm text-gray-400 transition-colors duration-200" 
             class:text-blue-400={statusMessage.toLowerCase().includes('successful')}>
            {statusMessage}
          </p>
        </div>
      {/if}

      <!-- register Link -->
      <div class="mt-4 text-center">
        <a href="/register" rel="external" class="text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors">
          Don't have an account? <span class="font-medium">Sign up</span>
        </a>
      </div>

      <!-- Security Badge -->
      <div class="mt-6 flex items-center justify-center gap-2 text-xs text-gray-500">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
        </svg>
        <span>End-to-end encrypted • Your keys, your files</span>
      </div>

    </div>
  </div>

  <!-- Bottom gradient line -->
  <div class="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>
</div>