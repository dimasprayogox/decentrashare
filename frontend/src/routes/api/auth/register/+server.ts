// src/routes/api/auth/register/+server.ts
import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';

export const POST = async ({ request, cookies }) => {
  const body = await request.json();

  // 1. Forward ke backend register endpoint
  const backendRes = await fetch(`${PUBLIC_API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const responseText = await backendRes.text();
  let result;
  try { result = responseText ? JSON.parse(responseText) : {}; }
  catch { result = { success: false, message: responseText || `HTTP ${backendRes.status} Error` }; }

  // 2. Jika sukses, simpan cookie
  if (backendRes.ok && result?.success) {
    const token = result?.data?.token || result?.token;
    const refreshToken = result?.data?.refreshToken || result?.refreshToken;
    const isProduction = import.meta.env.PROD;

    if (token) {
      cookies.set('session_token', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: isProduction,
        maxAge: 60 * 60 * 24
      });
    }

    if (refreshToken) {
      cookies.set('refresh_token', refreshToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: isProduction,
        maxAge: 60 * 60 * 24 * 7
      });
    }
    return json(result, { status: backendRes.status });
  }

  // 3. Forward error dengan status code & message asli
  return json(
    { 
      success: false, 
      message: result?.message || 'Registration failed',
      ...(result?.errorCode && { errorCode: result.errorCode })
    },
    { status: backendRes.status }
  );
};