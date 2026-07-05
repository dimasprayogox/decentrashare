<!-- src/routes/+layout.svelte -->
<script>
  import Sidebar from '$lib/components/dashboard/Sidebar.svelte';
  import Header from '$lib/components/dashboard/Header.svelte';
  import Footer from '$lib/components/dashboard/Footer.svelte';

  let { children, data } = $props();
</script>

<div class="min-h-screen bg-slate-50 dark:bg-[#0a0a0c] lg:flex transition-colors duration-300">
  
  <Sidebar
    active={data?.active ?? 'dashboard'}
    subActive={data?.subActive ?? ''}
    storageUsage={data?.storageUsage}
    role={data?.role ?? 'USER'}
  />
  
  <div class="flex-1 flex flex-col min-w-0 overflow-x-hidden">
    <Header userAddress={data?.userAddress} />
    
    <main class="flex-1 p-4 md:p-8 lg:p-10">
      {@render children()}
    </main>

    <Footer />
  </div>
</div>