import assert from 'node:assert/strict';
import test from 'node:test';
import { groupDailyWorkItems, propagateDailyWorkDone, relinkDailyWorkSourceItems, ungroupDailyWorkItems } from '../src/study/dailyWorkGroup.ts';
import { applyManualCompletionMetadata, findCompletionItem, refreshCompletionTree } from '../src/study/completionTree.ts';
import { resolveStudyTimerTarget, setStudyTimerTargetMinutes, setStudyTimerTargetState } from '../src/application/timer/studyTimerController.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

const date = '2026-10-24';

function groupedRecord(): StudyRecord {
  const integration: StudyItem = {
    id: 'integration', type: 'scienceReview', source: 'preset', presetKey: 'cal_natural_20261024',
    title: '自然', required: true, done: false, minutes: '', f: { subject: '混合', calendarNaturalIntegration: true,
      calendarIntegrationEntries: (['生物', '化學', '物理', '地科'] as const).map(subject => ({
        id: subject, subject, type: 'scienceReview', done: false, minutes: '', required: true,
        source: 'calendarNaturalIntegration', calendarIntegrationChild: true, f: { subject },
      })),
    },
  };
  const makeup: StudyItem = { id: 'makeup', title: '自然', type: 'scienceReview', source: 'preset',
    required: true, done: false, minutes: '18', f: { subject: '物理', start: '114', end: '127' } };
  return JSON.parse(JSON.stringify({ date, items: groupDailyWorkItems([integration, makeup]) }));
}

test('JSON-cloned integration display copies relink to their owning canonical subjects', () => {
  const record = groupedRecord();
  const root = record.items[0];
  const source = root.f.dailyWorkSourceItems![0];
  const child = root.f.groupedWorkEntries![0];
  assert.notEqual(root.f.calendarIntegrationEntries![0], source.f.calendarIntegrationEntries![0]);
  relinkDailyWorkSourceItems(record.items);
  assert.equal(root.f.calendarIntegrationEntries![0], source.f.calendarIntegrationEntries![0]);
  assert.equal(child.f.calendarIntegrationEntries![0], source.f.calendarIntegrationEntries![0]);
  assert.equal(findCompletionItem(record.items, '生物'), source.f.calendarIntegrationEntries![0]);
});

test('one subject completion and edited date persist through clone and regroup without checking siblings', () => {
  const record = groupedRecord();
  relinkDailyWorkSourceItems(record.items);
  const subject = findCompletionItem(record.items, '生物')!;
  applyManualCompletionMetadata(subject, true, date, '2026-10-25', record.items);
  propagateDailyWorkDone(subject, true);
  record.items.forEach(item => refreshCompletionTree(item));
  const restored = JSON.parse(JSON.stringify(record)) as StudyRecord;
  relinkDailyWorkSourceItems(restored.items);
  const rebuilt = groupDailyWorkItems(ungroupDailyWorkItems(restored.items));
  assert.equal(findCompletionItem(rebuilt, '生物')!.done, true);
  assert.equal(findCompletionItem(rebuilt, '生物')!.checkedOn, '2026-10-25');
  for (const name of ['化學', '物理', '地科']) assert.equal(findCompletionItem(rebuilt, name)!.done, false);
  assert.equal(rebuilt[0].done, false);
  assert.equal(findCompletionItem(rebuilt, 'makeup')!.minutes, '18');
});

test('integration timer and manual minutes target the same saved subject after JSON cloning', () => {
  const record = groupedRecord();
  const target = resolveStudyTimerTarget(record, { date, itemId: '化學' })!;
  setStudyTimerTargetState(target, { mode: 'timer', accumulatedSeconds: 90, startedAt: null });
  setStudyTimerTargetMinutes(target, '1.5');
  const stored = ungroupDailyWorkItems(record.items);
  assert.equal(findCompletionItem(stored, '化學')!.minutes, '1.5');
  assert.deepEqual(findCompletionItem(stored, '化學')!.f.timeTracking, { mode: 'timer', accumulatedSeconds: 90, startedAt: null });
  assert.equal(findCompletionItem(stored, '生物')!.minutes, '');
});

test('checking the integration aggregate checks all its subjects, and one cancellation refreshes aggregates only', () => {
  const record = groupedRecord();
  relinkDailyWorkSourceItems(record.items);
  const integration = record.items[0].f.groupedWorkEntries![0];
  propagateDailyWorkDone(integration, true);
  record.items.forEach(item => refreshCompletionTree(item));
  for (const name of ['生物', '化學', '物理', '地科']) assert.equal(findCompletionItem(record.items, name)!.done, true);
  assert.equal(integration.done, true);
  assert.equal(record.items[0].done, false);
  propagateDailyWorkDone(findCompletionItem(record.items, '物理')!, false);
  record.items.forEach(item => refreshCompletionTree(item));
  assert.equal(integration.done, false);
  for (const name of ['生物', '化學', '地科']) assert.equal(findCompletionItem(record.items, name)!.done, true);
});
