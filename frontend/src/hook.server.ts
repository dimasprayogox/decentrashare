import { redirect, type Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    // 1. Ambil session dari cookie
    const session = event.cookies.get('session_token');
    
    // 2. Tentukan rute mana yang harus diproteksi
    // Kita proteksi semua rute yang dimulai dengan /home atau rute dashboard lainnya
    const isDashboardRoute = event.url.pathname.startsWith('/home') || 
                             event.url.pathname.startsWith('/settings') ||
                             event.url.pathname.startsWith('/shared');

    // 3. Logika Proteksi
    if (isDashboardRoute) {
        if (!session) {
            // Jika tidak ada session, tendang balik ke halaman login
            throw redirect(303, '/login');
        }
    }

    // 4. Cegah user yang sudah login untuk masuk ke halaman login lagi
    if (event.url.pathname === '/login' && session) {
        throw redirect(303, '/home');
    }

    // Lanjutkan request
    const response = await resolve(event);
    return response;
};