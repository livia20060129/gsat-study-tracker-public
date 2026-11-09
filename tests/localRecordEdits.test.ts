import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileLocalRecordEdit, saveLocalRecordEdit } from '../src/application/records/localRecordEdits.ts';
import { updateOverdueTaskMinutes } from '../src/study/overdueTasks.ts';
import type { StudyRecord } from '../src/types.ts';

function fixture(): StudyRecord {
  return { date: '2026-10-15', notes: '', items: [{ id: 'task', type: 'englishPractice',
    required: true, source: 'preset', done: false, minutes: '', f: {} }] };
}

function storageFixture(initial: StudyRecord) {
  const values = new Map<string, string>([['study-v11:guest:2026-10-15', JSON.stringify(initial)]]);
  return {
    values, get length() { return values.size; }, key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
}

test('a stale untouched Calendar projection cannot revive a cleared schedule conflict', () => {
  const base = fixture();
  base.items[0].f = { calendarEventKey: 'primary:task', calendarPlanTitle: 'old' };
  const draft = structuredClone(base);
  draft.items[0].f.calendarPlanTitle = 'rendered';
  draft.syncConflict = true;
  draft.syncConflictLocal = structuredClone(base);
  draft.syncConflictCloud = structuredClone(base);
  const latest = structuredClone(base);
  latest.items[0].f.calendarPlanTitle = 'latest Actions';
  latest.syncConflict = false;
  latest.localDirty = false;
  const result = reconcileLocalRecordEdit(draft, latest, base);
  assert.equal(result.record, latest);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.record.syncConflict, false);
  assert.equal(result.record.localDirty, false);
});

test('Calendar cache preference never discards actual input or a deliberately cleared prior input', () => {
  for (const protectedVersion of ['draft', 'latest', 'base'] as const) {
    const base = fixture();
    base.items[0].f = { calendarEventKey: 'primary:task', calendarPlanTitle: 'old' };
    const draft = structuredClone(base), latest = structuredClone(base);
    draft.items[0].f.calendarPlanTitle = 'rendered';
    latest.items[0].f.calendarPlanTitle = 'Actions';
    ({ draft, latest, base })[protectedVersion].notes = 'real input';
    const result = reconcileLocalRecordEdit(draft, latest, base);
    assert.equal(result.usedThreeWayMerge, true);
    assert.notEqual(result.record, latest);
  }
});

test('unrelated cache normalization still merges newly initialized natural-subject children', () => {
  const base = fixture();
  base.items[0].presetKey = 'cal_natural';
  const draft = structuredClone(base), latest = structuredClone(base);
  draft.items[0].f.calendarIntegrationEntries = [{ id: 'biology', type: 'scienceReview', subject: '生物', done: false, minutes: '', source: 'preset', f: { subject: '生物' } }];
  latest.mood = '';
  latest.notes = '';
  const result = reconcileLocalRecordEdit(draft, latest, base);
  assert.deepEqual(result.conflicts, []);
  assert.equal((result.record.items[0].f.calendarIntegrationEntries as { id: string }[])[0].id, 'biology');
});

test('standalone edits merge a newer unrelated field instead of overwriting another tab', () => {
  const base = fixture();
  const latest = fixture();
  latest.notes = '其他頁籤已儲存';
  latest.items[0].done = true;
  const storage = storageFixture(latest);
  const saved = saveLocalRecordEdit(storage, 'study-v11:guest:', base, record => updateOverdueTaskMinutes(record, 'task', '25'));
  assert.equal(saved?.notes, latest.notes);
  assert.equal(saved?.items[0].done, true);
  assert.equal(saved?.items[0].minutes, '25');
  assert.equal(saved?.localDirty, true);
});

test('same-field conflicts preserve the latest record and fail with an actionable message', () => {
  const base = fixture();
  const latest = fixture();
  latest.items[0].minutes = '15';
  const storage = storageFixture(latest);
  assert.throws(() => saveLocalRecordEdit(storage, 'study-v11:guest:', base,
    record => updateOverdueTaskMinutes(record, 'task', '25')), /同一欄位/);
  assert.equal(JSON.parse(storage.getItem('study-v11:guest:2026-10-15')!).items[0].minutes, '15');
});

test('unreadable or missing source records are not silently replaced', () => {
  const base = fixture();
  const storage = storageFixture(base);
  storage.setItem('study-v11:guest:2026-10-15', '{broken');
  assert.throws(() => saveLocalRecordEdit(storage, 'study-v11:guest:', base,
    record => updateOverdueTaskMinutes(record, 'task', '25')), /無法讀取/);
  assert.equal(storage.getItem('study-v11:guest:2026-10-15'), '{broken');
});

test('failed storage writes do not report success or mutate the loaded draft', () => {
  const base = fixture();
  const storage = storageFixture(base);
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => saveLocalRecordEdit(storage, 'study-v11:guest:', base,
    record => updateOverdueTaskMinutes(record, 'task', '25')), /無法儲存/);
  assert.equal(base.items[0].minutes, '');
});
