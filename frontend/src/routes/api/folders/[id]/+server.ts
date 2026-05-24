// import { json } from '@sveltejs/kit';
// import { PUBLIC_API_BASE_URL } from '$env/static/public';
// import type { RequestHandler } from './$types';

// async function proxyToBackend(method: string, endpoint: string, body?: any) {
//   const headers = body ? { 'Content-Type': 'application/json' } : {};
//   const backendRes = await fetch(`${PUBLIC_API_BASE_URL}${endpoint}`, {
//     method, headers, body: body ? JSON.stringify(body) : undefined
//   });
//   const responseText = await backendRes.text();
//   let result;
//   try { result = responseText ? JSON.parse(responseText) : {}; }
//   catch { result = { success: false, message: responseText || `HTTP ${backendRes.status} Error` }; }
//   return { backendRes, result };
// }

// // GET: Get folder detail
// export const GET: RequestHandler = async ({ params }) => {
//   try {
//     const { id } = params;
//     const { backendRes, result } = await proxyToBackend('GET', `/folders/${id}`);
//     if (!backendRes.ok || !result?.success) {
//       return json({ success: false, message: result?.message || 'Folder not found', errorCode: result?.errorCode }, { status: backendRes.status || 404 });
//     }
//     return json(result, { status: backendRes.status });
//   } catch (e) {
//     return json({ success: false, message: 'Internal error', errorCode: 'INTERNAL_ERROR' }, { status: 500 });
//   }
// };

// // PATCH: Rename folder (with FOLDER_EXISTS handling)
// export const PATCH: RequestHandler = async ({ params, request }) => {
//   try {
//     const { id } = params;
//     const body = await request.json();
//     const { backendRes, result } = await proxyToBackend('PATCH', `/folders/${id}`, body);
    
//     if (!backendRes.ok || !result?.success) {
//       // ✅ Forward FOLDER_EXISTS error untuk duplicate name validation
//       return json({ 
//         success: false, 
//         message: result?.message || 'Failed to rename', 
//         errorCode: result?.errorCode // ← 'FOLDER_EXISTS' akan diteruskan
//       }, { status: backendRes.status || 400 });
//     }
//     return json(result, { status: backendRes.status });
//   } catch (e) {
//     return json({ success: false, message: 'Internal error', errorCode: 'INTERNAL_ERROR' }, { status: 500 });
//   }
// };