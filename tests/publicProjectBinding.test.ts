import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const EXPECTED_PUBLIC_PROJECT_REF = 'xcpnxkkixsxzgbqsiuud';
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
const calendarWorkflow = readFileSync(new URL('../.github/workflows/calendar-sync.yml', import.meta.url), 'utf8');
const deployWorkflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

function capture(source: string, pattern: RegExp, label: string): string {
  const value = source.match(pattern)?.[1];
  assert.ok(value, `${label} is missing`);
  return value;
}

test('all public deployment surfaces use the same Supabase project', () => {
  const configRef = capture(config, /^project_id\s*=\s*"([a-z0-9]+)"/m, 'supabase/config.toml project_id');
  const runtimeRef = capture(runtime, /SUPABASE_URL='https:\/\/([a-z0-9]+)\.supabase\.co'/, 'frontend Supabase URL');
  const calendarRef = capture(calendarWorkflow, /CALENDAR_SYNC_URL:\s*https:\/\/([a-z0-9]+)\.supabase\.co\//, 'Calendar sync URL');
  const readmeRef = capture(readme, /GOOGLE_REDIRECT_URI=https:\/\/([a-z0-9]+)\.supabase\.co\//, 'README OAuth callback');

  assert.equal(configRef, EXPECTED_PUBLIC_PROJECT_REF);
  assert.equal(runtimeRef, configRef);
  assert.equal(calendarRef, configRef);
  assert.equal(readmeRef, configRef);
  assert.doesNotMatch(`${config}\n${runtime}\n${calendarWorkflow}\n${readme}`, /arxbirgujbrtzhoficdf/);
});

test('release workflow refuses a GitHub project override that differs from config.toml', () => {
  assert.match(deployWorkflow, /SUPABASE_PROJECT_ID_OVERRIDE:/);
  assert.match(deployWorkflow, /SUPABASE_PROJECT_ID_OVERRIDE[^\n]*!=[^\n]*project_id/);
  assert.match(deployWorkflow, /SUPABASE_PROJECT_ID does not match supabase\/config\.toml/);
});
