<script lang="ts">
  import { fade, fly, scale, slide } from 'svelte/transition';
  import { authService } from '$lib/services';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import logo from '$lib/assets/logo.png';
  import { themeController } from '$lib/utils/theme.svelte';


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
  let redirectTo = $state('/storage');
  let registerUrl = $state('/register');

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
    const urlParams = new URLSearchParams(window.location.search);
    const redirectParam = urlParams.get('redirectTo');
    if (redirectParam) {
      redirectTo = redirectParam;
      registerUrl = `/register?redirectTo=${encodeURIComponent(redirectParam)}`;
    }

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
        setTimeout(() => { window.location.href = redirectTo; }, 1200);
      } else {
        throw new Error(loginData?.message || "Signature verification failed!");
      }

    } catch (err: unknown) {
      let userMessage = 'An unknown error occurred';
      const errorData = err as { status?: number; data?: unknown };
      
      if (err) {
        if (typeof err === 'string') {
          userMessage = err;
        } else if (typeof err === 'object') {
          const e = err as any;
          if (
            e.code === 4001 || 
            e.code === 'ACTION_REJECTED' || 
            e.message?.toLowerCase().includes('rejected') || 
            e.message?.toLowerCase().includes('cancel')
          ) {
            userMessage = 'Request cancelled.';
          } else {
            userMessage = e.message || e.error?.message || 'An unknown error occurred';
          }
        }
      }

      statusMessage = `Error: ${userMessage}`;
      showErrorBanner = true;

      console.error('🔴 [Login Error]', {
        message: userMessage, status: errorData?.status, data: errorData?.data
      });
    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Login | DecentraShare Web3</title>
</svelte:head>

<div class="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-tr from-slate-100/80 via-slate-50 to-blue-50/30 dark:from-[#030712] dark:via-[#09090b] dark:to-[#020617] transition-colors duration-300 relative overflow-hidden">
  
  <!-- Theme Toggle Button (Top Right) -->
  <div class="absolute top-6 right-6 z-50">
    <button
      onclick={() => themeController.toggle()}
      class="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 transition-all hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 cursor-pointer shadow-sm"
      aria-label="Toggle theme"
    >
      {#if themeController.theme === 'dark'}
        <svg class="h-5 w-5 rotate-0 transition-transform duration-300 dark:-rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      {:else}
        <svg class="h-5 w-5 rotate-0 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
      {/if}
    </button>
  </div>

  <!-- Animated Background Orbs (Softer colors for light mode) -->
  <div class="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-500/[0.03] dark:bg-blue-500/15 rounded-full blur-[110px] animate-pulse"></div>
  <div class="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-indigo-600/[0.03] dark:bg-indigo-600/15 rounded-full blur-[100px] animate-pulse" style="animation-delay: 1.2s"></div>
  <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-400/[0.01] dark:bg-blue-500/5 rounded-full blur-[130px]"></div>

  <!-- Main Card -->
  <div 
    in:fly={{ y: 40, duration: 700, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}
    class="w-full max-w-md relative"
  >
    <!-- Glow effect behind card (Extremely soft in light mode) -->
    <div class="absolute -inset-1 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 dark:from-blue-600/20 dark:via-indigo-500/25 dark:to-blue-500/20 rounded-3xl blur-xl opacity-50 dark:opacity-60"></div>
    
    <div 
      class="relative backdrop-blur-2xl bg-white/95 dark:bg-[#09090b]/90 border border-slate-200/80 dark:border-white/10 p-8 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-black/50 transition-colors duration-300"
      onmouseenter={() => isHovered = true}
      onmouseleave={() => isHovered = false}
    >
      
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-18 h-18 rounded-2xl bg-blue-50/30 dark:bg-white/[0.02] transition-transform duration-300 overflow-hidden" 
             class:scale-105={isHovered}>
          <img src={logo} alt="DecentraShare Logo" class="w-full h-full object-contain" />
        </div>

        <h1 class="text-3xl font-bold text-slate-800 dark:text-white tracking-tight">
          Decentra<span class="bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">Share</span>
        </h1>
        <p class="text-slate-500 dark:text-gray-400 mt-2 text-sm font-medium">Secure Web3 File Sharing</p>
      </div>

      <!-- Connected Wallet Badge -->
      {#if connectedAddress && !isLoading}
        <div in:fade={{ duration: 250 }} class="mb-6">
          <div class="flex items-center justify-center gap-2 p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-500/20 transition-colors duration-300">
            <div class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            <span class="text-sm text-blue-800 dark:text-blue-300 font-mono tracking-wide">{formatAddress(connectedAddress)}</span>
            <button 
              onclick={copyAddress}
              class="ml-2 px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 hover:bg-blue-100/60 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
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
            class="group w-full relative overflow-hidden flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-semibold text-base transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.99] cursor-pointer"
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
              <div class="w-14 h-14 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-blue-500 animate-spin"></div>
              <div class="absolute inset-0 w-14 h-14 rounded-full border-4 border-transparent border-b-indigo-500/60 animate-spin" style="animation-duration: 1.5s; animation-direction: reverse"></div>
              <!-- Center dot -->
              <div class="absolute inset-0 flex items-center justify-center">
                <div class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
              </div>
            </div>
            <p class="mt-5 text-slate-700 dark:text-gray-300 text-sm font-medium">{statusMessage}</p>
            <!-- Dots animation -->
            <div class="mt-4 flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style="animation-delay: 100ms"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style="animation-delay: 200ms"></span>
            </div>
          </div>
        {/if}
      </div>

      <!-- Error Banner -->
      {#if showErrorBanner || statusMessage.toLowerCase().includes('error') || statusMessage.toLowerCase().includes('failed')}
        <div 
          in:slide={{ axis: 'y', duration: 200 }}
          class="mt-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-sm flex items-start gap-3"
        >
          <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span class="flex-1 leading-relaxed">{statusMessage}</span>
          <button 
            onclick={dismissError}
            class="text-red-405 hover:text-red-650 dark:text-red-400/60 dark:hover:text-red-400 transition-colors p-1 -mr-1 -mt-1 cursor-pointer"
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
        <div class="mt-8 pt-6 border-t border-slate-200/60 dark:border-white/5 transition-colors duration-300">
          <p class="text-center text-sm text-slate-500 dark:text-gray-400 transition-colors duration-200" 
             class:text-blue-650={statusMessage.toLowerCase().includes('successful')}
             class:dark:text-blue-400={statusMessage.toLowerCase().includes('successful')}>
            {statusMessage}
          </p>
        </div>
      {/if}

      <!-- register Link -->
      <div class="mt-4 text-center">
        <a href={registerUrl} rel="external" class="text-sm text-blue-600 dark:text-blue-400 hover:text-indigo-500 transition-colors">
          Don't have an account? <span class="font-medium">Sign up</span>
        </a>
      </div>

      <!-- Security Badge -->
      <div class="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-gray-500">
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