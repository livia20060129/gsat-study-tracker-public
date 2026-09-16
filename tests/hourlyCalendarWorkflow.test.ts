import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/calendar-sync.yml', import.meta.url),
  'utf8',
);

test('Calendar workflow runs hourly and can also be started manually', () => {
  assert.match(workflow, /schedule:\s*[\s\S]*cron:\s*'7 \* \* \* \*'/);
  assert.match(workflow, /workflow_dispatch:/);
});

test('Calendar workflow calls sync-all with a repository secret', () => {
  assert.match(workflow, /CALENDAR_CRON_SECRET:\s*\$\{\{ secrets\.CALENDAR_CRON_SECRET \}\}/);
  assert.match(workflow, /--header "x-cron-secret: \$\{CALENDAR_CRON_SECRET\}"/);
  assert.match(workflow, /--data '\{"action":"sync-all"\}'/);
  assert.match(workflow, /\$\{#CALENDAR_CRON_SECRET\} < 32/);
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY|GOOGLE_CLIENT_SECRET/);
});

test('Calendar workflow fails when any connected account fails to sync', () => {
  assert.match(workflow, /select\(has\("error"\)\)/);
  assert.match(workflow, /if \(\( failure_count > 0 \)\)/);
});
