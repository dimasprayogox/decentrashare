<script lang="ts">
  import { fade, fly, slide } from 'svelte/transition';
  import { authService } from '$lib/services';
  import { goto, invalidateAll } from '$app/navigation';

  // State
  let isLoading = $state(false);
  let statusMessage = $state("Connect your wallet to create an account.");
  let showErrorBanner = $state(false);
  let connectedAddress = $state<string | null>(null);
  let isHovered = $state(false);
  
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
      statusMessage = "✓ Address copied!";
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

      // 4. Success! ✅ REDIRECT CERDAS
      if (regData?.success) {
        const token = regData.data?.token;
        const isProfileComplete = regData.data?.isProfileComplete; // ✅ Ambil flag

        if (token) localStorage.setItem('session_token', token);

        if (!isProfileComplete) {
          statusMessage = "✓ Account created! Silakan lengkapi profil Anda.";
          setTimeout(() => {
            window.location.href = '/settings/profile';
          }, 1500);
        } else {
          statusMessage = "✓ Account created successfully! Redirecting...";
          setTimeout(() => {
            window.location.href = '/dashboard';
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
    const userMessage = err.message || 'An unknown error occurred';
    const statusCode = err.status ? ` (Status: ${err.status})` : '';
    statusMessage = `Error: ${userMessage}${statusCode}`;
    showErrorBanner = true;
    
    console.error('🔴 [Register Error]', {
      message: err.message, status: err.status, data: err.data
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

<div class="min-h-screen w-full flex items-center justify-center p-4 bg-[#0a0a0c] relative overflow-hidden">
  
  <!-- Animated Background Orbs (same as login) -->
  <div class="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px] animate-pulse"></div>
  <div class="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] animate-pulse" style="animation-delay: 1s"></div>
  <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[120px]"></div>

  <!-- Main Card -->
  <div 
    in:fly={{ y: 40, duration: 700, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}
    class="w-full max-w-md relative"
  >
    <!-- Glow effect -->
    <div class="absolute -inset-1 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-blue-600/20 rounded-3xl blur-xl opacity-50"></div>
    
    <div 
      class="relative backdrop-blur-2xl bg-[#0a0a0c]/80 border border-white/10 p-8 rounded-3xl shadow-2xl shadow-black/50"
      onmouseenter={() => isHovered = true}
      onmouseleave={() => isHovered = false}
    >
      
      <!-- Header -->
      <div class="text-center mb-6">
        <div class="inline-flex items-center justify-center w-18 h-18 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-5 border border-white/20 shadow-lg shadow-blue-500/25 transition-transform duration-300" 
             class:scale-105={isHovered}>
          <svg class="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>
          </svg>
        </div>
        <h1 class="text-3xl font-bold text-white tracking-tight">
          Join <span class="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">DecentraShare</span>
        </h1>
        <p class="text-gray-400 mt-2 text-sm">Create your secure Web3 identity</p>
      </div>

      <!-- Step Indicator -->
      {#if !isLoading}
        <div class="flex items-center justify-center gap-2 mb-6">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
              {step === 'connect' ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400'}">
              1
            </div>
            <span class="text-xs text-gray-400">Connect</span>
          </div>
          <div class="w-8 h-px bg-white/10"></div>
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
              {step === 'form' || step === 'signing' ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400'}">
              2
            </div>
            <span class="text-xs text-gray-400">Details</span>
          </div>
          <div class="w-8 h-px bg-white/10"></div>
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
              {step === 'signing' ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400'}">
              3
            </div>
            <span class="text-xs text-gray-400">Sign</span>
          </div>
        </div>
      {/if}

      <!-- STEP 1: Connect Wallet -->
      {#if step === 'connect' && !isLoading}
        <div in:fade>
          
          <button 
            onclick={connectWallet}
            class="group w-full relative overflow-hidden flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl font-semibold text-base transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/30 active:scale-[0.99]"
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
          <div class="mb-6 p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              <span class="text-sm text-gray-300 font-mono tracking-wide">{formatAddress(connectedAddress!)}</span>
            </div>
            <button onclick={changeWallet} class="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              Change
            </button>
          </div>

          <!-- Required Form Fields -->
          <div class="space-y-4 mb-6">
            <!-- Username (REQUIRED) -->
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1.5">
                Username <span class="text-red-400">*</span>
              </label>
              <input 
                bind:value={username}
                oninput={() => clearFieldError('username')}
                type="text" 
                placeholder="e.g. web3user"
                maxlength="20"
                class="w-full h-12 px-4 bg-white/5 border {fieldErrors.username ? 'border-red-500/50' : 'border-white/10'} rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
              />
              {#if fieldErrors.username}
                <p class="mt-1 text-xs text-red-400">{fieldErrors.username}</p>
              {/if}
            </div>

            <!-- Email (REQUIRED) -->
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1.5">
                Email <span class="text-red-400">*</span>
              </label>
              <input 
                bind:value={email}
                oninput={() => clearFieldError('email')}
                type="email" 
                placeholder="you@example.com"
                class="w-full h-12 px-4 bg-white/5 border {fieldErrors.email ? 'border-red-500/50' : 'border-white/10'} rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
              />
              {#if fieldErrors.email}
                <p class="mt-1 text-xs text-red-400">{fieldErrors.email}</p>
              {/if}
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="space-y-3">
            <button 
              onclick={handleRegister}
              class="group w-full relative overflow-hidden flex items-center justify-center gap-3 h-14 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl font-semibold text-base transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/30 active:scale-[0.99]"
            >
              <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              <svg class="w-5 h-5 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span class="relative z-10">Create Account</span>
            </button>
            
            <button 
              onclick={changeWallet}
              class="w-full h-12 backdrop-blur-sm bg-white/[0.03] border border-white/10 text-gray-400 rounded-2xl font-medium hover:bg-white/5 transition-all"
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
            <div class="w-14 h-14 rounded-full border-4 border-white/10 border-t-blue-500 animate-spin"></div>
            <div class="absolute inset-0 w-14 h-14 rounded-full border-4 border-transparent border-b-purple-500/60 animate-spin" style="animation-duration: 1.5s; animation-direction: reverse"></div>
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
            </div>
          </div>
          <p class="mt-5 text-gray-300 text-sm font-medium">{statusMessage}</p>
          <div class="mt-4 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style="animation-delay: 100ms"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-pink-500 animate-bounce" style="animation-delay: 200ms"></span>
          </div>
        </div>
      {/if}

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
      {#if !showErrorBanner && !statusMessage.toLowerCase().includes('error') && !isLoading}
        <div class="mt-6 pt-4 border-t border-white/5">
          <p class="text-center text-sm text-gray-400 transition-colors duration-200" 
             class:text-blue-400={statusMessage.toLowerCase().includes('successful')}>
            {statusMessage}
          </p>
        </div>
      {/if}

      <!-- Login Link -->
      <div class="mt-4 text-center">
        <a href="/login" rel="external" class="text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors">
          Already have an account? <span class="font-medium">Sign in</span>
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