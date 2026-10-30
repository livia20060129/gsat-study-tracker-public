import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudyItem, StudyRecord } from '../src/types.ts';
import {
  completedItemSummarySubject, completedItemsForPeriod, completedItemsForSubject,
} from '../src/study/completedItems.ts';
import { summarizeLearningPeriod, summaryPeriod } from '../src/study/learningSummary.ts';
import {
  overdueHandledTasks, undoOverdueTaskAction, updateOverdueTaskCompletion, updateOverdueTaskSkip,
} from '../src/study/overdueTasks.ts';

const week = summaryPeriod('2026-10-17', 'week');

function item(id: string, overrides: Partial<StudyItem> = {}): StudyItem {
  return { id, type: 'englishPractice', title: id, done: true, minutes: '', required: true,
    source: 'preset', f: {}, ...overrides };
}

test('membership uses actual completion dates, including early/late work outside the scheduled period', () => {
  const records: StudyRecord[] = [
    { date: '2026-09-30', items: [item('late', { checkedOn: '2026-10-12' })] },
    { date: '2026-11-01', items: [item('early', { checkedOn: '2026-10-18' })] },
    { date: '2026-10-17', mood: '外出', items: [item('legacy'), item('open', { done: false }),
      item('next-week', { checkedOn: '2026-10-19' }), item('last-week', { checkedOn: '2026-10-11' })] },
  ];
  assert.deepEqual(completedItemsForPeriod(records, week).map(row => [row.title, row.date]), [
    ['early', '2026-10-18'], ['legacy', '2026-10-17'], ['late', '2026-10-12'],
  ]);
  assert.equal(completedItemsForPeriod(records, summaryPeriod('2026-10-17', 'month')).length, 5);
});

test('all status days, optional and weekly tasks count as accomplishments even without minutes', () => {
  const records: StudyRecord[] = ['外出', '身體不適', '較疲累'].map((mood, index) => ({
    date: `2026-10-${15 + index}`, mood, items: [item(`status-${index}`, {
      required: false, minutes: index === 0 ? '0' : '', f: { calendarRoute: 'week' },
    })],
  }));
  assert.equal(completedItemsForPeriod(records, week).length, 3);
});

test('lists only completed leaves, not aggregate parents or duplicate hidden sources', () => {
  const source = item('source', { f: { book: 'Azar 英文文法', start: '18', end: '21' } });
  const displayed = item('displayed', { f: { dailyWorkSourceItems: [source] } });
  const parent = item('parent', { done: false, f: {
    groupedWorkEntries: [displayed, item('pending-child', { done: false })],
    dailyWorkSourceItems: [source],
  } });
  const result = completedItemsForPeriod([{ date: '2026-10-17', items: [parent, source] }], week);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'source');
  assert.equal(result[0].detail, 'Azar 英文文法｜p.18–21');
});

test('deferred completion and its original appear only once, including nested carried children', () => {
  const original = item('original', { deferred: true, deferredTargetDay: 6,
    deferredCompletedOn: '2026-10-17' });
  const child = item('child', { checkedOn: '2026-10-17' });
  const records: StudyRecord[] = [
    { date: '2026-10-05', items: [original, item('original-parent', { f: { interactiveEntries: [child] } })] },
    { date: '2026-10-17', items: [
      item('carry', { deferredCarry: true, deferredOriginId: 'original',
        deferredOriginDate: '2026-10-05', checkedOn: '2026-10-17' }),
      item('carry-parent', { deferredCarry: true, deferredOriginDate: '2026-10-05',
        checkedOn: '2026-10-17', f: { interactiveEntries: [child] } }),
      item('not-done-carry', { done: false, deferredCarry: true }),
    ] },
  ];
  const entries = completedItemsForPeriod(records, week);
  assert.equal(entries.length, 2);
  assert.ok(entries.every(entry => entry.recordDate === '2026-10-05' && entry.date === '2026-10-17'));
});

test('Calendar duplicates collapse but different scopes and separate scheduled days remain distinct', () => {
  const calendar = item('calendar', { f: { calendarEventKey: 'event:occurrence', start: '4', end: '10' } });
  const records: StudyRecord[] = [
    { date: '2026-10-16', items: [calendar, item('same-preset-id')] },
    { date: '2026-10-17', items: [
      { ...calendar, id: 'calendar-copy' },
      { ...calendar, id: 'other-scope', f: { ...calendar.f, start: '11', end: '20' } },
      item('same-preset-id'),
    ] },
  ];
  const rows = completedItemsForPeriod(records, week);
  assert.equal(rows.length, 4);
  assert.equal(rows.filter(row => row.title === 'same-preset-id').length, 2);
});

test('natural integration, reviews and makeup use completed child dates and inherited labels', () => {
  const records: StudyRecord[] = [{ date: '2026-10-10', items: [
    item('integration', { checkedOn: '2026-10-17', f: { calendarIntegrationEntries: [
      { id: 'bio', subject: '生物', done: true, pageText: 'p.4–57', chapterText: '細胞' },
      { id: 'chem', subject: '化學', done: false },
    ] } }),
    item('review-parent', { checkedOn: '2026-10-16', f: { reviewEntries: [item('review')] } }),
    item('makeup-parent', { checkedOn: '2026-10-15', f: { makeupEntries: [item('makeup')] } }),
  ] }];
  assert.deepEqual(completedItemsForPeriod(records, week).map(row => [row.title, row.subject, row.date]), [
    ['integration', '生物', '2026-10-17'], ['review', '英文', '2026-10-16'], ['makeup', '英文', '2026-10-15'],
  ]);
  assert.match(completedItemsForPeriod(records, week)[0].detail, /p.4–57/);
});

test('inactive English options and correction cards remain excluded', () => {
  const records: StudyRecord[] = [{ date: '2026-10-17', englishTaskChoice: 'mixed', items: [
    item('mixed', { type: 'englishMixedWriting' }),
    item('mock', { type: 'mock', presetKey: 'fri_mock_timed' }),
    item('hidden-correction', { f: { englishMockCorrectionInactive: true } }),
  ] }];
  assert.deepEqual(completedItemsForPeriod(records, week).map(row => row.title), ['mixed']);
});

test('invalid dates and unfinished items never produce rows; empty periods stay empty', () => {
  assert.deepEqual(completedItemsForPeriod([
    { date: '2026-02-30', items: [item('bad-record')] },
    { date: '2026-10-17', items: [item('bad-completion', { checkedOn: '2026-02-30' }),
      item('pending', { done: false, checkedOn: '2026-10-17' })] },
  ], week), []);
  assert.deepEqual(completedItemsForPeriod([], week), []);
});

test('listing does not mutate saved data or change time/completion metrics', () => {
  const records: StudyRecord[] = [{ date: '2026-10-17', mood: '身體不適', items: [
    item('done', { minutes: '30' }), item('open', { done: false }),
  ] }];
  const before = JSON.stringify(records);
  const metrics = summarizeLearningPeriod(records, week);
  assert.equal(completedItemsForPeriod(records, week).length, 1);
  assert.equal(JSON.stringify(records), before);
  assert.deepEqual(summarizeLearningPeriod(records, week), metrics);
});

test('todo completion uses the selected date outside the scheduled month and outlives the undo window', () => {
  const original: StudyRecord = { date: '2026-09-30', items: [item('todo', { done: false })] };
  const completed = updateOverdueTaskCompletion(original, 'todo', true, '2026-10-16', '2026-10-17T04:00:00Z');
  assert.ok(completed);
  const stored = JSON.parse(JSON.stringify(completed)) as StudyRecord;
  assert.equal(overdueHandledTasks([stored], Date.parse('2026-10-22T04:00:00Z')).length, 0);
  const rows = completedItemsForPeriod([stored], week);
  assert.deepEqual(rows.map(row => [row.title, row.date, row.recordDate]), [
    ['todo', '2026-10-16', '2026-09-30'],
  ]);
  assert.equal(completedItemsForPeriod([stored], summaryPeriod('2026-09-30', 'month')).length, 0);
  assert.equal(completedItemsForPeriod([stored], summaryPeriod('2026-10-17', 'month')).length, 1);

  const restored = undoOverdueTaskAction(stored, 'todo', '2026-10-17');
  assert.ok(restored);
  assert.deepEqual(completedItemsForPeriod([restored], week), []);
  const skipped = updateOverdueTaskSkip(original, 'todo', '2026-10-17');
  assert.ok(skipped);
  assert.deepEqual(completedItemsForPeriod([skipped], week), []);
});

test('canonical todo sources remain visible when older grouped display copies are stale', () => {
  const pendingSource = item('canonical-todo', { done: false,
    f: { material: '新關鍵', start: '10', end: '12' } });
  const completed = updateOverdueTaskCompletion({ date: '2026-09-30', items: [pendingSource] },
    pendingSource.id, true, '2026-10-16');
  assert.ok(completed);
  const staleDisplay = item('display-copy', { done: false, f: {
    dailyWorkSourceItems: [structuredClone(pendingSource)],
  } });
  const stored: StudyRecord = { date: '2026-09-30', items: [item('merged-parent', { f: {
    dailyWorkSourceItems: completed.items, groupedWorkEntries: [staleDisplay],
  } })] };
  const before = JSON.stringify(stored);
  const rows = completedItemsForPeriod([stored], week);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'canonical-todo');
  assert.equal(rows[0].date, '2026-10-16');
  assert.equal(rows[0].detail, '新關鍵｜p.10–12');
  assert.equal(JSON.stringify(stored), before);
});

test('explicit todo accomplishments survive a later change of the active English option', () => {
  const original: StudyRecord = { date: '2026-09-30', englishTaskChoice: 'mixed', items: [
    item('todo-mixed', { type: 'englishMixedWriting', done: false }),
    item('mock-option', { type: 'mock', presetKey: 'fri_mock_timed', done: false }),
    item('inactive-correction', { done: true, f: { englishMockCorrectionInactive: true } }),
  ] };
  const completed = updateOverdueTaskCompletion(original, 'todo-mixed', true, '2026-10-16');
  assert.ok(completed);
  completed.englishTaskChoice = 'mock';
  assert.deepEqual(completedItemsForPeriod([completed], week).map(row => row.title), ['todo-mixed']);
  const restored = undoOverdueTaskAction(completed, 'todo-mixed', '2026-10-17');
  assert.ok(restored);
  assert.deepEqual(completedItemsForPeriod([restored], week), []);
});

test('an inactive grouped option includes only its explicitly completed todo children', () => {
  const todoChild = item('todo-child', { checkedOn: '2026-10-16', f: {
    overdueTodoAction: { kind: 'complete', handledAt: '2026-10-17T04:00:00Z' },
  } });
  const records: StudyRecord[] = [{ date: '2026-09-30', englishTaskChoice: 'mock', items: [
    item('inactive-mixed', { type: 'englishMixedWriting', done: false, f: {
      groupedWorkEntries: [todoChild, item('other-inactive-child', { checkedOn: '2026-10-16' })],
    } }),
    item('mock-option', { type: 'mock', presetKey: 'fri_mock_timed', done: false }),
  ] }];
  assert.deepEqual(completedItemsForPeriod(records, week).map(row => row.title), ['todo-child']);
});

test('subject filtering follows donut families without dropping zero-minute completions or changing order', () => {
  const subjects = ['國文', '英文', '數學', '物理', '化學', '生物', '地科', '自然', '社會', '其他'];
  const records: StudyRecord[] = [{ date: '2026-10-17', items: subjects.map(subject => item(subject, {
    type: 'general', f: { subject },
  })) }];
  const entries = completedItemsForPeriod(records, week);
  const before = JSON.stringify(entries);
  assert.equal(completedItemsForSubject(entries, null).length, 10);
  assert.deepEqual(completedItemsForSubject(entries, '英文').map(entry => entry.subject), ['英文']);
  assert.deepEqual(completedItemsForSubject(entries, '數學').map(entry => entry.subject), ['數學']);
  assert.deepEqual(completedItemsForSubject(entries, '國文').map(entry => entry.subject), ['國文']);
  assert.deepEqual(completedItemsForSubject(entries, '自然'), entries.filter(entry => (
    ['自然', '物理', '化學', '生物', '地科'].includes(entry.subject)
  )));
  assert.equal(completedItemsForSubject(entries, '自然').length, 5);
  assert.deepEqual(completedItemsForSubject(entries, '物理').map(entry => entry.subject), ['物理']);
  assert.deepEqual(completedItemsForSubject(entries, '社會').map(entry => entry.subject), ['社會']);
  assert.deepEqual(completedItemsForSubject(entries, '其他').map(entry => entry.subject), ['其他']);
  assert.equal(JSON.stringify(entries), before);
});

test('completed list colors use existing donut subject keys, with a safe other-subject fallback', () => {
  for (const subject of ['數學', '國文', '英文', '物理', '化學', '生物', '地科', '自然', '公民', '歷史', '地理', '社會', '其他']) {
    assert.equal(completedItemSummarySubject(subject), subject);
  }
  assert.equal(completedItemSummarySubject('未知科目'), '其他');
  assert.deepEqual(completedItemsForSubject([], '英文'), []);
});
