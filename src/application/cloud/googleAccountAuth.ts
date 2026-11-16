import { requestedStudyDate } from '../../ui/siteNavigation.ts';

export const GOOGLE_AUTH_INTENT_KEY = 'study-v11:auth:google-intent';
const INTENT_MAX_AGE = 20 * 60 * 1000;
export interface GoogleAuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export interface GoogleAuthUser {
  id: string;
  identities?: { provider: string }[];
  app_metadata?: { provider?: string; providers?: string[] };
}
export interface GoogleAuthIntent {
  version: 1;
  attempt: string;
  kind: 'signin';
  date: string;
  startedAt: number;
}
export interface GoogleAuthReturn {
  requested: boolean;
  intent: GoogleAuthIntent | null;
  error: string | null;
  allowExchange: boolean;
}

export class GoogleAuthDraftError extends Error {
  constructor(message = '登入前的讀書紀錄尚未保存，請先按「儲存」查看原因並修正後再試；目前內容仍保留。') {
    super(message);
    this.name = 'GoogleAuthDraftError';
  }
}

class GoogleAuthStorageError extends Error {
  constructor() {
    super('無法保存登入狀態，請確認瀏覽器允許此網站使用儲存空間後再試一次。');
    this.name = 'GoogleAuthStorageError';
  }
}

/** Keep SDK verifier failures in the auth-storage stage without changing persistence. */
export function guardGoogleAuthStorage(storage: GoogleAuthStorage): GoogleAuthStorage {
  return {
    async getItem(key): Promise<string | null> {
      try { return await storage.getItem(key); }
      catch { throw new GoogleAuthStorageError(); }
    },
    async setItem(key, value): Promise<void> {
      try { await storage.setItem(key, value); }
      catch { throw new GoogleAuthStorageError(); }
    },
    async removeItem(key): Promise<void> {
      try { await storage.removeItem(key); }
      catch { throw new GoogleAuthStorageError(); }
    },
  };
}

function requireSavedDraft(saveDraft: () => boolean): void {
  try {
    if (saveDraft()) return;
  } catch (error) {
    if (error instanceof GoogleAuthDraftError) throw error;
  }
  throw new GoogleAuthDraftError();
}

async function readGoogleAuthIntent(storage: GoogleAuthStorage, now: number): Promise<GoogleAuthIntent | null> {
  let raw: string | null;
  try { raw = await storage.getItem(GOOGLE_AUTH_INTENT_KEY); }
  catch { throw new GoogleAuthStorageError(); }
  return parseGoogleAuthIntent(raw, now);
}

export function hasGoogleIdentity(user: GoogleAuthUser | null): boolean {
  return Boolean(user?.identities?.some(identity => identity.provider === 'google')
    || user?.app_metadata?.providers?.includes('google') || user?.app_metadata?.provider === 'google');
}

/** Fixed same-origin callback; the chosen date stays in the durable intent. */
export function googleAuthReturnUrl(href: string): string {
  const url = new URL('./index.html', href);
  url.search = '?google_auth=1';
  url.hash = '';
  return url.href;
}

export function parseGoogleAuthIntent(raw: string | null, now: number): GoogleAuthIntent | null {
  if (!raw) return null;
  try {
    const intent: GoogleAuthIntent = JSON.parse(raw);
    if (intent.version !== 1 || intent.kind !== 'signin'
      || typeof intent.attempt !== 'string' || !intent.attempt || intent.attempt.length > 100
      || !Number.isFinite(intent.startedAt) || now - intent.startedAt < 0 || now - intent.startedAt > INTENT_MAX_AGE
      || requestedStudyDate(`?date=${encodeURIComponent(intent.date)}`) !== intent.date) return null;
    return intent;
  } catch { return null; }
}

/** Error codes only: provider descriptions may contain URLs or private data. */
export function googleAuthErrorMessage(error: unknown): string {
  if (error instanceof GoogleAuthDraftError) return error.message;
  if (error instanceof GoogleAuthStorageError) return '無法保存登入驗證資料，請確認瀏覽器允許此網站使用儲存空間後再試。';
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'provider_disabled' || code === 'validation_failed') return 'Google 登入尚未完成設定，請依設定說明啟用 Supabase 的 Google 登入。';
  if (code === 'access_denied') return '已取消 Google 授權，原有紀錄仍保留。';
  if (code === 'google_identity_mismatch') return '回傳帳號與原帳號不同，已停止登入；原有紀錄仍保留。';
  if (code === 'google_auth_expired') return '登入連結已過期或缺少驗證資料，請重新使用 Google 登入。';
  if (code === 'google_auth_replaced') return '另一個分頁已開始新的 Google 登入，請在最新操作的分頁繼續。';
  if (error instanceof Error && /storage|儲存|保存/i.test(error.message)) return '無法保存登入驗證資料，請確認瀏覽器允許此網站使用儲存空間後再試。';
  return 'Google 登入未完成，請確認網路與登入設定後再試；原有紀錄仍保留。';
}

export async function prepareGoogleAuthReturn(href: string, storage: GoogleAuthStorage, now = Date.now()): Promise<GoogleAuthReturn> {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  if (url.searchParams.get('google_auth') !== '1') {
    if (url.searchParams.has('code') || hash.has('access_token') || hash.has('refresh_token') || hash.get('type') === 'recovery') {
      return { requested: true, intent: null, error: '此登入連結已停用，目前只提供 Google 登入；原有紀錄仍保留。', allowExchange: false };
    }
    return { requested: false, intent: null, error: null, allowExchange: true };
  }
  const code = url.searchParams.get('error_code') || hash.get('error_code') || url.searchParams.get('error') || hash.get('error');
  let intent: GoogleAuthIntent | null;
  try { intent = await readGoogleAuthIntent(storage, now); }
  catch (error) { return { requested: true, intent: null, error: googleAuthErrorMessage(error), allowExchange: false }; }
  if (code) return { requested: true, intent, error: googleAuthErrorMessage({ code }), allowExchange: false };
  if (!intent || !url.searchParams.get('code')) return { requested: true, intent, error: googleAuthErrorMessage({ code: 'google_auth_expired' }), allowExchange: false };
  return { requested: true, intent, error: null, allowExchange: true };
}

export async function clearGoogleAuthIntent(storage: GoogleAuthStorage, attempt: string): Promise<void> {
  const raw = await storage.getItem(GOOGLE_AUTH_INTENT_KEY);
  if (!raw) return;
  try { if (JSON.parse(raw).attempt === attempt) await storage.removeItem(GOOGLE_AUTH_INTENT_KEY); }
  catch { /* An unrelated or malformed intent must not be deleted. */ }
}

interface OAuthOptions {
  provider: 'google';
  options: { redirectTo: string; scopes: string; queryParams: { prompt: string }; skipBrowserRedirect: true };
}
interface OAuthResult { data: { url: string | null }; error: unknown }
export interface GoogleOAuthApi {
  signInWithOAuth(options: OAuthOptions): Promise<OAuthResult>;
}

export async function beginGoogleAuthentication(options: {
  auth: GoogleOAuthApi; storage: GoogleAuthStorage; supabaseUrl: string; href: string;
  date: string; currentUserId(): string | null; saveDraft(): boolean;
  redirect(url: string): void; now?: number; attempt?: string;
}): Promise<void> {
  const intent: GoogleAuthIntent = { version: 1, kind: 'signin',
    date: options.date, startedAt: options.now ?? Date.now(), attempt: options.attempt ?? crypto.randomUUID() };
  if (!parseGoogleAuthIntent(JSON.stringify(intent), intent.startedAt)) throw new Error('Invalid Google authentication context');
  requireSavedDraft(options.saveDraft);
  try { await options.storage.setItem(GOOGLE_AUTH_INTENT_KEY, JSON.stringify(intent)); }
  catch { throw new GoogleAuthStorageError(); }
  try {
    const request: OAuthOptions = { provider: 'google', options: { redirectTo: googleAuthReturnUrl(options.href),
      scopes: 'openid email profile', queryParams: { prompt: 'select_account' }, skipBrowserRedirect: true } };
    const result = await options.auth.signInWithOAuth(request);
    if (result.error) throw result.error;
    if (!result.data.url) throw new Error('Missing Google authorization URL');
    const url = new URL(result.data.url), supabase = new URL(options.supabaseUrl);
    const valid = url.origin === supabase.origin && url.pathname === '/auth/v1/authorize'
      && url.searchParams.get('provider') === 'google' && Boolean(url.searchParams.get('code_challenge'))
      && url.searchParams.get('code_challenge_method')?.toLowerCase() === 's256';
    if (!valid || options.currentUserId() !== null) throw { code: 'google_identity_mismatch' };
    const current = await readGoogleAuthIntent(options.storage, options.now ?? Date.now());
    if (current?.attempt !== intent.attempt) throw { code: 'google_auth_replaced' };
    requireSavedDraft(options.saveDraft);
    url.searchParams.delete('skip_http_redirect');
    options.redirect(url.href);
  } catch (error) {
    await clearGoogleAuthIntent(options.storage, intent.attempt).catch(() => {});
    throw error;
  }
}

/** Bound the PKCE exchange; the SDK persists the existing Google identity session. */
export function googleAuthFetch(base: typeof fetch, supabaseUrl: string): typeof fetch {
  const origin = new URL(supabaseUrl).origin;
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const pkce = url.origin === origin && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce';
    if (!pkce) return base(input, init);
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    const signal = init?.signal;
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 12_000);
    try {
      const response = await base(input, { ...init, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  };
}

export function cleanGoogleAuthReturnUrl(href: string, date?: string): string {
  const url = new URL(href);
  for (const key of ['google_auth', 'code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
  if (date && requestedStudyDate(`?date=${date}`)) url.searchParams.set('date', date);
  if (/[&=]|access_token|error/.test(url.hash)) url.hash = '';
  return url.href;
}

export async function completeGoogleAuthReturn(plan: GoogleAuthReturn, storage: GoogleAuthStorage, auth: {
  initialize(): Promise<{ error: unknown }>;
  getSession(): Promise<{ data: { session: { user: GoogleAuthUser } | null }; error: unknown }>;
  signOut(options: { scope: 'local' }): Promise<unknown>;
}): Promise<{ message: string; ok: boolean }> {
  try {
    if (!plan.allowExchange || !plan.intent) return { message: plan.error ?? googleAuthErrorMessage({ code: 'google_auth_expired' }), ok: false };
    const initialized = await auth.initialize();
    if (initialized.error) throw initialized.error;
    if (plan.error) return { message: plan.error, ok: false };
    const result = await auth.getSession();
    if (result.error) throw result.error;
    const user = result.data.session?.user;
    if (!user || !hasGoogleIdentity(user)) return { message: 'Google 登入尚未完成，請重新使用 Google 登入；原有紀錄仍保留。', ok: false };
    return { message: '已使用 Google 登入，原帳號的紀錄與翻譯額度繼續沿用。', ok: true };
  } catch (error) {
    return { message: plan.error ?? googleAuthErrorMessage(error), ok: false };
  } finally {
    if (plan.intent) await clearGoogleAuthIntent(storage, plan.intent.attempt).catch(() => {});
  }
}
