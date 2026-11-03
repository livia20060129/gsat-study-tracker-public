import assert from 'node:assert/strict';
import test from 'node:test';
import { CALENDAR_SCOPE, buildCalendarAuthorizationUrl } from '../supabase/functions/_shared/calendarAuthorization.ts';

const options = {
  clientId: '1234567890-example.apps.googleusercontent.com',
  redirectUri: 'https://example.supabase.co/functions/v1/google-calendar-callback',
  state: 'signed-state.with+reserved/characters=&',
};

test('Calendar authorization requests only the approved read-only event scope', () => {
  const url = new URL(buildCalendarAuthorizationUrl(options));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.deepEqual(url.searchParams.getAll('scope'), ['https://www.googleapis.com/auth/calendar.events.readonly']);
  assert.equal(CALENDAR_SCOPE, 'https://www.googleapis.com/auth/calendar.events.readonly');
  assert.equal(url.searchParams.get('include_granted_scopes'), 'false');
});

test('narrower Calendar authorization retains the code flow, offline access and explicit consent', () => {
  const url = new URL(buildCalendarAuthorizationUrl(options));
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
});

test('Calendar authorization preserves the supplied client, callback and signed state exactly', () => {
  const url = new URL(buildCalendarAuthorizationUrl(options));
  assert.equal(url.searchParams.get('client_id'), options.clientId);
  assert.equal(url.searchParams.get('redirect_uri'), options.redirectUri);
  assert.equal(url.searchParams.get('state'), options.state);
});
