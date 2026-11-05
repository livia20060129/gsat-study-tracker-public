import { CLOUD_TRANSLATION_QUOTA_MESSAGE, cloudTranslationInput, cloudTranslationResult, type CloudTranslation } from './cloudTranslationProtocol.ts';

export interface CloudTranslationPorts {
  authenticate(token: string): Promise<string | null>;
  configured(): boolean;
  reserve(userId: string, characters: number): Promise<boolean>;
  translate(text: string, signal: AbortSignal): Promise<CloudTranslation>;
}
const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };
function reply(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, code, message }), { status, headers: HEADERS });
}
async function requestText(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_body');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16384) { await reader.cancel(); throw new Error('body_too_large'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(data);
}

export function createCloudTranslationHandler(ports: CloudTranslationPorts, timeoutMilliseconds = 8000): (request: Request) => Promise<Response> {
  return async function handleTranslation(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
    if (request.method !== 'POST') return reply(405, 'method_not_allowed', '請使用翻譯按鈕送出查詢。');
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return reply(401, 'authentication_required', '請先登入 Tracker，再使用 Google 翻譯。');
    let userId: string | null;
    try { userId = await ports.authenticate(token); }
    catch { return reply(503, 'authentication_unavailable', '目前無法確認登入，請稍後再試。'); }
    if (!userId) return reply(401, 'authentication_required', '登入已失效，請重新登入 Tracker。');
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply(415, 'invalid_content_type', '翻譯請求格式不正確。');
    let text: string | null;
    try { text = cloudTranslationInput((JSON.parse(await requestText(request)) as { text?: unknown })?.text); }
    catch (error) { return reply(error instanceof Error && error.message === 'body_too_large' ? 413 : 400, 'invalid_input', '請輸入 1～2000 字元的英文內容。'); }
    if (!text) return reply(400, 'invalid_input', '請輸入 1～2000 字元的英文內容。');
    if (!ports.configured()) return reply(503, 'translation_not_configured', 'Google 翻譯尚未啟用，請聯絡網站管理者。');
    try {
      if (!await ports.reserve(userId, Array.from(text).length)) return reply(429, 'translation_quota_exceeded', CLOUD_TRANSLATION_QUOTA_MESSAGE);
    } catch { return reply(503, 'translation_quota_unavailable', '目前無法確認翻譯額度，請稍後再試。'); }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
    try {
      const result = cloudTranslationResult(await ports.translate(text, controller.signal), text);
      if (!result) return reply(502, 'invalid_translation_response', 'Google 翻譯暫時無法提供結果，請稍後再試。');
      return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: HEADERS });
    } catch {
      return reply(controller.signal.aborted ? 504 : 502, 'translation_unavailable', 'Google 翻譯暫時無法使用；既有翻譯已保留。');
    } finally { clearTimeout(timeout); }
  };
}
