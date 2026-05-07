// $lib/utils/apiClient.ts
import { PUBLIC_API_BASE_URL } from '$env/static/public';

const BASE_URL = PUBLIC_API_BASE_URL;

export const apiClient = async (endpoint: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('session_token');
    
    const headers: Record<string, string> = {
        'Authorization': token ? `Bearer ${token}` : '',
        ...((options.headers as Record<string, string>) || {}),
    };

    if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
        const responseText = await response.text();
        
        if (!response.ok) {
            let errorData;
            try {
                errorData = JSON.parse(responseText);
            } catch {
                errorData = { message: responseText || `HTTP ${response.status} Error` };
            }
            
            const error = new Error(errorData.message || 'Server error occurred');
            (error as any).status = response.status;
            (error as any).data = errorData;
            (error as any).responseText = responseText;
            throw error;
        }
        
        return responseText ? JSON.parse(responseText) : {};
        
    } catch (err: any) {
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
            throw new Error('Unable to connect to server. Please check your connection.');
        }
        throw err;
    }
};