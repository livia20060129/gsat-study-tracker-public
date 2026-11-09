import {
  CALENDAR_SCOPE,
  CalendarConfigurationError,
  adminClient,
  exchangeAuthorizationCode,
  googleConfig,
  syncCalendarForUser,
  verifyOAuthState,
} from '../_shared/googleCalendar.ts';
import { calendarHtmlResponse, calendarRedirectResponse } from '../_shared/functionResponse.ts';
import { CalendarRequestError, calendarPublicError, logCalendarFailure } from '../_shared/calendarSecurity.ts';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'GET') return calendarHtmlResponse('GET required', 405);
    const url = new URL(req.url);
    const errorParam = url.searchParams.get('error');
    if (errorParam) return calendarHtmlResponse('Google 授權未完成，請重新連接。', 400);

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return calendarHtmlResponse('缺少 Google OAuth callback 參數。', 400);

    const admin = adminClient();
    const cfg = googleConfig();
    const { userId, clientId } = await verifyOAuthState(state, admin);
    const tokens = await exchangeAuthorizationCode(code, clientId);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const { error } = await admin.rpc('calendar_connection_write', { p_user_id: userId, p_tokens: {
      client_id: clientId,
      refresh_token: tokens.refresh_token || null,
      access_token: tokens.access_token,
      access_token_expires_at: expiresAt,
      scope: tokens.scope || CALENDAR_SCOPE,
    } });
    if (error) throw error;

    try { await syncCalendarForUser(admin, userId); }
    catch (error) { if (!(error instanceof CalendarRequestError && error.code === 'calendar_sync_busy')) throw error; }
    const target = new URL(cfg.appReturnUrl);
    target.searchParams.set('calendar', 'connected');
    return calendarRedirectResponse(target.toString());
  } catch (error) {
    logCalendarFailure('callback', error);
    if (error instanceof CalendarConfigurationError) {
      return calendarHtmlResponse(`Google Calendar 伺服器設定未完成：缺少 ${error.missing.join('、')}。請完成設定後重新連線。`, 503);
    }
    const safe = calendarPublicError(error);
    return calendarHtmlResponse(safe.error, safe.status);
  }
});
