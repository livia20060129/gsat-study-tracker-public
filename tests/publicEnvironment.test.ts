import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertSafeViteEnvironment,
  forbiddenViteEnvironmentKeys,
} from '../src/config/publicEnvironment.ts';

const exampleEnvironment = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const legacyRuntime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
const calendarConfig = readFileSync(new URL('../src/config/googleCalendar.ts', import.meta.url), 'utf8');

test('only the reviewed public Google client ID may use the VITE_ prefix', () => {
  assert.deepEqual(forbiddenViteEnvironmentKeys({
    VITE_GOOGLE_CLIENT_ID: '123-example.apps.googleusercontent.com',
    ORDINARY_SERVER_SECRET: 'not-browser-visible',
  }), []);
  assert.doesNotThrow(function validateAllowedEnvironment(): void {
    assertSafeViteEnvironment({ VITE_GOOGLE_CLIENT_ID: '123-example.apps.googleusercontent.com' });
  });
});

test('the build rejects browser-visible secrets, tokens, and unreviewed variables', () => {
  const environment = {
    VITE_GOOGLE_CLIENT_SECRET: 'secret',
    VITE_ACCESS_TOKEN: 'token',
    VITE_UNREVIEWED_PUBLIC_VALUE: 'value',
  };
  assert.deepEqual(forbiddenViteEnvironmentKeys(environment), [
    'VITE_ACCESS_TOKEN',
    'VITE_GOOGLE_CLIENT_SECRET',
    'VITE_UNREVIEWED_PUBLIC_VALUE',
  ]);
  assert.throws(
    function validateUnsafeEnvironment(): void {
      assertSafeViteEnvironment(environment);
    },
    /would be exposed in the browser/,
  );
});

test('.env.example remains a placeholder and cannot silently carry a real client ID', () => {
  const assignments = exampleEnvironment
    .split(/\r?\n/)
    .map(function trimLine(line): string { return line.trim(); })
    .filter(function isAssignment(line): boolean { return Boolean(line) && !line.startsWith('#'); });
  assert.deepEqual(assignments, [
    'VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com',
  ]);
});

test('the legacy UI receives Calendar configuration only through the config module', () => {
  assert.doesNotMatch(legacyRuntime, /import\.meta\.env/);
  assert.match(legacyRuntime, /import \{ googleCalendarConnectionController \} from '\.\/application\/googleCalendarConnectionController\.ts'/);
  const connectionController = readFileSync(new URL('../src/application/googleCalendarConnectionController.ts', import.meta.url), 'utf8');
  assert.match(connectionController, /import \{[\s\S]*googleCalendarClientConfig[\s\S]*\} from '\.\.\/config\/googleCalendar\.ts'/);
  assert.match(calendarConfig, /import\.meta\.env\?\.VITE_GOOGLE_CLIENT_ID/);
  assert.doesNotMatch(legacyRuntime, /[0-9]{6,}-[A-Za-z0-9._-]+\.apps\.googleusercontent\.com/);
});
