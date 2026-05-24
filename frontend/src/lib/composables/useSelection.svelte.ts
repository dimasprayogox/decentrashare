// src/lib/composables/useSelection.svelte.ts
import type { Folder, Document } from '$lib/types/storage';

export function useSelection() {
  let selectedItems = $state<string[]>([]);
  let selectionMode = $state(false);

  function toggleSelection(id: string) {
    if (selectedItems.includes(id)) {
      selectedItems = selectedItems.filter(i => i !== id);
    } else {
      selectedItems = [...selectedItems, id];
    }
    selectionMode = selectedItems.length > 0;
  }

  function clearSelection() {
    selectedItems = [];
    selectionMode = false;
  }

  function toggleSelectMode() {
    selectionMode = !selectionMode;
    if (!selectionMode) clearSelection();
  }

  // ✅ Return PLAIN functions dengan explicit selectedIds parameter
  function getSelectedFolders(folders: Folder[], selectedIds: string[]) {
    return folders.filter(f => selectedIds.includes(f.id));
  }
  
  function getSelectedDocuments(items: Document[], selectedIds: string[]) {
    return items.filter(d => selectedIds.includes(d.id));
  }
  
  function getSelectedType(
    folders: Folder[], 
    items: Document[],
    selectedIds: string[]
  ): 'folders' | 'documents' | 'mixed' | 'items' {
    const selectedFolders = folders.filter(f => selectedIds.includes(f.id));
    const selectedDocuments = items.filter(d => selectedIds.includes(d.id));
    if (selectedFolders.length > 0 && selectedDocuments.length > 0) return 'mixed';
    if (selectedFolders.length > 0) return 'folders';
    if (selectedDocuments.length > 0) return 'documents';
    return 'items';
  }

  return {
    selectedItems,
    selectionMode,
    toggleSelection,
    clearSelection,
    toggleSelectMode,
    // ✅ Return plain functions (parent pass selectedItems as arg)
    getSelectedFolders,
    getSelectedDocuments,
    getSelectedType
  };
}