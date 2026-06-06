<script lang="ts">
  import { authService } from '$lib/services/auth/auth';
  import type { AuthUser } from '$lib/types/auth';
  import logo from '$lib/assets/logo.png';

  // ── Props ──
  let {
    active = 'dashboard',
    subActive = '',
    currentUser = null,
    role = 'USER',
    storageUsage = { usedBytes: 0, quotaBytes: 5 * 1024 * 1024 * 1024, usagePercent: 0, unlimited: false }
  }: {
    active?: string;
    subActive?: string;
    currentUser?: AuthUser | null;
    role?: 'USER' | 'ADMIN';
    storageUsage?: { usedBytes: number; quotaBytes: number | null; usagePercent: number; unlimited?: boolean };
  } = $props();

  function formatBytes(bytes: number) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  // Unlimited bila flag unlimited true, atau quotaBytes null (mis. ADMIN)
  const isUnlimited = $derived(storageUsage.unlimited === true || storageUsage.quotaBytes === null);
  const storagePercent = $derived(Math.min(100, Math.max(0, storageUsage.usagePercent || 0)));
  const storagePercentLabel = $derived(`${Math.round(storagePercent)}%`);
  const storageUsedLabel = $derived(formatBytes(storageUsage.usedBytes));
  const storageQuotaLabel = $derived(storageUsage.quotaBytes ? formatBytes(storageUsage.quotaBytes) : '∞');
  // Warna progress: merah saat hampir penuh
  const isStorageCritical = $derived(!isUnlimited && storagePercent >= 90);
  
  // ── Internal State ──
  let isMobileOpen = $state(false);
  let isSettingsExpanded = $state(active === 'settings');
  let isLoggingOut = $state(false);

  // ── Enhanced Styles with Visual Effects ──
  const STYLES = {
    // Main nav item - Active: Animated gradient + glow
    active: `
      relative overflow-hidden
      bg-gradient-to-r from-blue-600/20 via-purple-600/10 to-transparent
      text-blue-300 font-semibold
      shadow-[inset_0_0_30px_rgba(37,99,235,0.15),0_0_20px_rgba(59,130,246,0.1)]
      border-r-2 border-blue-400
      before:absolute before:inset-0 before:bg-gradient-to-r before:from-blue-500/10 before:via-transparent before:to-transparent
      before:animate-shimmer
    `,
    // Main nav item - Inactive: Subtle hover
    inactive: `
      text-gray-400 hover:text-gray-200
      hover:bg-white/[0.05] hover:shadow-[inset_0_0_15px_rgba(255,255,255,0.03)]
      border-r-2 border-transparent
      transition-all duration-200
    `,
    // Sub nav item - Active
    subActive: `
      bg-gradient-to-r from-blue-600/15 to-transparent
      text-blue-300 font-medium
      border-l-2 border-blue-400 pl-5
      shadow-[inset_0_0_10px_rgba(37,99,235,0.1)]
    `,
    // Sub nav item - Inactive
    subInactive: `
      text-gray-500 hover:text-gray-300
      hover:bg-white/[0.03]
      border-l-2 border-transparent pl-5
      transition-all duration-200
    `,
    // Icon colors
    iconInactive: 'text-gray-500 group-hover:text-gray-300',
    iconActive: 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]'
  } as const;

  // ── Actions ──
  const toggleMobile = () => isMobileOpen = !isMobileOpen;
  const toggleSettings = () => isSettingsExpanded = !isSettingsExpanded;

  const handleLogout = async () => {
    if (isLoggingOut) return;
    isLoggingOut = true;
    try {
      await authService.logout();
      authService.clearClientStorage();
      authService.redirectToLogin();
    } catch (error: any) {
      console.error('[Sidebar] Logout failed:', error);
      authService.redirectToLogin();
    } finally {
      isLoggingOut = false;
    }
  };

  // ── Icons ──
  const Icons = {
    Dashboard: (isActive: boolean) => `<svg class="w-5 h-5 transition-all duration-300 ${isActive ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] scale-110' : 'text-gray-500 group-hover:text-gray-300'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>`,
    Storage: (isActive: boolean) => `<svg class="w-5 h-5 transition-all duration-300 ${isActive ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] scale-110' : 'text-gray-500 group-hover:text-gray-300'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path></svg>`,
    Explore: (isActive: boolean) => `<svg class="w-5 h-5 transition-all duration-300 ${isActive ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] scale-110' : 'text-gray-500 group-hover:text-gray-300'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m1.1-5.4a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"></path></svg>`,
    Shared: (isActive: boolean) => `<svg class="w-5 h-5 transition-all duration-300 ${isActive ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] scale-110' : 'text-gray-500 group-hover:text-gray-300'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>`,
    Validate: (isActive: boolean) => `<svg class="w-5 h-5 transition-all duration-300 ${isActive ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] scale-110' : 'text-gray-500 group-hover:text-gray-300'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>`,
    Trash: (isActive: boolean) => `<svg class="w-5 h-5 transition-all duration-300 ${isActive ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] scale-110' : 'text-gray-500 group-hover:text-gray-300'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-8 0h10"></path></svg>`,
    Settings: (isActive: boolean) => `<svg class="w-5 h-5 transition-all duration-300 ${isActive ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] scale-110' : 'text-gray-500 group-hover:text-gray-300'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>`,
    Admin: (isActive: boolean) => `<svg class="w-5 h-5 transition-all duration-300 ${isActive ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] scale-110' : 'text-gray-500 group-hover:text-gray-300'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>`,
    Profile: (isActive: boolean) => `<svg class="w-4 h-4 transition-all duration-300 ${isActive ? 'text-blue-400' : 'opacity-70 group-hover:opacity-100'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>`,
    Security: (isActive: boolean) => `<svg class="w-4 h-4 transition-all duration-300 ${isActive ? 'text-blue-400' : 'opacity-70 group-hover:opacity-100'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>`,
    Notifications: (isActive: boolean) => `<svg class="w-4 h-4 transition-all duration-300 ${isActive ? 'text-blue-400' : 'opacity-70 group-hover:opacity-100'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>`,
    Logout: () => `<svg class="w-5 h-5 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>`,
    ChevronDown: (expanded: boolean) => `<svg class="w-4 h-4 text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`,
    Menu: () => `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>`,
    Close: () => `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`,
    Spinner: () => `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`,
    // ✨ Active Indicator Dot
    ActiveDot: () => `<span class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-gradient-to-b from-blue-400 to-cyan-400 rounded-r-full shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse"></span>`
  };
</script>

<!-- Mobile Toggle Button -->
<button 
  onclick={toggleMobile}
  class="lg:hidden fixed bottom-6 right-6 z-[110] w-14 h-14 bg-blue-600/80 backdrop-blur-lg text-white rounded-full shadow-[0_8px_32px_rgba(37,99,235,0.4)] flex items-center justify-center active:scale-90 transition-all border border-white/20"
  aria-label="Toggle navigation menu"
  aria-expanded={isMobileOpen}
>
  {@html isMobileOpen ? Icons.Close() : Icons.Menu()}
</button>

<!-- Sidebar Container -->
<aside class="
  fixed lg:sticky top-0 left-0 z-[100] h-screen bg-[#0a0a0c] lg:bg-white/[0.01] 
  border-r border-white/5 backdrop-blur-2xl p-6 flex flex-col 
  transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
  {isMobileOpen ? 'w-72 translate-x-0' : 'w-72 -translate-x-full lg:translate-x-0'}
">
  
  <!-- Logo with Active Glow -->
  <div class="flex items-center gap-3 mb-12 px-2">
    <div class="relative w-10 h-10 rounded-xl overflow-hidden">
      <img src={logo} alt="DecentraShare Logo" class="w-full h-full object-cover" />
    </div>
    <span class="text-2xl font-bold tracking-tighter text-white">
      Decentra<span class="text-blue-400 drop-shadow-[0_0_10px_rgba(59,130,246,0.4)]">Share</span>
    </span>
  </div>

  <!-- Navigation Menu -->
  <nav class="flex-1 space-y-1.5 overflow-y-auto pr-2 custom-scrollbar">
    
    <!-- Dashboard -->
    <a href="/dashboard" 
       class="group relative flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-300
              {active === 'dashboard' ? STYLES.active : STYLES.inactive}">
      {#if active === 'dashboard'}{@html Icons.ActiveDot()}{/if}
      {@html Icons.Dashboard(active === 'dashboard')}
      <span class="transition-transform group-hover:translate-x-0.5">Dashboard</span>
      {#if active === 'dashboard'}
      {/if}
    </a>

    <!-- Storage -->
    <a href="/storage"
       class="group relative flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-300
              {active === 'storage' ? STYLES.active : STYLES.inactive}">
      {#if active === 'storage'}{@html Icons.ActiveDot()}{/if}
      {@html Icons.Storage(active === 'storage')}
      <span class="transition-transform group-hover:translate-x-0.5">Storage</span>
    </a>

    <!-- Explore -->
    <a href="/explore"
       class="group relative flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-300
              {active === 'explore' ? STYLES.active : STYLES.inactive}">
      {#if active === 'explore'}{@html Icons.ActiveDot()}{/if}
      {@html Icons.Explore(active === 'explore')}
      <span class="transition-transform group-hover:translate-x-0.5">Explore</span>
    </a>

    <!-- Shared -->
    <a href="/shared"
       class="group relative flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-300
              {active === 'shared' ? STYLES.active : STYLES.inactive}">
      {#if active === 'shared'}{@html Icons.ActiveDot()}{/if}
      {@html Icons.Shared(active === 'shared')}
      <span class="transition-transform group-hover:translate-x-0.5">Shared With Me</span>
    </a>

    <!-- Validate -->
    <a href="/validate"
       class="group relative flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-300
              {active === 'validate' ? STYLES.active : STYLES.inactive}">
      {#if active === 'validate'}{@html Icons.ActiveDot()}{/if}
      {@html Icons.Validate(active === 'validate')}
      <span class="transition-transform group-hover:translate-x-0.5">Validate</span>
    </a>

    <!-- Trash -->
    <a href="/trash"
       class="group relative flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-300
              {active === 'trash' ? STYLES.active : STYLES.inactive}">
      {#if active === 'trash'}{@html Icons.ActiveDot()}{/if}
      {@html Icons.Trash(active === 'trash')}
      <span class="transition-transform group-hover:translate-x-0.5">Trash</span>
    </a>

    <!-- Contract Activity (Admin Only) -->
    {#if role === 'ADMIN'}
      <a href="/contract-activity"
         class="group relative flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-300
                {active === 'contract-activity' ? STYLES.active : STYLES.inactive}">
        {#if active === 'contract-activity'}{@html Icons.ActiveDot()}{/if}
        <svg class="w-5 h-5 transition-all duration-300 {active === 'contract-activity' ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] scale-110' : 'text-gray-500 group-hover:text-gray-300'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
        <span class="transition-transform group-hover:translate-x-0.5">Smart Contract</span>
      </a>
    {/if}

    <!-- ⚙️ Settings with Submenu -->
    <div class="space-y-1">
      <button 
        onclick={toggleSettings}
        class="group relative w-full flex items-center justify-between gap-3 px-4 py-3.5 
               rounded-xl font-medium transition-all duration-300 
               {active === 'settings' ? STYLES.active : STYLES.inactive}"
        aria-expanded={isSettingsExpanded}
        aria-controls="settings-submenu"
      >
        {#if active === 'settings'}{@html Icons.ActiveDot()}{/if}
        <div class="flex items-center gap-3">
          {@html Icons.Settings(active === 'settings')}
          <span class="transition-transform group-hover:translate-x-0.5">Settings</span>
        </div>
        {@html Icons.ChevronDown(isSettingsExpanded)}
      </button>
      
      <!-- Submenu with Animated Expand -->
      <div id="settings-submenu"
           class="overflow-hidden transition-all duration-300 ease-in-out" 
           style="max-height: {isSettingsExpanded ? '400px' : '0px'}; 
                  opacity: {isSettingsExpanded ? '1' : '0'};">
        <div class="pl-4 space-y-1 pt-1">
          
          <a href="/settings/profile" 
             class="group relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium 
                    transition-all duration-200 
                    {(active === 'settings' && subActive === 'profile') ? STYLES.subActive : STYLES.subInactive}">
            {#if active === 'settings' && subActive === 'profile'}
              <span class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-blue-400 rounded-r animate-pulse"></span>
            {/if}
            {@html Icons.Profile((active === 'settings' && subActive === 'profile'))}
            Profile Setting
          </a>

          {#if role === 'ADMIN'}
            <!-- Manage Users (admin only) -->
            <a href="/settings/users"
               class="group relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium 
                      transition-all duration-200 
                      {(active === 'settings' && subActive === 'users') ? STYLES.subActive : STYLES.subInactive}">
              {#if active === 'settings' && subActive === 'users'}
                <span class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-blue-400 rounded-r animate-pulse"></span>
              {/if}
              {@html Icons.Admin((active === 'settings' && subActive === 'users'))}
              <span class="flex-1">Manage Users</span>
            </a>

            <!-- Set Storage Limit (admin only) -->
            <a href="/settings/set-limit"
               class="group relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium 
                      transition-all duration-200 
                      {(active === 'settings' && subActive === 'set-limit') ? STYLES.subActive : STYLES.subInactive}">
              {#if active === 'settings' && subActive === 'set-limit'}
                <span class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-blue-400 rounded-r animate-pulse"></span>
              {/if}
              {@html Icons.Storage((active === 'settings' && subActive === 'set-limit'))}
              <span class="flex-1">Storage Limit</span>
              </a>
          {/if}
          
         
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="py-2" role="separator">
      <div class="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
    </div>

    <!-- Logout Button with Hover Glow -->
    <button 
      onclick={handleLogout}
      disabled={isLoggingOut}
      class="group relative w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium 
             text-red-400/80 hover:text-red-300
             hover:bg-red-500/10 hover:shadow-[inset_0_0_20px_rgba(239,68,68,0.1)]
             transition-all duration-300 border-r-2 border-transparent 
             hover:border-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
      aria-busy={isLoggingOut}
    >
      {#if isLoggingOut}
        {@html Icons.Spinner()}
        <span>Logging out...</span>
      {:else}
        {@html Icons.Logout()}
        <span class="transition-transform group-hover:-translate-x-0.5">Log Out</span>
        <!-- Subtle hover indicator -->
        <span class="absolute right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
          </svg>
        </span>
      {/if}
    </button>
  </nav>

  <!-- Storage Widget with Animated Progress -->
  <div class="mt-auto space-y-4 pt-6 border-t border-white/5">
    <div class="relative overflow-hidden p-5 rounded-3xl bg-white/[0.03] 
                border border-white/5 shadow-2xl
                hover:shadow-[0_0_30px_rgba(59,130,246,0.1)] transition-shadow duration-300">
      <div class="absolute top-0 right-0 w-24 h-24 bg-blue-600/10 blur-[40px] -z-10 animate-pulse"></div>

      {#if isUnlimited}
        <!-- Unlimited (mis. ADMIN) -->
        <div class="flex items-center justify-between mb-2">
          <p class="text-[10px] text-gray-500 uppercase tracking-widest">Storage</p>
          <span class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-purple-300 bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 rounded">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            Unlimited
          </span>
        </div>
        <p class="text-sm font-bold text-purple-300">
          {storageUsedLabel} <span class="text-sm font-normal text-gray-400">used</span>
        </p>
      {:else}
        <!-- Used / Quota + percentage -->
        <div class="flex justify-between items-end mb-3">
          <div>
            <p class="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Storage</p>
            <p class="text-sm font-bold {isStorageCritical ? 'text-red-400' : 'text-blue-400'}">
              {storageUsedLabel}
              <span class="text-sm font-normal text-gray-400">/ {storageQuotaLabel}</span>
            </p>
          </div>
          <span class="text-sm font-bold {isStorageCritical ? 'text-red-400' : 'text-white'}">{storagePercentLabel}</span>
        </div>

        <!-- Progress bar -->
        <div class="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-700 ease-out
              {isStorageCritical
                ? 'bg-gradient-to-r from-red-500 to-orange-500'
                : 'bg-gradient-to-r from-blue-500 to-cyan-400'}"
            style="width: {storagePercent}%">
          </div>
        </div>

        {#if isStorageCritical}
          <p class="mt-2 text-[10px] text-red-400/90">Storage almost full</p>
        {/if}
      {/if}
    </div>
  </div>
</aside>

<!-- Mobile Overlay -->
{#if isMobileOpen}
  <div 
    onclick={toggleMobile}
    class="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]"
    aria-hidden="true"
  ></div>
{/if}

<style>
  /* Custom Scrollbar */
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { 
    background: rgba(255, 255, 255, 0.05); 
    border-radius: 10px; 
  }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  
  /* Focus States for Accessibility */
  button:focus-visible, a:focus-visible {
    outline: 2px solid rgba(59, 130, 246, 0.5);
    outline-offset: 2px;
  }
  
  /* ✨ Shimmer Animation for Active Gradient */
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  .animate-shimmer {
    animation: shimmer 2.5s ease-in-out infinite;
  }
  
  /* ✨ Subtle Pulse for Active Indicators */
  @keyframes pulse-glow {
    0%, 100% { opacity: 1; box-shadow: 0 0 10px rgba(59,130,246,0.8); }
    50% { opacity: 0.8; box-shadow: 0 0 20px rgba(59,130,246,0.4); }
  }
  .animate-pulse-glow {
    animation: pulse-glow 2s ease-in-out infinite;
  }
  
  /* ✨ Smooth Icon Scale Transition */
  .group:hover .transition-transform {
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }
</style>