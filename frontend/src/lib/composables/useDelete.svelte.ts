// src/lib/composables/useDelete.svelte.ts
import { storageService } from '$lib/services/storage/storage';

export interface DeleteItem {
	id: string;
	type: 'folder' | 'document';
	name: string;
}

export function useDelete(onRefresh: () => Promise<void>) {
	// Internal state (tidak di-return)
	let _deletingItem = $state<DeleteItem | null>(null);
	let _bulkDeleteItems = $state<DeleteItem[]>([]);
	let _isProcessing = $state(false);
	let _isPermanent = $state(false); // ✅ Track mode: soft vs permanent delete

	// Internal setters
	function _setDeletingItem(item: DeleteItem | null) {
		_deletingItem = item;
	}
	function _setBulkDeleteItems(items: DeleteItem[]) {
		_bulkDeleteItems = items;
	}
	function _setIsPermanent(permanent: boolean) {
		_isPermanent = permanent;
	}

	// ── SINGLE DELETE ──────────────────────────────────────────

	// Public: Confirm single delete (default = soft delete)
	function confirmDelete(item: DeleteItem, isPermanent = false) {
		_setDeletingItem(item);
		_setIsPermanent(isPermanent);
	}

	// src/lib/composables/useDelete.svelte.ts

	async function executeDelete(): Promise<{ success: boolean; error?: string }> {
		if (!_deletingItem) return { success: false, error: 'No item to delete' };
		const { id, type, name } = _deletingItem;

		try {
			_isProcessing = true;

			if (type === 'folder') {
				// ✅ GANTI INI:
				// ❌ await storageService.deleteFolders([id]);  // ← Hard delete!

				// ✅ PAKAI INI untuk soft delete:
				if (_isPermanent) {
					// 🔥 Permanent delete (hanya di Trash page)
					await storageService.destroyFolders?.([id]);
				} else {
					// 🗑️ Soft delete default (Move to Trash)
					await storageService.archiveFolders([id]); // ← ✅ SOFT DELETE
				}
			} else {
				// Document (sudah benar)
				if (_isPermanent) {
					await storageService.destroyDocuments([id]);
				} else {
					await storageService.archiveDocuments([id]);
				}
			}

			await onRefresh();
			_setDeletingItem(null);
			_setIsPermanent(false);
			return { success: true };
		} catch (err: any) {
			console.error('❌ Delete failed:', { item: _deletingItem, error: err.message });
			return { success: false, error: err.message || `Failed to delete ${name}` };
		} finally {
			_isProcessing = false;
		}
	}

	function cancelDelete() {
		_setDeletingItem(null);
		_setIsPermanent(false);
	}

	// ── BULK DELETE ──────────────────────────────────────────

	// Public: Confirm bulk delete (default = soft delete)
	function confirmBulkDelete(items: DeleteItem[], isPermanent = false) {
		_setBulkDeleteItems(items);
		_setIsPermanent(isPermanent);
	}

	async function executeBulkDelete(): Promise<{ success: boolean; error?: string }> {
		if (_bulkDeleteItems.length === 0) return { success: false, error: 'No items to delete' };

		try {
			_isProcessing = true;

			const folderIds = _bulkDeleteItems.filter((i) => i.type === 'folder').map((i) => i.id);
			const documentIds = _bulkDeleteItems.filter((i) => i.type === 'document').map((i) => i.id);

			if (_isPermanent) {
				// 🔥 Permanent delete
				if (folderIds.length > 0) await storageService.destroyFolders?.(folderIds);
				if (documentIds.length > 0) await storageService.destroyDocuments(documentIds);
			} else {
				// 🗑️ Soft delete (DEFAULT)
				if (folderIds.length > 0) {
					// ✅ GANTI: deleteFolders → archiveFolders
					await storageService.archiveFolders(folderIds); // ← SOFT DELETE
				}
				if (documentIds.length > 0) {
					await storageService.archiveDocuments(documentIds);
				}
			}

			await onRefresh();
			_setBulkDeleteItems([]);
			_setIsPermanent(false);
			return { success: true };
		} catch (err: any) {
			console.error('❌ Bulk delete failed:', { error: err.message });
			return { success: false, error: err.message || 'Failed to delete selected items' };
		} finally {
			_isProcessing = false;
		}
	}
	function cancelBulkDelete() {
		_setBulkDeleteItems([]);
		_setIsPermanent(false);
	}

	// ── PUBLIC API ──────────────────────────────────────────

	return {
		// State
		isProcessing: _isProcessing,
		deletingItem: _deletingItem, // Untuk modal confirmation single
		bulkDeleteItems: _bulkDeleteItems, // Untuk modal confirmation bulk
		isPermanent: _isPermanent, // Untuk label modal: "Move to Trash" vs "Delete Permanently"

		// Single delete actions
		confirmDelete,
		executeDelete,
		cancelDelete,

		// Bulk delete actions
		confirmBulkDelete,
		executeBulkDelete,
		cancelBulkDelete
	};
}
