// $lib/utils/apiClient.ts
import { PUBLIC_API_BASE_URL } from '$env/static/public';

const BASE_URL = PUBLIC_API_BASE_URL;

// ✅ Tambah type untuk response type
export type ResponseType = 'json' | 'blob' | 'text';

export const apiClient = async <T = any>(
  endpoint: string, 
  options: RequestInit = {},
  responseType: ResponseType = 'json'  // ← ✅ New parameter
): Promise<T> => {
  const token = localStorage.getItem('session_token');
  
  const headers: Record<string, string> = {
    'Authorization': token ? `Bearer ${token}` : '',
    ...((options.headers as Record<string, string>) || {}),
  };

  // Auto-set Content-Type for JSON body (but not for FormData or blob)
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
    
    // ✅ Always parse error response as text/JSON (regardless of responseType)
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText || `HTTP ${response.status} Error` };
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
                if (responseType === 'blob') return await retryResponse.blob() as unknown as T;
                if (responseType === 'text') return await retryResponse.text() as unknown as T;
                const retryText = await retryResponse.text();
                return retryText ? JSON.parse(retryText) : {} as T;
              }
            }
          }
        } catch (refreshErr) {
          console.error('[apiClient] Client-side auto-refresh failed:', refreshErr);
          localStorage.removeItem('session_token');
        }
      }
      
      const error = new Error(errorData.message || 'Server error occurred');
      (error as any).status = response.status;
      (error as any).data = errorData;
      (error as any).responseText = errorText;
      throw error;
    }
    
    // ✅ Handle different response types
    if (responseType === 'blob') {
      return await response.blob() as unknown as T;
    }
    
    if (responseType === 'text') {
      return await response.text() as unknown as T;
    }
    
    // ✅ Default: parse as JSON
    const responseText = await response.text();
    return responseText ? JSON.parse(responseText) : {} as T;
    
  } catch (err: any) {
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
      throw new Error('Unable to connect to server. Please check your connection.');
    }
    throw err;
  }
};