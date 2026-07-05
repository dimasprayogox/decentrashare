<script lang="ts">
  import { fade, fly, slide } from 'svelte/transition';
  import { authService } from '$lib/services';
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import logo from '$lib/assets/logo.png';
  import { themeController } from '$lib/utils/theme.svelte';


  // State
  let isLoading = $state(false);
  let statusMessage = $state("Connect your wallet to create an account.");
  let showErrorBanner = $state(false);
  let connectedAddress = $state<string | null>(null);
  let isHovered = $state(false);
  let redirectTo = $state('/storage');
  let loginUrl = $state('/login');
  
  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const redirectParam = urlParams.get('redirectTo');
    if (redirectParam) {
      redirectTo = redirectParam;
      loginUrl = `/login?redirectTo=${encodeURIComponent(redirectParam)}`;
    }
  });
  
  // Multi-step state
  let step = $state<'connect' | 'form' | 'signing'>('connect');
  
  // Form fields (REQUIRED)
  let username = $state("");
  let email = $state("");
  
  // Per-field validation errors
  let fieldErrors = $state<{ username?: string; email?: string }>({});

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
      statusMessage = "Address copied!";
      setTimeout(() => { statusMessage = originalMsg; }, 1500);
    }
  }

  // Helper: Dismiss error banner
  function dismissError() {
    showErrorBanner = false;
    if (!isLoading && !statusMessage.toLowerCase().includes('success')) {
      statusMessage = step === 'form' 
        ? "Fill in your details" 
        : "Connect your wallet to create an account.";
    }
  }

  // Helper: Validate form fields
  function validateForm(): boolean {
    fieldErrors = {};
    let isValid = true;

    if (!username.trim()) {
      fieldErrors.username = "Username is required";
      isValid = false;
    } else if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
      fieldErrors.username = "3-20 chars, letters/numbers/underscore only";
      isValid = false;
    }

    if (!email.trim()) {
      fieldErrors.email = "Email is required";
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      fieldErrors.email = "Please enter a valid email address";
      isValid = false;
    }

    return isValid;
  }

  // Step 1: Connect wallet
  async function connectWallet() {
    isLoading = true;
    statusMessage = "Connecting wallet...";
    showErrorBanner = false;
    fieldErrors = {};

    try {
      if (!window.ethereum) throw new Error("MetaMask not detected!");
      
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      connectedAddress = accounts[0];

      step = 'form';
      statusMessage = "Fill in your details";
      
    } catch (err: any) {
      handleError(err);
    } finally {
      isLoading = false;
    }
  }

  // Step 2: Validate → Submit → Sign → Register
  async function handleRegister() {
    if (!connectedAddress) return;
    
    if (!validateForm()) {
      showErrorBanner = true;
      statusMessage = "Please fix the form errors above";
      return;
    }
    
    isLoading = true;
    step = 'signing';
    statusMessage = "Fetching security nonce...";
    showErrorBanner = false;

    try {
      // 1. Fetch nonce
      const result = await authService.fetchNonce(connectedAddress);
      if (!result?.success) {
        throw new Error(result?.message || "Failed to fetch data from server");
      }

      const nonce = result.data.nonce;
      const registerMessage = result.data.registerMessage; 

      // 2. Request signature
      statusMessage = "Please sign the registration message in your wallet...";
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [registerMessage, connectedAddress],
      });

      // 3. Register user
      statusMessage = "Creating your account...";
      const regData = await authService.registerUser({
        walletAddress: connectedAddress,
        signature,
        nonce,
        username: username.trim(),
        email: email.trim().toLowerCase()
      });

      // 4. Success! ✅ SMART REDIRECT
      if (regData?.success) {
        const token = regData.data?.token;
        const isProfileComplete = regData.data?.isProfileComplete; // ✅ Get flag

        if (token) localStorage.setItem('session_token', token);

        if (!isProfileComplete) {
          statusMessage = "Account created! Please complete your profile.";
          const destUrl = redirectTo !== '/storage' ? `/settings/profile?redirectTo=${encodeURIComponent(redirectTo)}` : '/settings/profile';
          setTimeout(() => {
            window.location.href = destUrl;
          }, 1500);
        } else {
          statusMessage = "Account created successfully! Redirecting...";
          setTimeout(() => {
            window.location.href = redirectTo;
          }, 1200);
        }
      } else {
        throw new Error(regData?.message || "Registration verification failed!");
      }

    } catch (err: any) {
      handleError(err);
    } finally {
      isLoading = false;
      if (!statusMessage.toLowerCase().includes('successful')) {
        step = 'form';
      }
    }
  }

  // Unified error handler
  function handleError(err: any) {
    let userMessage = 'An unknown error occurred';
    if (err) {
      if (typeof err === 'string') {
        userMessage = err;
      } else if (typeof err === 'object') {
        if (
          err.code === 4001 || 
          err.code === 'ACTION_REJECTED' || 
          err.message?.toLowerCase().includes('rejected') || 
          err.message?.toLowerCase().includes('cancel')
        ) {
          userMessage = 'Request cancelled.';
        } else {
          userMessage = err.message || err.error?.message || 'An unknown error occurred';
        }
      }
    }
    statusMessage = `Error: ${userMessage}`;
    showErrorBanner = true;
    
    console.error('[Register Error]', {
      message: err?.message || userMessage, status: err?.status, data: err?.data
    });
  }

  // Go back to connect step
  function changeWallet() {
    connectedAddress = null;
    username = "";
    email = "";
    fieldErrors = {};
    step = 'connect';
    statusMessage = "Connect your wallet to create an account.";
    showErrorBanner = false;
  }
  
  // Clear field error when user starts typing
  function clearFieldError(field: 'username' | 'email') {
    if (fieldErrors[field]) {
      fieldErrors = { ...fieldErrors, [field]: undefined };
      if (showErrorBanner && Object.values(fieldErrors).every(e => !e)) {
        dismissError();
      }
    }
  }
</script>

<svelte:head>
  <title>Register | DecentraShare Web3</title>
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
      <div class="text-center mb-6">
        <div class="inline-flex items-center justify-center w-18 h-18 rounded-2xl bg-blue-50/30 dark:bg-white/[0.02] transition-transform duration-300 overflow-hidden" 
             class:scale-105={isHovered}>
          <img src={logo} alt="DecentraShare Logo" class="w-full h-full object-contain" />
        </div>

        <h1 class="text-3xl font-bold text-slate-800 dark:text-white tracking-tight">
          Join <span class="bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">DecentraShare</span>
        </h1>
        <p class="text-slate-500 dark:text-gray-400 mt-2 text-sm font-medium">Create your secure Web3 identity</p>
      </div>

      <!-- Step Indicator -->
      {#if !isLoading}
        <div class="flex items-center justify-center gap-2 mb-6">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors duration-300
              {step === 'connect' ? 'bg-blue-600 text-white keep-white' : 'bg-blue-50/50 dark:bg-white/10 text-slate-400 dark:text-gray-400'}">
              1
            </div>
            <span class="text-xs text-slate-400 dark:text-gray-400">Connect</span>
          </div>
          <div class="w-8 h-px bg-slate-200 dark:bg-white/10 transition-colors duration-300"></div>
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors duration-300
              {step === 'form' || step === 'signing' ? 'bg-blue-600 text-white keep-white' : 'bg-blue-50/50 dark:bg-white/10 text-slate-400 dark:text-gray-400'}">
              2
            </div>
            <span class="text-xs text-slate-400 dark:text-gray-400">Details</span>
          </div>
          <div class="w-8 h-px bg-slate-200 dark:bg-white/10 transition-colors duration-300"></div>
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors duration-300
              {step === 'signing' ? 'bg-blue-600 text-white keep-white' : 'bg-blue-50/50 dark:bg-white/10 text-slate-400 dark:text-gray-400'}">
              3
            </div>
            <span class="text-xs text-slate-400 dark:text-gray-400">Sign</span>
          </div>
        </div>
      {/if}

      <!-- STEP 1: Connect Wallet -->
      {#if step === 'connect' && !isLoading}
        <div in:fade>
          
          <button 
            onclick={connectWallet}
            class="group w-full relative overflow-hidden flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-semibold text-base transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.99] cursor-pointer"
          >
            <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
            <svg class="w-5 h-5 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
            </svg>
            <span class="relative z-10">Connect MetaMask</span>
          </button>
        </div>
      {/if}

      <!-- STEP 2: Form (after wallet connected) -->
      {#if step === 'form' && !isLoading}
        <div in:fade>
          <!-- Connected Wallet Badge -->
          <div class="mb-6 p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-500/20 flex items-center justify-between transition-colors duration-300">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
              <span class="text-sm text-blue-800 dark:text-blue-300 font-mono tracking-wide">{formatAddress(connectedAddress!)}</span>
            </div>
            <button onclick={changeWallet} class="text-xs text-blue-650 dark:text-blue-400 hover:text-blue-500 transition-colors cursor-pointer">
              Change
            </button>
          </div>

          <!-- Required Form Fields -->
          <div class="space-y-4 mb-6">
            <!-- Username (REQUIRED) -->
            <div>
              <label class="block text-sm font-medium text-slate-750 dark:text-gray-300 mb-1.5">
                Username <span class="text-red-500 dark:text-red-400">*</span>
              </label>
              <input 
                bind:value={username}
                oninput={() => clearFieldError('username')}
                type="text" 
                placeholder="e.g. web3user"
                maxlength="20"
                class="w-full h-12 px-4 bg-white dark:bg-white/5 border {fieldErrors.username ? 'border-red-500/50' : 'border-slate-250 dark:border-white/10'} rounded-xl text-slate-800 dark:text-white placeholder-slate-450 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
              />
              {#if fieldErrors.username}
                <p class="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.username}</p>
              {/if}
            </div>

            <!-- Email (REQUIRED) -->
            <div>
              <label class="block text-sm font-medium text-slate-750 dark:text-gray-300 mb-1.5">
                Email <span class="text-red-500 dark:text-red-400">*</span>
              </label>
              <input 
                bind:value={email}
                oninput={() => clearFieldError('email')}
                type="email" 
                placeholder="you@example.com"
                class="w-full h-12 px-4 bg-white dark:bg-white/5 border {fieldErrors.email ? 'border-red-500/50' : 'border-slate-250 dark:border-white/10'} rounded-xl text-slate-800 dark:text-white placeholder-slate-450 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
              />
              {#if fieldErrors.email}
                <p class="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.email}</p>
              {/if}
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="space-y-3">
            <button 
              onclick={handleRegister}
              class="group w-full relative overflow-hidden flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-semibold text-base transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.99] cursor-pointer"
            >
              <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              <svg class="w-5 h-5 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span class="relative z-10">Create Account</span>
            </button>
            
            <button 
              onclick={changeWallet}
              class="w-full h-12 backdrop-blur-sm bg-slate-50 dark:bg-white/[0.03] border border-slate-250 dark:border-white/10 text-slate-500 dark:text-gray-400 rounded-2xl font-medium hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer"
            >
              Use Different Wallet
            </button>
          </div>
        </div>
      {/if}

      <!-- Loading State (all steps) -->
      {#if isLoading}
        <div class="flex flex-col items-center justify-center py-8" in:fade>
          <div class="relative">
            <div class="w-14 h-14 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-blue-500 animate-spin"></div>
            <div class="absolute inset-0 w-14 h-14 rounded-full border-4 border-transparent border-b-indigo-500/60 animate-spin" style="animation-duration: 1.5s; animation-direction: reverse"></div>
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            </div>
          </div>
          <p class="mt-5 text-slate-700 dark:text-gray-300 text-sm font-medium">{statusMessage}</p>
          <div class="mt-4 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style="animation-delay: 100ms"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style="animation-delay: 200ms"></span>
          </div>
        </div>
      {/if}

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
      {#if !showErrorBanner && !statusMessage.toLowerCase().includes('error') && !isLoading}
        <div class="mt-6 pt-4 border-t border-slate-200/60 dark:border-white/5 transition-colors duration-300">
          <p class="text-center text-sm text-slate-500 dark:text-gray-400 transition-colors duration-200" 
             class:text-blue-655={statusMessage.toLowerCase().includes('successful')}
             class:dark:text-blue-400={statusMessage.toLowerCase().includes('successful')}>
            {statusMessage}
          </p>
        </div>
      {/if}

      <!-- Login Link -->
      <div class="mt-4 text-center">
        <a href={loginUrl} rel="external" class="text-sm text-blue-600 dark:text-blue-400 hover:text-indigo-500 transition-colors">
          Already have an account? <span class="font-medium">Sign in</span>
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