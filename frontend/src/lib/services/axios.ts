import { PUBLIC_API_BASE_URL } from '$env/static/public';

const BASE_URL = PUBLIC_API_BASE_URL;

export const apiClient = async (endpoint: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('session_token');
    
    // Siapkan headers
    const headers: Record<string, string> = {
        'Authorization': token ? `Bearer ${token}` : '',
        ...((options.headers as Record<string, string>) || {}),
    };

    // OTOMATIS TAMBAHKAN JSON HEADER jika ada body dan bukan FormData
    if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Server Error' }));
        throw new Error(error.message || 'Terjadi kesalahan server');
    }
    
    return response.json();
};