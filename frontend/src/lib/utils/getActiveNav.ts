// src/lib/utils/getActiveNav.ts
export type NavState = { active: string; subActive: string };

export function getActiveNav(pathname: string): NavState {
  // Hapus trailing slash agar konsisten
  const path = pathname.replace(/\/$/, '');

  // Settings & sub-routes
  if (path.startsWith('/settings')) {
    if (path === '/settings/profile') return { active: 'settings', subActive: 'profile' };
    if (path === '/settings/security') return { active: 'settings', subActive: 'security' };
    if (path === '/settings/notifications') return { active: 'settings', subActive: 'notifications' };
    return { active: 'settings', subActive: '' };
  }

  // Main routes
  if (path === '/storage') return { active: 'storage', subActive: '' };
  if (path === '/shared') return { active: 'shared', subActive: '' };
  
  // Default
  return { active: 'dashboard', subActive: '' };
}