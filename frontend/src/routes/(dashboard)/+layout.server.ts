// src/routes/+layout.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { getActiveNav } from '$lib/utils/getActiveNav';

// Decode payload JWT (tanpa verifikasi signature) hanya untuk membaca role.
// Verifikasi signature tetap dilakukan backend di setiap request API.
function decodeJwtRole(token: string): 'USER' | 'ADMIN' {
	try {
		const parts = token.split('.');
		if (parts.length !== 3) return 'USER';
		const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
		return payload?.role === 'ADMIN' ? 'ADMIN' : 'USER';
	} catch {
		return 'USER';
	}
}

export const load: LayoutServerLoad = async ({ cookies, url }) => {
	const { active, subActive } = getActiveNav(url.pathname, url.searchParams);
	const fallbackStorageUsage = {
		usedBytes: 0,
		quotaBytes: 5 * 1024 * 1024 * 1024,
		usagePercent: 0,
		unlimited: false
	};

	const session = cookies.get('session_token');

	// Jika tidak ada session, langsung lempar ke login
	if (!session) {
		const fromUrl = url.pathname + url.search;
		throw redirect(303, `/login?redirectTo=${encodeURIComponent(fromUrl)}`);
	}

	const role = decodeJwtRole(session);

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
		role,
		active,
		subActive,
		storageUsage
	};
};
