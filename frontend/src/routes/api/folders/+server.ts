// src/routes/api/documents/folders/+server.ts
import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import type { RequestHandler } from './$types';

// ── Helper: Proxy request ke Express backend ──
async function proxyToBackend(
  method: string,
  endpoint: string,
  body?: any,
  isFormData: boolean = false
) {
  const headers: Record<string, string> = {};
  if (!isFormData && body) {
    headers['Content-Type'] = 'application/json';
  }
  
  const backendRes = await fetch(`${PUBLIC_API_BASE_URL}${endpoint}`, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined)
  });

  // Baca response sebagai text dulu (handle JSON & non-JSON)
  const responseText = await backendRes.text();
  let result;
  
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    result = { success: false, message: responseText || `HTTP ${backendRes.status} Error` };
  }

  return { backendRes, result };
}

// ── Helper: Format error response konsisten ──
function errorResponse(message: string, errorCode?: string, status: number = 400) {
  return json(
    { 
      success: false, 
      message,
      ...(errorCode && { errorCode })
    },
    { status }
  );
}