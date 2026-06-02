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

            // Auto-refresh token if expired (401 with TOKEN_EXPIRED)
            if (response.status === 401 && (errorData.code === 'TOKEN_EXPIRED' || errorData.errorCode === 'TOKEN_EXPIRED' || errorData.message?.includes('expired'))) {
                try {
                    const refreshRes = await fetch('/api/auth/refresh', {
                        method: 'POST',
                        credentials: 'include'
                    });
                    if (refreshRes.ok) {
                        const refreshData = await refreshRes.json();
                        if (refreshData.success && refreshData.token) {
                            localStorage.setItem('session_token', refreshData.token);

                            // Retry original request
                            const retryHeaders = {
                                ...headers,
                                'Authorization': `Bearer ${refreshData.token}`
                            };
                            const retryResponse = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers: retryHeaders });

                            if (retryResponse.ok) {
                                const retryText = await retryResponse.text();
                                return retryText ? JSON.parse(retryText) : {};
                            }
                        }
                    }
                } catch (refreshErr) {
                    console.error('[axios] Client-side auto-refresh failed:', refreshErr);
                    localStorage.removeItem('session_token');
                }
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