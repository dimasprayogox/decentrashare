// src/lib/services/auth/auth.ts
import { apiClient } from '../axios'; // Pastikan ini adalah apiClient yang sudah di-update

export const authService = {
    /**
     * Fetch nonce from backend for wallet signature
     * @param address - Wallet address
     * @returns Promise with nonce data
     */
    async fetchNonce(address: string) {
        try {
            // Validate input
            if (!address || !address.startsWith('0x')) {
                throw new Error('Invalid wallet address format');
            }

            const response = await apiClient(`/auth/nonce/${address}`, { 
                method: 'GET' 
            });
            
            // Ensure response has expected structure
            if (!response?.success) {
                throw new Error(response?.message || 'Failed to fetch nonce from server');
            }
            
            return response;
            
        } catch (err: any) {
            // Log for debugging, then re-throw to let frontend handle
            console.error('[authService] fetchNonce error:', {
                address,
                message: err.message,
                status: err.status,
                data: err.data
            });
            
            // Preserve backend error message if available
            if (err.message && !err.message.includes('Failed to fetch')) {
                throw err;
            }
            
            // Fallback for network errors
            throw new Error('Unable to connect to authentication server. Please try again.');
        }
    },

    /**
     * Verify login signature via SvelteKit route (for cookie handling)
     * @param payload - { walletAddress, signature, nonce }
     * @returns Promise with login result
     */
    async verifyLogin(payload: { walletAddress: string; signature: string; nonce: string }) {
        try {
            // Validate payload
            if (!payload.walletAddress || !payload.signature || !payload.nonce) {
                throw new Error('Missing required login parameters');
            }

            // Use native fetch to hit SvelteKit route for proper cookie handling
            const res = await fetch('/api/auth/login', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // Parse response body first (text) to handle both JSON and non-JSON errors
            const responseText = await res.text();
            let responseData;
            
            try {
                responseData = responseText ? JSON.parse(responseText) : {};
            } catch {
                // If not JSON, create error object from text
                responseData = { 
                    success: false, 
                    message: responseText || `HTTP ${res.status} Error` 
                };
            }

            // Handle HTTP errors
            if (!res.ok) {
                const error = new Error(responseData.message || 'Authentication failed');
                (error as any).status = res.status;
                (error as any).data = responseData;
                throw error;
            }

            // Handle logical errors (success: false but HTTP 200)
            if (!responseData?.success) {
                throw new Error(responseData.message || 'Login verification failed');
            }

            return responseData;
            
        } catch (err: any) {
            // Log for debugging
            console.error('[authService] verifyLogin error:', {
                payload: { ...payload, signature: '[REDACTED]' }, // Don't log signature
                message: err.message,
                status: err.status,
                data: err.data
            });

            // Re-throw with user-friendly message if needed
            if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
                throw new Error('Unable to connect to server. Please check your connection.');
            }
            
            // Preserve backend error messages
            throw err;
        }
    }
};