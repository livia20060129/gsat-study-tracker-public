import assert from 'node:assert/strict';
import test from 'node:test';
import { canUseCloudCalendarRecord, decideRevisionSync, markRecordLocallyEdited, markRecordSynced } from '../src/storage/recordSync.ts';
import { clearUnrecordedCalendarConflict, hasRecordedStudyInput } from '../src/study/recordedActivity.ts';
import { calendarItemsByDate, reconcileCalendarRecord } from '../src/application/calendar/reconcileCalendarSchedule.ts';
import { synchronizeStoredCalendarSchedule } from '../src/application/calendar/storedCalendarSchedule.ts';
import type { StudyRecord } from '../src/types.ts';

const date = '2026-11-02';
function rows(round = 3) {
  return [{ event_key: 'primary:a', source_event_id: 'a', calendar_id: 'primary', event_date: date,
    title: `英文｜ACE Reading 第 ${round} 回`, description: '', category: 'english' }];
}
function blank(round = 3): StudyRecord {
  return { date, items: structuredClone(calendarItemsByDate(rows(round)).get(date)!),
    mood: '', wakeTime: '', notes: '', serverRevision: 2, localDirty: true };
}
function conflicted(): StudyRecord {
  const local = blank();
  return { ...local, syncConflict: true, syncConflictLocal: blank(), syncConflictCloud: blank(5),
    syncConflictDetails: [{ path: '$.items', kind: 'unknown-base', baseExists: false, localExists: true, cloudExists: true }] };
}

function defaultMagazine() {
  return { id: 'preset-magazine', type: 'magazine' as const, source: 'preset', required: true, done: false, minutes: '', f: {
    entries: [{ id: 'generated-row', name: '', month: '11', unit: '', minutes: '', magazineMonthInitialized: true,
      timeTracking: { mode: 'manual' as const, accumulatedSeconds: 0, startedAt: null as number | null } }],
  } };
}

test('a generated blank magazine month and timer cannot turn a Calendar cache into recorded input', () => {
  const local = conflicted();
  local.items.push(defaultMagazine());
  assert.equal(hasRecordedStudyInput(local), false);
  assert.equal(canUseCloudCalendarRecord(local, markRecordSynced(blank(5))), true);
  assert.equal(clearUnrecordedCalendarConflict(local).syncConflict, false);
});

test('real magazine fields, changed or cleared months, added rows and active timers stay protected', () => {
  const edits: Array<(entry: ReturnType<typeof defaultMagazine>['f']['entries'][number]) => void> = [
    entry => { entry.name = 'Live'; }, entry => { entry.unit = '3'; },
    entry => { entry.minutes = '0'; }, entry => { entry.month = '12'; },
    entry => { entry.month = ''; }, entry => { entry.timeTracking.startedAt = 1; },
    entry => { entry.timeTracking.accumulatedSeconds = 1; },
  ];
  for (const edit of edits) {
    const local = conflicted(), magazine = defaultMagazine();
    edit(magazine.f.entries[0]); local.items.push(magazine);
    assert.equal(hasRecordedStudyInput(local), true);
    assert.equal(canUseCloudCalendarRecord(local, markRecordSynced(blank(5))), false);
  }
  const local = conflicted(), magazine = defaultMagazine();
  magazine.f.entries.push(structuredClone(magazine.f.entries[0])); local.items.push(magazine);
  assert.equal(hasRecordedStudyInput(local), true);
});

test('an unrecorded calendar difference adopts verified cloud even with an old schedule-only conflict', () => {
  const local = conflicted(), cloud = markRecordSynced({ ...blank(5), serverRevision: 4 });
  assert.equal(hasRecordedStudyInput(local), false);
  assert.equal(canUseCloudCalendarRecord(local, cloud), true);
  assert.equal(decideRevisionSync(local, cloud), 'use-cloud');
  assert.equal(canUseCloudCalendarRecord(local, { ...cloud, serverRevision: 1 }), false);
  assert.equal(canUseCloudCalendarRecord(local, { ...cloud, localDirty: true }), false);
  assert.equal(canUseCloudCalendarRecord(local, { ...cloud, date: '2026-11-03' }), false);
});

test('time, checks, words, routine, notes, manual scope and custom items protect the entire date', () => {
  const edits: Array<(record: StudyRecord) => void> = [
    record => { record.items[0].done = true; },
    record => { record.items[0].minutes = '0'; },
    record => { record.items[0].f.graded = true; },
    record => { record.items[0].f.corrected = true; },
    record => { record.items[0].f.words = [{ text: 'intriguing', translation: '有趣的' }]; },
    record => { record.wakeTime = '07:20'; },
    record => { Object.assign(record, { wakeHour: '0', wakeMinute: '30' }); },
    record => { record.bedtime = { time: '01:30', dateTime: '2026-11-03T01:30', nextDay: true }; },
    record => { record.mood = '外出'; },
    record => { record.notes = '保留筆記'; },
    record => { record.items[0].f.dailyWorkUserFields = { start: '' }; },
    record => { record.items[0].f.timeTracking = { mode: 'timer', accumulatedSeconds: 0, startedAt: Date.now() }; },
    record => { record.items.push({ id: 'manual', source: 'custom', type: 'extra', done: false, required: false, minutes: '', f: {} }); },
    record => { record.items[0].f.calendarIntegrationEntries = [{ subject: '生物', done: true }]; },
  ];
  for (const edit of edits) {
    const local = conflicted(); edit(local);
    assert.equal(hasRecordedStudyInput(local), true);
    assert.equal(canUseCloudCalendarRecord(local, markRecordSynced(blank(5))), false);
    assert.equal(clearUnrecordedCalendarConflict(local), local);
  }
});

test('a cleared prior record and a recoverable local draft cannot be silently replaced', () => {
  const local = blank(), cloud = markRecordSynced(blank(5));
  local.syncBase = { ...blank(), notes: '剛清除的筆記' };
  assert.equal(canUseCloudCalendarRecord(local, cloud), false);
  delete local.syncBase;
  local.syncConflictLocal = { ...blank(), mood: '普通' };
  assert.equal(canUseCloudCalendarRecord(local, cloud), false);
  assert.equal(canUseCloudCalendarRecord({ ...blank(), storageIssue: { source: 'local', date, error: 'invalid', backupKey: 'backup', capturedAt: '' } }, cloud), false);
});

test('successful Actions projection resolves only empty calendar conflicts and adopts the latest range', () => {
  const local = conflicted(), wanted = calendarItemsByDate(rows(6)).get(date)!;
  const next = reconcileCalendarRecord(local, wanted)!;
  assert.equal(next.syncConflict, false);
  assert.equal(next.syncConflictDetails, undefined);
  assert.ok(JSON.stringify(next.items).includes('第 6 回'));
  const recorded = conflicted(); recorded.notes = '已經記錄';
  assert.equal(reconcileCalendarRecord(recorded, wanted), null);
  const cloudRecorded = conflicted(); cloudRecorded.syncConflictCloud!.notes = '雲端實際紀錄';
  assert.equal(reconcileCalendarRecord(cloudRecorded, wanted), null);
});

test('the stored snapshot clears schedule-only conflicts without restoring them during save', () => {
  const values = new Map<string, string>(), prefix = 'study-v11:user:owner:';
  const storage = { get length() { return values.size; }, key(index: number) { return [...values.keys()][index] || null; },
    getItem(key: string) { return values.get(key) || null; }, setItem(key: string, value: string) { values.set(key, value); }, removeItem(key: string) { values.delete(key); } };
  values.set(prefix + date, JSON.stringify(conflicted()));
  assert.deepEqual(synchronizeStoredCalendarSchedule(storage, prefix, rows(6), date).savedDates, [date]);
  const saved = JSON.parse(values.get(prefix + date)!);
  assert.equal(saved.syncConflict, false);
  assert.equal(saved.syncConflictDetails, undefined);
  assert.equal(saved.localDirty, false);
  assert.deepEqual(synchronizeStoredCalendarSchedule(storage, prefix, rows(6), date).savedDates, []);
  saved.syncConflict = true;
  saved.syncConflictDetails = [{ path: '$.items', kind: 'unknown-base' }];
  values.set(prefix + date, JSON.stringify(saved));
  assert.deepEqual(synchronizeStoredCalendarSchedule(storage, prefix, rows(6), date).savedDates, [date]);
  assert.equal(JSON.parse(values.get(prefix + date)!).syncConflict, false);
});

test('downloaded Calendar-only changes are cached without an upload, while actual input and cleared input stay dirty', () => {
  const previous = markRecordSynced(blank());
  const cached = markRecordLocallyEdited(blank(5), previous);
  assert.equal(cached.localDirty, false);
  assert.deepEqual(cached.syncBase, previous.syncBase);
  const recorded = { ...blank(5), notes: '今天已記錄' };
  assert.equal(markRecordLocallyEdited(recorded, previous).localDirty, true);
  const cleared = markRecordLocallyEdited(blank(5), markRecordSynced(recorded));
  assert.equal(cleared.localDirty, true);
});
