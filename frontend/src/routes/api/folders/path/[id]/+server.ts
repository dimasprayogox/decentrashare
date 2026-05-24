import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import type { RequestHandler } from './$types';

async function proxyToBackend(method: string, endpoint: string) {
  const backendRes = await fetch(`${PUBLIC_API_BASE_URL}${endpoint}`, { method, headers: { 'Content-Type': 'application/json' } });
  const responseText = await backendRes.text();
  let result;
  try { result = responseText ? JSON.parse(responseText) : {}; }
  catch { result = { success: false, message: responseText || `HTTP ${backendRes.status} Error` }; }
  return { backendRes, result };
}

export const GET: RequestHandler = async ({ params }) => {
  try {
    const { id } = params;
    const { backendRes, result } = await proxyToBackend('GET', `/folders/path/${id}`);
    if (!backendRes.ok || !result?.success) {
      return json({ success: false, message: result?.message || 'Failed', errorCode: result?.errorCode }, { status: backendRes.status || 404 });
    }
    return json(result, { status: backendRes.status });
  } catch (e) {
    return json({ success: false, message: 'Internal error', errorCode: 'INTERNAL_ERROR' }, { status: 500 });
  }
};