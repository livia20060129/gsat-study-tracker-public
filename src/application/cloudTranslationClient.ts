import { CLOUD_TRANSLATION_QUOTA_MESSAGE, cloudTranslationInput, cloudTranslationResult, type CloudTranslation } from '../study/cloudTranslation.ts';
import { activeStudyRecordPrefix } from '../study/materialProgress.ts';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config/supabase.ts';
import { browserAuthPersistence, createPersistentAuthStorage } from '../infrastructure/storage/browserAuthStorage.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

interface TranslationSession { accessToken: string; userId: string }
export class CloudTranslationError extends Error {}
export interface TranslationClientPorts {
  session(): Promise<TranslationSession | null>;
  scope(): string;
  request(token: string, text: string, signal: AbortSignal): Promise<Response>;
}

export function createCloudTranslationClient(ports: TranslationClientPorts): {
  translate(text: string, scope: string, signal: AbortSignal): Promise<CloudTranslation>;
} {
  return { async translate(value, scope, signal): Promise<CloudTranslation> {
    const text = cloudTranslationInput(value);
    if (!text) throw new CloudTranslationError('請輸入 1～2000 字元的英文內容。');
    if (!/^study-v11:user:[^:]+:$/.test(scope) || ports.scope() !== scope) throw new CloudTranslationError('請先登入 Tracker，再使用 Google 翻譯。');
    const session = await ports.session();
    if (!session || scope !== `study-v11:user:${session.userId}:` || ports.scope() !== scope) throw new CloudTranslationError('請先登入正確的 Tracker 帳號。');
    if (signal.aborted) throw new CloudTranslationError('翻譯已取消。');
    const controller = new AbortController();
    function cancel(): void { controller.abort(); }
    signal.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(cancel, 12000);
    try {
      const response = await ports.request(session.accessToken, text, controller.signal);
      const body = await response.json() as { ok?: boolean; code?: string; result?: unknown };
      if (signal.aborted || ports.scope() !== scope) throw new CloudTranslationError('資料空間已改變，翻譯結果不會填入。');
      const currentSession = await ports.session();
      if (!currentSession || currentSession.userId !== session.userId || ports.scope() !== scope || signal.aborted)
        throw new CloudTranslationError('登入或資料空間已改變，翻譯結果不會填入。');
      if (!response.ok || !body.ok) {
        if (response.status === 401) throw new CloudTranslationError('登入已失效，請重新登入 Tracker。');
        if (response.status === 429) throw new CloudTranslationError(CLOUD_TRANSLATION_QUOTA_MESSAGE);
        if (body.code === 'translation_not_configured') throw new CloudTranslationError('Google 翻譯尚未啟用，請聯絡網站管理者。');
        throw new CloudTranslationError('Google 翻譯暫時無法使用；既有翻譯已保留。');
      }
      const result = cloudTranslationResult(body.result, text);
      if (!result) throw new CloudTranslationError('翻譯結果不符合這段英文，尚未填入。');
      return result;
    } finally { clearTimeout(timeout); signal.removeEventListener('abort', cancel); }
  } };
}

let client: Promise<SupabaseClient> | undefined;
const translationClient = createCloudTranslationClient({
  scope(): string { return activeStudyRecordPrefix(localStorage); },
  async session(): Promise<TranslationSession | null> {
    if (!client) client = import('@supabase/supabase-js').then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: {
      storage: createPersistentAuthStorage(browserAuthPersistence(indexedDB), localStorage),
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
    } })).catch(function unavailable(error): never { client = undefined; throw error; });
    const authClient = await client;
    const { data, error } = await authClient.auth.getSession();
    if (error || !data.session) return null;
    return { accessToken: data.session.access_token, userId: data.session.user.id };
  },
  request(token, text, signal): Promise<Response> {
    return fetch(`${SUPABASE_URL}/functions/v1/cloud-translate`, { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text }),
    });
  },
});
export const translateWithGoogle = translationClient.translate;
