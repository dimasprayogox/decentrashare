import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';


export const POST = async ({ request, cookies }) => {
    const body = await request.json();

    // 1. Teruskan ke API Backend asli kamu
    const res = await fetch(`${PUBLIC_API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const result = await res.json();

    if (res.ok && result.success) {
        // 2. SIMPAN COOKIE DI SVELTEKIT (Ini kuncinya, Bos!)
        cookies.set('session_token', body.walletAddress, {
            path: '/',
            httpOnly: true,
            sameSite: 'strict',
            secure: false, // Set true jika sudah pakai HTTPS
            maxAge: 60 * 60 * 24 
        });

        return json({ success: true });
    }

    return json({ success: false, message: 'Verifikasi Gagal' }, { status: 401 });
};