// src/routes/+layout.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { getActiveNav } from '$lib/utils/getActiveNav';


export const load: LayoutServerLoad = async ({ cookies, url, fetch }) => {
    const { active, subActive } = getActiveNav(url.pathname, url.searchParams);
    const fallbackStorageUsage = { usedBytes: 0, quotaBytes: 5 * 1024 * 1024 * 1024, usagePercent: 0 };

    const session = cookies.get('session_token');

    // Jika tidak ada session, langsung lempar ke login
    if (!session) {
        throw redirect(303, '/login');
    }

    let storageUsage = fallbackStorageUsage;
    try {
        const response = await fetch(`${PUBLIC_API_BASE_URL}/documents/me/storage-usage`, {
            headers: {
                Authorization: `Bearer ${session}`,
                Cookie: `session_token=${session}`
            }
        });
        if (response.ok) {
            const result = await response.json();
            storageUsage = result?.data ?? fallbackStorageUsage;
        }
    } catch {
        storageUsage = fallbackStorageUsage;
    }

    return {
        userAddress: session,
        active,
        subActive,
        storageUsage
    };
};