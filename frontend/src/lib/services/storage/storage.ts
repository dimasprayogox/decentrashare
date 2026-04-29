import { apiClient } from '../axios';

export const storageService = {
    // Ambil semua data (file & folder)
    getFolders: () => apiClient('/folders'),


    // Ambil file yang baru saja diakses (untuk Quick Access)
    getRecentFiles: () => apiClient('/documents/recent'),

    async uploadDocument(file: File, folderId: string | null = null) {
        const formData = new FormData();
        formData.append('file', file);
        
        // Pastikan key-nya sesuai dengan yang diminta backend (misal: folderId)
        if (folderId) {
            formData.append('folderId', folderId);
        }

        // Panggil apiClient dengan method POST dan body FormData
        return await apiClient('/documents/upload', {
            method: 'POST',
            // PENTING: Biarkan browser yang mengatur Content-Type untuk FormData
            // Jangan tambahkan 'Content-Type': 'multipart/form-data' di sini
            body: formData 
        });
    },

    // Buat folder baru
    async createFolder(folderName: string) {
        return await apiClient('/folders', {
            method: 'POST',
            body: JSON.stringify({ name: folderName }) 
        });
    },

    // Tambahkan parameter optional folderId
    getDocuments: (folderId: string | null = null) => {
        const url = folderId ? `/documents?folderId=${folderId}` : '/documents';
        return apiClient(url);
    },
    // ...

    // Hapus item berdasarkan ID
    deleteItem: (id: string) => apiClient(`/storage/${id}`, {
        method: 'DELETE'
    })
};