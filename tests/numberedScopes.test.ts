import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { parseCalendarTask } from '../src/calendar/calendarBridge.ts';
import { numberedScopesInText, numberedStudyScope, usesSharedNumberedTemplate, usesSharedPageTemplate } from '../src/data/numberedScopes.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import { completedItemsForPeriod } from '../src/study/completedItems.ts';
import { groupDailyWorkItems } from '../src/study/dailyWorkGroup.ts';
import { isProgressOnlyStudyItem, studyItemProgress } from '../src/study/itemProgress.ts';
import { applyNumberedScope, numberedScopeText, validNumberedScope } from '../src/study/numberedScopeProgress.ts';
import { overdueTasks, updateOverdueTaskPageRange } from '../src/study/overdueTasks.ts';
import { bookUnitRange, bookUnitText } from '../src/study/unitBookProgress.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(title: string, fields: StudyItem['f'] = {}, type = 'extra'): StudyItem {
  return { id: title, title, type, source: 'preset', required: true, done: false, minutes: '25',
    f: { title, start: '10', end: '20', progress: true, ...fields } };
}

const cases = [
  ['英文｜Prism Reading 3｜Unit 4', 'unit', '4', '4', '英文'],
  ['英文｜未登錄教材｜Units ２～３', 'unit', '2', '3', '英文'],
  ['物理｜自訂測驗｜第3回～第5回', 'round', '3', '5', '物理'],
  ['數學｜新教材｜Unit 7', 'unit', '7', '7', '數學'],
  ['國文｜新教材｜Rounds 2–4', 'round', '2', '4', '國文'],
  ['英文｜未登錄教材｜Test 6', 'round', '6', '6', '英文'],
  ['Azar英文文法（中階）｜Unit 2', 'unit', '2', '2', '英文'],
] as const;

for (const [title, kind, start, end, subject] of cases) {
  test(`scope-first Calendar template: ${title}`, () => {
    const parsed = parseCalendarTask({ event_key: title, source_event_id: title, calendar_id: 'primary',
      event_date: '2026-10-18', title, category: 'other', description: '【頁碼範圍】p.10–20' });
    assert.equal(parsed.kind, 'numberedScope');
    if (parsed.kind !== 'numberedScope') throw new Error('Expected numbered scope');
    assert.equal(parsed.subject, subject);
    assert.deepEqual(parsed.scopes, [{ kind, start, end }]);
  });
}

test('scopes in structured progress and legacy descriptions are book-independent', () => {
  for (const description of ['【單元進度】Unit 4', 'Unit 4']) {
    const parsed = parseCalendarTask({ event_key: 'x', source_event_id: 'x', calendar_id: 'primary',
      event_date: '2026-10-18', title: '英文｜Another Course', category: 'other', description });
    assert.equal(parsed.kind, 'numberedScope');
    if (parsed.kind === 'numberedScope') assert.equal(parsed.scopes[0].start, '4');
  }
  assert.deepEqual(numberedScopesInText('Unit 1、Unit 3'), [
    { kind: 'unit', start: '1', end: '1' }, { kind: 'unit', start: '3', end: '3' },
  ]);
  assert.deepEqual(numberedScopesInText('第 6 回'), [{ kind: 'round', start: '6', end: '6' }]);
  assert.deepEqual(numberedScopesInText('回次：8–9'), [{ kind: 'round', start: '8', end: '9' }]);
  assert.deepEqual(numberedScopesInText('Prism Reading 3｜2026/10/18｜（1/2）｜p.10–20｜Ch.1'), []);
  assert.deepEqual(numberedScopesInText('Unit 0｜Unit 3–2'), [
    { kind: 'unit', start: '', end: '' },
  ]);
  assert.equal(usesSharedNumberedTemplate(item('英文｜未知教材｜Units 3–2')), true);
});

test('all supported card types recover explicit scopes without a title whitelist', () => {
  for (const type of ['extra', 'general', 'scienceReview', 'mathStudy', 'chineseReading']) {
    const unit = item('未登錄教材', {}, type);
    unit.description = 'Google Calendar API：Unit 9';
    assert.equal(usesSharedNumberedTemplate(unit), true);
    assert.deepEqual(bookUnitRange(unit), { start: '9', end: '9' });
    const round = item('未登錄教材', { round: '4' }, type);
    assert.equal(usesSharedNumberedTemplate(round), true);
    assert.equal(numberedScopeText(round), '第 4 回');
  }
  assert.equal(numberedStudyScope(item('Prism Reading', { unitStart: '', unitEnd: '', unit: '', round: '' })), null);
  assert.equal(numberedStudyScope(item('數學', { unit: '多項式函數' })), null);
  assert.equal(numberedStudyScope(item('英文｜新教材｜Unit 4', { unitStart: '', unitEnd: '' }))?.start, '4');
  assert.equal(numberedStudyScope(item('英文｜新教材｜第 3 回', { round: '' }))?.start, '3');
  assert.equal(usesSharedNumberedTemplate(item('自訂英文雜誌｜Unit 2')), true);
  assert.equal(usesSharedNumberedTemplate(item('ACE Reading Plus', { round: '2' })), true);
  assert.equal(usesSharedNumberedTemplate(item('雜誌', { unit: '2' })), false);
  assert.equal(usesSharedNumberedTemplate(item('ACE Reading', { round: '2' })), false);
});

test('repeating a scope in the title and structured note creates only one numbered definition', () => {
  const parsed = parseCalendarTask({ event_key: 'repeat', source_event_id: 'repeat', calendar_id: 'primary',
    event_date: '2026-10-18', title: '英文｜新教材｜Unit 4', category: 'other', description: '【單元進度】Unit 4' });
  assert.equal(parsed.kind, 'numberedScope');
  if (parsed.kind === 'numberedScope') assert.equal(parsed.scopes.length, 1);
});

test('the real shared renderer uses Unit or round controls, never page fields', () => {
  const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
  const context = createContext({ numberedStudyScope, usesSharedNumberedTemplate, usesSharedPageTemplate, bookUnitRange, bookUnitText, managedMaterialForItem: () => null,
    numberedScopeText, studyItemProgress, isProgressOnlyStudyItem, isGroupedWork: () => false, isCalendarPageMappedBook: () => false,
    esc: (value: unknown) => String(value ?? ''), checked: (value: unknown) => value ? ' checked' : '',
    reasonField: () => '', readingOptions: () => '',
    isPrism: () => false, isAce: () => false, isEnglishPageMappedBook: () => false,
    isAzarGrammar: () => false, isListeningTestBook: () => false, isWritingTest: () => false,
    isGrammarReview: () => false, isEssentialGrammar: (title: string) => title === 'Essential Grammar in Use',
    isCalendarEssentialGrammar: () => true });
  for (const name of ['renderNumberedScopeFields', 'renderExtraProgressChecks', 'renderExtraFields', 'renderItemFields']) {
    const start = runtime.indexOf(`function ${name}(`);
    const end = runtime.indexOf('\nfunction ', start + 1);
    runInContext(runtime.slice(start, end), context);
  }
  for (const [title, kind] of cases) {
    const sample = item(title, {}, title.startsWith('英文') || title.startsWith('Azar') ? 'extra' : 'general');
    const html = context.renderItemFields(sample, false) as string;
    assert.match(html, new RegExp(`data-field="${kind === 'unit' ? 'unitStart' : 'round'}"`));
    assert.doesNotMatch(html, /data-field="(?:start|end)"|起始頁|頁碼不在/);
  }
  const essential = item('Essential Grammar in Use', { unit: '1', unitStart: '2', unitEnd: '3' });
  const nativeHtml = context.renderItemFields(essential, false) as string;
  assert.match(nativeHtml, /Unit 2–3/);
  assert.doesNotMatch(nativeHtml, /Unit 1<|起始頁/);
});

test('unknown numbered books have no guessed maximum and todo preserves separate pages and completion data', () => {
  for (const kind of ['unit', 'round'] as const) {
    const original = item('未登錄教材', { scopeKind: kind, [kind === 'unit' ? 'unitStart' : 'round']: '1' });
    original.checkedOn = '2026-10-16';
    const record: StudyRecord = { date: '2026-10-15', items: [original] };
    const [entry] = overdueTasks([record], '2026-10-18');
    const controls = entry.details.filter(detail => detail.editableRange);
    assert.deepEqual(controls.map(detail => detail.rangeKind), [kind, kind]);
    assert.equal(controls[0].unitMaximum, undefined);
    const updated = updateOverdueTaskPageRange(record, original.id, '120', '122');
    assert.ok(updated);
    const decoded = decodeStudyRecord(encodeStudyRecord(updated), record.date);
    assert.equal(decoded.ok, true);
    if (!decoded.ok) throw new Error('Round-trip failed');
    const restored = decoded.record.items[0];
    assert.deepEqual([restored.f.start, restored.f.end, restored.checkedOn, restored.minutes, restored.f.progress, restored.done],
      ['10', '20', '2026-10-16', '25', true, false]);
    assert.equal(numberedStudyScope(restored)?.start, '120');
    assert.equal(numberedStudyScope(restored)?.end, '122');
    assert.equal(updateOverdueTaskPageRange(record, original.id, '3', '2'), null);
    assert.equal(updateOverdueTaskPageRange(record, original.id, '1.5', '2'), null);
  }
});

test('known Unit and round bounds remain enforced; single, blank and reversed ranges are handled consistently', () => {
  const bounded = item('Unlock 3', { unitStart: '1', unitEnd: '1' });
  const scope = numberedStudyScope(bounded)!;
  assert.equal(scope.maximum, 8);
  assert.equal(validNumberedScope(scope, '2', ''), true);
  assert.equal(validNumberedScope(scope, '', ''), true);
  assert.equal(validNumberedScope(scope, '', '2'), false);
  assert.equal(validNumberedScope(scope, '1', '9'), false);
  assert.equal(validNumberedScope(scope, '3', '2'), false);
  assert.equal(numberedStudyScope(item('大考英聽A攻略', { round: '2' }))?.maximum, 10);
  applyNumberedScope(bounded, '2', '');
  assert.deepEqual(bookUnitRange(bounded), { start: '2', end: '2' });
});

test('different Unit and round ranges never collapse because of old overlapping page data', () => {
  for (const kind of ['unit', 'round'] as const) {
    const items = [2, 3].map(end => ({ ...item('英文｜新教材', { scopeKind: kind, calendarEventKey: 'same',
      ...(kind === 'unit' ? { unitStart: '1', unitEnd: String(end) } : { round: '1', roundEnd: String(end) }) }),
      id: String(end), done: true }));
    const record = { date: '2026-10-18', items: groupDailyWorkItems(items) };
    const completed = completedItemsForPeriod([record], { start: record.date, end: record.date });
    assert.equal(completed.length, 2);
    assert.ok(completed.every(entry => !entry.detail.includes('p.')));
    assert.notEqual(completed[0].detail, completed[1].detail);
  }
});
