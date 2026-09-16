import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarHtmlResponse,
  readableErrorMessage,
} from '../supabase/functions/_shared/functionResponse.ts';

test('formats Supabase object errors instead of object Object', () => {
  const message = readableErrorMessage({
    code: 'PGRST204',
    message: "Could not find the 'client_id' column",
    details: null,
    hint: null,
  });

  assert.equal(message, "Could not find the 'client_id' column（PGRST204）");
  assert.doesNotMatch(message, /\[object Object\]/);
});

test('extracts nested Google API object errors', () => {
  assert.equal(
    readableErrorMessage({ error: { code: 400, message: 'Invalid request' } }),
    'Invalid request',
  );
});

test('returns an ASCII-only callback page with UTF-8 metadata', async () => {
  const response = calendarHtmlResponse('Google Calendar 連線失敗：測試', 500);
  const body = await response.text();

  assert.equal(response.status, 500);
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.match(body, /<meta charset="utf-8">/);
  assert.match(body, /Google Calendar/);
  assert.match(body, /&#x9023;/);
  assert.doesNotMatch(body, /[^\x00-\x7f]/);
});
