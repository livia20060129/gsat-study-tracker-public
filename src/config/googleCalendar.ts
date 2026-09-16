export type GoogleCalendarClientConfigIssue = 'missing' | 'placeholder' | 'invalid' | null;

export interface GoogleCalendarClientConfig {
  clientId: string | null;
  isConfigured: boolean;
  issue: GoogleCalendarClientConfigIssue;
  message: string | null;
}

const PLACEHOLDER_VALUES = new Set([
  'your-google-oauth-client-id.apps.googleusercontent.com',
  'replace-me.apps.googleusercontent.com',
]);

function invalidConfig(issue: Exclude<GoogleCalendarClientConfigIssue, null>, message: string): GoogleCalendarClientConfig {
  return { clientId: null, isConfigured: false, issue, message };
}

/**
 * Reads the public Google OAuth client ID defensively.
 *
 * OAuth client IDs identify an app and are safe to expose in a browser bundle.
 * Google OAuth client secrets must never use a VITE_ variable because Vite
 * intentionally publishes every VITE_ value to the browser.
 */
export function readGoogleCalendarClientConfig(value: unknown): GoogleCalendarClientConfig {
  if (typeof value !== 'string' || !value.trim()) {
    return invalidConfig(
      'missing',
      'Google Calendar 尚未設定：請在部署環境提供 VITE_GOOGLE_CLIENT_ID。其他 Study Tracker 功能仍可正常使用。',
    );
  }

  const clientId = value.trim();
  if (PLACEHOLDER_VALUES.has(clientId.toLowerCase()) || /^(your-|replace-|<).*(>|client-id)/i.test(clientId)) {
    return invalidConfig(
      'placeholder',
      'Google Calendar 設定仍是範例值：請將 VITE_GOOGLE_CLIENT_ID 換成 Google Cloud 的 Web OAuth Client ID。',
    );
  }

  if (
    clientId.length > 512
    || /\s/.test(clientId)
    || !/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId)
  ) {
    return invalidConfig(
      'invalid',
      'VITE_GOOGLE_CLIENT_ID 格式不正確；應為 Google Cloud Web OAuth Client ID，並以 .apps.googleusercontent.com 結尾。',
    );
  }

  return { clientId, isConfigured: true, issue: null, message: null };
}

export const googleCalendarClientConfig = readGoogleCalendarClientConfig(
  import.meta.env?.VITE_GOOGLE_CLIENT_ID,
);
