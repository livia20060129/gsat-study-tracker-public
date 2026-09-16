import assert from 'node:assert/strict';
import test from 'node:test';

import {
  groupDailyWorkItems,
  propagateDailyWorkDeferred,
  propagateDailyWorkDone,
  propagateDailyWorkField,
  propagateDailyWorkMinutes,
  propagateDailyWorkRangeField,
  ungroupDailyWorkItems,
} from '../src/study/dailyWorkGroup.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function math(id: string, start: number, end: number, deferredCarry = false): StudyItem {
  return {
    id,
    type: 'mathStudy',
    done: false,
    minutes: '',
    required: !deferredCarry,
    source: 'preset',
    presetKey: id,
    title: '數學講義：進度',
    deferredCarry,
    f: { material: '教學講義', book: '1', start: String(start), end: String(end) },
  };
}

function reload(record: StudyRecord): StudyRecord {
  const decoded = decodeStudyRecord(encodeStudyRecord(record), record.date);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) throw new Error(decoded.error);
  return decoded.record;
}

test('merged math edits survive storage encoding and a full view rebuild', () => {
  const merged = groupDailyWorkItems([
    math('original', 158, 165),
    math('makeup', 149, 157, true),
  ]);
  propagateDailyWorkMinutes(merged[0], '45');
  propagateDailyWorkRangeField(merged[0], 'end', '170');
  propagateDailyWorkDone(merged[0], true);

  const stored = reload({ date: '2026-09-01', items: merged });
  const rebuilt = groupDailyWorkItems(ungroupDailyWorkItems(stored.items));

  assert.equal(rebuilt.length, 1);
  assert.equal(rebuilt[0].minutes, '45');
  assert.equal(rebuilt[0].f.start, '149');
  assert.equal(rebuilt[0].f.end, '170');
  assert.equal(rebuilt[0].done, true);
  assert.equal((rebuilt[0].f.dailyWorkSourceItems as StudyItem[]).every(item => item.done), true);
});

test('separate grouped children keep independent fields after storage reload', () => {
  const merged = groupDailyWorkItems([
    math('first', 1, 5),
    math('second', 11, 15, true),
  ]);
  const children = merged[0].f.groupedWorkEntries as StudyItem[];
  propagateDailyWorkField(children[1], 'reason', '第二段錯因');
  propagateDailyWorkDone(children[1], true);
  propagateDailyWorkDeferred(children[0], true, 5);

  const stored = reload({ date: '2026-09-01', items: merged });
  const rebuilt = groupDailyWorkItems(ungroupDailyWorkItems(stored.items));
  const rebuiltChildren = rebuilt[0].f.groupedWorkEntries as StudyItem[];

  assert.equal(rebuiltChildren.length, 2);
  assert.equal(rebuiltChildren[0].deferred, true);
  assert.equal(rebuiltChildren[0].deferredTargetDay, 5);
  assert.equal(rebuiltChildren[1].done, true);
  assert.equal(rebuiltChildren[1].f.reason, '第二段錯因');
});

test('timer timestamps survive a local and cloud-compatible payload round trip', () => {
  const item = math('timed', 198, 205);
  item.f.timeTracking = { mode: 'timer', accumulatedSeconds: 75, startedAt: 1_788_000_000_000 };
  const stored = reload({ date: '2026-09-01', items: [item] });
  assert.deepEqual(stored.items[0].f.timeTracking, item.f.timeTracking);
});

test('a one-decimal timer result survives the stored record round trip', () => {
  const item = math('timed-finished', 206, 210);
  item.minutes = '1.5';
  item.f.timeTracking = { mode: 'manual', accumulatedSeconds: 90, startedAt: null };

  const stored = reload({ date: '2026-09-01', items: [item] });

  assert.equal(stored.items[0].minutes, '1.5');
  assert.deepEqual(stored.items[0].f.timeTracking, item.f.timeTracking);
});

test('manual and deferred completion dates survive the cloud-compatible payload round trip', () => {
  const completed = math('deferred-finished', 211, 215, true);
  completed.done = true;
  completed.checkedOn = '2026-09-17';
  completed.deferredCompletedOn = '2026-09-17';

  const stored = reload({ date: '2026-09-17', items: [completed] });

  assert.equal(stored.items[0].checkedOn, '2026-09-17');
  assert.equal(stored.items[0].deferredCompletedOn, '2026-09-17');
});
