<!-- src/lib/components/storage/ItemMenu.svelte -->
<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing'; 
  
  // ── Props ──
  let {
    itemId,
    itemType,
    itemName,
    itemDescription,
    isOwner = true,
    onRename,
    onEdit,
    onMove,
    onShare,
    onDelete,
    onDownload,
    onRestore,
    trashMode = false
  }: {
    itemId: string;
    itemType: 'folder' | 'document';
    itemName: string;
    itemDescription?: string | null;
    isOwner?: boolean;
    onRename?: (id: string, currentName: string) => Promise<void> | void;
    onEdit?: (id: string, title: string, description: string | null) => Promise<void> | void;
    onMove?: (id: string, type: 'folder' | 'document') => Promise<void> | void;
    onShare?: (id: string, itemType: 'folder' | 'document') => Promise<void> | void;
    onDelete?: (id: string, type: 'folder' | 'document', name: string) => Promise<void> | void;
    onDownload?: (id: string, type: 'folder' | 'document') => Promise<void> | void;
    onRestore?: (id: string, type: 'folder' | 'document', name: string) => Promise<void> | void;
    trashMode?: boolean;
  } = $props();

  // ── State ──
  let isOpen = $state(false);
  let buttonElement: HTMLButtonElement | undefined;
  
  // ✅ UPDATED: Tambahkan placement state untuk animasi arah
  let menuPosition = $state({ 
    top: 0, 
    left: 0, 
    placement: 'bottom' as 'top' | 'bottom' 
  });
  
  let errorMessage = $state("");
  let errorTimer: ReturnType<typeof setTimeout> | undefined;
  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : false;

  // ── Helpers ────────────────────────────────────────────────
  
  function setError(message: string) {
    errorMessage = message;
    if (errorTimer) clearTimeout(errorTimer);
    errorTimer = setTimeout(() => { errorMessage = ""; }, 4000);
  }
  
  function clearError() {
    errorMessage = "";
    if (errorTimer) clearTimeout(errorTimer);
  }

  // ✅ FIXED: Calculate menu position dengan MAX OFFSET ke atas
function updateMenuPosition() {
  if (!buttonElement) return;
  
  const rect = buttonElement.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  
  const menuWidth = 192;
  const menuHeight = 280;
  const spacing = 8;
  
  // ✅ CONFIG: Max jarak dropdown dari trigger saat flip ke atas
  const MAX_UPWARD_OFFSET = 200; // Dropdown max 200px di atas trigger
  
  // position:fixed adalah viewport-relative, JANGAN tambah scrollY/scrollX
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;
  
  let placement: 'top' | 'bottom' = 'bottom';
  let positionTop: number;
  
  // ✅ AUTO-FLIP LOGIC dengan MAX OFFSET constraint
  if (spaceBelow < menuHeight && spaceAbove > spacing) {
    // Tidak cukup ruang di bawah → coba flip ke ATAS
    placement = 'top';
    
    // Hitung posisi ideal di atas trigger
    const idealTop = rect.top - menuHeight - spacing;
    
    // ✅ CONSTRAINT: Jangan biarkan dropdown terlalu jauh di atas trigger
    const maxAllowedTop = rect.top - MAX_UPWARD_OFFSET;
    
    // Gunakan yang lebih "bawah" antara ideal dan max allowed
    positionTop = Math.max(idealTop, maxAllowedTop);
    
    // ✅ Prevent overflow top of viewport (prioritas utama)
    positionTop = Math.max(positionTop, spacing);
    
  } else if (spaceBelow >= spacing) {
    // Cukup ruang di bawah → tampil di BAWAH (default)
    placement = 'bottom';
    positionTop = rect.bottom + spacing;
    
  } else {
    // Edge case: tidak cukup ruang di atas ATAU bawah
    // Fallback: tampil di atas dengan scroll jika perlu
    placement = 'top';
    positionTop = Math.max(rect.top - menuHeight - spacing, spacing);
  }
  
  // Handle horizontal overflow (kanan)
  let positionLeft = rect.right - menuWidth;
  if (positionLeft + menuWidth > viewportWidth - spacing) {
    positionLeft = viewportWidth - menuWidth - spacing;
  }
  positionLeft = Math.max(positionLeft, spacing);
  
  menuPosition = { top: positionTop, left: positionLeft, placement };
}

  // ── Effects ────────────────────────────────────────────────
  
  // ✅ Auto-update position on scroll/resize saat dropdown open
  $effect(() => {
    if (!isOpen) return;
    
    // Initial position dengan delay kecil agar DOM ready
    setTimeout(updateMenuPosition, 0);
    
    function updatePosition() {
      updateMenuPosition();
    }
    
    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  });

  // Close dropdown on outside click
  $effect(() => {
    if (!isOpen) return;
    
    function handleClick(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (buttonElement && !buttonElement.contains(target)) {
        const menuEl = document.querySelector(`[data-menu-id="${itemId}"]`);
        if (!menuEl?.contains(target)) {
          isOpen = false;
        }
      }
    }
    
    document.addEventListener('mousedown', handleClick, { capture: true });
    document.addEventListener('touchstart', handleClick, { capture: true, passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClick, { capture: true });
      document.removeEventListener('touchstart', handleClick, { capture: true });
    };
  });

  // ── Actions dengan Error Handling ──────────────────────────
  
  async function handleRename() {
    try {
      await onRename?.(itemId, itemName);
      isOpen = false;
    } catch (err: any) {
      setError(err.message || 'Failed to rename folder');
    }
  }
  
  async function handleEdit() {
    try {
      await onEdit?.(itemId, itemName, itemDescription ?? null);
      isOpen = false;
    } catch (err: any) {
      setError(err.message || 'Failed to edit document');
    }
  }

  async function handleMove() {
    try {
      isOpen = false;
      await onMove?.(itemId, itemType);
      window.dispatchEvent(new CustomEvent('item-moved', { 
        detail: { itemId, itemType, itemName } 
      }));
    } catch (err: any) {
      setError(err.message || `Failed to move ${itemType}`);
    }
  }
  
  function handleShare() { 
    isOpen = false; 
    onShare?.(itemId, itemType); 
  }
  
  async function handleDelete() {
    try {
      await onDelete?.(itemId, itemType, itemName);
      isOpen = false;
    } catch (err: any) {
      setError(err.message || `Failed to delete ${itemType}`);
    }
  }
  
  async function handleDownload() {
    try {
      isOpen = false;
      await onDownload?.(itemId, itemType);
      window.dispatchEvent(new CustomEvent('download-success', {
        detail: { itemId, itemName }
      }));
    } catch (err: any) {
      const message = err.message || 'Failed to download file';
      window.dispatchEvent(new CustomEvent('download-error', {
        detail: { message, itemName }
      }));
      console.error('❌ Download error:', { itemId, itemName, error: err.message });
    }
  }

  async function handleRestore() {
    try {
      await onRestore?.(itemId, itemType, itemName);
      isOpen = false;
    } catch (err: any) {
      setError(err.message || `Failed to restore ${itemType}`);
    }
  }

  function toggleMenu(e: Event) {
    e.stopPropagation();
    isOpen = !isOpen;
    if (isOpen) {
      // Small delay to ensure DOM is updated for getBoundingClientRect
      setTimeout(updateMenuPosition, 0);
    } else {
      clearError();
    }
  }
</script>

<!-- Three Dots Button -->
<button
  bind:this={buttonElement}
  type="button"
  onclick={toggleMenu}
  class="p-2 m-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 relative z-30 touch-manipulation"
  aria-label="More options for {itemName}"
  aria-expanded={isOpen}
  aria-haspopup="true"
>
  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="6" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="18" r="2" />
  </svg>
</button>

<!-- ✅ Dropdown Menu dengan Auto-Flip Positioning -->
{#if isOpen}
  <div
    data-menu-id={itemId}
    style="
      position: fixed;
      top: {menuPosition.top}px;
      left: {menuPosition.left}px;
      z-index: 99999;
      max-height: 300px;
      overflow-y: auto;
    "
    transition:fly={{ 
      y: menuPosition.placement === 'top' ? 8 : -8,  /* ✅ Animasi sesuai arah */
      duration: 150, 
      easing: cubicOut 
    }}
    class="bg-[#1a1a1e] border border-white/10 rounded-xl shadow-2xl shadow-black/50 py-1 z-[99999] w-48 max-w-[90vw]"
    role="menu"
    onclick={(e) => e.stopPropagation()}
    ontouchstart={(e) => e.stopPropagation()}
  >
    
    <!-- ✅ Inline Error Banner -->
    {#if errorMessage}
      <div class="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
        <div class="flex items-start gap-2">
          <svg class="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p class="text-xs text-red-400 flex-1 leading-tight">{errorMessage}</p>
          <button onclick={clearError} class="p-0.5 hover:bg-red-500/20 rounded transition-colors -mt-0.5" aria-label="Dismiss error">
            <svg class="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    {/if}
    
    {#if trashMode}
      {#if itemType === 'document' && onDownload}
        <button
          onclick={handleDownload}
          class="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-white/10 active:bg-white/20 hover:text-white transition-colors min-h-[44px]"
          role="menuitem"
        >
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          <span class="truncate">Download</span>
        </button>
      {/if}

      <button
        onclick={handleRestore}
        class="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-green-400 hover:bg-green-500/10 active:bg-green-500/20 hover:text-green-300 transition-colors min-h-[44px]"
        role="menuitem"
      >
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a4 4 0 010 8H7m-4-8l4-4m-4 4l4 4"/>
        </svg>
        <span class="truncate">Restore</span>
      </button>

      <div class="my-1 h-px bg-white/10"></div>

      <button
        onclick={handleDelete}
        class="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 active:bg-red-500/20 hover:text-red-300 transition-colors min-h-[44px]"
        role="menuitem"
      >
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
        <span class="truncate">Delete Permanently</span>
      </button>
    {:else}
    <!-- ✅ CONDITIONAL: Folder → Rename, Document → Edit -->
    {#if itemType === 'folder'}
      <button 
        onclick={handleRename} 
        class="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-white/10 active:bg-white/20 hover:text-white transition-colors min-h-[44px]" 
        role="menuitem"
      >
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
        </svg>
        <span class="truncate">Rename</span>
      </button>
    {:else if itemType === 'document'}
      <button 
        onclick={handleEdit} 
        class="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-white/10 active:bg-white/20 hover:text-white transition-colors min-h-[44px]" 
        role="menuitem"
      >
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
        </svg>
        <span class="truncate">Edit</span>
      </button>
    {/if}

    <!-- Move to... (NEW) -->
    {#if isOwner && onMove}
      <button 
        onclick={handleMove} 
        class="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-white/10 active:bg-white/20 hover:text-white transition-colors min-h-[44px]" 
        role="menuitem"
      >
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
        </svg>
        <span class="truncate">Move to...</span>
      </button>
    {/if}

    <!-- Share / Manage Access -->
    {#if isOwner}
      <button 
        onclick={handleShare} 
        class="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-white/10 active:bg-white/20 hover:text-white transition-colors min-h-[44px]" 
        role="menuitem"
      >
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
        </svg>
        <span class="truncate">Share</span>
      </button>
    {/if}

    <!-- Download -->
    {#if onDownload}
      <button 
        onclick={handleDownload} 
        class="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-300 hover:bg-white/10 active:bg-white/20 hover:text-white transition-colors min-h-[44px]" 
        role="menuitem"
      >
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
        </svg>
        <span class="truncate">Download</span>
      </button>
    {/if}

    <!-- Divider -->
    <div class="my-1 h-px bg-white/10"></div>

    <!-- Delete (Danger) -->
    <button 
      onclick={handleDelete} 
      class="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 active:bg-red-500/20 hover:text-red-300 transition-colors min-h-[44px]" 
      role="menuitem"
    >
      <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>
      <span class="truncate">Move to Trash</span>
    </button>
    {/if}
  </div>
{/if}