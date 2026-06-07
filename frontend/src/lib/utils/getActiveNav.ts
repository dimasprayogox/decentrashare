// src/lib/utils/getActiveNav.ts
export type NavState = { active: string; subActive: string };

export function getActiveNav(pathname: string, searchParams?: URLSearchParams): NavState {
  // Hapus trailing slash agar konsisten
  const path = pathname.replace(/\/$/, '');

  if (path.startsWith('/profile/')) {
    const from = searchParams?.get('from');
    if (from === 'storage' || from === 'explore' || from === 'shared' || from === 'validate' || from === 'trash') {
      return { active: from, subActive: '' };
    }
  }

  // Settings & sub-routes
  if (path.startsWith('/settings')) {
    if (path === '/settings/profile') return { active: 'settings', subActive: 'profile' };
    if (path === '/settings/security') return { active: 'settings', subActive: 'security' };
    if (path === '/settings/notifications') return { active: 'settings', subActive: 'notifications' };
    if (path === '/settings/users') return { active: 'settings', subActive: 'users' };
    if (path === '/settings/set-limit') return { active: 'settings', subActive: 'set-limit' };
    return { active: 'settings', subActive: '' };
  }

  // Main routes
  if (path === '/explore') return { active: 'explore', subActive: '' };
  if (path.startsWith('/storage')) return { active: 'storage', subActive: '' };
  if (path.startsWith('/shared')) return { active: 'shared', subActive: '' };
  if (path === '/validate') return { active: 'validate', subActive: '' };
  if (path === '/trash') return { active: 'trash', subActive: '' };
  if (path === '/activity') return { active: 'activity', subActive: '' };
  if (path === '/wallet-activity') return { active: 'wallet-activity', subActive: '' };
  if (path === '/contract-activity') return { active: 'contract-activity', subActive: '' };

  // Default
  return { active: 'storage', subActive: '' };
}