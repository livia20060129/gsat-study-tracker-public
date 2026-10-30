import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
const connectionMotion = readFileSync(new URL('../src/ui/connectionSettingsMotion.ts', import.meta.url), 'utf8');
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
  assert.match(runtime, /function updateEnglishReviewWordText\(target,item,completeWord\)/);
  assert.match(runtime, /if\(t\.matches\('\[data-word-text\]'\)&&x\)\{updateEnglishReviewWordText\(t,x\);return\}/);
  assert.match(runtime, /function handleChange\(e\)\{[\s\S]*?if\(t\.matches\('\[data-word-text\]'\)&&x\)\{updateEnglishReviewWordText\(t,x,true\);persist\(false\);return\}/);
});

test('English review separates parts of speech from the animated content-kind switch', () => {
  assert.match(runtime, /var primaryTags=VOCABULARY_PARTS_OF_SPEECH/);
  assert.match(runtime, /\[\['word','單字'\],\['combination','組合'\],\['sentence','句子'\]\]/);
  assert.match(runtime, /renderEnglishReviewWordTagRow\(w,i,primaryTags,'word-pos-primary'\)\+renderEnglishReviewWordKind\(w,i\)/);
  assert.match(runtime, /current\.fixedCombination=kind==='combination';current\.beautifulSentences=kind==='sentence'/);
  assert.match(styles, /\.word-kind-indicator\{[\s\S]*?transition:transform/);
});

test('other notes save only after leaving the field', () => {
  assert.match(runtime, /function notesInput\(\)\{data\.notes=id\('notes'\)\.value\}/);
  assert.match(runtime, /id\('notes'\)\.addEventListener\('input',notesInput\);id\('notes'\)\.addEventListener\('change',headerChange\)/);
  assert.doesNotMatch(runtime, /\[[^\]]*'notes'[^\]]*\]\.forEach\(function\(k\)\{id\(k\)\.addEventListener\('input',headerInput\)/);
});

test('completion saves independently before progress summaries are recalculated', () => {
  assert.match(runtime, /function persistCompletionChange\(\)\{return persist\(false,\{ignoreRoutineTime:true\}\)\}/);
  assert.match(runtime, /if\(x\.calendarIntegrationChild\|\|x\.calendarGroupedChild\)[\s\S]*?persistCompletionChange\(\);updateSummary\(\)/);
  assert.match(runtime, /if\(x\.done&&confirmedDeferred\(x\)\)[\s\S]*?persistCompletionChange\(\);updateSummary\(\);maybeCelebrateCompletion/);
});

test('cloud status distinguishes local, pending, synced and failed states', () => {
  assert.match(runtime, /'已存本機 ✓'/);
  assert.match(runtime, /'Cloud 已同步 ✓'/);
  assert.match(runtime, /'待同步 '\+pending\+' 天'/);
  assert.match(runtime, /retryDirtyCloudRecordsOnReconnect/);
  assert.match(html, /id="cloudRefreshNotice"/);
});

test('Cloud login cannot be blocked indefinitely by record or Calendar bootstrap', () => {
  assert.match(runtime, /import \{ completionDateValue, deferredCompletionDate, isCompletedByDate \} from '\.\/study\/completionCheckedOn'/);
  assert.match(runtime, /CLOUD_AUTH_TIMEOUT_MS=15000/);
  assert.match(runtime, /CLOUD_RECORD_BOOTSTRAP_TIMEOUT_MS=20000/);
  assert.match(runtime, /controller\.abort\(\)/);
  assert.match(runtime, /setTimeout\(function\(\)\{refreshCalendarAfterCloudActivation\(serial\)\},0\)/);
  assert.match(runtime, /已登入，但載入帳號本機快取失敗/);
  assert.doesNotMatch(runtime, /Promise\.all\(\[cloudPullAllRecords\(\{silent:true\}\),calendarRefreshStatus\(false\)\]\)/);
});

test('mobile settings use a bottom sheet and CI runs real browser tests', () => {
  assert.match(styles, /\.connection-dock\[open\]\{position:fixed/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /npm run test:e2e/);
});

test('mobile date input can shrink without escaping its card', () => {
  assert.match(styles, /input\[type=date\]\{[^}]*min-inline-size:0;max-inline-size:100%/);
  assert.match(styles, /#studyDate\{width:auto;max-width:none;inline-size:auto;max-inline-size:none;align-self:stretch\}/);
  assert.match(styles, /@media\(max-width:720px\)[\s\S]*?\.grid-2,\.grid-3,[^}]*grid-template-columns:minmax\(0,1fr\)/);
});

test('connection settings share one responsive transition lifecycle', () => {
  assert.match(runtime, /setupConnectionSettingsMotion\(connectionSettingsPanel,connectionSettingsSummary\)/);
  assert.match(connectionMotion, /type ConnectionMotionState = 'idle' \| 'opening' \| 'closing'/);
  assert.match(connectionMotion, /new ResizeObserver\(handleContentResize\)/);
  assert.match(connectionMotion, /mobilePlaceholder\.classList\.add\('is-active'\)/);
  assert.match(connectionMotion, /panel\.classList\.add\('is-preparing', 'is-opening'\)/);
  assert.match(connectionMotion, /panel\.style\.top = `\$\{collapsedRect\.top\}px`/);
  assert.match(connectionMotion, /panel\.style\.height = `\$\{mobile \? expandedHeight : limitedExpandedHeight\(panel\)\}px`/);
  assert.match(connectionMotion, /clearMotionStyles\(isMobile\(\)\)/);
  assert.match(connectionMotion, /if \(state !== 'closing'\) return;[\s\S]*panel\.open = false/);
  assert.match(connectionMotion, /if \(event\.propertyName !== 'height'\) return/);
  assert.match(connectionMotion, /document\.addEventListener\('touchmove', handleGuardedTouchMove, \{ passive: false \}\)/);
  assert.match(connectionMotion, /document\.addEventListener\('wheel', handleGuardedWheel, \{ passive: false \}\)/);
  assert.match(styles, /\.connection-dock\.is-preparing,\.connection-dock\.is-animating\{overflow:hidden;pointer-events:none/);
  assert.match(styles, /\.connection-dock\[open\]\.is-preparing\{transition:none\}/);
  assert.match(styles, /\.connection-dock\[open\]\{[^}]*backdrop-filter:none;contain:paint/);
  assert.match(styles, /\.connection-dock\.is-animating:not\(\.is-expanded\) \.connection-settings-content/);
  assert.match(styles, /\.connection-dock\[open\]\.is-animating\{transition:height/);
  assert.match(styles, /body\.connection-sheet-open\{overscroll-behavior:none\}/);
  assert.doesNotMatch(styles, /body\.connection-sheet-open\{overflow:hidden\}/);
  assert.doesNotMatch(styles, /@keyframes connection-(settings-in|settings-out|dock-collapse|sheet-in|sheet-out)/);
});

test('material progress navigation stays in the current browser tab', () => {
  const link = html.match(/<a[^>]*href="\.\/material\.progress\.html"[^>]*>教材進度圖<\/a>/)?.[0] || '';
  assert.ok(link);
  assert.doesNotMatch(link, /target="_blank"/);
});
