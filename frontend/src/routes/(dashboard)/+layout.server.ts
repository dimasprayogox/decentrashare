import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
    const session = cookies.get('session_token');

    // Jika tidak ada session, langsung lempar ke login
    if (!session) {
        throw redirect(303, '/login');
    }

    // Kirim data session ke UI
    return {
        userAddress: session
    };
};