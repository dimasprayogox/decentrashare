// src/routes/api/auth/logout/+server.ts
import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';

export const POST = async ({ cookies, fetch }) => {
  try {
    const session = cookies.get('session_token');
    // 1. Call Express backend logout endpoint (untuk hapus refreshToken di DB)
    const backendRes = await fetch(`${PUBLIC_API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': session ? `Bearer ${session}` : ''
      },
    });

    // 2. Baca & parse response backend
    const responseText = await backendRes.text();
    let result;
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      result = { success: false, message: responseText || `HTTP ${backendRes.status} Error` };
    }

    const isProduction = import.meta.env.PROD;

    // 3. 🗑️ HAPUS COOKIE session_token dan refresh_token
    cookies.delete('session_token', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: isProduction,
    });

    cookies.delete('refresh_token', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: isProduction,
    });

    // 4. Return success response
    return json({
      success: true,
      message: result?.message || 'Logged out successfully'
    }, { status: 200 });

  } catch (error: any) {
    console.error('[API] Logout error:', error);
    
    const isProduction = import.meta.env.PROD;

    // Fallback: tetap hapus cookie walau backend error
    cookies.delete('session_token', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: isProduction,
    });

    cookies.delete('refresh_token', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: isProduction,
    });
    
    return json({
      success: false,
      message: error.message || 'Logout failed'
    }, { status: 500 });
  }
};