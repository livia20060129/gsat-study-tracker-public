import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  GOOGLE_CLIENT_ID_PLACEHOLDER,
  validateEnvironmentFile,
  validateGitIgnore,
  validateRuntimeEnvironment,
} from '../scripts/validate-public-env.mjs';

test('allows only the public Google OAuth client ID in the browser environment', () => {
  assert.deepEqual(validateRuntimeEnvironment({
    VITE_GOOGLE_CLIENT_ID: '123-example.apps.googleusercontent.com',
  }), []);
});

test('rejects a Google client secret with a VITE prefix', () => {
  const errors = validateRuntimeEnvironment({
    VITE_GOOGLE_CLIENT_SECRET: 'must-not-be-public',
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /VITE_GOOGLE_CLIENT_SECRET/);
});

test('rejects every unapproved VITE variable', () => {
  const errors = validateRuntimeEnvironment({ VITE_ACCESS_TOKEN: 'token' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /VITE_ACCESS_TOKEN/);
});

test('keeps .env.example as a placeholder-only tracked template', () => {
  const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  assert.deepEqual(validateEnvironmentFile(template, '.env.example', { template: true }), []);
  assert.match(template, new RegExp(`VITE_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID_PLACEHOLDER}`));
});

test('rejects a real client ID or server secret in .env.example', () => {
  const realClientId = validateEnvironmentFile(
    'VITE_GOOGLE_CLIENT_ID=123-real.apps.googleusercontent.com',
    '.env.example',
    { template: true },
  );
  assert.match(realClientId.join('\n'), /必須保留/);

  const serverSecret = validateEnvironmentFile(
    `VITE_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID_PLACEHOLDER}\nGOOGLE_CLIENT_SECRET=secret`,
    '.env.example',
    { template: true },
  );
  assert.match(serverSecret.join('\n'), /GOOGLE_CLIENT_SECRET/);
});

test('keeps local env files ignored while tracking only the safe template', () => {
  const gitIgnore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.deepEqual(validateGitIgnore(gitIgnore), []);
});
