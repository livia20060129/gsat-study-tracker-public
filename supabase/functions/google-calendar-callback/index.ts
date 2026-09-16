import {
  CALENDAR_SCOPE,
  CalendarConfigurationError,
  adminClient,
  exchangeAuthorizationCode,
  googleConfig,
  syncCalendarForUser,
  verifyOAuthState,
} from '../_shared/googleCalendar.ts';
import { calendarHtmlResponse, readableErrorMessage } from '../_shared/functionResponse.ts';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const errorParam = url.searchParams.get('error');
    if (errorParam) return calendarHtmlResponse(`Google 授權未完成：${errorParam}`, 400);

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return calendarHtmlResponse('缺少 Google OAuth callback 參數。', 400);

    const admin = adminClient();
    const cfg = googleConfig();
    const { userId, clientId } = await verifyOAuthState(state);
    const tokens = await exchangeAuthorizationCode(code, clientId);
    const { data: existing, error: existingError } = await admin
      .from('google_calendar_connections')
      .select('refresh_token')
      .eq('user_id', userId)
      .maybeSingle();
    if (existingError) throw existingError;

    const refreshToken = tokens.refresh_token || existing?.refresh_token;
    if (!refreshToken) throw new Error('Google 未回傳 refresh token；請重新授權並允許離線存取。');

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const { error } = await admin.from('google_calendar_connections').upsert({
      user_id: userId,
      calendar_id: 'primary',
      client_id: clientId,
      refresh_token: refreshToken,
      access_token: tokens.access_token,
      access_token_expires_at: expiresAt,
      scope: tokens.scope || CALENDAR_SCOPE,
      updated_at: new Date().toISOString(),
      sync_error: null,
    }, { onConflict: 'user_id' });
    if (error) throw error;

    await syncCalendarForUser(admin, userId);
    const target = new URL(cfg.appReturnUrl);
    target.searchParams.set('calendar', 'connected');
    return Response.redirect(target.toString(), 302);
  } catch (error) {
    console.error('google-calendar-callback error', error);
    if (error instanceof CalendarConfigurationError) {
      return calendarHtmlResponse(`Google Calendar 伺服器設定未完成：缺少 ${error.missing.join('、')}。請完成設定後重新連線。`, 503);
    }
    return calendarHtmlResponse(`Google Calendar 連線失敗：${readableErrorMessage(error)}`, 500);
  }
});
