import { json, type RequestHandler } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';

function getCookieValue(cookieString: string, name: string): string | null {
  const match = cookieString.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
  return match ? match[2] : null;
}

export const POST: RequestHandler = async ({ cookies }) => {
  const refreshToken = cookies.get('refresh_token');

  if (!refreshToken) {
    return json(
      { success: false, message: 'Refresh token is missing from cookies', errorCode: 'REFRESH_TOKEN_REQUIRED' },
      { status: 400 }
    );
  }

  try {
    // 1. Forward ke backend refresh endpoint dengan cookie refresh_token
    const backendRes = await fetch(`${PUBLIC_API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `refresh_token=${refreshToken}`
      }
    });

    const responseText = await backendRes.text();
    let result;
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      result = { success: false, message: responseText || `HTTP ${backendRes.status} Error` };
    }

    if (backendRes.ok && result?.success) {
      // 2. Ambil token baru dari response JSON backend
      let newAccessToken = result?.data?.token || result?.token || result?.data?.user?.token;
      let newRefreshToken = result?.data?.refreshToken || result?.refreshToken || result?.data?.user?.refreshToken;

      // 3. Fallback: Jika backend tidak mengirim token di JSON body, ambil dari header Set-Cookie
      const setCookies = backendRes.headers.getSetCookie();
      if (setCookies && setCookies.length > 0) {
        for (const cookieStr of setCookies) {
          const sessionVal = getCookieValue(cookieStr, 'session_token');
          if (sessionVal) newAccessToken = sessionVal;

          const refreshVal = getCookieValue(cookieStr, 'refresh_token');
          if (refreshVal) newRefreshToken = refreshVal;
        }
      }

      const isProduction = import.meta.env.PROD;

      if (newAccessToken) {
        cookies.set('session_token', newAccessToken, {
          path: '/',
          httpOnly: true,
          sameSite: 'strict',
          secure: isProduction,
          maxAge: 60 * 60 * 24 // 24 hours
        });
      }

      if (newRefreshToken) {
        cookies.set('refresh_token', newRefreshToken, {
          path: '/',
          httpOnly: true,
          sameSite: 'strict',
          secure: isProduction,
          maxAge: 60 * 60 * 24 * 7 // 7 days
        });
      }

      return json({
        success: true,
        token: newAccessToken,
        data: result.data
      });
    }

    return json(result, { status: backendRes.status });

  } catch (err: any) {
    console.error('[SvelteKit] POST /api/auth/refresh error:', err);
    return json(
      { success: false, message: 'Failed to connect to server', errorCode: 'CONNECTION_ERROR' },
      { status: 503 }
    );
  }
};
