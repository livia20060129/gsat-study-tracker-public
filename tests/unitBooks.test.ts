import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { UNLOCK_3_BOOK } from '../src/data/bookPageMaps.ts';
import { bookUnitNumbers, unitBook } from '../src/data/unitBooks.ts';
import { parseCalendarTask } from '../src/calendar/calendarBridge.ts';
import { completedItemsForPeriod } from '../src/study/completedItems.ts';
import { groupDailyWorkItems } from '../src/study/dailyWorkGroup.ts';
import { materialProgressRows } from '../src/study/materialProgress.ts';
import { isInteractiveStudyItem } from '../src/study/interactiveTasks.ts';
import { overdueTasks, updateOverdueTaskPageRange } from '../src/study/overdueTasks.ts';
import { bookUnitRange, bookUnitText } from '../src/study/unitBookProgress.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(fields: StudyItem['f'] = {}, overrides: Partial<StudyItem> = {}): StudyItem {
  return { id: 'unlock', type: 'extra', title: '英文｜Unlock 3', source: 'preset', required: true,
    done: false, minutes: '25', f: { title: UNLOCK_3_BOOK, ...fields }, ...overrides };
}

test('unit books use their own total and never infer a unit from the book edition or a fraction', () => {
  assert.equal(unitBook(UNLOCK_3_BOOK)?.total, 8);
  assert.equal(unitBook('Essential Grammar in Use')?.total, 115);
  assert.equal(unitBook('ACE Reading'), null);
  assert.deepEqual(bookUnitNumbers('Unlock 3｜Unit 1 Animals（1/2）｜10/18', 8), [1]);
  assert.deepEqual(bookUnitNumbers('Unlock 3｜（1/2）｜p.14–35', 8), []);
  assert.deepEqual(bookUnitNumbers('Units １–３, ５', 8), [1, 2, 3, 5]);
  assert.deepEqual(bookUnitNumbers('Unit 1、Unit 3', 8), [1, 3]);
  assert.deepEqual(bookUnitNumbers('Unit 0｜Unit 9｜Units 4–2', 8), []);
});

test('Calendar Unlock with a split annotation uses the supplied actual pages instead of Unit inputs', () => {
  const parsed = parseCalendarTask({ event_key: 'event', source_event_id: 'event', calendar_id: 'primary',
    event_date: '2026-10-18', title: '英文｜Unlock 3｜Unit 1 Animals（1/2）', category: 'studyItem',
    description: '【頁碼範圍】p.14–24\n【單元進度】Unit 1 Animals（1/2）',
  });
  assert.equal(parsed.kind, 'pageScope');
  if (parsed.kind === 'pageScope') assert.deepEqual([parsed.startPage, parsed.endPage], [14, 24]);
});

test('split Calendar descriptions do not infer Unit or pages, while unsplit legacy pages keep Unit inference', () => {
  const old = item({}, { description: 'Google Calendar API：Unlock 3｜Unit 1 Animals（1/2）', done: true, checkedOn: '2026-10-18' });
  const snapshot = structuredClone(old);
  assert.deepEqual(bookUnitRange(old), { start: '', end: '' });
  assert.equal(bookUnitText(old), '尚未填寫 Unit。');
  assert.deepEqual(old, snapshot);
  const legacyPages = item({ start: '14', end: '24' });
  assert.deepEqual(bookUnitRange(legacyPages), { start: '1', end: '1' });
  assert.equal(legacyPages.f.start, '14');
});

test('the actual Calendar definition builder keeps distinct Units and stable item identities', () => {
  const parsed = parseCalendarTask({ event_key: 'unit-event', source_event_id: 'event', calendar_id: 'primary',
    event_date: '2026-10-18', title: '英文｜Unlock 3｜Units 1, 3', category: 'studyItem', description: '',
  });
  const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
  const context = createContext({ calendarParsedByDate: { '2026-10-18': [parsed] }, isInteractiveStudyItem });
  for (const name of ['calendarEventToken', 'calendarIdentifierToken', 'presetDef', 'cloudCalendarDefsForDate']) {
    const start = runtime.indexOf(`function ${name}(`);
    const end = runtime.indexOf('\nfunction ', start + 1);
    assert.ok(start >= 0 && end > start);
    runInContext(runtime.slice(start, end), context);
  }
  const definitions = context.cloudCalendarDefsForDate('2026-10-18');
  assert.deepEqual(Array.from(definitions, (entry: { f: StudyItem['f'] }) => entry.f.unitStart), ['1', '3']);
  assert.ok(definitions.every((entry: { f: StudyItem['f'] }) => entry.f.start === undefined && entry.f.calendarBookRangeLocked === true));
  assert.equal(JSON.stringify(definitions), JSON.stringify(context.cloudCalendarDefsForDate('2026-10-18')));
});

test('todo edits Unit fields with their own bounds and keeps original pages, flags and minutes', () => {
  const record: StudyRecord = { date: '2026-10-15', items: [item({ start: '14', end: '24', progress: true })] };
  const [entry] = overdueTasks([record], '2026-10-18');
  assert.deepEqual(entry.details.filter(detail => detail.editableRange).map(detail => [detail.label, detail.value, detail.unitMaximum]), [
    ['起始 Unit', '1', 8], ['結束 Unit', '1', 8],
  ]);
  const updated = updateOverdueTaskPageRange(record, 'unlock', '2', '3');
  assert.ok(updated);
  assert.equal(updated.items[0].f.unitStart, '2');
  assert.equal(updated.items[0].f.unitEnd, '3');
  assert.equal(updated.items[0].f.start, '14');
  assert.equal(updated.items[0].f.end, '24');
  assert.equal(updated.items[0].f.progress, true);
  assert.equal(updated.items[0].minutes, '25');
  assert.equal(updated.items[0].done, false);
  assert.deepEqual(bookUnitRange(JSON.parse(JSON.stringify(updated.items[0]))), { start: '2', end: '3' });
  assert.equal(updateOverdueTaskPageRange(record, 'unlock', '1', '9'), null);
  assert.equal(updateOverdueTaskPageRange(record, 'unlock', '3', '2'), null);
  assert.equal(updateOverdueTaskPageRange(record, 'unlock', '1.5', '2'), null);
  assert.equal(updateOverdueTaskPageRange(record, 'unlock', '1e0', '2'), null);
  assert.equal(updateOverdueTaskPageRange(record, 'unlock', '2', '')?.items[0].f.unitEnd, '2');
  assert.equal(record.items[0].f.unitStart, undefined);
});

test('distinct Units do not merge by retained legacy pages and completion lists retain both scopes', () => {
  const items = [1, 2].map(unit => item({ unitStart: String(unit), unitEnd: String(unit), start: '14', end: '35', calendarEventKey: 'same-event' }, { id: `unit-${unit}`, done: true }));
  assert.equal(groupDailyWorkItems(items).length, 2);
  const completed = completedItemsForPeriod([{ date: '2026-10-18', items }], { start: '2026-10-18', end: '2026-10-18' });
  assert.equal(completed.length, 2);
  assert.deepEqual(completed.map(entry => entry.detail).sort(), ['Unit 1｜Animals', 'Unit 2｜The environment']);
});

test('split material progress requires actual pages, not an estimated fraction of a Unit', () => {
  const first = item({ unitStart: '1', unitEnd: '1', calendarUnitProgress: 'Unit 1 Animals（1/2）' }, { done: true });
  const second = item({ unitStart: '1', unitEnd: '1', calendarUnitProgress: 'Unit 1 Animals（2/2）' }, { id: 'second', done: true });
  const progress = (items: StudyItem[]) => materialProgressRows([{ date: '2026-10-18', items }]).find(row => row.id === `book:${UNLOCK_3_BOOK}`)!;
  assert.equal(progress([first]).recorded, 0);
  assert.equal(progress([first, second]).recorded, 0);
  const noteWithoutPart = item({ unitStart: '1', unitEnd: '1', calendarUnitProgress: 'Unit 1' }, { done: true, description: 'Unlock 3｜Unit 1 Animals（1/2）' });
  assert.equal(progress([noteWithoutPart]).recorded, 0);
  assert.equal(first.f.start, undefined);
  first.f.start = '14'; first.f.end = '24';
  second.f.start = '25'; second.f.end = '35';
  assert.equal(progress([first]).segments.find(segment => segment.recorded)?.completionPercent, 50);
  assert.equal(progress([first, second]).segments.find(segment => segment.recorded)?.completionPercent, 100);
});
