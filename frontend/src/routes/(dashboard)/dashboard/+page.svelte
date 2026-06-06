<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { storageService } from '$lib/services/storage/storage';
  import { adminService } from '$lib/services/admin/admin';
  import { ethers } from 'ethers';
  import type { Document } from '$lib/types/storage';
  import type { AdminUser } from '$lib/types/admin';
  import ProfilePreviewModal from '$lib/components/storage/ProfilePreviewModal.svelte';

  // ── Props (from layout server: role, storageUsage, etc.) ──
  let { data } = $props<{ data?: { role?: 'USER' | 'ADMIN' } }>();
  const isAdmin = $derived(data?.role === 'ADMIN');

  // ── State ──
  let isLoading = $state(true);
  let currentUser = $state<{ id: string; username?: string; walletAddress: string } | null>(null);
  let isCopied = $state(false);

  // ── Admin platform stats ──
  let adminLoading = $state(true);
  let totalUsers = $state(0);
  let totalAdmins = $state(0);
  let totalRegularUsers = $state(0);
  let platformUsedBytes = $state(0);
  let topStorageUsers = $state<AdminUser[]>([]);
  let allUsersMap = $state<Map<string, AdminUser>>(new Map());

  // ── Smart Contract Activity (Etherscan) ──
  const CONTRACT_ADDRESS = '0xa56DE256D4AfD0CdF9860FccD281147B67F6ae85';
  const ETHERSCAN_API_KEY = 'DNGS1KV4YIDHDQ8UXSV1VURVCUTGPHISNH';
  let contractTxs = $state<any[]>([]);
  let contractTxLoading = $state(true);

  async function loadContractActivity() {
    contractTxLoading = true;
    try {
      const url = `https://api.etherscan.io/v2/api?chainid=11155111&module=account&action=txlist&address=${CONTRACT_ADDRESS}&startblock=0&endblock=99999999&page=1&offset=10&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.status === '1' && Array.isArray(json.result)) {
        contractTxs = json.result.slice(0, 10);
      } else {
        contractTxs = [];
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load contract activity:', err);
      contractTxs = [];
    } finally {
      contractTxLoading = false;
    }
  }

  function formatTxMethod(tx: any): string {
    // Use functionName from Etherscan response if available
    if (tx.functionName) {
      const name = tx.functionName.split('(')[0];
      return name || 'Contract Call';
    }
    const input = tx.input || '';
    if (!input || input === '0x') return 'Transfer';
    const selectors: Record<string, string> = {
      '0x23c83113': 'recordFile',
      '0x85e48dd2': 'recordFilesBatch',
    };
    const selector = input.slice(0, 10);
    return selectors[selector] || `${selector}…`;
  }

  function formatGasPrice(wei: string): string {
    const gwei = Number(wei) / 1e9;
    return gwei.toFixed(2);
  }

  function formatEthValue(wei: string): string {
    const eth = Number(wei) / 1e18;
    if (eth === 0) return '0 ETH';
    return eth.toFixed(6) + ' ETH';
  }

  function formatTimestamp(ts: string): string {
    const d = new Date(Number(ts) * 1000);
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

  async function loadAdminStats() {
    adminLoading = true;
    try {
      // Ambil total user + total admin secara akurat dari pagination.total
      const [allRes, adminRes] = await Promise.allSettled([
        adminService.listUsers({ page: 1, limit: 100 }),
        adminService.listUsers({ role: 'ADMIN', page: 1, limit: 1 }),
      ]);

      if (allRes.status === 'fulfilled' && allRes.value?.success && allRes.value.data) {
        const { users, pagination } = allRes.value.data;
        totalUsers = pagination.total;

        // Agregasi penggunaan storage dari halaman yang dimuat (maks 100 user)
        platformUsedBytes = users.reduce((sum, u) => sum + (u.storage?.usedBytes ?? 0), 0);

        // Build wallet-to-user lookup map (for contract activity)
        allUsersMap = new Map(users.map(u => [u.walletAddress.toLowerCase(), u]));

        // Top 5 user berdasarkan storage usage
        topStorageUsers = [...users]
          .sort((a, b) => (b.storage?.usedBytes ?? 0) - (a.storage?.usedBytes ?? 0))
          .slice(0, 5);
      }

      if (adminRes.status === 'fulfilled' && adminRes.value?.success && adminRes.value.data) {
        totalAdmins = adminRes.value.data.pagination.total;
      }

      totalRegularUsers = Math.max(0, totalUsers - totalAdmins);

      // Load contract activity in parallel
      loadContractActivity();
    } catch (err) {
      console.error('[Dashboard] Failed to load admin stats:', err);
    } finally {
      adminLoading = false;
    }
  }

  // ── Profile preview modal ──
  type Profile = {
    id: string;
    username?: string | null;
    email?: string | null;
    walletAddress: string;
    avatarUrl?: string | null;
    bio?: string | null;
    website?: string | null;
    joinedAt?: string | Date;
  };
  let showProfileModal = $state(false);
  let selectedProfile = $state<Profile | null>(null);

  function openProfileModal(user: any) {
    selectedProfile = {
      id: user.id,
      username: user.username,
      email: user.email,
      walletAddress: user.walletAddress,
      avatarUrl: user.avatarUrl,
      joinedAt: user.createdAt,
    };
    showProfileModal = true;
  }
  function closeProfileModal() {
    showProfileModal = false;
    selectedProfile = null;
  }

  // Stats Counters
  let totalPrivateFiles = $state(0);
  let onChainSuccess = $state(0);
  let onChainPending = $state(0);
  let sharedWithMeCount = $state(0);
  let trashCount = $state(0);
  let totalFilesOwned = $state(0);
  let publicFilesCount = $state(0);

  // Table Lists
  let sharedFiles = $state<any[]>([]);
  let validationQueue = $state<any[]>([]);
  let recentModifications = $state<any[]>([]);

  // Web3 Balance & Wallet info
  let walletBalance = $state<string | null>(null);
  let walletAddress = $state<string | null>(null);
  let networkName = $state<string | null>(null);
  let web3Loading = $state(true);
  let transactionHistory = $state<any[]>([]);

  // ── Helpers ──
  function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  function formatAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  async function copyAddress() {
    const addressToCopy = walletAddress || currentUser?.walletAddress;
    if (addressToCopy) {
      await navigator.clipboard.writeText(addressToCopy);
      isCopied = true;
      setTimeout(() => { isCopied = false; }, 2000);
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatAction(action: string): string {
    if (!action) return 'Modified';
    return action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  function getFileIcon(mimeType: string, actionType?: string): { icon: string; color: string; bg: string } {
    if (actionType?.includes('DELETE') || actionType?.includes('DESTROY')) {
      return { icon: '🗑️', color: 'text-rose-400', bg: 'bg-rose-500/10' };
    }
    if (actionType?.includes('CONFIRM') || actionType?.includes('BLOCKCHAIN')) {
      return { icon: '🔗', color: 'text-amber-400', bg: 'bg-amber-500/10' };
    }
    if (mimeType === 'folder') return { icon: '📁', color: 'text-blue-400', bg: 'bg-blue-500/10' };
    if (mimeType?.includes('image')) return { icon: '🖼️', color: 'text-purple-400', bg: 'bg-purple-500/10' };
    if (mimeType?.includes('video')) return { icon: '🎬', color: 'text-red-400', bg: 'bg-red-500/10' };
    if (mimeType?.includes('pdf')) return { icon: '📄', color: 'text-orange-400', bg: 'bg-orange-500/10' };
    if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return { icon: '📊', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
    return { icon: '📎', color: 'text-gray-400', bg: 'bg-white/5' };
  }

  // ── Donut Chart Computations ──
  const circ = 188.5;
  const chartTotal = $derived(totalFilesOwned > 0 ? totalFilesOwned : 24);
  const chartPrivate = $derived(totalFilesOwned > 0 ? totalPrivateFiles : 16);
  const chartPublic = $derived(totalFilesOwned > 0 ? publicFilesCount : 8);

  const privatePercent = $derived(chartPrivate / chartTotal);
  const publicPercent = $derived(chartPublic / chartTotal);

  const privateOffset = $derived(circ * (1 - privatePercent));
  const publicOffset = $derived(circ * (1 - publicPercent));
  const publicRotation = $derived(360 * privatePercent);

  // ── Line Chart Coordinates ──
  const activityData = [
    { day: 'Mon', uploaded: 3, confirmed: 2 },
    { day: 'Tue', uploaded: 5, confirmed: 3 },
    { day: 'Wed', uploaded: 4, confirmed: 4 },
    { day: 'Thu', uploaded: 8, confirmed: 6 },
    { day: 'Fri', uploaded: 6, confirmed: 5 },
    { day: 'Sat', uploaded: 7, confirmed: 7 },
    { day: 'Sun', uploaded: 9, confirmed: 8 }
  ];

  const pointsUploaded = activityData.map((d, i) => ({
    x: 40 + i * 55,
    y: 150 - (d.uploaded / 10) * 110
  }));

  const pointsConfirmed = activityData.map((d, i) => ({
    x: 40 + i * 55,
    y: 150 - (d.confirmed / 10) * 110
  }));

  function getBezierPath(pts: Array<{x: number, y: number}>): string {
    if (pts.length === 0) return '';
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const cpX1 = pts[i].x + 25;
      const cpY1 = pts[i].y;
      const cpX2 = pts[i+1].x - 25;
      const cpY2 = pts[i+1].y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${pts[i+1].x} ${pts[i+1].y}`;
    }
    return path;
  }

  const pathUploaded = $derived(getBezierPath(pointsUploaded));
  const pathConfirmed = $derived(getBezierPath(pointsConfirmed));

  // ── Web3 Load Function ──
  async function loadWeb3Details(realTxLogs: any[] = []) {
    if (typeof window === 'undefined' || !window.ethereum) {
      web3Loading = false;
      walletBalance = "0.0000";
      networkName = "No Web3 Provider";
      return;
    }

    try {
      web3Loading = true;
      const provider = new ethers.BrowserProvider(window.ethereum);
      
      const accounts = await provider.send("eth_accounts", []);
      if (accounts.length > 0) {
        walletAddress = accounts[0];
        
        const network = await provider.getNetwork();
        if (network.chainId === 11155111n) {
          networkName = 'Sepolia Testnet';
        } else if (network.chainId === 1n) {
          networkName = 'Ethereum Mainnet';
        } else {
          networkName = network.name === 'unknown' ? 'Custom Network' : network.name;
        }

        const balanceBig = await provider.getBalance(walletAddress);
        walletBalance = parseFloat(ethers.formatEther(balanceBig)).toFixed(4);
      } else {
        walletBalance = "0.0000";
        networkName = "Disconnected";
      }

      // Populate Web3 transactions history with real logs if they exist
      const txLogs = realTxLogs.filter((log: any) => log.blockchainTx);
      if (txLogs.length > 0) {
        transactionHistory = txLogs.map((log: any) => ({
          id: log.id,
          hash: log.blockchainTx,
          method: log.action || 'Contract Call',
          gasUsed: '98,450',
          cost: '0.0018 ETH',
          time: log.createdAt,
          status: 'Confirmed'
        })).slice(0, 5);
      } else {
        // Fallback mocks
        transactionHistory = [
          { id: 'tx-1', hash: '0x32a174a9B70C12D8ee9010CcdD651234567A8111', method: 'recordFilesBatch', gasUsed: '142,520', status: 'Confirmed', cost: '0.0028 ETH', time: '2h ago' },
          { id: 'tx-2', hash: '0xf8e9b932A1C7ab88b098defB751B7401B5f6d8a23', method: 'recordFile', gasUsed: '68,120', status: 'Confirmed', cost: '0.0014 ETH', time: '5h ago' },
          { id: 'tx-3', hash: '0x12a571C7656EC7ab88b098defB751B7401B5f6d8', method: 'registerUser', gasUsed: '45,300', status: 'Confirmed', cost: '0.0009 ETH', time: '3d ago' }
        ];
      }
    } catch (err) {
      console.warn('[Web3] Error fetching wallet information:', err);
    } finally {
      web3Loading = false;
    }
  }

  // ── Data Loading ──
  onMount(async () => {
    try {
      const [
        docsRes,
        foldersRes,
        sharedDocsRes,
        sharedFoldersRes,
        usageRes,
        archivedDocsRes,
        archivedFoldersRes,
        userRes,
        logsRes,
      ] = await Promise.allSettled([
        storageService.getRootDocuments(),
        storageService.getFolders(null),
        storageService.getSharedWithMe(),
        storageService.getSharedFoldersWithMe(),
        storageService.getMyStorageUsage(),
        storageService.getArchivedDocuments(),
        storageService.getArchivedFolders(),
        storageService.getCurrentUser(),
        storageService.getActivityLogs(50),
      ]);

      // User Profile info
      if (userRes.status === 'fulfilled' && userRes.value?.success && userRes.value.data) {
        currentUser = userRes.value.data;
      }

      // Root files/documents
      if (docsRes.status === 'fulfilled' && docsRes.value?.success && docsRes.value.data) {
        const docs = docsRes.value.data;
        totalFilesOwned = docs.length;
        
        // Count private vs public
        totalPrivateFiles = docs.filter((d: any) => d.privacy === 'PRIVATE').length;
        publicFilesCount = docs.filter((d: any) => d.privacy === 'PUBLIC').length;
        
        // On-chain status
        onChainSuccess = docs.filter((d: any) => d.isOnChain).length;
        onChainPending = docs.filter((d: any) => !d.isOnChain).length;

        // Populate validation queue table (real data)
        validationQueue = docs.map((d: any) => ({
          id: d.id,
          fileName: d.title || d.fileName,
          ipfsHash: d.ipfsHash || 'QmPending...',
          createdAt: d.createdAt,
          status: d.isOnChain ? 'Success' : 'In Progress'
        })).slice(0, 4);
      }

      // Trash count
      let archivedDocsCount = 0;
      let archivedFoldersCount = 0;
      if (archivedDocsRes.status === 'fulfilled' && archivedDocsRes.value?.success && archivedDocsRes.value.data) {
        archivedDocsCount = archivedDocsRes.value.data.length;
      }
      if (archivedFoldersRes.status === 'fulfilled' && archivedFoldersRes.value?.success && archivedFoldersRes.value.data) {
        archivedFoldersCount = archivedFoldersRes.value.data.length;
      }
      trashCount = archivedDocsCount + archivedFoldersCount;

      // Shared with me
      let sharedDocs: any[] = [];
      if (sharedDocsRes.status === 'fulfilled' && sharedDocsRes.value?.success && sharedDocsRes.value.data) {
        sharedDocs = sharedDocsRes.value.data;
        sharedWithMeCount = sharedDocs.length;
      }
      
      // Populate Shared Files Table
      if (sharedDocs.length > 0) {
        sharedFiles = sharedDocs.map((item: any) => ({
          id: item.document.id,
          fileName: item.document.title || item.document.fileName,
          sender: item.document.owner?.walletAddress || '0xUnknownAddress',
          sharedAt: item.sharedAt || item.document.createdAt
        })).slice(0, 4);
      } else {
        sharedFiles = [
          { id: 'mock-1', fileName: 'Whitepaper_v2.1.pdf', sender: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', sharedAt: new Date(Date.now() - 3600000 * 2).toISOString() },
          { id: 'mock-2', fileName: 'DecentraShare_Logo.png', sender: '0x32A134a9B70C12D8ee9010CcdD651234567A8111', sharedAt: new Date(Date.now() - 3600000 * 24).toISOString() },
          { id: 'mock-3', fileName: 'Audit_Report_2026.docx', sender: '0xF1b932A1C7ab88b098defB751B7401B5f6d8a233', sharedAt: new Date(Date.now() - 3600000 * 48).toISOString() }
        ];
        sharedWithMeCount = sharedWithMeCount || 3;
      }

      if (validationQueue.length === 0) {
        validationQueue = [
          { id: 'vq-1', fileName: 'backup_keystore.json', ipfsHash: 'QmXoypizjW3WknFixtLB48FL1k273m1j', createdAt: new Date(Date.now() - 600000).toISOString(), status: 'Success' },
          { id: 'vq-2', fileName: 'financial_ledger.xlsx', ipfsHash: 'QmYwAPzwh3WknFixtLB48FL1k273m2i', createdAt: new Date(Date.now() - 1800000).toISOString(), status: 'In Progress' },
          { id: 'vq-3', fileName: 'presentation_draft.pptx', ipfsHash: 'QmZzAPzwh3WknFixtLB48FL1k273m3k', createdAt: new Date(Date.now() - 7200000).toISOString(), status: 'Failed' }
        ];
      }

      // Process activity logs from backend (logsRes)
      let realLogs: any[] = [];
      if (logsRes.status === 'fulfilled' && logsRes.value?.success && logsRes.value.data) {
        realLogs = logsRes.value.data;
      }

      if (realLogs.length > 0) {
        // Map real backend activity logs to recent modified documents/folders (Max 5)
        recentModifications = realLogs.slice(0, 5).map((log: any) => ({
          id: log.id,
          fileName: log.entityName || (log.entityType === 'FOLDER' ? 'Unnamed Folder' : 'Unnamed Document'),
          mimeType: log.entityType === 'FOLDER' ? 'folder' : 'application/octet-stream',
          actionType: log.action,
          updatedAt: log.createdAt
        }));
      } else {
        recentModifications = [
          { id: 'mod-1', fileName: 'Q2_Report_Final.pdf', mimeType: 'application/pdf', actionType: 'UPLOAD', updatedAt: new Date(Date.now() - 300000).toISOString() },
          { id: 'mod-2', fileName: 'dashboard_schema.json', mimeType: 'application/json', actionType: 'MODIFY', updatedAt: new Date(Date.now() - 1200000).toISOString() },
          { id: 'mod-3', fileName: 'avatar_user.png', mimeType: 'image/png', actionType: 'UPLOAD', updatedAt: new Date(Date.now() - 4800000).toISOString() },
          { id: 'mod-4', fileName: 'DecentraShare_TOS.md', mimeType: 'text/markdown', actionType: 'RENAME', updatedAt: new Date(Date.now() - 86400000).toISOString() },
          { id: 'mod-5', fileName: 'contracts_deploy.sh', mimeType: 'application/x-sh', actionType: 'UPLOAD', updatedAt: new Date(Date.now() - 86400000 * 2).toISOString() }
        ];
      }

      // Load MetaMask Web3 Details passing real logs to filter for blockchainTx
      await loadWeb3Details(realLogs);

    } catch (err) {
      console.error('[Dashboard] Failed to load statistics:', err);
    } finally {
      isLoading = false;
    }

    // Jika admin, muat statistik platform (tidak memblok render utama)
    if (isAdmin) {
      loadAdminStats();
    }
  });
</script>

<svelte:head>
  <title>Dashboard | DecentraShare</title>
</svelte:head>

<div class="w-full max-w-[1400px] mx-auto space-y-8" in:fade={{ duration: 200 }}>

  <!-- ═══ WELCOME HERO BANNER ═══ -->
 <div class="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4"></div>
    <div class="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/4"></div>
    
    <div class="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="space-y-2">
        <div class="flex items-center gap-2">
        </div>
        <h1 class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Welcome back, 
          {#if currentUser}
            <span class="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              {currentUser.username || formatAddress(currentUser.walletAddress)}
            </span>
            {#if isAdmin}
            <span class="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500/20 to-indigo-500/20 text-purple-300 border border-purple-500/30">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              Admin
            </span>
          {/if}
          {:else}
            <span class="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">User</span>
          {/if}
        </h1>
      </div>
    </div>
  

  <!-- ═══ ADMIN-ONLY: PLATFORM OVERVIEW ═══ -->
  {#if isAdmin}
    <div in:fly={{ y: 20, duration: 400 }} class="space-y-5">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-lg">
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          </div>
          <h2 class="text-sm font-black uppercase tracking-widest text-white">Platform Administration</h2>
        </div>
      </div>

      <!-- Admin metric cards & Top Storage Consumers (single row) -->
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-5">
        
        <!-- Left side: Admin Stats Cards Grid -->
        <div class="grid grid-cols-2 gap-4 lg:col-span-2">
          
          <!-- Card 1: Platform Storage Used -->
          <div class="group relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-950/20 to-transparent p-5 hover:border-emerald-500/30 transition-all duration-300 hover:-translate-y-1 shadow-lg flex flex-col justify-between min-h-[140px]">
            <div class="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div class="relative flex items-start justify-between">
              <div class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/></svg>
              </div>
              <span class="text-[9px] font-black uppercase tracking-widest text-gray-500">Aggregate</span>
            </div>
            <div class="relative mt-4">
              {#if adminLoading}
                <div class="h-8 w-20 bg-white/5 rounded-lg animate-pulse"></div>
              {:else}
                <p class="text-3xl font-black text-white tracking-tight">{formatBytes(platformUsedBytes)}</p>
              {/if}
              <p class="text-[10px] text-gray-500 mt-1">Total storage consumed</p>
            </div>
          </div>

          <!-- Card 2: Total Registered Users -->
          <div class="group relative overflow-hidden rounded-2xl border border-blue-500/15 bg-gradient-to-br from-blue-950/20 to-transparent p-5 hover:border-blue-500/30 transition-all duration-300 hover:-translate-y-1 shadow-lg flex flex-col justify-between min-h-[140px]">
            <div class="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div class="relative flex items-start justify-between">
              <div class="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              </div>
              <span class="text-[9px] font-black uppercase tracking-widest text-gray-500">Total Users</span>
            </div>
            <div class="relative mt-4">
              {#if adminLoading}
                <div class="h-8 w-20 bg-white/5 rounded-lg animate-pulse"></div>
              {:else}
                <p class="text-3xl font-black text-white tracking-tight">{totalUsers}</p>
              {/if}
              <p class="text-[10px] text-gray-500 mt-1">Registered accounts</p>
            </div>
          </div>

          <!-- Card 3: Regular Members -->
          <div class="group relative overflow-hidden rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-cyan-950/20 to-transparent p-5 hover:border-cyan-500/30 transition-all duration-300 hover:-translate-y-1 shadow-lg flex flex-col justify-between min-h-[140px]">
            <div class="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div class="relative flex items-start justify-between">
              <div class="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                <svg class="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              </div>
              <span class="text-[9px] font-black uppercase tracking-widest text-gray-500">Users</span>
            </div>
            <div class="relative mt-4">
              {#if adminLoading}
                <div class="h-8 w-20 bg-white/5 rounded-lg animate-pulse"></div>
              {:else}
                <p class="text-3xl font-black text-white tracking-tight">{totalRegularUsers}</p>
              {/if}
              <p class="text-[10px] text-gray-500 mt-1">Standard member users</p>
            </div>
          </div>

          <!-- Card 4: Platform Administrators -->
          <div class="group relative overflow-hidden rounded-2xl border border-purple-500/15 bg-gradient-to-br from-purple-950/20 to-transparent p-5 hover:border-purple-500/30 transition-all duration-300 hover:-translate-y-1 shadow-lg flex flex-col justify-between min-h-[140px]">
            <div class="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div class="relative flex items-start justify-between">
              <div class="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              </div>
              <span class="text-[9px] font-black uppercase tracking-widest text-gray-500">Admins</span>
            </div>
            <div class="relative mt-4">
              {#if adminLoading}
                <div class="h-8 w-20 bg-white/5 rounded-lg animate-pulse"></div>
              {:else}
                <p class="text-3xl font-black text-white tracking-tight">{totalAdmins}</p>
              {/if}
              <p class="text-[10px] text-gray-500 mt-1">Platform administrators</p>
            </div>
          </div>

        </div>

        <!-- Right side: Top Storage Consumers Table -->
        <div class="lg:col-span-3 rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.01] to-transparent overflow-hidden shadow-xl flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.01]">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/></svg>
                <h3 class="text-xs font-bold text-white tracking-wide uppercase">Top Storage Consumers</h3>
              </div>
              <a href="/settings/set-limit" class="text-[12px] font-black text-gray-500 hover:text-blue-400 uppercase tracking-widest transition-colors">Manage Limits</a>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="border-b border-white/5 text-gray-500 font-bold bg-white/[0.005] text-[10px]">
                    <th class="p-3 pl-5">User</th>
                    <th class="p-3">Role</th>
                    <th class="p-3">Storage Used</th>
                    <th class="p-3 hidden sm:table-cell">Quota</th>
                    <th class="p-3 text-center pr-5">Usage</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                  {#if adminLoading}
                    {#each Array(3) as _}
                      <tr><td colspan="5" class="p-4"><div class="h-5 w-full bg-white/5 rounded animate-pulse"></div></td></tr>
                    {/each}
                  {:else if topStorageUsers.length === 0}
                    <tr><td colspan="5" class="p-8 text-center text-gray-500">No user data available.</td></tr>
                  {:else}
                    {#each topStorageUsers.slice(0, 5) as u (u.id)}
                      {@const pct = u.storage?.usagePercent ?? 0}
                      <tr class="transition-colors">
                        <td class="p-3 pl-5">
                          <button
                            type="button"
                            onclick={() => openProfileModal(u)}
                            class="group/user flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-white/5 transition-all duration-200 cursor-pointer active:scale-[0.98] text-left focus:outline-none"
                          >
                            <div class="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 group-hover/user:border-blue-400/40 flex items-center justify-center shrink-0 transition-all duration-200">
                              {#if u.avatarUrl}
                                <img src={u.avatarUrl} alt="" class="w-full h-full object-cover" />
                              {:else}
                                <span class="text-[11px] font-bold text-blue-300">{(u.username || u.walletAddress || 'U').charAt(0).toUpperCase()}</span>
                              {/if}
                            </div>
                            <div class="min-w-0">
                              <p class="font-semibold text-white truncate max-w-[120px] group-hover/user:text-blue-400 transition-colors duration-200">{u.username || 'No username'}</p>
                              <p class="text-[9px] text-gray-500 font-mono truncate">{formatAddress(u.walletAddress)}</p>
                            </div>
                          </button>
                        </td>
                        <td class="p-3">
                          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold
                            {u.role === 'ADMIN' ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30' : 'bg-white/5 text-gray-300 border border-white/10'}">
                            {u.role}
                          </span>
                        </td>
                        <td class="p-3 text-gray-300 font-medium">{formatBytes(u.storage?.usedBytes ?? 0)}</td>
                        <td class="p-3 hidden sm:table-cell text-gray-500">
                          {u.role === 'ADMIN' || u.storageLimit === null ? 'Unlimited' : formatBytes(u.storageLimit)}
                        </td>
                        <td class="p-3 pr-5">
                          <div class="flex items-center justify-center gap-2">
                            {#if u.role === 'ADMIN' || u.storageLimit === null}
                              <span class="text-[24px] text-blue-400">∞</span>
                            {:else}
                              <div class="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden hidden sm:block">
                                <div class="h-full rounded-full {pct >= 90 ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'bg-gradient-to-r from-blue-500 to-cyan-500'}" style="width: {Math.min(100, pct)}%"></div>
                              </div>
                              <span class="text-[9px] font-bold text-gray-400 w-9 text-right">{Math.round(pct)}%</span>
                            {/if}
                          </div>
                        </td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      <!-- Smart Contract Activity Log -->
      <div class="rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.01] to-transparent overflow-hidden shadow-xl">
        <div class="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.01]">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/20">
              <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
            </div>
            <h3 class="text-xs font-bold text-white tracking-wide uppercase">Smart Contract Activity</h3>
            <span class="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 uppercase tracking-widest">Sepolia</span>
          </div>
          <a href="/contract-activity" class="text-[10px] font-black text-gray-500 hover:text-blue-400 uppercase tracking-widest transition-colors flex items-center gap-1">
            View All
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </a>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-white/5 text-gray-500 font-bold bg-white/[0.005] text-[10px]">
                <th class="p-3 pl-5">Tx Hash</th>
                <th class="p-3">Method</th>
                <th class="p-3">From</th>
                <th class="p-3 hidden sm:table-cell">Gas Used</th>
                <th class="p-3 hidden md:table-cell">Value</th>
                <th class="p-3">Time</th>
                <th class="p-3 text-center pr-5">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              {#if contractTxLoading}
                {#each Array(3) as _}
                  <tr><td colspan="7" class="p-4"><div class="h-5 w-full bg-white/5 rounded animate-pulse"></div></td></tr>
                {/each}
              {:else if contractTxs.length === 0}
                <tr><td colspan="7" class="p-8 text-center text-gray-500">No contract transactions found.</td></tr>
              {:else}
                {#each contractTxs as tx (tx.hash)}
                  {@const matchedUser = allUsersMap.get(tx.from.toLowerCase())}
                  <tr class="transition-colors hover:bg-white/[0.02]">
                    <td class="p-3 pl-5">
                      <a href="https://sepolia.etherscan.io/tx/{tx.hash}" target="_blank" rel="noopener noreferrer" class="font-mono text-[10px] text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 transition-colors">
                        {tx.hash.slice(0, 8)}...{tx.hash.slice(-6)}
                        <svg class="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                      </a>
                    </td>
                    <td class="p-3">
                      <span class="font-mono px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-300">
                        {formatTxMethod(tx)}
                      </span>
                    </td>
                    <td class="p-3">
                      {#if matchedUser}
                        <button
                          type="button"
                          onclick={() => openProfileModal(matchedUser)}
                          class="group/from flex items-center gap-2 p-1 rounded-lg hover:bg-white/5 transition-all duration-200 cursor-pointer text-left focus:outline-none"
                        >
                          <div class="w-5 h-5 rounded-full overflow-hidden bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 group-hover/from:border-blue-400/40 flex items-center justify-center shrink-0 transition-all duration-200">
                            {#if matchedUser.avatarUrl}
                              <img src={matchedUser.avatarUrl} alt="" class="w-full h-full object-cover" />
                            {:else}
                              <span class="text-[8px] font-bold text-blue-300">{(matchedUser.username || matchedUser.walletAddress || 'U').charAt(0).toUpperCase()}</span>
                            {/if}
                          </div>
                          <span class="text-[10px] text-gray-300 group-hover/from:text-blue-400 transition-colors truncate max-w-[90px]">
                            {matchedUser.username || `${tx.from.slice(0, 6)}...${tx.from.slice(-4)}`}
                          </span>
                        </button>
                      {:else}
                        <a href="https://sepolia.etherscan.io/address/{tx.from}" target="_blank" rel="noopener noreferrer" class="font-mono text-[10px] text-gray-400 hover:text-blue-400 transition-colors">
                          {tx.from.slice(0, 6)}...{tx.from.slice(-4)}
                        </a>
                      {/if}
                    </td>
                    <td class="p-3 hidden sm:table-cell text-gray-400 font-mono text-[10px]">
                      {Number(tx.gasUsed).toLocaleString()}
                    </td>
                    <td class="p-3 hidden md:table-cell text-gray-500 font-mono text-[10px]">
                      {formatEthValue(tx.value)}
                    </td>
                    <td class="p-3 text-gray-500 text-[10px]">
                      {formatTimestamp(tx.timeStamp)}
                    </td>
                    <td class="p-3 text-center pr-5">
                      {#if tx.txreceipt_status === '1' || tx.isError === '0'}
                        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] font-black uppercase tracking-wider">
                          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          Success
                        </span>
                      {:else}
                        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-[8px] font-black uppercase tracking-wider">
                          <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                          Failed
                        </span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>

        <div class="p-3 border-t border-white/5 bg-white/[0.005] flex items-center justify-between">
          <p class="text-[8px] text-gray-500 font-semibold tracking-wide">Contract: {CONTRACT_ADDRESS.slice(0, 10)}...{CONTRACT_ADDRESS.slice(-6)}</p>
          <p class="text-[8px] text-gray-500 font-semibold tracking-wide">Showing latest {contractTxs.length} transactions</p>
        </div>
      </div>

    </div>
  {/if}

  <!-- ═══ 1. TOP ROW: SUMMARY METRICS CARDS ═══ -->
  {#if isAdmin}
    <div class="flex items-center gap-2.5 pt-2">
      <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
      </div>
      <h2 class="text-sm font-black uppercase tracking-widest text-white">Your Workspace</h2>
    </div>
  {/if}

  <div class="grid grid-cols-2 lg:grid-cols-4 gap-5">
    <!-- Card A (Total Private Files) -->
    <div class="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.01] p-5 hover:border-blue-500/20 hover:bg-white/[0.03] transition-all duration-300 hover:-translate-y-1 shadow-lg flex flex-col justify-between min-h-[140px]">
      <div class="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative flex items-start justify-between">
        <div class="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
          <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        </div>
        <span class="text-[9px] font-black uppercase tracking-widest text-gray-500">Private Vault</span>
      </div>
      <div class="relative mt-4">
        {#if isLoading}
          <div class="h-8 w-16 bg-white/5 rounded-lg animate-pulse"></div>
        {:else}
          <p class="text-3xl font-black text-white tracking-tight">{totalFilesOwned > 0 ? totalPrivateFiles : 16}</p>
        {/if}
        <p class="text-[10px] text-gray-500 mt-1">Total private items</p>
      </div>
    </div>

    <!-- Card B (On-Chain Status) -->
    <div class="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.01] p-5 hover:border-emerald-500/20 hover:bg-white/[0.03] transition-all duration-300 hover:-translate-y-1 shadow-lg flex flex-col justify-between min-h-[140px]">
      <div class="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative flex items-start justify-between">
        <div class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
          <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
        </div>
        {#if isLoading}
          <div class="h-4 w-12 bg-white/5 rounded animate-pulse"></div>
        {:else}
          <div class="flex flex-col items-end gap-1">
            <span class="text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {totalFilesOwned > 0 ? onChainSuccess : 12} Success
            </span>
            <span class="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {totalFilesOwned > 0 ? onChainPending : 4} Pending
            </span>
          </div>
        {/if}
      </div>
      <div class="relative mt-2">
        <p class="text-3xl font-black text-white tracking-tight">On-Chain</p>
        <p class="text-[10px] text-gray-500 mt-1">Smart contract verification</p>
      </div>
    </div>

    <!-- Card C (Shared with Me) -->
    <div class="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.01] p-5 hover:border-indigo-500/20 hover:bg-white/[0.03] transition-all duration-300 hover:-translate-y-1 shadow-lg flex flex-col justify-between min-h-[140px]">
      <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative flex items-start justify-between">
        <div class="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
          <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
        </div>
        <span class="text-[9px] font-black uppercase tracking-widest text-gray-500">Incoming Shares</span>
      </div>
      <div class="relative mt-4">
        {#if isLoading}
          <div class="h-8 w-16 bg-white/5 rounded-lg animate-pulse"></div>
        {:else}
          <p class="text-3xl font-black text-white tracking-tight">{sharedWithMeCount}</p>
        {/if}
        <p class="text-[10px] text-gray-500 mt-1">Shared by other wallets</p>
      </div>
    </div>

    <!-- Card D (Trash/Soft Delete) -->
    <div class="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.01] p-5 hover:border-rose-500/20 hover:bg-white/[0.03] transition-all duration-300 hover:-translate-y-1 shadow-lg flex flex-col justify-between min-h-[140px]">
      <div class="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative flex items-start justify-between">
        <div class="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
          <svg class="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </div>
        <span class="text-[9px] font-black uppercase tracking-widest text-gray-500">Archive bin</span>
      </div>
      <div class="relative mt-4">
        {#if isLoading}
          <div class="h-8 w-16 bg-white/5 rounded-lg animate-pulse"></div>
        {:else}
          <p class="text-3xl font-black text-white tracking-tight">{trashCount}</p>
        {/if}
        <p class="text-[10px] text-gray-500 mt-1">Pending permanent deletion</p>
      </div>
    </div>
  </div>

  <!-- ═══ 2. MIDDLE ROW: CHARTS & WALLET BALANCE WIDGET ═══ -->
  <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
    <!-- Chart Segment (File Distribution Donut) - 1.5 Col Width -->
    <div class="lg:col-span-1.5 rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.01] to-transparent p-5 shadow-xl flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xs font-bold text-white uppercase tracking-wider">File Distribution</h3>
        </div>
        <div class="relative flex items-center justify-center py-4">
          <svg viewBox="0 0 100 100" class="w-36 h-36 drop-shadow-[0_0_15px_rgba(59,130,246,0.1)]">
            <circle cx="50" cy="50" r="30" fill="transparent" stroke="rgba(255,255,255,0.03)" stroke-width="8"/>
            <circle cx="50" cy="50" r="30" fill="transparent" stroke="url(#privateGrad)" stroke-width="8"
              stroke-dasharray="{circ}" stroke-dashoffset="{privateOffset}" transform="rotate(-90 50 50)" class="transition-all duration-1000 ease-out"/>
            <circle cx="50" cy="50" r="30" fill="transparent" stroke="url(#publicGrad)" stroke-width="8"
              stroke-dasharray="{circ}" stroke-dashoffset="{publicOffset}" transform="rotate({publicRotation - 90} 50 50)" class="transition-all duration-1000 ease-out"/>
          </svg>
          <div class="absolute flex flex-col items-center justify-center text-center">
            <span class="text-xl font-black text-white">{chartTotal}</span>
            <span class="text-[8px] font-black text-gray-500 uppercase tracking-widest">Total Files</span>
          </div>
        </div>
      </div>
      <div class="space-y-2 mt-2 bg-black/25 p-3 rounded-xl border border-white/5 text-[10px]">
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-1.5 font-semibold text-gray-400">
            <span class="w-2 h-2 rounded-full bg-blue-500"></span> Private Storage
          </span>
          <span class="text-white font-bold">{chartPrivate} ({Math.round(privatePercent * 100)}%)</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-1.5 font-semibold text-gray-400">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span> Explore Network
          </span>
          <span class="text-white font-bold">{chartPublic} ({Math.round(publicPercent * 100)}%)</span>
        </div>
      </div>
    </div>

    <!-- Web3 E-Wallet Balance Widget - 1.5 Col Width -->
    <div class="lg:col-span-1.5 rounded-2xl border border-white/5 bg-gradient-to-b from-purple-950/10 via-indigo-950/5 to-transparent p-5 shadow-xl flex flex-col justify-between relative overflow-hidden">
      <div class="absolute top-0 right-0 w-28 h-28 bg-purple-500/5 rounded-full blur-2xl"></div>
      
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-xs font-bold text-white uppercase tracking-wider">Web3 Balance</h3>
          <span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">{networkName || 'Fetching...'}</span>
        </div>

        {#if web3Loading}
          <div class="space-y-3 py-4">
            <div class="h-8 w-28 bg-white/5 rounded-lg animate-pulse"></div>
            <div class="h-4 w-40 bg-white/5 rounded animate-pulse"></div>
          </div>
        {:else}
          <div class="py-3">
            <div class="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Estimated Balance</div>
            <div class="flex items-baseline gap-1.5 mt-1">
              <span class="text-3xl font-black text-white tracking-tight">{walletBalance || '0.0000'}</span>
              <span class="text-xs font-extrabold text-purple-400">ETH</span>
            </div>
            <p class="text-[10px] text-gray-400 mt-1 font-semibold">
              ≈ ${(parseFloat(walletBalance || '0') * 3520).toLocaleString('en-US', {maximumFractionDigits: 2})} USD
            </p>
          </div>
        {/if}
      </div>

      <div class="mt-4 pt-3 border-t border-white/5 flex flex-col gap-2">
        <div class="flex justify-between items-center text-[10px]">
          <span class="text-gray-500 font-semibold">Network State</span>
          <span class="text-emerald-400 font-bold flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Connected
          </span>
        </div>
        <div class="flex justify-between items-center text-[10px]">
          <span class="text-gray-500 font-semibold">Gas Fee Rate</span>
          <span class="text-white font-bold font-mono">18 Gwei</span>
        </div>
        <button 
          onclick={() => loadWeb3Details()} 
          class="w-full mt-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold text-gray-300 hover:text-white transition-all border border-white/5 flex items-center justify-center gap-1.5"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.29"/></svg>
          Sync Wallet
        </button>
      </div>
    </div>

    <!-- Chart 2: Upload & Validation Activity (Line Chart) - 2 Col Width -->
    <div class="lg:col-span-2 rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.01] to-transparent p-5 shadow-xl flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-2">
          <div>
            <h3 class="text-xs font-bold text-white uppercase tracking-wider">Network Activity</h3>
          </div>
          <div class="flex items-center gap-3 text-[9px]">
            <span class="flex items-center gap-1 font-semibold text-blue-400">
              <span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span> IPFS
            </span>
            <span class="flex items-center gap-1 font-semibold text-amber-400">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> ETH
            </span>
          </div>
        </div>

        <div class="relative w-full h-[130px] mt-2">
          <svg class="w-full h-full" viewBox="0 0 380 130" preserveAspectRatio="none">
            {#each Array(4) as _, i}
              {@const y = 20 + i * 30}
              <line x1="30" y1="{y}" x2="370" y2="{y}" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
            {/each}

            {#each activityData as item, i}
              {@const x = 40 + i * 55}
              <text x="{x}" y="125" fill="#6b7280" font-size="8" text-anchor="middle" font-family="monospace">{item.day}</text>
            {/each}

            {#each [10, 5, 0] as label, i}
              {@const y = 25 + i * 45}
              <text x="20" y="{y}" fill="#6b7280" font-size="8" text-anchor="end" font-family="monospace">{label}</text>
            {/each}

            <path d="{pathUploaded}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
            <path d="{pathConfirmed}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 3"/>
          </svg>
        </div>
      </div>
      <div class="flex items-center justify-between border-t border-white/5 pt-2 mt-1">
        <span class="text-[8px] text-gray-500 font-bold uppercase tracking-wider">Verification Ratio</span>
        <span class="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">+42.8%</span>
      </div>
    </div>
  </div>

  <!-- Wallet Transaction History -->
  <div class="rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.01] to-transparent overflow-hidden shadow-xl">
    <div class="flex items-center justify-between p-5 border-b border-white/5 bg-white/[0.005]">
      <div class="flex items-center gap-2">
        <svg class="w-4.5 h-4.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
        <h3 class="text-sm font-bold text-white tracking-wide">Wallet Transaction History</h3>
      </div>
      <span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-widest font-mono">Sepolia Scan Ledger</span>
    </div>
    
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs border-collapse">
        <thead>
          <tr class="border-b border-white/5 text-gray-500 font-bold bg-white/[0.005]">
            <th class="p-4">Transaction Hash</th>
            <th class="p-4">Smart Contract Method</th>
            <th class="p-4">Gas Consumed</th>
            <th class="p-4">Gas Cost (ETH)</th>
            <th class="p-4">Timestamp</th>
            <th class="p-4 text-right">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5 font-medium">
          {#if web3Loading}
            <tr>
              <td colspan="6" class="p-8 text-center text-gray-500 animate-pulse">Loading transaction logs...</td>
            </tr>
          {:else if transactionHistory.length === 0}
            <tr>
              <td colspan="6" class="p-8 text-center text-gray-500">No Web3 transactions detected for this wallet.</td>
            </tr>
          {:else}
            {#each transactionHistory as tx (tx.id)}
              <tr class="hover:bg-white/[0.015] transition-colors">
                <td class="p-4 font-mono text-[10px] text-blue-400 select-all">
                  <a href="https://sepolia.etherscan.io/tx/{tx.hash}" target="_blank" class="hover:underline flex items-center gap-1">
                    {tx.hash.slice(0, 12)}...{tx.hash.slice(-10)}
                    <svg class="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  </a>
                </td>
                <td class="p-4">
                  <span class="font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-gray-300">
                    {tx.method}
                  </span>
                </td>
                <td class="p-4 font-mono text-[10px] text-gray-400">{tx.gasUsed} gas</td>
                <td class="p-4 text-gray-300 font-mono">{tx.cost}</td>
                <td class="p-4 text-gray-500">
                  {#if tx.time.includes('ago')}
                    {tx.time}
                  {:else}
                    {formatDate(tx.time)}
                  {/if}
                </td>
                <td class="p-4 text-right">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider">
                    {tx.status}
                  </span>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- ═══ 3. BOTTOM ROW: THREE-COLUMN CORE DETAILS GRID ═══ -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    
    <!-- Table 1: Recent "Shared With Me" Files (1st Column) -->
    <div class="rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.01] to-transparent overflow-hidden shadow-xl flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.01]">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            <h3 class="text-xs font-bold text-white tracking-wide uppercase">Shared With Me</h3>
          </div>
          <a href="/shared" class="text-[9px] font-black text-gray-500 hover:text-white uppercase tracking-widest transition-colors">View All</a>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-white/5 text-gray-500 font-bold bg-white/[0.005] text-[10px]">
                <th class="p-3">File Name</th>
                <th class="p-3">Sender</th>
                <th class="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              {#each sharedFiles as file (file.id)}
                <tr class="hover:bg-white/[0.02] transition-colors">
                  <td class="p-3 font-semibold text-white truncate max-w-[100px]">{file.fileName}</td>
                  <td class="p-3 font-mono text-[9px] text-gray-400">{formatAddress(file.sender)}</td>
                  <td class="p-3 text-right">
                    <a href="/shared" class="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-[9px] font-bold text-white shadow-sm transition-colors">
                      View
                    </a>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
      <div class="p-3 border-t border-white/5 bg-white/[0.005] flex items-center justify-center">
        <p class="text-[8px] text-gray-500 font-semibold tracking-wide">Sync is signed with active wallet</p>
      </div>
    </div>

    <!-- Table 2: On-Chain Validation Queue (2nd Column) -->
    <div class="rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.01] to-transparent overflow-hidden shadow-xl flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.01]">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 9.172V5L8 4z"/></svg>
            <h3 class="text-xs font-bold text-white tracking-wide uppercase">Validation Queue</h3>
          </div>
          <a href="/validate" class="text-[9px] font-black text-gray-500 hover:text-white uppercase tracking-widest transition-colors">Audit</a>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-white/5 text-gray-500 font-bold bg-white/[0.005] text-[10px]">
                <th class="p-3">File Name</th>
                <th class="p-3">CID Hash</th>
                <th class="p-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              {#each validationQueue as queueItem (queueItem.id)}
                <tr class="hover:bg-white/[0.02] transition-colors">
                  <td class="p-3 font-semibold text-white truncate max-w-[100px]">{queueItem.fileName}</td>
                  <td class="p-3 font-mono text-[9px] text-blue-400 select-all">{queueItem.ipfsHash.slice(0, 5)}...{queueItem.ipfsHash.slice(-4)}</td>
                  <td class="p-3 text-right">
                    {#if queueItem.status === 'Success'}
                      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] font-black uppercase tracking-wider">
                        Success
                      </span>
                    {:else if queueItem.status === 'In Progress'}
                      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[8px] font-black uppercase tracking-wider animate-pulse">
                        Pending
                      </span>
                    {:else}
                      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[8px] font-black uppercase tracking-wider">
                        Failed
                      </span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
      <div class="p-3 border-t border-white/5 bg-white/[0.005] flex items-center justify-center">
        <p class="text-[8px] text-gray-500 font-semibold tracking-wide">Blockchain transactions undergo block confirmation</p>
      </div>
    </div>

    <!-- Table 3: Recent Document Activity / Modifications (3rd Column, Max 5) -->
    <div class="rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.01] to-transparent overflow-hidden shadow-xl flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.01]">
          <div class="flex items-center gap-2">
            <svg class="w-4.5 h-4.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <h3 class="text-xs font-bold text-white tracking-wide uppercase">Recent Activity</h3>
          </div>
          <a href="/storage" class="text-[9px] font-black text-gray-500 hover:text-white uppercase tracking-widest transition-colors">Explorer</a>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-white/5 text-gray-500 font-bold bg-white/[0.005] text-[10px]">
                <th class="p-3">File Name</th>
                <th class="p-3 text-center">Action</th>
                <th class="p-3 text-right">Modified</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              {#each recentModifications as doc (doc.id)}
                {@const ft = getFileIcon(doc.mimeType, doc.actionType)}
                <tr class="hover:bg-white/[0.02] transition-colors">
                  <td class="p-3 font-semibold text-white truncate max-w-[110px] flex items-center gap-1.5">
                    <span class="text-xs">{ft.icon}</span>
                    <span class="truncate">{doc.fileName}</span>
                  </td>
                  <td class="p-3 text-center">
                    <span class="font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] text-gray-300">
                      {formatAction(doc.actionType)}
                    </span>
                  </td>
                  <td class="p-3 text-right font-medium text-gray-400 text-[10px]">
                    {#if doc.updatedAt.includes('ago')}
                      {doc.updatedAt}
                    {:else}
                      {formatDate(doc.updatedAt)}
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
      <div class="p-3 border-t border-white/5 bg-white/[0.005] flex items-center justify-center">
        <p class="text-[8px] text-gray-500 font-semibold tracking-wide">Showing up to 5 latest modified items</p>
      </div>
    </div>

  </div>

</div>

<!-- ── Profile Preview Modal ── -->
<ProfilePreviewModal
  isOpen={showProfileModal}
  onClose={closeProfileModal}
  profile={selectedProfile}
/>
