import test from 'node:test';
import assert from 'node:assert/strict';
import { CalendarRequestError, calendarPublicError, calendarRequestBody, secretMatches } from '../supabase/functions/_shared/calendarSecurity.ts';

test('Calendar request input is a bounded JSON object, even without a length header', async () => {
  const request = (body: string) => new Request('https://test.invalid', { method:'POST', body });
  assert.deepEqual(await calendarRequestBody(request('{"action":"status"}')), { action:'status' });
  await assert.rejects(calendarRequestBody(request('[]')), { status:400 });
  await assert.rejects(calendarRequestBody(request('{broken')), { status:400 });
  await assert.rejects(calendarRequestBody(request('x'.repeat(8193))), { status:413 });
});

test('a never-ending Calendar request body is cancelled at its deadline', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const request = new Request('https://test.invalid', { method:'POST', body:stream, duplex:'half' } as RequestInit);
  await assert.rejects(calendarRequestBody(request, 5), { status:408 });
  assert.equal(cancelled, true);
});

test('cron credentials require a long exact match and errors cannot expose upstream details', () => {
  const secret = 'a'.repeat(32);
  assert.equal(secretMatches(secret, secret), true);
  assert.equal(secretMatches(secret, 'b'.repeat(32)), false);
  assert.equal(secretMatches('short', 'short'), false);
  assert.equal(secretMatches(secret, secret+'x'), false);
  const response = calendarPublicError(new Error('refresh_token=private database column private_secret'));
  assert.equal(response.status,503);
  assert.doesNotMatch(JSON.stringify(response), /refresh_token|private_secret|column/);
  assert.equal(calendarPublicError(new CalendarRequestError('Sign in required',401,'sign_in_required')).status,401);
});
