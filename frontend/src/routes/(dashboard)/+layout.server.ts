// src/routes/+layout.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getActiveNav } from '$lib/utils/getActiveNav';


export const load: LayoutServerLoad = async ({ cookies, url }) => {
    const { active, subActive } = getActiveNav(url.pathname, url.searchParams);
    
    const session = cookies.get('session_token');

    // Jika tidak ada session, langsung lempar ke login
    if (!session) {
        throw redirect(303, '/login');
    }
    return {
        userAddress: session,
        active,      
        subActive    
    };
};