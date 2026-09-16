import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.114.0';
import { staleCalendarEventKeys } from './calendarSyncDiff.ts';
import { readableErrorMessage } from './functionResponse.ts';
import { chunksOf, collectStringKeysetPages } from './keysetPagination.ts';
import { classifyCalendarEvent } from './calendarClassification.ts';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export interface CalendarConnection {
  user_id: string;
  calendar_id: string;
  client_id?: string | null;
  refresh_token: string;
  access_token?: string | null;
  access_token_expires_at?: string | null;
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  updated?: string;
  etag?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string };
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export class CalendarConfigurationError extends Error {
  readonly code = 'calendar_configuration_error';

  constructor(readonly missing: string[]) {
    super(`Google Calendar server configuration is incomplete: ${missing.join(', ')}`);
    this.name = 'CalendarConfigurationError';
  }
}

function requiredCalendarEnv(names: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) values[name] = value;
    else missing.push(name);
  }
  if (missing.length) throw new CalendarConfigurationError(missing);
  return values;
}

function serviceRoleKey(): string {
  const direct = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (direct) return direct;
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      const key = parsed.default ?? Object.values(parsed)[0];
      if (key) return key;
    } catch {
      // Continue to a clear configuration error.
    }
  }
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
}

export function adminClient(): SupabaseClient {
  return createClient(requiredEnv('SUPABASE_URL'), serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function googleConfig() {
  const env = requiredCalendarEnv([
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'GOOGLE_STATE_SECRET',
    'APP_RETURN_URL',
  ]);
  return {
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
    stateSecret: env.GOOGLE_STATE_SECRET,
    appReturnUrl: env.APP_RETURN_URL,
  };
}

export function assertGoogleOAuthServerConfigured(): void {
  googleConfig();
}

export function normalizeGoogleClientId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CalendarConfigurationError(['VITE_GOOGLE_CLIENT_ID']);
  }
  const clientId = value.trim();
  if (
    clientId.length > 512
    || /\s/.test(clientId)
    || !/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId)
  ) {
    throw new Error('Invalid Google OAuth client ID supplied by the application');
  }
  return clientId;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64Url(new Uint8Array(signature));
}

export async function createOAuthState(userId: string, clientId: string): Promise<string> {
  const cfg = googleConfig();
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    userId,
    clientId: normalizeGoogleClientId(clientId),
    expiresAt: Date.now() + 15 * 60 * 1000,
    nonce: crypto.randomUUID(),
  })));
  return `${payload}.${await hmac(payload, cfg.stateSecret)}`;
}

export async function verifyOAuthState(state: string): Promise<{ userId: string; clientId: string }> {
  const cfg = googleConfig();
  const [payload, signature] = state.split('.');
  if (!payload || !signature) throw new Error('Invalid OAuth state');
  if (signature !== await hmac(payload, cfg.stateSecret)) throw new Error('Invalid OAuth state signature');
  const decoded = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as {
    userId?: string;
    clientId?: string;
    expiresAt?: number;
  };
  if (!decoded.userId || !decoded.clientId || !decoded.expiresAt || decoded.expiresAt < Date.now()) {
    throw new Error('Expired OAuth state');
  }
  return { userId: decoded.userId, clientId: normalizeGoogleClientId(decoded.clientId) };
}

export function buildGoogleAuthorizationUrl(state: string, clientId: string): string {
  const cfg = googleConfig();
  const params = new URLSearchParams({
    client_id: normalizeGoogleClientId(clientId),
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeAuthorizationCode(code: string, clientId: string) {
  const cfg = googleConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: normalizeGoogleClientId(clientId),
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(readableErrorMessage(data.error_description ?? data.error ?? data, 'Google token exchange failed'));
  }
  return data as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
}

async function refreshGoogleAccessToken(refreshToken: string, clientId: string) {
  const cfg = googleConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: normalizeGoogleClientId(clientId),
      client_secret: cfg.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(readableErrorMessage(data.error_description ?? data.error ?? data, 'Google token refresh failed'));
  }
  return data as { access_token: string; expires_in: number };
}

async function validAccessToken(admin: SupabaseClient, connection: CalendarConnection): Promise<string> {
  const expires = connection.access_token_expires_at ? Date.parse(connection.access_token_expires_at) : 0;
  if (connection.access_token && expires > Date.now() + 60_000) return connection.access_token;
  if (!connection.client_id) {
    throw new Error('既有 Google Calendar 連線缺少 OAuth Client ID；請解除連線後重新連接。');
  }
  const refreshed = await refreshGoogleAccessToken(connection.refresh_token, connection.client_id);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const { error } = await admin.from('google_calendar_connections').update({
    access_token: refreshed.access_token,
    access_token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
    sync_error: null,
  }).eq('user_id', connection.user_id);
  if (error) throw error;
  return refreshed.access_token;
}

function dateInTimezone(value: string, timeZone = 'Asia/Taipei'): string {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function eventDate(event: GoogleEvent): string | null {
  if (event.start?.date) return event.start.date;
  if (event.start?.dateTime) return dateInTimezone(event.start.dateTime, event.start.timeZone || 'Asia/Taipei');
  return null;
}

function plainCalendarDescription(value: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  };
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(?:p|div|li|ul|ol)\s*>/gi, '\n')
    .replace(/<\s*li(?:\s[^>]*)?>/gi, '• ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&([a-z]+);/gi, (entity, name: string) => named[name.toLowerCase()] ?? entity)
    .replace(/&#(x?[0-9a-f]+);/gi, (entity, rawCode: string) => {
      const hexadecimal = rawCode[0]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(hexadecimal ? rawCode.slice(1) : rawCode, hexadecimal ? 16 : 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    })
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchCalendarEvents(accessToken: string, calendarId: string) {
  const timeMin = new Date(Date.now() - 60 * 86_400_000);
  const timeMax = new Date(Date.now() + 240 * 86_400_000);
  const events: GoogleEvent[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      showDeleted: 'true',
      maxResults: '2500',
      timeZone: 'Asia/Taipei',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(readableErrorMessage(data.error ?? data, 'Google Calendar events.list failed'));
    }
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return {
    events,
    timeMinDate: dateInTimezone(timeMin.toISOString()),
    timeMaxDate: dateInTimezone(timeMax.toISOString()),
  };
}

export async function syncCalendarForUser(admin: SupabaseClient, userId: string) {
  const { data: connection, error: connectionError } = await admin
    .from('google_calendar_connections').select('*').eq('user_id', userId).maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection) return { connected: false, synced: 0, removed: 0 };

  try {
    const accessToken = await validAccessToken(admin, connection as CalendarConnection);
    const calendarId = connection.calendar_id || 'primary';
    const { events, timeMinDate, timeMaxDate } = await fetchCalendarEvents(accessToken, calendarId);
    const fetchedKeys = new Set<string>();
    const rows: Record<string, unknown>[] = [];

    for (const event of events) {
      const key = `${calendarId}:${event.id}`;
      if (event.status === 'cancelled') continue;
      const date = eventDate(event);
      if (!date) continue;
      const description = plainCalendarDescription(event.description ?? '');
      fetchedKeys.add(key);
      rows.push({
        user_id: userId,
        event_key: key,
        source_event_id: event.id,
        calendar_id: calendarId,
        event_date: date,
        end_date: event.end?.date ?? null,
        start_at: event.start?.dateTime ?? null,
        end_at: event.end?.dateTime ?? null,
        is_all_day: Boolean(event.start?.date),
        title: event.summary ?? '(未命名行程)',
        description,
        location: event.location ?? '',
        category: classifyCalendarEvent(event.summary ?? '', description),
        event_updated_at: event.updated ?? null,
        metadata: {
          etag: event.etag ?? null,
          htmlLink: event.htmlLink ?? null,
          recurringEventId: event.recurringEventId ?? null,
          originalStartTime: event.originalStartTime ?? null,
        },
        synced_at: new Date().toISOString(),
      });
    }

    for (const chunk of chunksOf(rows)) {
      const { error } = await admin.from('calendar_tasks').upsert(chunk, { onConflict: 'user_id,event_key' });
      if (error) throw error;
    }

    const existing = await collectStringKeysetPages(
      async (after, pageSize) => {
        let query = admin
          .from('calendar_tasks').select('event_key')
          .eq('user_id', userId).eq('calendar_id', calendarId)
          .gte('event_date', timeMinDate).lte('event_date', timeMaxDate);
        if (after) query = query.gt('event_key', after);
        const { data, error } = await query.order('event_key', { ascending: true }).limit(pageSize);
        if (error) throw error;
        return (data ?? []) as Array<{ event_key: string }>;
      },
      (row) => String(row.event_key ?? ''),
    );

    const stale = staleCalendarEventKeys(
      existing.map((row) => row.event_key),
      fetchedKeys,
    );
    for (const staleChunk of chunksOf(stale, 200)) {
      const { error } = await admin.from('calendar_tasks')
        .delete().eq('user_id', userId).in('event_key', staleChunk);
      if (error) throw error;
    }

    const { error: statusError } = await admin.from('google_calendar_connections').update({
      last_synced_at: new Date().toISOString(),
      sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    if (statusError) throw statusError;

    return { connected: true, synced: rows.length, removed: stale.length };
  } catch (error) {
    await admin.from('google_calendar_connections').update({
      sync_error: readableErrorMessage(error),
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    throw error;
  }
}

export async function authenticatedUser(req: Request, admin: SupabaseClient): Promise<string> {
  const authorization = req.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Missing Authorization header');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid user session');
  return data.user.id;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
