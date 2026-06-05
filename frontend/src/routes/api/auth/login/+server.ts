import { json, type RequestHandler } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const body = await request.json();

  cookies.delete('session_token', {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: import.meta.env.PROD
  });

  const backendRes = await fetch(`${PUBLIC_API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const responseText = await backendRes.text();
  let result;
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    result = { success: false, message: responseText || `HTTP ${backendRes.status} Error` };
  }

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
        maxAge: 60 * 60 * 24 // 24 hours
      });
    }

    if (refreshToken) {
      cookies.set('refresh_token', refreshToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: isProduction,
        maxAge: 60 * 60 * 24 * 7 // 7 days
      });
    }

    return json(result, { status: backendRes.status });
  }

  return json(
    {
      success: false,
      message: result?.message || 'Verification Failed',
      ...(result?.errorCode && { errorCode: result.errorCode })
    },
    { status: backendRes.status }
  );
};