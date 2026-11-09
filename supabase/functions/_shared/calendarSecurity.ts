import { timingSafeEqual } from 'node:crypto';

export class CalendarRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) { super(message); this.status=status; this.code=code; }
}

export function secretMatches(expected: string, provided: string): boolean {
  const left = new TextEncoder().encode(expected), right = new TextEncoder().encode(provided);
  return left.length >= 32 && left.length === right.length && timingSafeEqual(left, right);
}

export async function calendarRequestBody(request: Request, timeoutMs = 5000): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  let expired = false;
  const timeout = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, timeoutMs);
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new CalendarRequestError('Request is too large', 413, 'request_too_large'); }
      chunks.push(chunk.value);
    }
    if (expired) throw new CalendarRequestError('Request timed out', 408, 'request_timeout');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('object required');
    return body;
  } catch (error) {
    if (error instanceof CalendarRequestError) throw error;
    throw new CalendarRequestError('Invalid JSON request', 400, 'invalid_request');
  } finally { clearTimeout(timeout); reader.releaseLock(); }
}

/** Never expose provider bodies, SQL details, OAuth codes, credentials or user text. */
export function calendarPublicError(error: unknown): { error: string; code: string; status: number } {
  if (error instanceof CalendarRequestError) return { error: error.message, code: error.code, status: error.status };
  return { error: 'Google Calendar 暫時無法完成操作，請稍後重試。', code: 'calendar_unavailable', status: 503 };
}

export function logCalendarFailure(stage: string, error: unknown): void {
  const publicError = calendarPublicError(error);
  console.error('Calendar operation failed', { stage, code: publicError.code, status: publicError.status });
}
