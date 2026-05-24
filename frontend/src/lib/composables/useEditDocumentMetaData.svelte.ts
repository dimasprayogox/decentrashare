import { storageService } from '$lib/services/storage/storage';

export interface EditMetadata {
  id: string;
  title: string;
  description: string | null;
}

export function useEditDocumentMetadata(onRefresh: () => Promise<void>) {
  let isProcessing = $state(false);
  let pendingEdit = $state<EditMetadata | null>(null);
  let editTitle = $state('');
  let editDescription = $state('');

  // Internal setters
  function _setPending(item: EditMetadata | null) { pendingEdit = item; }
  function _setTitle(value: string) { editTitle = value; }
  function _setDescription(value: string) { editDescription = value; }

  // Public: Open edit modal with current values
  function startEdit(item: { id: string; title: string; description?: string | null }) {
    _setPending({ id: item.id, title: item.title, description: item.description ?? null });
    _setTitle(item.title);
    _setDescription(item.description ?? '');
  }

  // Public: Update local state (for input binding)
  function updateTitle(value: string) { _setTitle(value); }
  function updateDescription(value: string) { _setDescription(value); }

  // Public: Submit edit to backend
  async function submitEdit(): Promise<{ success: boolean; error?: string }> {
    if (!pendingEdit) return { success: false, error: 'No item to edit' };
    
    const { id, title: oldTitle, description: oldDescription } = pendingEdit;
    
    // Check if anything actually changed
    const titleChanged = editTitle.trim() !== oldTitle;
    const descChanged = (editDescription?.trim() || null) !== (oldDescription?.trim() || null);
    
    if (!titleChanged && !descChanged) {
      _setPending(null);
      return { success: true }; // No changes needed
    }
    
    try {
      isProcessing = true;
      
      // Call API with only changed fields (partial update)
      const updates: { title?: string; description?: string | null } = {};
      if (titleChanged) updates.title = editTitle.trim();
      if (descChanged) updates.description = editDescription.trim() || null;
      
      const result = await storageService.updateDocumentMetadata(id, updates);
      
      if (result.success === false) {
        return { success: false, error: result.message || 'Failed to update document' };
      }
      
      await onRefresh();
      _setPending(null);
      return { success: true };
      
    } catch (err: any) {
      console.error('❌ Edit failed:', err);
      return { success: false, error: err.message || 'Failed to update document' };
    } finally {
      isProcessing = false;
    }
  }

  // Public: Cancel edit
  function cancelEdit() {
    _setPending(null);
  }

  // Public: Reset to original values
  function resetEdit() {
    if (pendingEdit) {
      _setTitle(pendingEdit.title);
      _setDescription(pendingEdit.description ?? '');
    }
  }

  return {
    // State
    isProcessing,
    pendingEdit,
    editTitle,
    editDescription,
    
    // Actions
    startEdit,
    updateTitle,
    updateDescription,
    submitEdit,
    cancelEdit,
    resetEdit
  };
}