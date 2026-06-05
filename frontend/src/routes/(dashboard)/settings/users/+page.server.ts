// src/routes/(dashboard)/settings/users/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Decode payload JWT (tanpa verifikasi signature — hanya untuk membaca role di sisi server SvelteKit).
// Verifikasi signature tetap dilakukan backend pada setiap request API.
function decodeJwtPayload(token: string): { role?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64').toString());
  } catch {
    return null;
  }
}

export const load: PageServerLoad = async ({ cookies }) => {
  const session = cookies.get('session_token');
  if (!session) throw redirect(303, '/login');

  const payload = decodeJwtPayload(session);
  if (!payload || payload.role !== 'ADMIN') {
    throw error(403, 'Forbidden. Admin access only.');
  }

  return {};
};
