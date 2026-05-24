<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import { userService } from '$lib/services/settings/profile';

  // ── Form State ──
  let profile = $state({ 
    avatarUrl: '', bio: '', website: '', email: '', username: '' 
  });

  // ── Edit States (Per-Field Pattern) ──
  let editingField = $state<'username' | 'email' | 'bio' | 'website' | null>(null);
  let editBuffer = $state({ username: '', email: '', bio: '', website: '' });

  // ── Avatar Upload State ──
  let selectedFile = $state<File | null>(null);
  let avatarPreview = $state<string>('');
  let isUploading = $state(false);
  let isDragging = $state(false);
  let isAvatarHovered = $state(false); // Untuk mobile tap feedback

  // ── UI State ──
  let isLoading = $state(true);
  let isSaving = $state(false);
  let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);
  let fieldErrors = $state<{ 
    avatarUrl?: string; username?: string; email?: string; bio?: string; website?: string;
  }>({});

  // ── Load Profile ──
  onMount(async () => {
    try {
      const res = await userService.getProfile();
      if (res?.success && res?.data) {
        profile = {
          avatarUrl: res.data.avatarUrl ?? '', bio: res.data.bio ?? '', website: res.data.website ?? '',
          email: res.data.email ?? '', username: res.data.username ?? ''
        };
        editBuffer = { username: profile.username, email: profile.email, bio: profile.bio, website: profile.website };
        if (res.data.avatarUrl) avatarPreview = res.data.avatarUrl;
      } else if (res?.message?.toLowerCase().includes('unauthorized')) {
        goto('/login');
      } else {
        message = { type: 'error', text: res?.message || 'Failed to load profile' };
      }
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) { goto('/login'); return; }
      message = { type: 'error', text: 'Failed to load profile' };
    } finally { isLoading = false; }
  });

  // ── Avatar Handlers ──
  function handleAvatarChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    validateAndSetAvatar(file);
  }
  function handleDragOver(e: DragEvent) { e.preventDefault(); isDragging = true; }
  function handleDragLeave(e: DragEvent) { e.preventDefault(); isDragging = false; }
  function handleDrop(e: DragEvent) {
    e.preventDefault(); isDragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) validateAndSetAvatar(file);
  }
  function validateAndSetAvatar(file: File) {
    if (!file.type.startsWith('image/')) { fieldErrors.avatarUrl = 'Images only (PNG, JPG, GIF)'; return; }
    if (file.size > 5 * 1024 * 1024) { fieldErrors.avatarUrl = 'Max 5MB'; return; }
    fieldErrors.avatarUrl = undefined; selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => { avatarPreview = e.target?.result as string; };
    reader.readAsDataURL(file);
  }
  function clearAvatar() { 
    selectedFile = null; 
    avatarPreview = profile.avatarUrl || ''; 
    const input = document.getElementById('avatar-upload') as HTMLInputElement; 
    if (input) input.value = ''; 
  }

  // ── Upload Avatar ──
  async function uploadAvatarToBackend(file: File): Promise<string> {
    const formData = new FormData(); 
    formData.append('avatar', file); 
    const res = await userService.uploadAvatar(formData);
    if (!res.success || !res.data) throw new Error(res.message || 'Upload failed via backend');
    return res.data.avatarUrl;
  }

  // ── Per-Field Edit Functions ──
  function startEdit(field: 'username' | 'email' | 'bio' | 'website') {
    editBuffer[field] = profile[field] || '';
    editingField = field;
    fieldErrors[field] = undefined;
    if (message?.type === 'error') message = null;
  }
  function cancelEdit(field: 'username' | 'email' | 'bio' | 'website') {
    editBuffer[field] = profile[field] || '';
    if (editingField === field) editingField = null;
    fieldErrors[field] = undefined;
  }
  function clearFieldError(field: keyof typeof fieldErrors) {
    if (fieldErrors[field]) { 
      fieldErrors = { ...fieldErrors, [field]: undefined }; 
      if (message?.type === 'error') message = null; 
    }
  }

  // ── Validation ──
  function validateField(field: 'username' | 'email' | 'bio' | 'website', value: string): string | undefined {
    switch (field) {
      case 'username':
        if (!value) return 'Username required';
        if (value.length < 3) return 'Min 3 characters';
        if (value.length > 20) return 'Max 20 characters';
        if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Only letters, numbers, underscore';
        break;
      case 'email':
        if (!value) return 'Email required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Invalid email format';
        break;
      case 'bio': if (value.length > 200) return 'Max 200 chars'; break;
      case 'website': if (value && !/^https?:\/\/.+/.test(value)) return 'Invalid URL'; break;
    }
    return undefined;
  }

  // ── Save Single Field ──
  async function saveField(field: 'username' | 'email' | 'bio' | 'website') {
    const value = editBuffer[field]?.trim() || null;
    const error = validateField(field, editBuffer[field] || '');
    if (error) { fieldErrors[field] = error; message = { type: 'error', text: 'Please fix the errors' }; return; }
    isSaving = true; message = null;
    try {
      const updateData: Record<string, string | null> = { [field]: value };
      const res = await userService.updateProfile(updateData);
      if (!res.success) throw new Error(res.message || 'Failed to update profile');
      profile[field] = value || '';
      editingField = null;
      message = { type: 'success', text: `${field.charAt(0).toUpperCase() + field.slice(1)} updated!` };
      await invalidateAll();
    } catch (err: any) { message = { type: 'error', text: err.message || 'Save failed' }; } 
    finally { isSaving = false; }
  }

  // ── Save Profile (Avatar + Redirect) ──
  async function saveProfile() {
    if (selectedFile) {
      isUploading = true;
      try {
        const avatarUrl = await uploadAvatarToBackend(selectedFile);
        profile.avatarUrl = avatarUrl;
        selectedFile = null;
        avatarPreview = avatarUrl;
        message = { type: 'success', text: 'Avatar updated!' };
      } catch (err: any) { message = { type: 'error', text: err.message || 'Upload failed' }; return; } 
      finally { isUploading = false; }
    }
    if (editingField) await saveField(editingField);
    await invalidateAll();
    setTimeout(() => goto('/dashboard'), 1000);
  }

  function skipForNow() { goto('/dashboard'); }
  function getInitials(): string { const name = profile.username || profile.bio?.trim() || 'U'; return name.charAt(0).toUpperCase(); }
  function formatUsernameDisplay(): string { return profile.username ? `@${profile.username}` : 'Set username'; }
  function formatValue(value: string | null | undefined, field: string): string {
    if (!value) return field === 'username' ? 'Not set' : 'Not added yet';
    if (field === 'username') return `@${value}`;
    if (field === 'website' && !value.startsWith('http')) return `https://${value}`;
    return value;
  }
  function getCompletionCount(): number { return [profile.username, profile.email, profile.avatarUrl, profile.bio, profile.website].filter(Boolean).length; }
</script>

<svelte:head><title>{profile.username || 'Profile'} • DecentraShare</title></svelte:head>

<div class="w-full min-h-[calc(100vh-4rem)] bg-[#050507] px-4 py-6 md:px-6 md:py-8">
  <div class="max-w-6xl mx-auto">
    
    <!-- 🎴 Dashboard Card -->
    <div transition:fly={{ y: 20, duration: 400, easing: 'cubic-bezier(0.16,1,0.3,1)' }} 
         class="relative backdrop-blur-2xl bg-[#0a0a0f]/80 border border-white/10 rounded-2xl shadow-xl shadow-black/30 overflow-hidden">
      
      <!-- Top Accent -->
      <div class="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500"></div>
      
      <!-- Header: Title Left + Progress Right -->
      <div class="px-5 py-4 md:px-6 md:py-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <!-- Left: Title -->
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-cyan-500 flex items-center justify-center">
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
          </div>
          <div>
            <h1 class="text-base md:text-lg font-semibold text-white">Profile Settings</h1>
            <p class="text-xs text-gray-500 hidden sm:block">View and manage your account</p>
          </div>
        </div>
        
        <!-- Right: Profile Completion Progress -->
       {#if !isLoading}
        <div class="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
          <div class="flex items-center gap-2 text-xs text-gray-400">
            <span class="sm:inline hidden">Progress:</span>
            <span class="font-medium text-white">{getCompletionCount()}/5</span>
          </div>
          <div class="flex-1 sm:w-132 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div 
              class="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-full transition-all duration-500 ease-out" 
              style="width: {(getCompletionCount() / 5) * 100}%"></div>
          </div>
        </div>
        {/if}
      </div>

      {#if isLoading}
        <div class="p-6 md:p-8 flex flex-col items-center justify-center min-h-[300px]" in:fade>
          <div class="w-10 h-10 rounded-full border-2 border-white/10 border-t-blue-500 animate-spin"></div>
          <p class="mt-4 text-gray-400 text-sm">Loading profile...</p>
        </div>
      {:else}
        <div class="p-5 md:p-6 space-y-5 md:space-y-6">
          
          <!-- 🖼️ AVATAR SECTION - Enhanced UX -->
          <div class="grid grid-cols-1 md:grid-cols-2 items-center md:items-start gap-8 md:gap-12 pb-5 md:pb-6 border-b border-white/5">
            
    <!-- Left: Avatar Upload with Clear Edit Indicator -->
    <div class="flex flex-col items-center w-full">
      <div class="w-fit text-center">
        
        <!-- Avatar Container -->
        <div 
          role="button" tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && document.getElementById('avatar-upload')?.click()}
          ondragover={handleDragOver} ondragleave={handleDragLeave} ondrop={handleDrop}
          onclick={() => document.getElementById('avatar-upload')?.click()}
          onmouseenter={() => isAvatarHovered = true}
          onmouseleave={() => isAvatarHovered = false}
          ontouchstart={() => isAvatarHovered = true}
          ontouchend={() => isAvatarHovered = false}
          class="relative group cursor-pointer {isDragging ? 'ring-4 ring-blue-500/50' : ''}"
        >
          {#if isDragging}
            <div class="absolute inset-0 bg-blue-500/30 border-2 border-dashed border-blue-400 rounded-full flex items-center justify-center z-30 backdrop-blur-sm">
              <svg class="w-8 h-8 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
            </div>
          {/if}
          
          <div class="relative">
            <!-- Avatar Circle (Tetap ada sedikit scale up fotonya agar dinamis) -->
            <div class="w-56 h-56 rounded-full overflow-hidden bg-gradient-to-br from-blue-500/20 to-purple-500/20 border-4 border-white/10 flex items-center justify-center shadow-lg shadow-black-500/20 ring-4 transition-all">
              {#if avatarPreview}
                <img src={avatarPreview} alt="Avatar" class="w-full h-full object-cover transition-transform group-hover:scale-105" onerror={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'} />
              {:else}
                <span class="text-4xl md:text-5xl font-bold bg-gradient-to-br from-blue-400 to-purple-400 bg-clip-text text-transparent">{getInitials()}</span>
              {/if}
            </div>
            
            <!-- 📱 Edit Badge - Hanya bagian ini yang merespon hover (membesar dan efek shadow naik) -->
            <div class="absolute bottom-2 right-2 sm:right-6 w-11 h-11 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center border-3 border-[#0a0a0f] shadow-lg group-hover:scale-110 group-hover:shadow-purple-500/50 transition-all duration-300">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
            </div>
          </div>
          
          <input id="avatar-upload" type="file" accept="image/*" class="hidden" onchange={handleAvatarChange} aria-label="Change profile photo" />
        </div>
        
        <!-- Helper Text -->
        <div class="mt-4 text-center">
          {#if selectedFile}
            <div class="inline-flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
              <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span class="text-sm text-gray-300 truncate max-w-[200px]">{selectedFile.name}</span>
              <button type="button" onclick={(e) => { e.stopPropagation(); clearAvatar(); }} class="text-red-400 hover:text-red-300 text-sm">✕</button>
            </div>
            <button type="button" onclick={saveProfile} disabled={isUploading} class="mt-3 px-4 py-2 text-xs font-medium text-white bg-blue-500 rounded-lg transition-colors disabled:opacity-50">
              {isUploading ? 'Uploading...' : 'Save Avatar'}
            </button>
          {:else}
            
          {/if}
          {#if fieldErrors.avatarUrl}<p class="mt-2 text-xs text-red-400">{fieldErrors.avatarUrl}</p>{/if}
        </div>
      </div>
    </div>

            <!-- Right: Info Fields (Per-Field Edit - Works on Mobile Too!) -->
            <div class="w-full space-y-5">
              
              <!-- 👤 Username -->
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">Username</label>
                {#if editingField === 'username'}
                  <!-- Edit Mode -->
                  <div class="flex flex-col sm:flex-row gap-2">
                    <div class="relative flex-1">
                      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">@</span>
                      <input bind:value={editBuffer.username} oninput={() => clearFieldError('username')} type="text" placeholder="username" maxlength="20" autofocus class="w-full h-10 pl-7 pr-3 bg-white/5 border {fieldErrors.username ? 'border-red-500/50' : 'border-white/10'} rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all text-sm" />
                    </div>
                    <div class="flex gap-2">
                      <button type="button" onclick={() => cancelEdit('username')} class="px-4 h-10 bg-white/5 border border-white/10 text-gray-400 rounded-lg text-sm hover:bg-white/10 transition-colors whitespace-nowrap">Cancel</button>
                      <button type="button" onclick={() => saveField('username')} disabled={isSaving} class="px-4 h-10 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors whitespace-nowrap disabled:opacity-50">Save</button>
                    </div>
                  </div>
                  {#if fieldErrors.username}<p class="mt-1 text-xs text-red-400">{fieldErrors.username}</p>{/if}
                  <p class="mt-1 text-xs text-gray-500">3-20 chars, letters/numbers/underscore</p>
                {:else}
                  <!-- View Mode -->
                  <div class="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg active:bg-white/10 transition-colors sm:group hover:border-white/20">
                    <span class="font-medium text-white">{formatValue(profile.username, 'username')}</span>
                    <button type="button" onclick={() => startEdit('username')} class="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors flex items-center gap-1.5 min-h-[32px]">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                      <span class="sm:inline hidden">Change</span>
                    </button>
                  </div>
                {/if}
              </div>

              <!-- ✉️ Email -->
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
                {#if editingField === 'email'}
                  <div class="flex flex-col sm:flex-row gap-2">
                    <input bind:value={editBuffer.email} oninput={() => clearFieldError('email')} type="email" placeholder="you@example.com" autofocus class="flex-1 h-10 px-3 bg-white/5 border {fieldErrors.email ? 'border-red-500/50' : 'border-white/10'} rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all text-sm" />
                    <div class="flex gap-2">
                      <button type="button" onclick={() => cancelEdit('email')} class="px-4 h-10 bg-white/5 border border-white/10 text-gray-400 rounded-lg text-sm hover:bg-white/10 transition-colors whitespace-nowrap">Cancel</button>
                      <button type="button" onclick={() => saveField('email')} disabled={isSaving} class="px-4 h-10 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors whitespace-nowrap disabled:opacity-50">Save</button>
                    </div>
                  </div>
                  {#if fieldErrors.email}<p class="mt-1 text-xs text-red-400">{fieldErrors.email}</p>{/if}
                {:else}
                  <div class="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg active:bg-white/10 transition-colors sm:group hover:border-white/20">
                    <span class="text-white truncate">{formatValue(profile.email, 'email')}</span>
                    <button type="button" onclick={() => startEdit('email')} class="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors flex items-center gap-1.5 min-h-[32px]">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                      <span class="sm:inline hidden">Change</span>
                    </button>
                  </div>
                {/if}
              </div>

            </div>
          </div>

          <!-- ✍️ Bio (Per-Field Edit) -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label for="bio" class="text-sm font-medium text-gray-300">Bio</label>
              {#if editingField !== 'bio'}
                <button type="button" onclick={() => startEdit('bio')} class="text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors flex items-center gap-1 active:opacity-80">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                  <span class="sm:inline hidden">Change</span>
                </button>
              {/if}
            </div>
            {#if editingField === 'bio'}
              <div>
                <textarea id="bio" bind:value={editBuffer.bio} oninput={() => clearFieldError('bio')} maxlength="200" rows="3" placeholder="Tell us about yourself..." autofocus class="w-full px-4 py-3 bg-white/5 border {fieldErrors.bio ? 'border-red-500/50' : 'border-white/10'} rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all resize-none text-sm"></textarea>
                <div class="flex justify-between items-center mt-2">
                  {#if fieldErrors.bio}<p class="text-xs text-red-400">{fieldErrors.bio}</p>{:else}<span></span>{/if}
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500"><span class={editBuffer.bio?.length === 200 ? 'text-orange-400' : ''}>{editBuffer.bio?.length || 0}</span>/200</span>
                    <button type="button" onclick={() => cancelEdit('bio')} class="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors">Cancel</button>
                    <button type="button" onclick={() => saveField('bio')} disabled={isSaving} class="px-3 py-1.5 text-xs text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50">Save</button>
                  </div>
                </div>
              </div>
            {:else}
              <div class="p-3 bg-white/5 border border-white/10 rounded-lg min-h-[80px] active:bg-white/10 transition-colors">
                <p class="text-gray-500 text-sm">{profile.bio || 'No bio added yet.'}</p>
              </div>
            {/if}
          </div>

          <!-- 🌐 Website (Per-Field Edit) -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label for="website" class="text-sm font-medium text-gray-300">Website</label>
              {#if editingField !== 'website'}
                <button type="button" onclick={() => startEdit('website')} class="text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors flex items-center gap-1 active:opacity-80">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                  <span class="sm:inline hidden">Change</span>
                </button>
              {/if}
            </div>
            {#if editingField === 'website'}
              <div>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">https://</span>
                  <input id="website" bind:value={editBuffer.website} oninput={() => clearFieldError('website')} type="url" placeholder="your-domain.com" autofocus class="w-full h-10 pl-16 pr-3 bg-white/5 border {fieldErrors.website ? 'border-red-500/50' : 'border-white/10'} rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all text-sm" />
                </div>
                <div class="flex justify-end items-center mt-2 gap-2">
                  {#if fieldErrors.website}<p class="text-xs text-red-400 mr-auto">{fieldErrors.website}</p>{/if}
                  <button type="button" onclick={() => cancelEdit('website')} class="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors">Cancel</button>
                  <button type="button" onclick={() => saveField('website')} disabled={isSaving} class="px-3 py-1.5 text-xs text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50">Save</button>
                </div>
              </div>
            {:else}
              <div class="p-3 bg-white/5 border border-white/10 rounded-lg active:bg-white/10 transition-colors">
                {#if profile.website}
                  <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 text-sm transition-colors break-all">
                    {formatValue(profile.website, 'website')}
                  </a>
                {:else}
                  <p class="text-gray-500 text-sm">No website added yet.</p>
                {/if}
              </div>
            {/if}
          </div>

          <!-- 📢 Message Banner -->
          {#if message}
            <div transition:fade={{ duration: 200 }} class="p-3 rounded-lg {message.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'} text-sm flex items-start gap-3">
              {#if message.type === 'success'}
                <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              {:else}
                <svg class="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              {/if}
              <span class="flex-1">{message.text}</span>
              <button type="button" onclick={() => message = null} class="opacity-60 hover:opacity-100 transition-opacity -mr-1 -mt-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          {/if}

        </div>
      {/if}

    </div>
  </div>
</div>