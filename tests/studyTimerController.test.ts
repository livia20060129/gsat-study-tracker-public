import assert from 'node:assert/strict';
import test from 'node:test';
import {
  changeStudyTimer, resolveStudyTimerTarget, sameStudyTimerPointer, sameStudyTimerTarget, setStudyTimerTargetMinutes,
  setStudyTimerTargetState, studyTimerTargetState, switchStudyTimerMode,
} from '../src/application/timer/studyTimerController.ts';
import { groupDailyWorkItems } from '../src/study/dailyWorkGroup.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(id: string, start: string, end: string): StudyItem {
  return { id, type: 'scienceReview', title: '物理複習', source: 'preset', required: true,
    done: false, minutes: '', f: { subject: '物理', material: '新關鍵', start, end } };
}

test('timer/manual/timer preserves exact seconds and an explicit manual edit becomes the new baseline', () => {
  const running = { mode: 'timer', accumulatedSeconds: 0, startedAt: 1_000 };
  const manual = switchStudyTimerMode(running, 'manual', '', 66_000);
  assert.equal(manual.minutes, '1.1');
  assert.equal(manual.state.accumulatedSeconds, 65);
  const resumed = switchStudyTimerMode(manual.state, 'timer', manual.minutes!, 80_000);
  assert.equal(resumed.state.accumulatedSeconds, 65);
  assert.equal(resumed.state.startedAt, null);
  const edited = switchStudyTimerMode(manual.state, 'timer', '3.5', 80_000);
  assert.equal(edited.state.accumulatedSeconds, 210);
});

test('both pages can resolve a persisted hidden source and mirror its paused state to the visible child', () => {
  const record: StudyRecord = { date: '2026-10-15', items: groupDailyWorkItems([
    item('source-a', '10', '12'), item('source-b', '20', '22'),
  ]) };
  const loaded = JSON.parse(JSON.stringify(record)) as StudyRecord;
  const target = resolveStudyTimerTarget(loaded, { date: loaded.date, itemId: 'source-a' });
  assert.ok(target);
  const state = { mode: 'timer' as const, accumulatedSeconds: 75, startedAt: null };
  setStudyTimerTargetState(target, state);
  setStudyTimerTargetMinutes(target, '1.3');
  const child = loaded.items[0].f.groupedWorkEntries?.[0];
  assert.deepEqual(child?.f.timeTracking, state);
  assert.equal(child?.minutes, '1.3');
  assert.equal(sameStudyTimerTarget(loaded, target.pointer, { date: loaded.date, itemId: child!.id }), true);
  assert.equal(sameStudyTimerTarget(loaded, target.pointer, { date: loaded.date, itemId: 'source-b' }), false);
  const sibling = resolveStudyTimerTarget(loaded, { date: loaded.date, itemId: 'source-b' });
  assert.equal(sibling?.item.minutes, '');
  assert.equal(studyTimerTargetState(sibling!).accumulatedSeconds, 0);
  const reloaded = JSON.parse(JSON.stringify(loaded)) as StudyRecord;
  assert.deepEqual(studyTimerTargetState(resolveStudyTimerTarget(reloaded, target.pointer)!), state);
});

test('magazine timer state and minutes update the same stable entry after propagation clones the rows', () => {
  const record: StudyRecord = { date: '2026-10-15', items: [{ ...item('magazine', '', ''),
    type: 'magazine', f: { entries: [{ id: 'entry-1', minutes: '' }, { id: 'entry-2', minutes: '9' }] },
  }] };
  const target = resolveStudyTimerTarget(record, { date: record.date, itemId: 'magazine', entryId: 'entry-1' });
  assert.ok(target);
  setStudyTimerTargetState(target, { mode: 'manual', accumulatedSeconds: 90, startedAt: null });
  setStudyTimerTargetMinutes(target, '1.5');
  assert.equal((record.items[0].f.entries as Array<{ minutes: string }>)[0].minutes, '1.5');
  assert.equal((record.items[0].f.entries as Array<{ minutes: string }>)[1].minutes, '9');
});

test('a contiguous merged card mirrors its preferred timer source without changing the other source', () => {
  const record: StudyRecord = { date: '2026-10-15', items: groupDailyWorkItems([
    item('source-a', '10', '12'), item('source-b', '13', '15'),
  ]) };
  assert.equal(record.items.length, 1);
  const target = resolveStudyTimerTarget(record, { date: record.date, itemId: 'source-a' })!;
  setStudyTimerTargetState(target, { mode: 'timer', accumulatedSeconds: 15, startedAt: null });
  assert.equal(record.items[0].f.timeTracking?.accumulatedSeconds, 15);
  assert.equal(resolveStudyTimerTarget(record, { date: record.date, itemId: 'source-b' })?.item.f.timeTracking, undefined);
});

test('timer command transitions preserve pause/resume and reject unrelated pointers', () => {
  const initial = { mode: 'timer', accumulatedSeconds: 60, startedAt: null };
  const started = changeStudyTimer(initial, 'toggle', 1_000)!;
  const paused = changeStudyTimer(started.state, 'toggle', 11_000)!;
  assert.equal(paused.state.accumulatedSeconds, 70);
  assert.equal(changeStudyTimer(paused.state, 'finish')?.minutes, '1.2');
  assert.equal(changeStudyTimer(initial, 'unknown'), null);
  assert.equal(changeStudyTimer(initial, 'reset')?.minutes, '');
  assert.equal(sameStudyTimerPointer({ date: '2026-10-15', itemId: 'a' }, { date: '2026-10-15', itemId: 'a', entryId: 'e' }), false);
  assert.equal(resolveStudyTimerTarget({ date: '2026-10-15', items: [] }, { date: '2026-10-16', itemId: 'a' }), null);
});
