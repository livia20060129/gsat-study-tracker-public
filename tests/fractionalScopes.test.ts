import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import test from 'node:test';
import { parseCalendarTask } from '../src/calendar/calendarBridge.ts';
import { canonicalPageMappedBook, UNLOCK_3_BOOK } from '../src/data/bookPageMaps.ts';
import { numberedStudyScope, resetObsoletePageScope, usesSharedNumberedTemplate, usesSharedPageTemplate } from '../src/data/numberedScopes.ts';
import { hasStudyPartAnnotation } from '../src/data/studyPartAnnotation.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import { completedItemsForPeriod } from '../src/study/completedItems.ts';
import { materialProgressRows } from '../src/study/materialProgress.ts';
import { overdueTasks, updateOverdueTaskPageRange } from '../src/study/overdueTasks.ts';
import { studyItemProgress } from '../src/study/itemProgress.ts';
import { isInteractiveStudyItem } from '../src/study/interactiveTasks.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(title = '英文｜Unlock 3｜Unit 1 Animals（1/2）', fields: StudyItem['f'] = {}, type = 'extra'): StudyItem {
  return { id: 'split', type, title, source: 'preset', required: true, minutes: '25', done: false,
    f: { title: UNLOCK_3_BOOK, unitStart: '1', unitEnd: '1', start: '14', end: '24', progress: true, ...fields } };
}

test('split annotations accept fullwidth, part labels and both halves but not ordinary dates or invalid fractions', () => {
  for (const text of ['Unit 1（1/2）', 'Unit 1/2', '第3回 (2 / 2)', 'Unit 1（１／２）', '進度：1/3', '【單元進度】1/2', 'Part 2/3', '1/2']) {
    assert.equal(hasStudyPartAnnotation(text), true, text);
  }
  for (const text of ['Unit 1｜2026/10/25', 'Unit 1｜10/25', 'Unit 1（原10/25）', '日期：(10/25)', 'Unit 1（0/2）',
    'Unit 1（3/2）', 'Unit 1（1/0）', 'Unit 1（1/200）', 'Unit 1｜Ch.2']) {
    assert.equal(hasStudyPartAnnotation(text), false, text);
  }
});

test('split annotation priority is shared by all subjects and retains stored Unit, round, pages and state', () => {
  for (const type of ['extra', 'general', 'scienceReview', 'mathStudy', 'chineseReading', 'mock']) {
    for (const scope of ['Unit 2', '第 3 回']) {
      const original = item(`教材｜${scope}（1/2）`, { title: '教材', scopeKind: 'unit', round: '3', graded: true }, type);
      const before = structuredClone(original);
      assert.equal(usesSharedPageTemplate(original), true);
      assert.equal(numberedStudyScope(original), null);
      assert.equal(usesSharedNumberedTemplate(original), false);
      assert.deepEqual(original, before);
      original.title = `教材｜${scope}`;
      assert.equal(usesSharedPageTemplate(original), false);
      assert.notEqual(numberedStudyScope(original), null);
    }
  }
  const progressOnly = item('教材', { calendarUnitProgress: '1/2' });
  assert.equal(usesSharedPageTemplate(progressOnly), true);
});

test('Calendar split Unit and round scopes prefer explicit pages across native and unknown books', () => {
  for (const title of ['英文｜Unlock 3｜Unit 1（1/2）', '英文｜Prism Reading 3｜Unit 4（1/2）',
    '英文｜ACE Reading 第 3 回（1/2）', '英文｜大考英聽A攻略 Test 2（1/2）',
    'Essential Grammar in Use｜Unit 4（1/2）', '物理｜自訂講義｜第 3 回（1/2）',
    '數學｜新教材｜Unit 5（1/2）', '國文｜古今悅讀一百 第 3 回（1/2）']) {
    const parsed = parseCalendarTask({ event_key: title, source_event_id: title, calendar_id: 'primary', event_date: '2026-10-25',
      title, description: '【頁碼範圍】p.14–24', category: 'other' });
    assert.equal(parsed.kind, 'pageScope', title);
    if (parsed.kind === 'pageScope') assert.deepEqual([parsed.startPage, parsed.endPage], [14, 24]);
  }
});

test('structured fraction notes use pages even without parentheses, and missing pages are never guessed', () => {
  for (const description of ['【單元進度】1/2', '【單元進度】Unit 1（1/2）', 'Unit 1（1/2）']) {
    for (const title of ['英文｜Unlock 3｜Unit 1', '英文｜Unlock 3']) {
      const parsed = parseCalendarTask({ event_key: 'missing', source_event_id: 'missing', calendar_id: 'primary', event_date: '2026-10-25',
        title, description, category: 'other' });
      assert.equal(parsed.kind, 'pageScope');
      if (parsed.kind === 'pageScope') assert.deepEqual([parsed.startPage, parsed.endPage], [null, null]);
    }
  }
});

test('the real Calendar builder produces one editable page definition with a stable existing book identity', () => {
  const parsed = parseCalendarTask({ event_key: 'event', source_event_id: 'event', calendar_id: 'primary', event_date: '2026-10-25',
    title: '英文｜Unlock 3｜Unit 1（1/2）', description: '【頁碼範圍】p.14–24', category: 'other' });
  const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
  const context = createContext({ calendarParsedByDate: { '2026-10-25': [parsed] }, canonicalPageMappedBook, isInteractiveStudyItem });
  for (const name of ['calendarEventToken', 'calendarIdentifierToken', 'presetDef', 'cloudCalendarDefsForDate']) {
    const start = runtime.indexOf(`function ${name}(`);
    runInContext(runtime.slice(start, runtime.indexOf('\nfunction ', start + 1)), context);
  }
  const definitions = context.cloudCalendarDefsForDate('2026-10-25');
  assert.equal(definitions.length, 1);
  assert.match(definitions[0].key, /^cal_book_/);
  assert.deepEqual(JSON.parse(JSON.stringify(definitions[0].f)), { title: UNLOCK_3_BOOK, book: UNLOCK_3_BOOK,
    subject: '英文', scopeKind: 'pages', start: '14', end: '24', calendarUnitProgress: parsed.title,
    calendarEventId: 'event', calendarEventKey: 'event', calendarRoute: 'today', calendarMakeup: false, calendarSourceDate: '2026-10-25' });
});

test('todo page inputs write back actual pages and round-trip without modifying old scope fields or completion state', () => {
  const original = item();
  const record: StudyRecord = { date: '2026-10-24', items: [original] };
  const [task] = overdueTasks([record], '2026-10-25');
  assert.deepEqual(task.details.filter(detail => detail.editableRange).map(detail => [detail.label, detail.value, detail.rangeKind]),
    [['起始頁', '14', undefined], ['結束頁', '24', undefined]]);
  const updated = updateOverdueTaskPageRange(record, original.id, '25', '35')!;
  assert.ok(updated);
  assert.deepEqual([updated.items[0].f.start, updated.items[0].f.end, updated.items[0].f.unitStart, updated.items[0].minutes, updated.items[0].done],
    ['25', '35', '1', '25', false]);
  const decoded = decodeStudyRecord(encodeStudyRecord(updated));
  assert.equal(decoded.ok, true);
  if (decoded.ok) assert.equal(usesSharedPageTemplate(decoded.record.items[0]), true);
  assert.equal(updateOverdueTaskPageRange(record, original.id, '35', '25'), null);
  const blank = overdueTasks([{ date: '2026-10-24', items: [item(undefined, { start: '', end: '' })] }], '2026-10-25')[0];
  assert.equal(blank.details.filter(detail => detail.editableRange).length, 2);
});

test('actual page coverage and completed details never claim a whole Unit or round from a split annotation', () => {
  const partial = item(undefined, {}, 'extra');
  partial.done = true;
  const record: StudyRecord = { date: '2026-10-24', items: [partial] };
  const progress = materialProgressRows([record]).find(row => row.id === `book:${UNLOCK_3_BOOK}`)!;
  assert.equal(progress.segments.find(segment => segment.recorded)!.completionPercent, 50);
  assert.match(completedItemsForPeriod([record], { start: record.date, end: record.date })[0].detail, /p\.14–24/);
  const ace = item('英文｜ACE Reading 第 3 回（1/2）', { title: 'ACE Reading', round: '3' });
  ace.done = true;
  assert.equal(materialProgressRows([{ date: record.date, items: [ace] }]).find(row => row.id === 'english:ace')!.recorded, 0);
  const gujin = item('國文｜古今悅讀一百 第 3 回（1/2）', { title: '古今悅讀一百', book: '', kind: 'reading', round: '3' }, 'chineseReading');
  gujin.done = true;
  assert.equal(materialProgressRows([{ date: record.date, items: [gujin] }]).find(row => row.id === 'chinese:gujin')!.recorded, 0);
  const azar = item('Azar英文文法（中階）｜Unit 1（1/2）', { title: 'Azar英文文法（中階）', book: '', start: '18', end: '20' });
  azar.done = true;
  assert.equal(materialProgressRows([{ date: record.date, items: [azar] }]).find(row => row.id === 'english:azar-intermediate')!.recorded, 1);
});

test('removing the split from a refreshed Calendar definition restores Unit mode and keeps actual saved pages', () => {
  const saved = item(undefined, { scopeKind: 'pages', calendarUnitProgress: 'Unit 1（1/2）' });
  const whole = item('英文｜Unlock 3｜Unit 1', { calendarUnitProgress: 'Unit 1' });
  assert.equal(resetObsoletePageScope(saved, item(undefined, { scopeKind: 'pages' })), false);
  assert.equal(resetObsoletePageScope(saved, whole), true);
  saved.title = whole.title;
  assert.equal(usesSharedPageTemplate(saved), false);
  assert.equal(numberedStudyScope(saved)!.kind, 'unit');
  assert.deepEqual([saved.f.start, saved.f.end, saved.minutes, saved.done, saved.f.unitStart], ['14', '24', '25', false, '1']);
});

test('the actual shared page renderer uses editable page controls and retains progress checks', () => {
  const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
  const context = createContext({ canonicalPageMappedBook, studyItemProgress, usesSharedPageTemplate, managedMaterialForItem: () => null,
    isGroupedWork: () => false, bookPageAutoField: () => '頁碼對照',
    esc: (value: unknown) => String(value ?? ''), checked: (value: boolean) => value ? ' checked' : '', reasonField: () => '' });
  for (const name of ['renderSharedPageFields', 'renderItemFields']) {
    const start = runtime.indexOf(`function ${name}(`);
    runInContext(runtime.slice(start, runtime.indexOf('\nfunction ', start + 1)), context);
  }
  const html = context.renderItemFields(item(undefined, { calendarBookRangeLocked: true }), false) as string;
  assert.match(html, /data-field="start" value="14"/);
  assert.match(html, /data-field="end" value="24"/);
  assert.doesNotMatch(html, /data-field="(?:unitStart|unitEnd|round)"/);
  assert.match(html, /data-check="progress" checked/);
});
