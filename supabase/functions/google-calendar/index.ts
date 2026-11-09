import {
  CORS_HEADERS,
  CalendarConfigurationError,
  adminClient,
  assertGoogleOAuthServerConfigured,
  authenticatedUser,
  buildGoogleAuthorizationUrl,
  createOAuthState,
  json,
  normalizeGoogleClientId,
  syncCalendarForUser,
} from '../_shared/googleCalendar.ts';
import { chunksOf, collectStringKeysetPages } from '../_shared/keysetPagination.ts';
import { CalendarRequestError, calendarPublicError, calendarRequestBody, logCalendarFailure, secretMatches } from '../_shared/calendarSecurity.ts';

const SYNC_ALL_CONCURRENCY = 4;

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

    const body = await calendarRequestBody(req);
    const action = String(body.action ?? 'status');
    const admin = adminClient();

    if (action === 'sync-all') {
      const expected = Deno.env.get('CALENDAR_CRON_SECRET') ?? '';
      const provided = req.headers.get('x-cron-secret') ?? '';
      if (!secretMatches(expected, provided)) return json({ error: 'Unauthorized cron request' }, 401);
      const connections = await collectStringKeysetPages(
        async (after, pageSize) => {
          let query = admin.from('google_calendar_connections').select('user_id');
          if (after) query = query.gt('user_id', after);
          const { data, error } = await query.order('user_id', { ascending: true }).limit(pageSize);
          if (error) throw error;
          return (data ?? []) as Array<{ user_id: string }>;
        },
        (connection) => String(connection.user_id ?? ''),
      );
      const results: unknown[] = [];
      for (const batch of chunksOf(connections, SYNC_ALL_CONCURRENCY)) {
        const batchResults = await Promise.all(batch.map(async (connection) => {
          try {
            return { userId: connection.user_id, ...(await syncCalendarForUser(admin, connection.user_id)) };
          } catch (error) {
            if (error instanceof CalendarRequestError && error.code === 'calendar_sync_busy') return { userId: connection.user_id, skipped: true };
            logCalendarFailure('scheduled-sync', error);
            return { userId: connection.user_id, error: calendarPublicError(error).error };
          }
        }));
        results.push(...batchResults);
      }
      return json({ ok: true, results });
    }

    const userId = await authenticatedUser(req, admin);
    if (action === 'auth-url') {
      assertGoogleOAuthServerConfigured();
      const clientId = normalizeGoogleClientId(body.clientId);
      const state = await createOAuthState(userId, clientId, admin);
      return json({ url: buildGoogleAuthorizationUrl(state, clientId) });
    }
    if (action === 'status') {
      const { data, error } = await admin
        .from('google_calendar_connections')
        .select('calendar_id,last_synced_at,sync_error')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      const safeError = data?.sync_error === 'Calendar sync in progress' ? data.sync_error
        : data?.sync_error ? 'Google Calendar 上一次同步尚未成功，請稍後手動重試。' : null;
      return json({ userId, connected: Boolean(data), ...(data ?? {}), sync_error: safeError });
    }
    if (action === 'sync') return json(await syncCalendarForUser(admin, userId));
    if (action === 'disconnect') {
      const { error: taskError } = await admin.from('calendar_tasks').delete().eq('user_id', userId);
      if (taskError) throw taskError;
      const { error } = await admin.from('google_calendar_connections').delete().eq('user_id', userId);
      if (error) throw error;
      return json({ disconnected: true });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    logCalendarFailure('request', error);
    if (error instanceof CalendarConfigurationError) {
      return json({
        error: error.message,
        code: error.code,
        missing: error.missing,
      }, 503);
    }
    const safe = calendarPublicError(error);
    return json({ error: safe.error, code: safe.code }, safe.status);
  }
});
