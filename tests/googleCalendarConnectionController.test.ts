import assert from 'node:assert/strict';
import test from 'node:test';

import { createGoogleCalendarConnectionController } from '../src/application/googleCalendarConnectionController.ts';
import { readGoogleCalendarClientConfig } from '../src/config/googleCalendar.ts';

function configuredController() {
  return createGoogleCalendarConnectionController(
    readGoogleCalendarClientConfig('123-example.apps.googleusercontent.com'),
  );
}

test('does not request OAuth when the public client ID is unavailable', async () => {
  const messages: Array<[string, boolean]> = [];
  let requested = false;
  const controller = createGoogleCalendarConnectionController(
    readGoogleCalendarClientConfig(undefined),
  );

  const connected = await controller.connect({
    async requestAuthorizationUrl() {
      requested = true;
      return {};
    },
    setMessage(message, ok) {
      messages.push([message, ok]);
    },
    navigate() {},
  });

  assert.equal(connected, false);
  assert.equal(requested, false);
  assert.match(messages[0][0], /VITE_GOOGLE_CLIENT_ID/);
  assert.equal(messages[0][1], false);
});

test('requests an authorization URL with the configured public client ID', async () => {
  let payload: { clientId: string } | undefined;
  let destination = '';
  const connected = await configuredController().connect({
    async requestAuthorizationUrl(value) {
      payload = value;
      return { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123-example' };
    },
    setMessage() {},
    navigate(url) {
      destination = url;
    },
  });

  assert.equal(connected, true);
  assert.deepEqual(payload, { clientId: '123-example.apps.googleusercontent.com' });
  assert.equal(new URL(destination).hostname, 'accounts.google.com');
});

test('rejects missing or non-Google authorization destinations', async () => {
  for (const url of [undefined, 'https://example.com/steal-oauth']) {
    const messages: Array<[string, boolean]> = [];
    let navigated = false;
    const connected = await configuredController().connect({
      async requestAuthorizationUrl() {
        return { url };
      },
      setMessage(message, ok) {
        messages.push([message, ok]);
      },
      navigate() {
        navigated = true;
      },
    });

    assert.equal(connected, false);
    assert.equal(navigated, false);
    assert.match(messages.at(-1)?.[0] ?? '', /Calendar 連線失敗/);
    assert.equal(messages.at(-1)?.[1], false);
  }
});
