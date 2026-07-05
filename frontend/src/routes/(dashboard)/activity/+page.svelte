<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { storageService } from '$lib/services/storage/storage';

  // ── State ──
  let isLoading = $state(true);
  let allLogs = $state<any[]>([]);
  let searchQuery = $state('');
  let actionFilter = $state('ALL');
  let entityFilter = $state('ALL');
  
  // Pagination
  let currentPage = $state(1);
  let pageSize = $state(10);
  const PAGE_SIZE_OPTIONS = [10, 25, 50];

  // Copy indicator
  let copiedId = $state<string | null>(null);

  // Expanded row (untuk menampilkan detail document/folder yang tercatat)
  let expandedId = $state<string | null>(null);

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  function truncateHash(hash: string, head = 10, tail = 8): string {
    if (!hash) return '';
    if (hash.length <= head + tail + 3) return hash;
    return `${hash.slice(0, head)}...${hash.slice(-tail)}`;
  }

  // ── Actions List ──
  const actionTypes = [
    { value: 'ALL', label: 'All Actions' },
    { value: 'UPLOAD_IPFS', label: 'Upload' },
    { value: 'CREATE', label: 'Create' },
    { value: 'DOWNLOAD', label: 'Download' },
    { value: 'BULK_DOWNLOAD', label: 'Download' },
    { value: 'SHARE', label: 'Share' },
    { value: 'REVOKE', label: 'Revoke' },
    { value: 'RENAME', label: 'Rename' },
    { value: 'MOVE', label: 'Move' },
    { value: 'CHANGE_PRIVACY', label: 'Privacy' },
    { value: 'ARCHIVE', label: 'Archive' },
    { value: 'RESTORE', label: 'Restore' },
    { value: 'PERMANENT_DELETE', label: 'Delete' },
    { value: 'BLOCKCHAIN_CONFIRM', label: 'Blockchain' },
    { value: 'BLOCKCHAIN_CONFIRM_BATCH', label: 'Blockchain Confirm' },
  ];

  // ── Load Data ──
  async function loadLogs() {
    isLoading = true;
    try {
      const res = await storageService.getActivityLogs(50);
      if (res?.success && Array.isArray(res.data)) {
        allLogs = res.data;
      } else {
        allLogs = [];
      }
    } catch (err) {
      console.error('[ActivityPage] Failed to fetch activity logs:', err);
      allLogs = [];
    } finally {
      isLoading = false;
    }
  }

  // ── Computations & Stats ──
  const totalLogsCount = $derived(allLogs.length);
  const uploadsCount = $derived(allLogs.filter(l => l.action === 'UPLOAD' || l.action === 'UPLOAD_IPFS').length);
  const sharesCount = $derived(allLogs.filter(l => l.action === 'SHARE').length);
  const deletesCount = $derived(allLogs.filter(l => l.action === 'PERMANENT_DELETE' || l.action === 'ARCHIVE').length);

  // Filter & Search Logic
  const filteredLogs = $derived(
    allLogs.filter(log => {
      // 1. Search Query Match
      const searchLower = searchQuery.trim().toLowerCase();
      const matchesSearch = !searchLower || 
        (log.entityName && log.entityName.toLowerCase().includes(searchLower)) ||
        (log.details && log.details.toLowerCase().includes(searchLower)) ||
        (log.blockchainTx && log.blockchainTx.toLowerCase().includes(searchLower));

      // 2. Action Filter Match
      const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;

      // 3. Entity Filter Match
      const matchesEntity = entityFilter === 'ALL' || log.entityType === entityFilter;

      return matchesSearch && matchesAction && matchesEntity;
    })
  );

  // Pagination Logic
  const totalPages = $derived(Math.max(1, Math.ceil(filteredLogs.length / pageSize)));
  const paginatedLogs = $derived(
    filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );

  function setPage(page: number) {
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
    }
  }

  
  // ── Helpers ──
  function toDate(ts: string): Date {
    // Dukung ISO string (activity log: createdAt) maupun unix detik (string angka)
    if (/^\d+$/.test(String(ts).trim())) return new Date(Number(ts) * 1000);
    return new Date(ts);
  }

  function formatTimestamp(ts: string): string {
    const d = toDate(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatFullDate(ts: string): string {
    const d = toDate(ts);
    return d.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  function getActionBadgeTheme(action: string) {
    switch (action) {
      case 'UPLOAD':
      case 'UPLOAD_IPFS':
        return { bg: 'bg-blue-500/10 border-blue-500/20 text-blue-400', label: 'Upload', icon: 'text-blue-400', iconBg: 'bg-blue-500/10' };
      case 'CREATE':
        return { bg: 'bg-blue-500/10 border-blue-500/20 text-blue-400', label: 'Create', icon: 'text-blue-400', iconBg: 'bg-blue-500/10' };
      case 'DOWNLOAD':
        return { bg: 'bg-sky-500/10 border-sky-500/20 text-sky-400', label: 'Download', icon: 'text-sky-400', iconBg: 'bg-sky-500/10' };
      case 'BULK_DOWNLOAD':
        return { bg: 'bg-sky-500/10 border-sky-500/20 text-sky-400', label: 'Bulk Download', icon: 'text-sky-400', iconBg: 'bg-sky-500/10' };
      case 'SHARE':
      case 'BULK_SHARE':
        return { bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', label: action === 'BULK_SHARE' ? 'Bulk Share' : 'Share', icon: 'text-emerald-400', iconBg: 'bg-emerald-500/10' };
      case 'REVOKE':
        return { bg: 'bg-rose-500/10 border-rose-500/20 text-rose-400', label: 'Revoke', icon: 'text-rose-400', iconBg: 'bg-rose-500/10' };
      case 'RENAME':
      case 'EDIT_METADATA':
      case 'EDIT_DESCRIPTION':
      case 'MOVE':
      case 'BULK_MOVE':
        return { 
          bg: 'bg-amber-500/10 border-amber-500/20 text-amber-400', 
          label: action === 'RENAME' ? 'Rename' : action === 'MOVE' ? 'Move' : action === 'BULK_MOVE' ? 'Bulk Move' : action === 'EDIT_METADATA' ? 'Edit Metadata' : 'Edit Description', 
          icon: 'text-amber-400', 
          iconBg: 'bg-amber-500/10' 
        };
      case 'CHANGE_PRIVACY':
        return { bg: 'bg-teal-500/10 border-teal-500/20 text-teal-400', label: 'Privacy', icon: 'text-teal-400', iconBg: 'bg-teal-500/10' };
      case 'ARCHIVE':
      case 'BULK_ARCHIVE':
        return { bg: 'bg-orange-500/10 border-orange-500/20 text-orange-400', label: action === 'ARCHIVE' ? 'Archive' : 'Bulk Archive', icon: 'text-orange-400', iconBg: 'bg-orange-500/10' };
      case 'RESTORE':
      case 'BULK_RESTORE':
        return { bg: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400', label: action === 'RESTORE' ? 'Restore' : 'Bulk Restore', icon: 'text-cyan-400', iconBg: 'bg-cyan-500/10' };
      case 'PERMANENT_DELETE':
      case 'BULK_PERMANENT_DELETE':
        return { bg: 'bg-red-500/10 border-red-500/20 text-red-400', label: action === 'PERMANENT_DELETE' ? 'Permanent Delete' : 'Bulk Delete', icon: 'text-red-400', iconBg: 'bg-red-500/10' };
      case 'CONFIRM_CHAIN':
      case 'BLOCKCHAIN_CONFIRM':
        return { bg: 'bg-blue-500/10 border-blue-500/20 text-blue-400', label: 'Blockchain', icon: 'text-blue-400', iconBg: 'bg-blue-500/10' };
      case 'BLOCKCHAIN_CONFIRM_BATCH':
        return { bg: 'bg-blue-500/10 border-blue-500/20 text-blue-400', label: 'Blockchain Confirm', icon: 'text-blue-400', iconBg: 'bg-blue-500/10' };
      case 'ADMIN_UPDATE_ROLE':
        return { bg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400', label: 'Role Update', icon: 'text-indigo-400', iconBg: 'bg-indigo-500/10' };
      case 'ADMIN_UPDATE_STORAGE_LIMIT':
        return { bg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400', label: 'Limit Update', icon: 'text-indigo-400', iconBg: 'bg-indigo-500/10' };
      default:
        return { bg: 'bg-gray-500/10 border-gray-500/20 text-gray-400', label: action.replace(/_/g, ' '), icon: 'text-gray-400', iconBg: 'bg-white/5' };
    }
  }

  function getActionIcon(action: string, color = 'text-blue-400'): string {
    const cls = `w-4 h-4 ${color}`;
    switch (action) {
      case 'UPLOAD':
      case 'UPLOAD_IPFS':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>`;
      case 'CREATE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>`;
      case 'DOWNLOAD':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>`;
      case 'BULK_DOWNLOAD':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11V5a2 2 0 00-2-2H7a2 2 0 00-2 2v6m14 0H5m14 0l-3 3m-8-3l3 3m1 0v6m-4-3l4 3 4-3"/></svg>`;
      case 'SHARE':
      case 'BULK_SHARE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 10.742l4.632-2.316m0 0a3 3 0 102.686-2.686 3 3 0 00-2.686 2.686zm-4.632 2.316a3 3 0 11-4.737 3.535 3 3 0 014.737-3.535zm0 0l4.632 2.316m0 0a3 3 0 102.686 2.686 3 3 0 00-2.686-2.686z"/></svg>`;
      case 'REVOKE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>`;
      case 'RENAME':
      case 'EDIT_METADATA':
      case 'EDIT_DESCRIPTION':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>`;
      case 'MOVE':
      case 'BULK_MOVE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>`;
      case 'ARCHIVE':
      case 'BULK_ARCHIVE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>`;
      case 'RESTORE':
      case 'BULK_RESTORE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v6h6M3.51 13a9 9 0 102.13-9.36L3 7"/></svg>`;
      case 'PERMANENT_DELETE':
      case 'BULK_PERMANENT_DELETE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-8 0h10"/></svg>`;
      case 'CONFIRM_CHAIN':
      case 'BLOCKCHAIN_CONFIRM':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>`;
      case 'BLOCKCHAIN_CONFIRM_BATCH':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`;
      case 'CHANGE_PRIVACY':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>`;
      case 'ADMIN_UPDATE_ROLE':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>`;
      case 'ADMIN_UPDATE_STORAGE_LIMIT':
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/></svg>`;
      default:
        return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>`;
    }
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      setTimeout(() => { copiedId = null; }, 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  }

  // Ringkas JSON detail bulk menjadi teks pendek, mis. "6 files · 2.5 GB" atau "6 files processed"
  function formatDetails(details: string | null | undefined): string {
    if (!details) return '—';

    const trimmed = details.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return details;

    try {
      const data = JSON.parse(trimmed);

      const count =
        data.downloadedCount ?? data.uploadedCount ?? data.sharedCount ??
        data.movedCount ?? data.successCount ?? data.processedCount ??
        data.confirmedCount ??
        (Array.isArray(data.files) ? data.files.length : undefined) ??
        data.requestedCount ?? data.totalRequested ?? data.total;

      if (count === undefined) return '—';
      return `${count} ${count === 1 ? 'file' : 'files'}`;
    } catch {
      return details;
    }
  }

  // Ambil data terstruktur dari field details (untuk ditampilkan di panel detail)
  function parseDetails(details: string | null | undefined, log?: any): {
    files: { id?: string; name: string }[];
    folders?: { id?: string; name: string }[];
    path?: string;
    txHash?: string;
    raw?: string;
  } {
    if (!details) return { files: [] };
    const trimmed = details.trim();
    let result: any = { files: [], folders: [] };
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const data = JSON.parse(trimmed);
        const files = Array.isArray(data.files)
          ? data.files.map((f: any) => (typeof f === 'string' ? { name: f } : { id: f?.id, name: f?.name ?? 'Unnamed' }))
          : [];
        const folders = Array.isArray(data.folders)
          ? data.folders.map((fd: any) => ({ id: fd?.id, name: fd?.name ?? 'Unnamed' }))
          : [];
        result = { files, folders, path: data.path, txHash: data.txHash };
      } catch {
        result = { files: [], folders: [], raw: details };
      }
    } else {
      result = { files: [], folders: [], raw: details };
    }

    if (log && result.files.length === 0) {
      if (log.action === 'ARCHIVE' || log.action === 'PERMANENT_DELETE') {
        result.files = [{
          id: log.entityId,
          name: log.entityName || 'Unnamed Item'
        }];
      }
    }
    return result;
  }

  function parseRename(details: string | null | undefined): { from: string; to: string } | null {
    if (!details) return null;
    let text = details.trim();
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.rename) {
          return parsed.rename;
        }
        text = parsed.raw || '';
      } catch {
        // Fallback to plain text
      }
    }
    const match = text.match(/(?:Document|Folder) renamed from (.+?) to (.+?)$/i);
    if (match) {
      return { from: match[1], to: match[2] };
    }
    return null;
  }

  function parseDescriptionEdit(details: string | null | undefined): { from: string; to: string } | null {
    if (!details) return null;
    let text = details.trim();
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.description) {
          return {
            from: parsed.description.from || '—',
            to: parsed.description.to || '—'
          };
        }
        if (parsed.descriptionUpdated) {
          return { from: '—', to: '—' };
        }
        text = parsed.raw || '';
      } catch {
        // Fallback to plain text
      }
    }
    if (text.toLowerCase().includes('description updated')) {
      return { from: '—', to: '—' };
    }
    return null;
  }

  function parseMove(details: string | null | undefined): { from: string; to: string; privacy?: { from: string; to: string } } | null {
    if (!details) return null;
    let text = details.trim();
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.move) {
          return {
            from: parsed.move.from || 'Root',
            to: parsed.move.to || 'Root',
            privacy: parsed.move.privacy || null
          };
        }
        text = parsed.raw || '';
      } catch {
        // Fallback to plain text
      }
    }
    const match = text.match(/(?:Document|Folder) moved to (.+?)$/i);
    if (match) {
      return { from: '—', to: match[1] };
    }
    return null;
  }

  function parsePrivacyChange(details: string | null | undefined): { from: string; to: string } | null {
    if (!details) return null;
    let text = details.trim();
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.privacy) {
          return parsed.privacy;
        }
        text = parsed.raw || '';
      } catch {
        // Fallback to plain text
      }
    }
    const fromToMatch = text.match(/privacy changed from (.+?) to (.+?)$/i);
    if (fromToMatch) {
      return { from: fromToMatch[1], to: fromToMatch[2] };
    }
    const toMatch = text.match(/privacy changed to (.+?)$/i);
    if (toMatch) {
      return { from: '—', to: toMatch[1] };
    }
    return null;
  }

  function parseShareRevoke(details: string | null | undefined): { 
    type: 'share' | 'revoke'; 
    users: Array<{ id: string; username: string; wallet: string }>;
    privacy?: { from: string; to: string } | null;
  } | null {
    if (!details) return null;
    let text = details.trim();
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.share) {
          return { 
            type: 'share', 
            users: parsed.share.users || [], 
            privacy: parsed.privacy || null 
          };
        }
        if (parsed.revoke) {
          return { 
            type: 'revoke', 
            users: parsed.revoke.users || [], 
            privacy: parsed.privacy || null 
          };
        }
      } catch {
        // Fallback
      }
    }
    return null;
  }

  function parseBulkShare(details: string | null | undefined): Array<{
    id: string;
    type: 'document' | 'folder';
    name: string;
    privacy: { from: string; to: string };
    users: Array<{ id: string; username: string; role?: string }>;
  }> | null {
    if (!details) return null;
    let text = details.trim();
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.bulk) {
          return parsed.bulk;
        }
      } catch {
        // Fallback
      }
    }
    return null;
  }

  function parseBulkMove(details: string | null | undefined): Array<{
    id: string;
    type: 'document' | 'folder';
    name: string;
    from: string;
    to: string;
  }> | null {
    if (!details) return null;
    let text = details.trim();
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.bulk) {
          return parsed.bulk;
        }
      } catch {
        // Fallback
      }
    }
    return null;
  }

  onMount(() => {
    loadLogs();

    function handleActivitySearch(e: Event) {
      const detail = (e as CustomEvent).detail;
      searchQuery = detail?.query ?? '';
      currentPage = 1;
    }
    function handleActivityFilter(e: Event) {
      const detail = (e as CustomEvent).detail;
      actionFilter = detail?.action ?? 'ALL';
      entityFilter = detail?.entity ?? 'ALL';
      currentPage = 1;
    }

    window.addEventListener('decentrashare:activity-search', handleActivitySearch);
    window.addEventListener('decentrashare:activity-filter', handleActivityFilter);

    return () => {
      window.removeEventListener('decentrashare:activity-search', handleActivitySearch);
      window.removeEventListener('decentrashare:activity-filter', handleActivityFilter);
    };
  });
</script>

<svelte:head>
  <title>Activity Log | DecentraShare</title>
</svelte:head>

<div class="activity-page w-full max-w-[1400px] mx-auto space-y-8" in:fly={{ y: 20, duration: 400 }}>
  
  <!-- Header Section -->
  <div class="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 pb-2">
    <!-- Left: Title & Subtitle -->
    <div class="flex items-center gap-4">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg">
        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Activity Log</h1>
    </div>
    </div>

    <!-- Right: Active filters indicator + Refresh -->
    <div class="flex flex-wrap items-center gap-3 w-full xl:w-auto">
      <!-- Active filter chips -->
      {#if searchQuery || actionFilter !== 'ALL' || entityFilter !== 'ALL'}
        <div class="flex flex-wrap items-center gap-2">
          {#if searchQuery}
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              "{searchQuery}"
            </span>
          {/if}
          {#if actionFilter !== 'ALL'}
            <span class="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs">
              {actionTypes.find(t => t.value === actionFilter)?.label ?? actionFilter}
            </span>
          {/if}
          {#if entityFilter !== 'ALL'}
            <span class="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs">
              {entityFilter === 'DOCUMENT' ? 'Documents' : 'Folders'}
            </span>
          {/if}
        </div>
      {/if}

      <!-- Refresh Button -->
      <button
          onclick={loadLogs}
          disabled={isLoading}
          class="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-[20px] font-medium text-xs hover:bg-white/10 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          title="Refresh activity logs"
        >
                {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
    </div>
  </div>

  

  <!-- Logs Table / List Layout -->
  <div class="backdrop-blur-2xl bg-[#0a0a0f]/80 border border-white/10 rounded-3xl shadow-2xl overflow-hidden relative">
    {#if isLoading}
      <div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-400 animate-pulse"></div>
    {/if}

    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm border-collapse">
        <thead>
          <tr class="border-b border-white/5 text-gray-500 text-xs uppercase tracking-wider">
            <th class="px-6 py-4 font-semibold w-[25%]">Event</th>
            <th class="px-6 py-4 font-semibold w-[20%]">Document/Folder Name</th>
            <th class="px-6 py-4 font-semibold text-center w-[25%]">Details</th>
            <th class="px-6 py-4 font-semibold w-[15%]">Time</th>
            <th class="px-6 py-4 font-semibold text-center w-[20%]">Status</th>
          </tr> 
        </thead> 
        <tbody class="divide-y divide-white/5">
          {#if isLoading}
            {#each Array(5) as _}
              <tr>
                <td colspan="4" class="px-6 py-5">
                  <div class="h-6 w-full bg-white/5 rounded-xl animate-pulse"></div>
                </td>
              </tr>
            {/each}
          {:else if paginatedLogs.length === 0}
            <tr>
              <td colspan="4" class="px-6 py-16 text-center">
                <div class="space-y-4 max-w-sm mx-auto">
                  <div class="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-gray-400 shadow-inner">
                    <svg class="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <h3 class="text-white font-bold text-lg">No matching logs</h3>
                  <p class="text-gray-500 text-xs leading-relaxed">We couldn't find any activities matching your filters or search query.</p>
                </div>
              </td>
            </tr>
          {:else}
            {#each paginatedLogs as log (log.id)}
              {@const badge = getActionBadgeTheme(log.action)}
              {@const isExpanded = expandedId === log.id}
              <tr class="hover:bg-white/[0.015] transition-all duration-200 {isExpanded ? 'bg-white/[0.015]' : ''}" in:fade>

                <!-- Event (Action) -->
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <span class="w-9 h-9 rounded-xl {badge.iconBg} border border-white/5 flex items-center justify-center shadow-inner shrink-0">
                      {@html getActionIcon(log.action, badge.icon)}
                    </span>
                    <div class="min-w-0 flex-1">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full border text-[12px] font-bold uppercase tracking-wider mb-1 {badge.bg}">
                        {badge.label}
                      </span>
                    </div>
                  </div>
                </td>

                 <!-- Event (Name) -->
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div class="min-w-0 flex-1">
                      <p class="text-gray-200 font-semibold truncate max-w-[250px]" title={log.entityName || 'Unnamed Entity'}>
                        {log.entityName || 'Unnamed Entity'}
                      </p>
                    </div>
                  </div>
                </td>

                <!-- Details -->
                <td class="px-6 py-4 text-center">
                  <button
                    type="button"
                    onclick={() => toggleExpand(log.id)}
                    aria-expanded={isExpanded}
                    aria-label="Toggle recorded details"
                    class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-colors text-[10px] font-semibold"
                  >
                    <span class="inline-flex items-center gap-1">
                      {#if log.entityType === 'FOLDER'}
                        <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                        Folder
                      {:else}
                        <svg class="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                        Document
                      {/if}
                    </span>
                    <svg class="w-3.5 h-3.5 transition-transform {isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                </td>

                <!-- Time -->
                <td class="px-6 py-4 text-xs text-gray-400 font-semibold whitespace-nowrap" title={formatFullDate(log.createdAt)}>
                  {formatTimestamp(log.createdAt)}
                </td>

                <!-- Status -->
                <td class="px-6 py-4 text-center">
                  <div class="flex items-center justify-center">
                    {#if log.blockchainTx && !['RENAME', 'EDIT_METADATA', 'EDIT_DESCRIPTION', 'MOVE', 'BULK_SHARE', 'BULK_MOVE', 'SHARE', 'REVOKE', 'CHANGE_PRIVACY', 'DOWNLOAD', 'BULK_DOWNLOAD', 'ARCHIVE', 'PERMANENT_DELETE', 'RESTORE', 'BULK_ARCHIVE', 'BULK_RESTORE', 'BULK_PERMANENT_DELETE'].includes(log.action)}
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium shadow-[0_0_12px_rgba(59,130,246,0.1)]">
                        <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                        Verified
                      </span>
                    {:else}
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium shadow-[0_0_12px_rgba(16,185,129,0.1)]">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Completed
                      </span>
                    {/if}
                  </div>
                </td>
              </tr>

              {#if isExpanded}
                {@const parsed = parseDetails(log.details, log)}
                {@const renameInfo = parseRename(log.details)}
                {@const moveInfo = parseMove(log.details)}
                {@const descriptionInfo = parseDescriptionEdit(log.details)}
                {@const privacyInfo = parsePrivacyChange(log.details)}
                {@const shareRevokeInfo = parseShareRevoke(log.details)}
                {@const bulkInfo = parseBulkShare(log.details)}
                {@const bulkMoveInfo = parseBulkMove(log.details)}
                <tr class="bg-black/20" in:fade={{ duration: 150 }}>
                  <td colspan="5" class="px-6 py-4">
                    <div class="rounded-2xl border border-white/10 bg-white/[0.01] p-5 shadow-inner">
                      
                      <!-- Header Status Aksi -->
                      <div class="flex items-center justify-between gap-4 mb-4 border-b border-white/5 pb-3">
                        <div class="flex items-center gap-2">
                           <span class="text-xs font-bold uppercase tracking-wider text-blue-400">{log.action.replace(/_/g, ' ')}</span>
                        </div>
                        {#if log.blockchainTx && log.action !== 'RENAME' && log.action !== 'EDIT_METADATA' && log.action !== 'EDIT_DESCRIPTION' && log.action !== 'MOVE' && log.action !== 'BULK_SHARE' && log.action !== 'BULK_MOVE'}
                          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 border border-blue-500/20 text-blue-300">Verified On-Chain</span>
                         {/if}
                      </div>

                      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                        
                        <!-- KOLOM KIRI: METADATA UTAMA & STORAGE -->
                        <div class="space-y-4">
                          <!-- Metadata Utama -->
                          <div class="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] space-y-3">
                            <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Resource Information</span>
                            
                            <div class="flex items-center gap-2">
                              <span class="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300 text-[10px] font-bold uppercase">
                                {#if log.entityType === 'MULTIPLE'}
                                  Bulk
                                {:else if log.entityType === 'FOLDER'}
                                  Folder
                                {:else}
                                  Document
                                {/if}
                              </span>
                              <span class="text-gray-200 font-semibold text-sm truncate" title={log.entityName}>{log.entityName || '—'}</span>
                            </div>

                            <div>
                              <span class="text-[12px] text-gray-500 block">TIMESTAMP</span>
                              <span class="text-gray-300 font-medium">{formatFullDate(log.createdAt)}</span>
                            </div>
                          </div>

                          <!-- Blockchain Link (Hanya muncul jika data ada) -->
                          {#if log.blockchainTx}
                            <div class="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] space-y-3">
                              <span class="text-[12px] uppercase font-bold text-gray-500 tracking-wider block">Blockchain TX</span>
                              <div>
                                <a href={`https://sepolia.etherscan.io/tx/${log.blockchainTx}`} target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 hover:underline font-mono text-[12px] break-all inline-flex items-center gap-1">
                                  {log.blockchainTx}
                                  <svg class="w-3 h-3 opacity-65 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                                </a>
                              </div>
                            </div>
                          {/if}
                        </div>

                        <!-- KOLOM KANAN: DETAIL PERUBAHAN & DAFTAR FILE -->
                        <div class="space-y-4 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6">
                          
                          <!-- Operasi RENAME (Jika terdeteksi) -->
                          {#if renameInfo}
                            <div class="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] space-y-3">
                              <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Rename Change</span>
                              <div class="grid grid-cols-1 gap-2">
                                <div>
                                  <span class="text-[10px] text-gray-500 block uppercase mb-0.5">Before</span>
                                  <span class="text-xs text-rose-300 font-semibold line-through break-all">{renameInfo.from}</span>
                                </div>
                                <div>
                                  <span class="text-[10px] text-gray-500 block uppercase mb-0.5">After</span>
                                  <span class="text-xs text-emerald-300 font-semibold break-all">{renameInfo.to}</span>
                                </div>
                              </div>
                            </div>
                          {/if}

                          <!-- Operasi MOVE (Jika terdeteksi) -->
                          {#if moveInfo}
                            <div class="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] space-y-3.5">
                              <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Move Details</span>
                              
                              <div class="grid grid-cols-2 gap-4">
                                <!-- Location Change -->
                                <div class="space-y-2 border-r border-white/5 pr-4">
                                  <span class="text-[9px] uppercase font-bold text-gray-500 tracking-wider block">Location</span>
                                  <div class="space-y-1.5">
                                    <div>
                                      <span class="text-[9px] text-gray-500 block uppercase font-mono">Before</span>
                                      <span class="text-xs text-rose-300 font-semibold line-through break-all">{moveInfo.from}</span>
                                    </div>
                                    <div>
                                      <span class="text-[9px] text-gray-500 block uppercase font-mono">After</span>
                                      <span class="text-xs text-emerald-300 font-semibold break-all">{moveInfo.to}</span>
                                    </div>
                                  </div>
                                </div>

                                <!-- Privacy Change -->
                                <div class="space-y-2 pl-2">
                                  <span class="text-[9px] uppercase font-bold text-gray-500 tracking-wider block">Privacy Level</span>
                                  {#if moveInfo.privacy}
                                    <div class="space-y-1.5">
                                      <div>
                                        <span class="text-[9px] text-gray-500 block uppercase font-mono">Before</span>
                                        <span class="text-xs text-rose-300 font-semibold line-through break-all">
                                          {(moveInfo.privacy.from || 'PRIVATE').replace(/_/g, ' ')}
                                        </span>
                                      </div>
                                      <div>
                                        <span class="text-[9px] text-gray-500 block uppercase font-mono">After</span>
                                        <span class="text-xs text-emerald-300 font-semibold break-all">
                                          {(moveInfo.privacy.to || 'PRIVATE').replace(/_/g, ' ')}
                                        </span>
                                      </div>
                                    </div>
                                  {:else}
                                    <div class="text-xs text-gray-400 italic mt-3">Unchanged</div>
                                  {/if}
                                </div>
                              </div>
                            </div>
                          {/if}

                          <!-- Operasi EDIT DESCRIPTION -->
                          {#if descriptionInfo}
                            <div class="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] space-y-3">
                              <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Description Change</span>
                              <div class="grid grid-cols-1 gap-2">
                                <div>
                                  <span class="text-[10px] text-gray-500 block uppercase mb-0.5">Before</span>
                                  <span class="text-xs text-rose-300 font-semibold line-through break-all">{descriptionInfo.from}</span>
                                </div>
                                <div>
                                  <span class="text-[10px] text-gray-500 block uppercase mb-0.5">After</span>
                                  <span class="text-xs text-emerald-300 font-semibold break-all">{descriptionInfo.to}</span>
                                </div>
                              </div>
                            </div>
                          {/if}

                          <!-- Operasi DOWNLOAD FOLDER -->
                          {#if log.action === 'DOWNLOAD' && log.entityType === 'FOLDER'}
                            <div class="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] space-y-3">
                              <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Folder Download Details</span>
                              
                              <div class="flex items-center gap-2.5 p-3 rounded-lg bg-white/5 border border-white/10">
                                <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                                  <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                                </div>
                                <div class="min-w-0 flex-1">
                                  <span class="text-xs text-white font-semibold block truncate" title={log.entityName}>{log.entityName}</span>
                                  <span class="text-[10px] text-gray-500 block">Total Files: {parsed.files.length}</span>
                                </div>
                              </div>

                              {#if parsed.files && parsed.files.length > 0}
                                <div class="space-y-2 pt-1">
                                  <span class="text-[9px] uppercase font-bold text-gray-500 tracking-wider block">Files Packaged</span>
                                  <div class="rounded-xl border border-white/10 bg-black/20 divide-y divide-white/5 max-h-40 overflow-y-auto">
                                    {#each parsed.files as file, i (file.id ?? file.name + i)}
                                      <div class="flex items-center gap-2.5 px-3 py-2">
                                        <span class="w-5 h-5 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 text-[9px] font-bold text-blue-300">{i + 1}</span>
                                        <svg class="w-3 h-3 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                                        <span class="flex-1 min-w-0 text-gray-300 text-[11px] truncate" title={file.name}>{file.name}</span>
                                      </div>
                                    {/each}
                                  </div>
                                </div>
                              {:else}
                                <div class="text-xs text-gray-400 italic py-1">This folder has no files.</div>
                              {/if}
                            </div>
                          {/if}

                          <!-- Operasi CHANGE PRIVACY -->
                          {#if log.action === 'CHANGE_PRIVACY' && privacyInfo}
                            <div class="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] space-y-3">
                              <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Privacy Change</span>
                              <div class="grid grid-cols-1 gap-2">
                                <div>
                                  <span class="text-[10px] text-gray-500 block uppercase mb-0.5">Before</span>
                                  <span class="text-xs text-rose-300 font-semibold line-through break-all">{privacyInfo.from}</span>
                                </div>
                                <div>
                                  <span class="text-[10px] text-gray-500 block uppercase mb-0.5">After</span>
                                  <span class="text-xs text-emerald-300 font-semibold break-all">{privacyInfo.to}</span>
                                </div>
                              </div>
                            </div>
                          {/if}

                          <!-- Operasi SHARE atau REVOKE -->
                          {#if shareRevokeInfo}
                            <div class="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] space-y-3.5">
                              <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Share Details</span>
                              
                              <div class="grid grid-cols-2 gap-4">
                                <!-- Users List -->
                                <div class="space-y-2 border-r border-white/5 pr-4">
                                  <span class="text-[9px] uppercase font-bold text-gray-500 tracking-wider block">
                                    {shareRevokeInfo.type === 'share' ? 'Shared With' : 'Access Revoked From'}
                                  </span>
                                  <div class="space-y-2 max-h-40 overflow-y-auto pr-1">
                                    {#each shareRevokeInfo.users as user}
                                      <div class="flex items-center justify-between p-1.5 rounded-lg bg-white/5 border border-white/10">
                                        <div class="flex items-center gap-2 min-w-0">
                                          <div class="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center text-[9px] font-bold text-white uppercase flex-shrink-0 keep-white">
                                            {user.username.charAt(0)}
                                          </div>
                                          <div class="min-w-0">
                                            <span class="text-[11px] text-white font-semibold block truncate leading-none">{user.username}</span>
                                          </div>
                                        </div>
                                        <span class="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase {shareRevokeInfo.type === 'share' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}">
                                          {shareRevokeInfo.type === 'share' ? 'Added' : 'Removed'}
                                        </span>
                                      </div>
                                    {/each}
                                  </div>
                                </div>

                                <!-- Privacy Change -->
                                <div class="space-y-2 pl-2">
                                  <span class="text-[9px] uppercase font-bold text-gray-500 tracking-wider block">Privacy Level</span>
                                  {#if shareRevokeInfo.privacy}
                                    <div class="space-y-1.5">
                                      <div>
                                        <span class="text-[9px] text-gray-500 block uppercase font-mono">Before</span>
                                        <span class="text-xs text-rose-300 font-semibold line-through break-all">
                                          {(shareRevokeInfo.privacy.from || 'PRIVATE').replace(/_/g, ' ')}
                                        </span>
                                      </div>
                                      <div>
                                        <span class="text-[9px] text-gray-500 block uppercase font-mono">After</span>
                                        <span class="text-xs text-emerald-300 font-semibold break-all">
                                          {(shareRevokeInfo.privacy.to || 'PRIVATE').replace(/_/g, ' ')}
                                        </span>
                                      </div>
                                    </div>
                                  {:else}
                                    <div class="text-xs text-gray-400 italic mt-3">Unchanged</div>
                                  {/if}
                                </div>
                              </div>
                            </div>
                          {/if}

                          <!-- Operasi BULK DOWNLOAD -->
                          {#if log.action === 'BULK_DOWNLOAD'}
                            <div class="space-y-4">
                              <!-- Downloaded Folders -->
                              {#if parsed.folders && parsed.folders.length > 0}
                                <div class="space-y-2">
                                  <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Downloaded Folders ({parsed.folders.length})</span>
                                  <div class="rounded-xl border border-white/10 bg-black/20 divide-y divide-white/5 max-h-40 overflow-y-auto">
                                    {#each parsed.folders as folder, i (folder.id ?? folder.name + i)}
                                      <div class="flex items-center gap-2.5 px-3 py-2">
                                        <span class="w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 text-[9px] font-bold text-amber-300">{i + 1}</span>
                                        <svg class="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                                        <span class="flex-1 min-w-0 text-gray-300 text-xs truncate" title={folder.name}>{folder.name}</span>
                                      </div>
                                    {/each}
                                  </div>
                                </div>
                              {/if}

                              <!-- Downloaded Files -->
                              {#if parsed.files && parsed.files.length > 0}
                                <div class="space-y-2">
                                  <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Downloaded Files ({parsed.files.length})</span>
                                  <div class="rounded-xl border border-white/10 bg-black/20 divide-y divide-white/5 max-h-40 overflow-y-auto">
                                    {#each parsed.files as file, i (file.id ?? file.name + i)}
                                      <div class="flex items-center gap-2.5 px-3 py-2">
                                        <span class="w-5 h-5 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 text-[9px] font-bold text-blue-300">{i + 1}</span>
                                        <svg class="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                                        <span class="flex-1 min-w-0 text-gray-300 text-xs truncate" title={file.name}>{file.name}</span>
                                      </div>
                                    {/each}
                                  </div>
                                </div>
                              {/if}
                            </div>
                          {/if}

                          <!-- Operasi BULK SHARE -->
                          {#if log.action === 'BULK_SHARE' && bulkInfo}
                            <div class="space-y-3">
                              <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Bulk Share Items ({bulkInfo.length})</span>
                              <div class="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                                {#each bulkInfo as item}
                                  <div class="p-3 rounded-xl border border-white/5 bg-white/[0.01] space-y-2.5">
                                    <div class="flex items-center gap-2">
                                      <span class="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-semibold uppercase text-gray-400">
                                        {item.type}
                                      </span>
                                      <span class="text-xs font-semibold text-white truncate max-w-[200px]" title={item.name}>{item.name}</span>
                                    </div>
                                    <div class="grid grid-cols-2 gap-2 border-t border-white/5 pt-2">
                                      <div>
                                        <span class="text-[9px] text-gray-500 block uppercase mb-0.5">Before</span>
                                        <span class="text-[10px] text-rose-300 font-bold uppercase line-through break-all">
                                          {(item.privacy?.from || (typeof item.privacy === 'string' ? item.privacy : '') || 'PRIVATE').replace(/_/g, ' ')}
                                        </span>
                                      </div>
                                      <div>
                                        <span class="text-[9px] text-gray-500 block uppercase mb-0.5">After</span>
                                        <span class="text-[10px] text-emerald-300 font-bold uppercase break-all">
                                          {(item.privacy?.to || 'PRIVATE').replace(/_/g, ' ')}
                                        </span>
                                      </div>
                                    </div>
                                    {#if item.users && item.users.length > 0}
                                      <div class="border-t border-white/5 pt-2 space-y-1.5">
                                        <span class="text-[9px] text-gray-500 uppercase font-semibold block font-mono">Access Users</span>
                                        <div class="grid grid-cols-1 gap-1.5">
                                          {#each item.users as user}
                                            <div class="flex items-center justify-between p-1.5 rounded bg-white/5 border border-white/10 text-[10px]">
                                              <div class="flex items-center gap-1.5 min-w-0">
                                                <div class="w-5 h-5 rounded-full bg-blue-600/30 flex items-center justify-center text-[9px] font-bold text-blue-200 uppercase shrink-0 font-mono keep-white">
                                                  {user.username.charAt(0)}
                                                </div>
                                                <span class="text-white truncate font-medium">{user.username}</span>
                                              </div>
                                              {#if user.role}
                                                <span class="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                                                  {user.role}
                                                </span>
                                              {/if}
                                            </div>
                                          {/each}
                                        </div>
                                      </div>
                                    {/if}
                                  </div>
                                {/each}
                              </div>
                            </div>
                          {/if}

                          <!-- Operasi BULK MOVE -->
                          {#if log.action === 'BULK_MOVE' && bulkMoveInfo}
                            <div class="space-y-3">
                              <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Bulk Move Items ({bulkMoveInfo.length})</span>
                              <div class="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                                {#each bulkMoveInfo as item}
                                  <div class="p-3 rounded-xl border border-white/5 bg-white/[0.01] space-y-2.5">
                                    <div class="flex items-center gap-2">
                                      <span class="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-semibold uppercase text-gray-400 font-mono">
                                        {item.type}
                                      </span>
                                      <span class="text-xs font-semibold text-white truncate max-w-[200px]" title={item.name}>{item.name}</span>
                                    </div>
                                    <div class="grid grid-cols-2 gap-4 border-t border-white/5 pt-2.5">
                                      <!-- Location Change -->
                                      <div class="space-y-1.5 border-r border-white/5 pr-2">
                                        <span class="text-[8px] uppercase font-bold text-gray-500 tracking-wider block font-mono">Location</span>
                                        <div>
                                          <span class="text-[8px] text-gray-500 block uppercase font-mono">Before</span>
                                          <span class="text-[10px] text-rose-300 font-semibold line-through break-all">Folder {item.from}</span>
                                        </div>
                                        <div>
                                          <span class="text-[8px] text-gray-500 block uppercase font-mono">After</span>
                                          <span class="text-[10px] text-emerald-300 font-semibold break-all">Folder {item.to}</span>
                                        </div>
                                      </div>

                                      <!-- Privacy Change -->
                                      <div class="space-y-1.5 pl-1">
                                        <span class="text-[8px] uppercase font-bold text-gray-500 tracking-wider block font-mono">Privacy</span>
                                        {#if item.privacy}
                                          <div>
                                            <span class="text-[8px] text-gray-500 block uppercase font-mono">Before</span>
                                            <span class="text-[10px] text-rose-300 font-semibold line-through break-all">
                                              {(item.privacy.from || 'PRIVATE').replace(/_/g, ' ')}
                                            </span>
                                          </div>
                                          <div>
                                            <span class="text-[8px] text-gray-500 block uppercase font-mono">After</span>
                                            <span class="text-[10px] text-emerald-300 font-semibold break-all">
                                              {(item.privacy.to || 'PRIVATE').replace(/_/g, ' ')}
                                            </span>
                                          </div>
                                        {:else}
                                          <div class="text-[10px] text-gray-400 italic mt-2.5">Unchanged</div>
                                        {/if}
                                      </div>
                                    </div>
                                  </div>
                                {/each}
                              </div>
                            </div>
                          {/if}

                          <!-- Detail Deskripsi Umum (Jika ada details teks mentah diluar rename/move/description/privacy/share/revoke/bulk) -->
                          {#if log.details && !renameInfo && !moveInfo && !descriptionInfo && !privacyInfo && !shareRevokeInfo && !bulkInfo && !bulkMoveInfo && (!parsed.files || parsed.files.length === 0) && !(log.action === 'DOWNLOAD' && log.entityType === 'FOLDER') && log.action !== 'BULK_DOWNLOAD'}
                            <div class="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] space-y-2">
                              <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Event Details</span>
                              <p class="text-gray-300 text-xs leading-relaxed break-words">{parsed.raw ?? formatDetails(log.details)}</p>
                            </div>
                          {/if}

                          <!-- RECORDED FILES LIST (Selalu muncul jika ada parsed.files) -->
                          {#if parsed.files && parsed.files.length > 0 && log.action !== 'RENAME' && log.action !== 'EDIT_METADATA' && log.action !== 'EDIT_DESCRIPTION' && log.action !== 'CHANGE_PRIVACY' && log.action !== 'SHARE' && log.action !== 'REVOKE' && log.action !== 'BULK_SHARE' && log.action !== 'BULK_MOVE' && log.action !== 'BULK_DOWNLOAD' && !(log.action === 'DOWNLOAD' && log.entityType === 'FOLDER')}
                            <div class="space-y-2">
                              <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">
                                {#if log.action.includes('UPLOAD')}
                                  Uploaded Files
                                {:else if log.action.includes('CONFIRM')}
                                  Confirmed Files
                                {:else if log.action.includes('DOWNLOAD')}
                                  Downloaded Files
                                {:else if log.action === 'ARCHIVE' || log.action === 'PERMANENT_DELETE' || log.action === 'BULK_ARCHIVE' || log.action === 'BULK_PERMANENT_DELETE'}
                                  Deleted Files
                                {:else if log.action === 'RESTORE' || log.action === 'BULK_RESTORE'}
                                  Restored Files
                                {:else}
                                  Recorded Items
                                {/if}
                                ({parsed.files.length})
                              </span>
                              <div class="rounded-xl border border-white/10 bg-black/20 divide-y divide-white/5 max-h-52 overflow-y-auto">
                                {#each parsed.files as file, i (file.id ?? file.name + i)}
                                  <div class="flex items-center gap-2.5 px-3 py-2">
                                    <span class="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 text-[10px] font-bold text-blue-300">{i + 1}</span>
                                    <svg class="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                                    <span class="flex-1 min-w-0 text-gray-300 text-xs truncate" title={file.name}>{file.name}</span>
                                  </div>
                                {/each}
                              </div>
                            </div>
                          {/if}

                        </div>

                      </div>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Pagination Footer -->
    {#if !isLoading && filteredLogs.length > 0}
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-white/5 bg-white/[0.01]">
        
        <!-- Left details -->
        <div class="flex items-center gap-4">
          <p class="text-xs text-gray-500">
            Showing <span class="text-gray-200 font-semibold">{paginatedLogs.length}</span> of <span class="text-gray-200 font-semibold">{filteredLogs.length}</span> logs
          </p>
          
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Rows per page:</span>
            <select
              bind:value={pageSize}
              onchange={() => currentPage = 1}
              class="h-8 px-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 text-xs cursor-pointer hover:bg-white/10 transition-all"
            >
              {#each PAGE_SIZE_OPTIONS as size}
                <option class="bg-[#0a0a0f] text-white" value={size}>{size}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- Right pagination controls -->
        <div class="flex items-center gap-1.5">
          <!-- Prev button -->
          <button
            onclick={() => setPage(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Previous page"
            class="w-8 h-8 flex items-center justify-center text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <!-- Pages -->
          {#each Array(totalPages) as _, idx}
            {@const pageNum = idx + 1}
            <button
              onclick={() => setPage(pageNum)}
              class="min-w-8 h-8 px-2 flex items-center justify-center text-xs rounded-lg border font-semibold transition-all
                {pageNum === currentPage
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'}"
            >
              {pageNum}
            </button>
          {/each}

          <!-- Next button -->
          <button
            onclick={() => setPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="Next page"
            class="w-8 h-8 flex items-center justify-center text-gray-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

      </div>
    {/if}
  </div>

</div>
