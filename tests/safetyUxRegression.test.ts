import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const connectionMotion = readFileSync(new URL('../src/ui/connectionSettingsMotion.ts', import.meta.url), 'utf8');
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

test('connection settings share one stable responsive transition lifecycle', () => {
  assert.match(runtime, /setupConnectionSettingsMotion\(connectionSettingsPanel,connectionSettingsSummary\)/);
  assert.match(connectionMotion, /type ConnectionMotionState = 'idle' \| 'opening' \| 'closing'/);
  assert.match(connectionMotion, /mobilePlaceholder\.classList\.add\('is-active'\)/);
  assert.match(connectionMotion, /panel\.style\.top = `\$\{collapsedRect\.top\}px`/);
  assert.match(connectionMotion, /clearMotionStyles\(isMobile\(\)\)/);
  assert.match(connectionMotion, /document\.addEventListener\('touchmove', handleGuardedTouchMove, \{ passive: false \}\)/);
  assert.match(styles, /\.connection-dock-placeholder\.is-active\{display:block\}/);
  assert.match(styles, /\.connection-dock\.is-preparing,\.connection-dock\.is-animating\{overflow:hidden;pointer-events:none/);
  assert.match(styles, /body\.connection-sheet-open\{overscroll-behavior:none\}/);
  assert.doesNotMatch(styles, /body\.connection-sheet-open\{overflow:hidden\}/);
  assert.doesNotMatch(styles, /@keyframes connection-(settings-in|settings-out|dock-collapse|sheet-in|sheet-out)/);
});

test('Cloud records render before Calendar reconciliation and failures preserve the visible record', () => {
  assert.match(runtime, /load\(\{skipCloudRead:true,cacheOnly:true,skipPresetReconcile:true\}\)/);
  assert.match(runtime, /refreshVisibleDataAfterBackgroundSync\(\{skipPresetReconcile:true\}\)/);
  assert.match(runtime, /setCloudVisibleRefreshPending\(true,options\)/);
  assert.match(runtime, /withOperationTimeout\(calendarRefreshStatus\(false\)/);
  assert.match(runtime, /calendarReady\)refreshVisibleDataAfterBackgroundSync\(\)/);
  assert.match(runtime, /if\(!opts\.skipPresetReconcile\)changed=ensureDailyPresets/);
});

test('Biology and Chemistry New Key cards display their mapped unit and topic', () => {
  assert.match(runtime, /import \{ naturalNewKeyPageText \} from '\.\/data\/naturalMaterialPageMaps\.ts'/);
  assert.match(runtime, /新關鍵｜頁碼對應單元／主題/);
  assert.match(runtime, /\(f\.subject==='生物'\|\|f\.subject==='化學'\)&&f\.material==='新關鍵'/);
});

test('material progress navigation stays in the current browser tab', () => {
  const link = html.match(/<a[^>]*href="\.\/material\.progress\.html"[^>]*>教材進度圖<\/a>/)?.[0] || '';
  assert.ok(link);
  assert.doesNotMatch(link, /target="_blank"/);
});
