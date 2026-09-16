import assert from 'node:assert/strict';
import test from 'node:test';

import { readGoogleCalendarClientConfig } from '../src/config/googleCalendar.ts';

test('reports a missing Vite Google client ID without throwing', () => {
  const config = readGoogleCalendarClientConfig(undefined);
  assert.equal(config.isConfigured, false);
  assert.equal(config.issue, 'missing');
  assert.match(config.message ?? '', /VITE_GOOGLE_CLIENT_ID/);
});

test('rejects the .env.example placeholder', () => {
  const config = readGoogleCalendarClientConfig('your-google-oauth-client-id.apps.googleusercontent.com');
  assert.equal(config.isConfigured, false);
  assert.equal(config.issue, 'placeholder');
});

test('rejects malformed values', () => {
  const config = readGoogleCalendarClientConfig('not a google client id');
  assert.equal(config.isConfigured, false);
  assert.equal(config.issue, 'invalid');
});

test('accepts and trims a Google Web OAuth client ID', () => {
  const config = readGoogleCalendarClientConfig(
    ' 1234567890-example_ABC.apps.googleusercontent.com ',
  );
  assert.equal(config.isConfigured, true);
  assert.equal(config.clientId, '1234567890-example_ABC.apps.googleusercontent.com');
  assert.equal(config.message, null);
});
