import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');

test('destructive whole-card and Calendar disconnect actions require confirmation', () => {
  assert.match(runtime, /action==='delete-item'.*window\.confirm/);
  assert.match(runtime, /async function calendarDisconnect\(\)\{\s*if\(!window\.confirm/);
});

test('small rows use an eight-second targeted undo instead of restoring a whole record', () => {
  assert.match(runtime, /DELETE_UNDO_MS=8000/);
  assert.match(runtime, /removeSmallEntryWithUndo/);
  assert.match(html, /id="deleteUndoToast"/);
  assert.doesNotMatch(runtime, /deleteUndoState=cloneRecord\(data\)/);
});

test('Supabase account recovery includes reset, resend and password update', () => {
  assert.match(runtime, /resetPasswordForEmail\(email,\{redirectTo:cloudAuthReturnUrl\(\)\}\)/);
  assert.match(runtime, /auth\.resend\(\{type:'signup'/);
  assert.match(runtime, /event==='PASSWORD_RECOVERY'/);
  assert.match(runtime, /auth\.updateUser\(\{password:password\}\)/);
  assert.match(html, /id="passwordRecoveryDialog"/);
});

test('all typed fields save after leaving the field while page exit remains durable', () => {
  assert.doesNotMatch(runtime, /LOCAL_INPUT_SAVE_MS|scheduleInputPersist|localInputSaveTimer/);
  assert.match(runtime, /function headerInput\(\)\{readHeader\(\)\}/);
  assert.match(runtime, /if\(t\.matches\('\[data-minutes\]'\)&&x\)\{propagateDailyWorkMinutes\(x,t\.value\);updateSummary\(\);return\}/);
  assert.match(runtime, /function handleChange\(e\)\{[\s\S]*?if\(t\.matches\('\[data-minutes\]'\)&&x\)[\s\S]*?persist\(false\);return/);
  assert.match(runtime, /function handleChange\(e\)\{[\s\S]*?if\(t\.matches\('\[data-mag-field\]'\)&&x\)[\s\S]*?persist\(false\);return/);
  assert.match(runtime, /window\.addEventListener\('pagehide'.*persist\(false\)/);
  assert.match(runtime, /visibilityState==='hidden'.*persist\(false\)/);
});

test('English review text stays in memory while typing and saves after leaving the field', () => {
  assert.match(runtime, /function updateEnglishReviewWordText\(target,item\)/);
  assert.match(runtime, /if\(t\.matches\('\[data-word-text\]'\)&&x\)\{updateEnglishReviewWordText\(t,x\);return\}/);
  assert.match(runtime, /function handleChange\(e\)\{[\s\S]*?if\(t\.matches\('\[data-word-text\]'\)&&x\)\{updateEnglishReviewWordText\(t,x\);persist\(false\);return\}/);
});

test('other notes save only after leaving the field', () => {
  assert.match(runtime, /function notesInput\(\)\{data\.notes=id\('notes'\)\.value\}/);
  assert.match(runtime, /id\('notes'\)\.addEventListener\('input',notesInput\);id\('notes'\)\.addEventListener\('change',headerChange\)/);
  assert.doesNotMatch(runtime, /\[[^\]]*'notes'[^\]]*\]\.forEach\(function\(k\)\{id\(k\)\.addEventListener\('input',headerInput\)/);
});

test('completion is persisted before progress summaries are recalculated', () => {
  assert.match(runtime, /if\(x\.calendarIntegrationChild\|\|x\.calendarGroupedChild\)[\s\S]*?persist\(false\);updateSummary\(\)/);
  assert.match(runtime, /if\(x\.done&&confirmedDeferred\(x\)\)[\s\S]*?persist\(false\);updateSummary\(\);maybeCelebrateCompletion/);
});

test('cloud status distinguishes local, pending, synced and failed states', () => {
  assert.match(runtime, /'已存本機 ✓'/);
  assert.match(runtime, /'Cloud 已同步 ✓'/);
  assert.match(runtime, /'待同步 '\+pending\+' 天'/);
  assert.match(runtime, /retryDirtyCloudRecordsOnReconnect/);
  assert.match(html, /id="cloudRefreshNotice"/);
});

test('mobile settings use a bottom sheet and CI runs real browser tests', () => {
  assert.match(styles, /\.connection-dock\[open\]\{position:fixed/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /npm run test:e2e/);
});

test('connection settings keep the details open until the retract animation finishes', () => {
  assert.match(runtime, /--connection-expanded-height/);
  assert.match(runtime, /event\.target!==connectionSettingsPanel/);
  assert.match(runtime, /connectionSettingsPanel\.open=false/);
  assert.match(styles, /@keyframes connection-dock-collapse/);
  assert.match(styles, /\.connection-dock\[open\]\.is-closing\{animation:connection-dock-collapse/);
  assert.match(styles, /\.connection-dock\[open\]\.is-closing\{animation:connection-sheet-out/);
});

test('material progress navigation stays in the current browser tab', () => {
  const link = html.match(/<a[^>]*href="\.\/material\.progress\.html"[^>]*>教材進度圖<\/a>/)?.[0] || '';
  assert.ok(link);
  assert.doesNotMatch(link, /target="_blank"/);
});
