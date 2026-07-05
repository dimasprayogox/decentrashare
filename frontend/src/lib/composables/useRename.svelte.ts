import { storageService } from '$lib/services/storage/storage';

export function useRename(onRefresh: () => Promise<void>) {
	let isProcessing = $state(false);
	let pendingRename = $state<{ id: string; type: 'folder' | 'document'; name: string } | null>(
		null
	);

	// Internal: track pending rename
	function _setPending(item: { id: string; type: 'folder' | 'document'; name: string } | null) {
		pendingRename = item;
	}

	// src/lib/composables/useRename.ts

	async function submitRename(newName: string): Promise<{ success: boolean; error?: string }> {
		if (!pendingRename || !newName.trim()) return { success: false, error: 'Name required' };

		const { id, type, name: oldName } = pendingRename;

		if (newName.toLowerCase() === oldName.toLowerCase()) {
			_setPending(null);
			return { success: true };
		}

		try {
			isProcessing = true;

			if (type === 'folder') {
				const result = await storageService.renameFolder(id, newName);

				// ✅ FIX: Handle response yang benar
				// Jika apiClient throw error → caught di catch block
				// Jika sampai sini → berarti HTTP 200, cek strukturnya:

				// Case 1: Backend return { success: false, message: "...", errorCode: "..." }
				if (
					result &&
					typeof result === 'object' &&
					'success' in result &&
					result.success === false
				) {
					if ((result as any).errorCode === 'FOLDER_EXISTS') {
						return { success: false, error: `Folder "${newName}" already exists` };
					}
					return { success: false, error: (result as any).message || 'Failed to rename folder' };
				}
			} else {
				// Document rename (nanti)
				const result = await storageService.renameDocument(id, newName);

				if (
					result &&
					typeof result === 'object' &&
					'success' in result &&
					result.success === false
				) {
					return { success: false, error: (result as any).message || 'Failed to rename document' };
				}
			}

			// ✅ SUCCESS: Refresh data dan reset state
			await onRefresh();
			_setPending(null);
			return { success: true };
		} catch (err: any) {
			console.error('❌ Rename error:', {
				message: err?.message,
				status: err?.status,
				response: err?.response
			});
			return { success: false, error: err?.message || 'Failed to rename' };
		} finally {
			isProcessing = false;
		}
	}

	function cancelRename() {
		_setPending(null);
	}

	return {
		// ❌ Jangan return renamingItem
		isProcessing,
		startRename: _setPending, // Return setter function
		submitRename,
		cancelRename
	};
}
