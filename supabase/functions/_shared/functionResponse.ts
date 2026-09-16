const ERROR_FIELDS = ['message', 'error_description', 'description', 'details', 'hint', 'error'] as const;

function usefulText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text === '[object Object]') return null;
  return text;
}

function describeError(value: unknown, seen: Set<object>, depth: number): string | null {
  const text = usefulText(value);
  if (text) return text;
  if (!value || typeof value !== 'object' || depth > 4 || seen.has(value)) return null;

  seen.add(value);
  const record = value as Record<string, unknown>;
  const messages: string[] = [];

  for (const field of ERROR_FIELDS) {
    const message = describeError(record[field], seen, depth + 1);
    if (message && !messages.includes(message)) messages.push(message);
  }

  const code = usefulText(record.code);
  const combined = messages.join('｜');
  if (combined && code && !combined.includes(code)) return `${combined}（${code}）`;
  if (combined) return combined;
  if (code) return `錯誤代碼 ${code}`;
  return null;
}

export function readableErrorMessage(error: unknown, fallback = '未知錯誤'): string {
  return describeError(error, new Set<object>(), 0) ?? fallback;
}

function asciiHtmlText(value: string): string {
  const escaped = value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] ?? char));

  return Array.from(escaped, (char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return codePoint > 0x7e ? `&#x${codePoint.toString(16)};` : char;
  }).join('');
}

export function calendarHtmlResponse(message: string, status = 200): Response {
  const body = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google Calendar</title></head><body><p>${asciiHtmlText(message)}</p></body></html>`;
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
