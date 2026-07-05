// src/lib/services/admin/admin.ts
import { apiClient } from '../apiClient';
import type {
	ListUsersResponse,
	GetUserDetailResponse,
	UpdateUserRoleResponse,
	UpdateStorageLimitResponse,
	ListUsersParams,
	UserRole
} from '$lib/types/admin';

// ── Helper: Build query string ─────────────────────────────
function buildQueryString(params: Record<string, string | number | null | undefined>): string {
	const searchParams = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value !== null && value !== undefined && value !== '') {
			searchParams.append(key, String(value));
		}
	});
	const qs = searchParams.toString();
	return qs ? `?${qs}` : '';
}

export const adminService = {
	/**
	 * GET /api/admin/users
	 * Daftar user dengan pencarian, filter role, dan pagination.
	 */
	listUsers: (params: ListUsersParams = {}) => {
		const qs = buildQueryString({
			query: params.query,
			role: params.role,
			page: params.page,
			limit: params.limit
		});
		return apiClient<ListUsersResponse>(`/admin/users${qs}`, { method: 'GET' });
	},

	/**
	 * GET /api/admin/users/:userId
	 * Detail satu user beserta penggunaan storage.
	 */
	getUserDetail: (userId: string) => {
		return apiClient<GetUserDetailResponse>(`/admin/users/${userId}`, { method: 'GET' });
	},

	/**
	 * PATCH /api/admin/users/:userId/role
	 * Ubah role user lain.
	 */
	updateUserRole: (userId: string, role: UserRole) => {
		return apiClient<UpdateUserRoleResponse>(`/admin/users/${userId}/role`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ role })
		});
	},

	/**
	 * PATCH /api/admin/users/:userId/storage-limit
	 * Atur batas penyimpanan user. Bisa kirim bytes atau GB.
	 */
	updateStorageLimit: (
		userId: string,
		payload: { storageLimitBytes?: number; storageLimitGB?: number }
	) => {
		return apiClient<UpdateStorageLimitResponse>(`/admin/users/${userId}/storage-limit`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
	}
};
