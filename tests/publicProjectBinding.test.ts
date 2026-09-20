import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const EXPECTED_PUBLIC_PROJECT_REF = 'xcpnxkkixsxzgbqsiuud';
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
const calendarWorkflow = readFileSync(new URL('../.github/workflows/calendar-sync.yml', import.meta.url), 'utf8');
const deployWorkflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const calendarRuntime = readFileSync(new URL('../supabase/functions/_shared/googleCalendar.ts', import.meta.url), 'utf8');
const privacyPolicy = readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8');
const calendarController = readFileSync(new URL('../src/application/googleCalendarConnectionController.ts', import.meta.url), 'utf8');
const calendarClientConfig = readFileSync(new URL('../src/config/googleCalendar.ts', import.meta.url), 'utf8');

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

test('release workflow derives the project only from tested config.toml', () => {
  assert.doesNotMatch(deployWorkflow, /SUPABASE_PROJECT_ID_OVERRIDE|vars\.SUPABASE_PROJECT_ID|secrets\.SUPABASE_PROJECT_ID/);
  assert.match(deployWorkflow, /project_id="\$\(sed[^\n]*supabase\/config\.toml/);
  assert.match(deployWorkflow, /echo "SUPABASE_PROJECT_ID=\$\{project_id\}" >> "\$\{GITHUB_ENV\}"/);
});

test('Pages artifact keeps the official stable name across failed-job reruns', () => {
  assert.match(deployWorkflow, /uses: actions\/upload-pages-artifact@v4/);
  assert.match(deployWorkflow, /uses: actions\/deploy-pages@v4/);
  assert.doesNotMatch(deployWorkflow, /github-pages-\$\{\{\s*github\.run_attempt\s*\}\}/);
  assert.doesNotMatch(deployWorkflow, /artifact_name:/);
});

test('public OAuth documentation and runtime use the same least-privilege Calendar scope', () => {
  const expectedScope = 'https://www.googleapis.com/auth/calendar.events.readonly';
  assert.match(calendarRuntime, new RegExp(`CALENDAR_SCOPE = '${expectedScope.replaceAll('.', '\\.')}'`));
  assert.match(privacyPolicy, /calendar\.events\.readonly/);
  assert.match(readme, /calendar\.events\.readonly/);
  assert.doesNotMatch(`${calendarRuntime}\n${privacyPolicy}`, /auth\/calendar\.readonly|<code>calendar\.readonly<\/code>/);
});

test('public OAuth documentation points back to the public custom domain', () => {
  assert.match(readme, /APP_RETURN_URL=https:\/\/gsat-study-tracker\.liviayeh\.dev\//);
  assert.match(readme, /Site URL\s+https:\/\/gsat-study-tracker\.liviayeh\.dev\//);
  assert.match(readme, /https:\/\/gsat-study-tracker\.liviayeh\.dev\/terms/);
  assert.doesNotMatch(readme, /livia20060129\.github\.io\/gsat-study-tracker\//);
});

test('OAuth configuration stays on the correct side of the browser and server boundary', () => {
  assert.match(runtime, /googleCalendarConnectionController/);
  assert.doesNotMatch(runtime, /googleCalendarClientConfig|import\.meta\.env|\.apps\.googleusercontent\.com/);
  assert.match(calendarController, /from '\.\.\/config\/googleCalendar\.ts'/);
  assert.match(calendarController, /hostname !== 'accounts\.google\.com'/);
  assert.match(calendarClientConfig, /import\.meta\.env\?\.VITE_GOOGLE_CLIENT_ID/);
  assert.doesNotMatch(calendarClientConfig, /GOOGLE_CLIENT_SECRET|GOOGLE_STATE_SECRET|CALENDAR_CRON_SECRET/);
  assert.match(calendarRuntime, /Deno\.env\.get\(name\)/);
  assert.match(calendarRuntime, /'GOOGLE_CLIENT_SECRET'/);
  assert.match(calendarRuntime, /'GOOGLE_STATE_SECRET'/);
});
