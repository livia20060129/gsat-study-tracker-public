export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';

interface CalendarAuthorizationOptions {
  clientId: string;
  redirectUri: string;
  state: string;
}

/** Keep requests within the approved read-only event scope. */
export function buildCalendarAuthorizationUrl(options: CalendarAuthorizationOptions): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state: options.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
