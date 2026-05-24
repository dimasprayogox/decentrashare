import { apiClient } from '../apiClient';

export interface UserProfile {
  id: string;
  walletAddress: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileResponse {
  success: boolean;
  data: UserProfile;
  message?: string;
  errorCode?: string;
}

// Tambahan interface untuk menangkap kembalian URL dari backend setelah upload
export interface UploadAvatarResponse {
  success: boolean;
  data: {
    avatarUrl: string; 
  };
  message?: string;
}

export const userService = {
  async getProfile(): Promise<UserProfileResponse> {
    try {
      // ✅ Diperbaiki menjadi /users/me sesuai instruksi komentar
      const response = await apiClient('/users/me', { method: 'GET' });
      return response;
    } catch (err: any) {
      console.error('[userService] getProfile error:', {
        message: err.message,
        status: err.status,
        data: err.data
      });
      throw err;
    }
  },

  async updateProfile(payload: {
    avatarUrl?: string | null;
    bio?: string | null;
    website?: string | null;
  }): Promise<UserProfileResponse> {
    try {
      // ✅ Diperbaiki menjadi /users/me sesuai instruksi komentar
      const response = await apiClient('/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return response;
    } catch (err: any) {
      console.error('[userService] updateProfile error:', {
        message: err.message,
        status: err.status,
        data: err.data
      });
      throw err;
    }
  },

  // ✅ Fungsi baru untuk mengunggah avatar ke backend
  async uploadAvatar(formData: FormData): Promise<UploadAvatarResponse> {
    try {
      // Ingat: Jangan tambahkan 'Content-Type': 'multipart/form-data' di header.
      // Browser dan apiClient akan otomatis menanganinya karena kita mengirim FormData.
      // Catatan: Pastikan endpoint '/users/avatar' ini sesuai dengan rute di Express/Backend Bos.
      const response = await apiClient('/users/me/avatar', {
        method: 'PATCH',
        body: formData
      });
      return response;
    } catch (err: any) {
      console.error('[userService] uploadAvatar error:', {
        message: err.message,
        status: err.status,
        data: err.data
      });
      throw err;
    }
  }
};