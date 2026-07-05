// src/lib/types/admin.d.ts
import type { StorageApiResponse } from './storage';

export type UserRole = 'USER' | 'ADMIN';

export interface AdminStorageInfo {
	usedBytes: number;
	quotaBytes: number | null;
	usagePercent: number;
	unlimited?: boolean;
}

export interface AdminUser {
	id: string;
	walletAddress: string;
	username: string | null;
	email: string | null;
	avatarUrl: string | null;
	role: UserRole;
	storageLimit: number | null;
	createdAt: string;
	updatedAt: string;
	_count?: { documents: number; folders: number };
	storage: AdminStorageInfo;
}

export interface AdminUserDetail extends AdminUser {
	bio: string | null;
	website: string | null;
}

export interface AdminPagination {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}

export interface ListUsersResponse extends StorageApiResponse {
	data: {
		users: AdminUser[];
		pagination: AdminPagination;
	};
}

export interface GetUserDetailResponse extends StorageApiResponse {
	data: AdminUserDetail;
}

export interface UpdateUserRoleResponse extends StorageApiResponse {
	data: {
		id: string;
		walletAddress: string;
		username: string | null;
		email: string | null;
		role: UserRole;
		storageLimit: number | null;
		updatedAt: string;
	};
}

export interface UpdateStorageLimitResponse extends StorageApiResponse {
	data: AdminUser & { storage: AdminStorageInfo };
}

export interface ListUsersParams {
	query?: string;
	role?: UserRole;
	page?: number;
	limit?: number;
}
