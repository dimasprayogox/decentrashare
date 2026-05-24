// src/routes/api/auth/logout/+server.ts
import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';

export const POST = async ({ cookies, fetch }) => {
  try {
    // 1. Call Express backend logout endpoint (untuk hapus refreshToken di DB)
    const backendRes = await fetch(`${PUBLIC_API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // ⚠️ Jangan kirim credentials: include di sini!
      // Cookie session_token akan otomatis dikirim oleh SvelteKit via cookies.get()
      // jika Anda perlu mengirim token ke backend untuk validasi
    });

    // 2. Baca & parse response backend
    const responseText = await backendRes.text();
    let result;
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      result = { success: false, message: responseText || `HTTP ${backendRes.status} Error` };
    }

    // 3. 🗑️ HAPUS COOKIE session_token (WAJIB - parameter HARUS match dengan login!)
    cookies.delete('session_token', {
      path: '/',                          // ← Harus SAMA dengan cookies.set() di login
      httpOnly: true,                     // ← Harus SAMA
      sameSite: 'strict',                 // ← Harus SAMA  
      secure: process.env.NODE_ENV === 'production',  // ← Harus SAMA
      // ⚠️ Jangan sertakan maxAge saat delete!
    });

    // 4. Return success response
    return json({
      success: true,
      message: result?.message || 'Logged out successfully'
    }, { status: 200 });

  } catch (error: any) {
    console.error('[API] Logout error:', error);
    
    // Fallback: tetap hapus cookie walau backend error
    cookies.delete('session_token', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production'
    });
    
    return json({
      success: false,
      message: error.message || 'Logout failed'
    }, { status: 500 });
  }
};