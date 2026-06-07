import { redirect, type Handle } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';

function getCookieValue(cookieString: string, name: string): string | null {
    const match = cookieString.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
    return match ? match[2] : null;
}

function isJwtExpired(token: string): boolean {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return true;
        
        // Decode base64 payload safely in Node/Bun
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        if (typeof payload.exp !== 'number') return false;
        
        // Expiration check with 2-second buffer to prevent race conditions
        return payload.exp * 1000 < Date.now() + 2000;
    } catch {
        return true;
    }
}

export const handle: Handle = async ({ event, resolve }) => {
    let session = event.cookies.get('session_token');
    const refreshToken = event.cookies.get('refresh_token');

    // 1. Auto-refresh access token jika expired tetapi refresh token masih ada
    if (session && isJwtExpired(session) && refreshToken) {
        try {
            const backendRes = await event.fetch(`${PUBLIC_API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `refresh_token=${refreshToken}`
                }
            });

            if (backendRes.ok) {
                const result = await backendRes.json();
                let newAccessToken = result?.data?.token || result?.token || result?.data?.user?.token;
                let newRefreshToken = result?.data?.refreshToken || result?.refreshToken || result?.data?.user?.refreshToken;

                // Fallback: ambil dari header Set-Cookie jika tidak ada di JSON body
                const setCookies = backendRes.headers.getSetCookie();
                if (setCookies && setCookies.length > 0) {
                    for (const cookieStr of setCookies) {
                        const sessionVal = getCookieValue(cookieStr, 'session_token');
                        if (sessionVal) newAccessToken = sessionVal;

                        const refreshVal = getCookieValue(cookieStr, 'refresh_token');
                        if (refreshVal) newRefreshToken = refreshVal;
                    }
                }

                const isProduction = import.meta.env.PROD;

                if (newAccessToken) {
                    event.cookies.set('session_token', newAccessToken, {
                        path: '/',
                        httpOnly: true,
                        sameSite: 'strict',
                        secure: isProduction,
                        maxAge: 60 * 60 * 24 // 24 hours
                    });
                    session = newAccessToken;
                }

                if (newRefreshToken) {
                    event.cookies.set('refresh_token', newRefreshToken, {
                        path: '/',
                        httpOnly: true,
                        sameSite: 'strict',
                        secure: isProduction,
                        maxAge: 60 * 60 * 24 * 7 // 7 days
                    });
                }
            } else {
                // Refresh token invalid atau expired di backend, hapus cookies
                event.cookies.delete('session_token', { path: '/' });
                event.cookies.delete('refresh_token', { path: '/' });
                session = undefined;
            }
        } catch (err) {
            console.error('[SvelteKit Hook] Auto-refresh token failed:', err);
        }
    }

    // 2. Tentukan rute mana yang harus diproteksi
    const isDashboardRoute = event.url.pathname.startsWith('/dashboard') || 
                             event.url.pathname.startsWith('/settings') ||
                             event.url.pathname.startsWith('/storage') ||
                             event.url.pathname.startsWith('/explore') ||
                             event.url.pathname.startsWith('/shared') ||
                             event.url.pathname.startsWith('/validate') ||
                             event.url.pathname.startsWith('/trash');

    // 3. Logika Proteksi
    if (isDashboardRoute) {
        if (!session) {
            const fromUrl = event.url.pathname + event.url.search;
            throw redirect(303, `/login?redirectTo=${encodeURIComponent(fromUrl)}`);
        }
    }

    // 4. Cegah user yang sudah login untuk masuk ke halaman login atau register lagi
    if ((event.url.pathname === '/login' || event.url.pathname === '/register') && session) {
        const redirectTo = event.url.searchParams.get('redirectTo') || '/dashboard';
        throw redirect(303, redirectTo);
    }

    // Lanjutkan request
    const response = await resolve(event);
    return response;
};
