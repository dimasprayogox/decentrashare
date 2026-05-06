import { apiClient } from '../axios';

export const storageService = {
    // 1. Ambil folder (Root)
    // 2. Ambil dokumen (Root atau Filter by folderId)
    getDocuments: (folderId: string | null = null) => {
        const url = folderId ? `/documents?folderId=${folderId}` : '/documents';
        return apiClient(url);
    },

    getFolderPath: async (folderId: string) => {
        return await apiClient(`/folders/path/${folderId}`, {
            method: 'GET'
        });
    },

    // 3. Ambil file terbaru
    getRecentFiles: () => apiClient('/documents/recent'),

    /**
     * FUNGSI UPLOAD UTAMA (MULTIPLE)
     * Kita gunakan satu fungsi saja yang menerima FormData
     */
    uploadMultipleFiles: async (formData: FormData) => {
        // Menggunakan apiClient agar seragam dengan fungsi lainnya
        // Jangan set 'Content-Type' manual, biarkan browser yang menangani boundary-nya
        return await apiClient('/documents/upload', {
            method: 'POST',
            body: formData
        });
    },

    
    getFolders: (parentId: string | null = null) => {
        // Kirim parentId sebagai query parameter agar backend bisa memfilter
        const url = parentId ? `/folders?parentId=${parentId}` : '/folders';
        return apiClient(url);
    },

    // 4. Buat folder baru
    createFolder: async (folderName: string, parentId: string | null = null) => {
        return await apiClient('/folders', {
            method: 'POST',
            body: JSON.stringify({ name: folderName, parentId }) // Kita bisa tambahkan parentId jika ingin buat subfolder
        });
    },

    // 5. Hapus item (File/Folder)
    deleteItem: (id: string) => apiClient(`/storage/${id}`, {
        method: 'DELETE'
    })
};