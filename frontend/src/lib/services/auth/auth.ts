// src/lib/services/auth/auth.ts
import type {
  AuthUser,
  AuthNonceResponse,
  AuthLoginResponse,
  AuthRegisterResponse,
  AuthLogoutResponse,
  AuthErrorResponse,
  AuthLoginRequest,
  AuthRegisterRequest,
  AuthNonceRequest
} from '$lib/types/auth';
import { apiClient } from '../apiClient';

// ── Helper: Type Guard untuk Error Response ──
function isAuthError(response: any): response is AuthErrorResponse {
  return response?.success === false;
}

// ── Helper: Throw Error dengan Context ──
function createAuthError(message: string, errorCode?: string, status?: number) {
  const error = new Error(message);
  (error as any).errorCode = errorCode;
  (error as any).status = status;
  return error;
}

export const authService = {
  /**
   * Fetch nonce from backend for wallet signature
   * @param address - Wallet address (must start with 0x)
   * @returns Promise<AuthNonceResponse>
   */
  async fetchNonce(address: string): Promise<AuthNonceResponse> {
    try {
      if (!address || !address.startsWith('0x')) {
        throw createAuthError('Invalid wallet address format', 'INVALID_ADDRESS_FORMAT', 400);
      }

      const response = await apiClient<AuthNonceResponse | AuthErrorResponse>(`/auth/nonce/${address}`, { 
        method: 'GET' 
      });
      
      if (isAuthError(response)) {
        throw createAuthError(response.message, response.errorCode, 400);
      }
      
      return response;
      
    } catch (err: any) {
      console.error('[authService] fetchNonce error:', {
        address: address.slice(0, 10) + '...',
        message: err.message,
        errorCode: err.errorCode,
        status: err.status
      });
      
      // Preserve backend error or throw friendly message
      if (err.errorCode || err.status) {
        throw err;
      }
      throw createAuthError('Unable to connect to authentication server. Please try again.', 'NETWORK_ERROR');
    }
  },

  /**
   * Verify login signature via SvelteKit route (for cookie handling)
   * @param payload - { walletAddress, signature, nonce }
   * @returns Promise<AuthLoginResponse>
   */
  async verifyLogin(payload: AuthLoginRequest): Promise<AuthLoginResponse> {
    try {
      if (!payload.walletAddress || !payload.signature || !payload.nonce) {
        throw createAuthError('Missing required login parameters', 'MISSING_PARAMS', 400);
      }

      const res = await fetch('/api/auth/login', { 
        method: 'POST',
        credentials: 'include', // ← WAJIB untuk cookie HttpOnly
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const responseText = await res.text();
      let responseData: AuthLoginResponse | AuthErrorResponse;
      
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseData = { 
          success: false, 
          message: responseText || `HTTP ${res.status} Error`,
          errorCode: 'PARSE_ERROR'
        };
      }

      if (!res.ok) {
        const error = createAuthError(
          (responseData as AuthErrorResponse).message || 'Authentication failed',
          (responseData as AuthErrorResponse).errorCode,
          res.status
        );
        (error as any).data = responseData;
        throw error;
      }

      if (isAuthError(responseData)) {
        throw createAuthError(responseData.message, responseData.errorCode, res.status);
      }

      return responseData;
      
    } catch (err: any) {
      console.error('[authService] verifyLogin error:', {
        walletAddress: payload.walletAddress?.slice(0, 10) + '...',
        message: err.message,
        errorCode: err.errorCode,
        status: err.status
      });

      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        throw createAuthError('Unable to connect to server. Please check your connection.', 'NETWORK_ERROR');
      }
      
      throw err;
    }
  },

  /**
   * Register new user with wallet signature
   * @param payload - { walletAddress, signature, nonce, username?, email? }
   * @returns Promise<AuthRegisterResponse>
   */
  async registerUser(payload: AuthRegisterRequest): Promise<AuthRegisterResponse> {
    try {
      if (!payload.walletAddress || !payload.signature || !payload.nonce) {
        throw createAuthError('Missing required registration parameters', 'MISSING_PARAMS', 400);
      }

      const res = await fetch('/api/auth/register', { 
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const responseText = await res.text();
      let responseData: AuthRegisterResponse | AuthErrorResponse;
      
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseData = { 
          success: false, 
          message: responseText || `HTTP ${res.status} Error`,
          errorCode: 'PARSE_ERROR'
        };
      }

      if (!res.ok) {
        const error = createAuthError(
          (responseData as AuthErrorResponse).message || 'Registration failed',
          (responseData as AuthErrorResponse).errorCode,
          res.status
        );
        (error as any).data = responseData;
        throw error;
      }

      if (isAuthError(responseData)) {
        throw createAuthError(responseData.message, responseData.errorCode, res.status);
      }

      return responseData;
      
    } catch (err: any) {
      console.error('[authService] registerUser error:', {
        walletAddress: payload.walletAddress?.slice(0, 10) + '...',
        message: err.message,
        errorCode: err.errorCode,
        status: err.status
      });

      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        throw createAuthError('Unable to connect to server. Please check your connection.', 'NETWORK_ERROR');
      }
      
      throw err;
    }
  },

  /**
   * Logout user: call backend to clear session cookie
   * @returns Promise<AuthLogoutResponse>
   */
  async logout(): Promise<AuthLogoutResponse> {
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include', // ← WAJIB: kirim cookie ke server
        headers: { 'Content-Type': 'application/json' }
      });

      const responseText = await res.text();
      let responseData: AuthLogoutResponse | AuthErrorResponse;
      
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseData = { 
          success: false, 
          message: responseText || `HTTP ${res.status} Error`,
          errorCode: 'PARSE_ERROR'
        };
      }

      if (!res.ok) {
        const error = createAuthError(
          (responseData as AuthErrorResponse).message || 'Logout failed',
          (responseData as AuthErrorResponse).errorCode,
          res.status
        );
        (error as any).data = responseData;
        throw error;
      }

      if (isAuthError(responseData)) {
        throw createAuthError(responseData.message, responseData.errorCode, res.status);
      }

      return responseData;
      
    } catch (err: any) {
      console.error('[authService] logout error:', {
        message: err.message,
        errorCode: err.errorCode,
        status: err.status
      });

      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        throw createAuthError('Unable to connect to server. Please check your connection.', 'NETWORK_ERROR');
      }
      
      throw err;
    }
  },

  /**
   * Clear client-side storage (helper for logout flow)
   */
  clearClientStorage(): void {
    // Hapus data sensitif dari localStorage
    localStorage.removeItem('user_profile');
    localStorage.removeItem('temp_upload');
    localStorage.removeItem('pending_signature');
    
    // Clear sessionStorage
    sessionStorage.clear();
  },

  /**
   * Redirect to login page (helper for logout flow)
   */
  redirectToLogin(redirectUrl?: string): void {
    const target = redirectUrl || '/login';
    // Use window.location for hard redirect (clears any in-memory state)
    window.location.href = target;
  },

  /**
   * Check if user session is valid (lightweight ping)
   * @returns Promise<boolean>
   */
  async isSessionValid(): Promise<boolean> {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      return res.ok;
    } catch {
      return false;
    }
  }
};