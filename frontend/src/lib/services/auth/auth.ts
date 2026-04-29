// src/lib/services/auth/auth.ts
import { apiClient } from '../axios';

export const authService = {
    // 1. Ambil Nonce
    async fetchNonce(address: string) {
        // Langsung return hasil dari apiClient
        return await apiClient(`/auth/nonce/${address}`, { method: 'GET' });
    },

    // 2. Verifikasi Login (Tembak ke rute internal SvelteKit Bos)
    async verifyLogin(payload: { walletAddress: string; signature: string; nonce: string }) {
        // Pakai fetch biasa ke rute lokal agar cookie terset oleh +server.ts
        const res = await fetch('/api/auth/login', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    }
};