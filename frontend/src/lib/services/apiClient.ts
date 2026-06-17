// $lib/utils/apiClient.ts
import { PUBLIC_API_BASE_URL } from '$env/static/public';

const BASE_URL = PUBLIC_API_BASE_URL;

// ✅ Tambah type untuk response type
export type ResponseType = 'json' | 'blob' | 'text';

// Simpan status promise refresh secara global agar request konkuren menunggu satu promise yang sama
let refreshPromise: Promise<string | null> | null = null;

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
          // Jika sudah ada proses refresh yang berjalan, semua request konkuren akan menunggu promise ini
          if (!refreshPromise) {
            refreshPromise = (async () => {
              try {
                const refreshRes = await fetch('/api/auth/refresh', {
                  method: 'POST',
                  credentials: 'include'
                });
                if (refreshRes.ok) {
                  const refreshData = await refreshRes.json();
                  if (refreshData.success && refreshData.token) {
                    localStorage.setItem('session_token', refreshData.token);
                    return refreshData.token;
                  }
                }
                return null;
              } catch (err) {
                console.error('[apiClient] Refresh request failed:', err);
                return null;
              } finally {
                refreshPromise = null; // Reset setelah selesai
              }
            })();
          }

          const newToken = await refreshPromise;

          if (newToken) {
            // Retry original request dengan token baru
            const retryHeaders = {
              ...headers,
              'Authorization': `Bearer ${newToken}`
            };
            const retryResponse = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers: retryHeaders });

            if (retryResponse.ok) {
              if (responseType === 'blob') return await retryResponse.blob() as unknown as T;
              if (responseType === 'text') return await retryResponse.text() as unknown as T;
              const retryText = await retryResponse.text();
              return retryText ? JSON.parse(retryText) : {} as T;
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