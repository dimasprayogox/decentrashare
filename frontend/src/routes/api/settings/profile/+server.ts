import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';

// ─────────────────────────────────────────────────────────────
// GET /api/user/me - Get current user profile
// ─────────────────────────────────────────────────────────────
export const GET = async ({ cookies }) => {
  try {
    // 1. Forward ke Express backend dengan cookie session
    const backendRes = await fetch(`${PUBLIC_API_BASE_URL}/users/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session_token=${cookies.get('session_token')}`
      },
      credentials: 'include'
    });

    // 2. Parse response
    const responseText = await backendRes.text();
    let result;
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      result = { success: false, message: responseText || `HTTP ${backendRes.status} Error` };
    }

    // 3. Return response (forward status code)
    return json(result, { status: backendRes.status });

  } catch (err: any) {
    console.error('[SvelteKit] GET /api/users/me error:', err);
    return json(
      { success: false, message: 'Failed to connect to server', errorCode: 'CONNECTION_ERROR' },
      { status: 503 }
    );
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/user/me - Update user profile
// ─────────────────────────────────────────────────────────────
export const PUT = async ({ request, cookies }) => {
  try {
    const body = await request.json();

    // 1. Forward ke Express backend
    const backendRes = await fetch(`${PUBLIC_API_BASE_URL}/users/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session_token=${cookies.get('session_token')}`
      },
      body: JSON.stringify(body),
      credentials: 'include'
    });

    // 2. Parse response
    const responseText = await backendRes.text();
    let result;
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      result = { success: false, message: responseText || `HTTP ${backendRes.status} Error` };
    }

    // 3. Return response (forward status code)
    return json(result, { status: backendRes.status });

  } catch (err: any) {
    console.error('[SvelteKit] PUT /api/users/me error:', err);
    return json(
      { success: false, message: 'Failed to connect to server', errorCode: 'CONNECTION_ERROR' },
      { status: 503 }
    );
  }
};