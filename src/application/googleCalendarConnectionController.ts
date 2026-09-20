import {
  googleCalendarClientConfig,
  type GoogleCalendarClientConfig,
} from '../config/googleCalendar.ts';

export interface GoogleCalendarAuthorizationResponse {
  url?: unknown;
}

export interface GoogleCalendarConnectionPorts {
  requestAuthorizationUrl(payload: { clientId: string }): Promise<GoogleCalendarAuthorizationResponse>;
  setMessage(message: string, ok: boolean): void;
  navigate(url: string): void;
}

export interface GoogleCalendarConnectionController {
  readonly configurationMessage: string | null;
  readonly isConfigured: boolean;
  connect(ports: GoogleCalendarConnectionPorts): Promise<boolean>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function verifiedGoogleAuthorizationUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('伺服器未回傳 Google 授權網址。');
  }

  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') {
    throw new Error('伺服器回傳的 Google 授權網址無效。');
  }
  return url.toString();
}

async function connectWithConfig(
  config: GoogleCalendarClientConfig,
  ports: GoogleCalendarConnectionPorts,
): Promise<boolean> {
  if (!config.isConfigured || !config.clientId) {
    ports.setMessage(config.message ?? 'Google Calendar 設定未完成。', false);
    return false;
  }

  ports.setMessage('正在建立 Google OAuth 連線…', true);
  try {
    const response = await ports.requestAuthorizationUrl({ clientId: config.clientId });
    ports.navigate(verifiedGoogleAuthorizationUrl(response.url));
    return true;
  } catch (error) {
    ports.setMessage(`Calendar 連線失敗：${errorMessage(error)}`, false);
    return false;
  }
}

export function createGoogleCalendarConnectionController(
  config: GoogleCalendarClientConfig,
): GoogleCalendarConnectionController {
  return {
    get configurationMessage(): string | null {
      return config.message;
    },
    get isConfigured(): boolean {
      return config.isConfigured;
    },
    connect(ports: GoogleCalendarConnectionPorts): Promise<boolean> {
      return connectWithConfig(config, ports);
    },
  };
}

export const googleCalendarConnectionController = createGoogleCalendarConnectionController(
  googleCalendarClientConfig,
);
