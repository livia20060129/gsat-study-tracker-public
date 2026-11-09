import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarItemsByDate, isArchivedCalendarItem, reconcileCalendarRecord, reconcileCalendarRecords } from '../src/application/calendar/reconcileCalendarSchedule.ts';
import { synchronizeStoredCalendarSchedule } from '../src/application/calendar/storedCalendarSchedule.ts';
import { summaryCompletionUnitsForRecord } from '../src/study/learningSummary.ts';
import { summarizeCompletionUnits } from '../src/study/completionMetrics.ts';
import { completedStudyTimeEntries } from '../src/study/completedStudyTime.ts';
import { vocabularyReviewEntries } from '../src/study/vocabularyReview.ts';
import { overdueTasks } from '../src/study/overdueTasks.ts';
import { ungroupDailyWorkItems } from '../src/study/dailyWorkGroup.ts';
import { stripRecordSyncMeta } from '../src/storage/recordSync.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import type { CalendarTaskRow } from '../src/calendar/calendarBridge.ts';
import type { StudyRecord } from '../src/types.ts';

const date = '2026-08-17', today = '2026-11-07';
function row(id: string, round = 3, day = date): CalendarTaskRow {
  return { event_key: `primary:${id}`, source_event_id: id, calendar_id: 'primary', event_date: day,
    title: `英文｜ACE Reading 第 ${round} 回`, description: '', category: 'english' };
}
function record(rows = [row('a'), row('b', 5)]): StudyRecord {
  const items = calendarItemsByDate(rows).get(date)!;
  return JSON.parse(JSON.stringify({ date, notes: '保留紀錄', wakeHour: '7', items }));
}
function active(record: StudyRecord) { return ungroupDailyWorkItems(record.items).filter(item => !isArchivedCalendarItem(item)); }

test('deleted historical events leave todo and both completion denominators but retain time, words and JSON round-trip', () => {
  const old = record();
  old.items[0].done = true; old.items[0].checkedOn = date; old.items[0].minutes = '25';
  old.items[0].f.words = [{ text: 'intriguing', translation: '有趣的' }];
  const result = reconcileCalendarRecords([old], [row('b', 5)], today)[0];
  assert.equal(active(result).length, 1);
  assert.equal(summarizeCompletionUnits(summaryCompletionUnitsForRecord(result)).itemTotal, 1);
  assert.equal(overdueTasks([result], today).length, 1);
  assert.equal(completedStudyTimeEntries([result]).reduce((sum, item) => sum + item.minutes, 0), 25);
  assert.equal(vocabularyReviewEntries([result])[0].text, 'intriguing');
  assert.equal(result.notes, '保留紀錄');
  assert.equal(reconcileCalendarRecords([result], [row('b', 5)], today)[0].items.length, result.items.length);
  assert.equal(decodeStudyRecord(encodeStudyRecord(result)).ok, true);
});

test('a revised round resets only that workload and a newly scheduled event changes the original date denominator', () => {
  const old = record(); old.items[0].done = true; old.items[0].minutes = '20';
  const result = reconcileCalendarRecords([old], [row('a', 4), row('b', 5), row('c', 6)], today)[0];
  const current = active(result);
  assert.equal(current.length, 3);
  assert.equal(current.find(item => item.f.round === '4')?.done, false);
  assert.equal(current.find(item => item.f.round === '4')?.minutes, '');
  assert.equal(completedStudyTimeEntries([result]).reduce((sum, item) => sum + item.minutes, 0), 20);
  assert.equal(summarizeCompletionUnits(summaryCompletionUnitsForRecord(result)).itemTotal, 3);
  assert.deepEqual(reconcileCalendarRecords([result], [row('a', 4), row('b', 5), row('c', 6)], today), [result]);
});

test('a moved event is no longer overdue on its old date, while manual cards and other events stay intact', () => {
  const old = record();
  old.items.push({ id: 'manual', type: 'extra', source: 'custom', title: '自訂教材', required: true, done: false, minutes: '5', f: {} });
  const result = reconcileCalendarRecords([old], [row('a', 3, '2026-11-06'), row('b', 5)], today);
  assert.equal(active(result.find(record => record.date === date)!).length, 2);
  assert.equal(active(result.find(record => record.date === '2026-11-06')!).length, 1);
  assert.equal(result[0].items.find(item => item.id === 'manual')?.minutes, '5');
});

test('calendar metadata changes retain completion and manual overrides; conflicting records remain untouched', () => {
  const old = record([row('a')]); old.items[0].done = true; old.items[0].checkedOn = date;
  const updated = { ...row('a'), event_updated_at: '2026-11-07T10:00:00Z', description: '新說明' };
  const result = reconcileCalendarRecords([old], [updated], today)[0];
  assert.equal(active(result)[0].done, true);
  assert.equal(active(result)[0].checkedOn, date);
  old.syncConflict = true;
  assert.equal(reconcileCalendarRecords([old], [], today)[0], old);
});

test('account-scoped persistence keeps cloud baselines and does not modify a guest or another account', () => {
  const data = new Map<string, string>();
  const storage = { get length() { return data.size; }, key(index: number) { return [...data.keys()][index] || null; },
    getItem(key: string) { return data.get(key) || null; }, setItem(key: string, value: string) { data.set(key, value); }, removeItem(key: string) { data.delete(key); } };
  const prefix = 'study-v11:user:owner:';
  const old = record(); old.serverRevision = 4;
  old.syncBase = stripRecordSyncMeta(old);
  data.set(prefix + date, JSON.stringify(old)); data.set('study-v11:user:another:' + date, JSON.stringify(old));
  data.set('study-v11:guest:' + date, JSON.stringify(old));
  assert.equal(synchronizeStoredCalendarSchedule(storage, 'study-v11:guest:', [], today).savedDates.length, 0);
  assert.equal(synchronizeStoredCalendarSchedule(storage, prefix, [row('b', 5)], today).savedDates.length, 1);
  const saved = JSON.parse(data.get(prefix + date)!);
  assert.equal(saved.localDirty, true); assert.equal(saved.serverRevision, 4);
  const decoded = decodeStudyRecord(data.get(prefix + date)!);
  assert.equal(decoded.ok, true); if (decoded.ok) assert.ok(decoded.record.syncBase);
  assert.equal(data.get('study-v11:user:another:' + date), JSON.stringify(old));
  assert.equal(synchronizeStoredCalendarSchedule(storage, prefix, [row('b', 5)], today).savedDates.length, 0);
});

test('unchanged natural integration retains each subject completion, timer and manually recorded minutes', () => {
  const rows = [{ ...row('science'), title: '自然整合', category: 'naturalIntegration',
    description: '【科目頁碼】生物 p.4–7；化學 p.9–12' }];
  const old = record(rows);
  const children = old.items[0].f.calendarIntegrationEntries!;
  assert.ok(children?.length);
  children[0].done = true; children[0].minutes = '12';
  const projected = reconcileCalendarRecords([old], rows, today)[0];
  const next = active(projected)[0].f.calendarIntegrationEntries!;
  assert.equal(next[0].done, true);
  assert.equal(next[0].minutes, '12');
  assert.equal(next[1].done, false);
});

test('a deleted running timer is paused with elapsed minutes retained in history', () => {
  const old = record([row('a')]);
  old.items[0].f.timeTracking = { mode: 'timer', accumulatedSeconds: 60, startedAt: Date.now() - 60000 };
  const result = reconcileCalendarRecords([old], [], today)[0];
  const history = result.items.find(isArchivedCalendarItem)!;
  assert.equal(history.f.timeTracking?.startedAt, null);
  assert.equal(Number(history.minutes), 2);
});

test('a conflicting record is not changed by otherwise matching automatic coverage', () => {
  const pending = record([row('pending', 3)]); pending.syncConflict = true;
  const evidence = record([row('evidence', 3)]); evidence.date = '2026-08-16';
  evidence.items[0].done = true; evidence.items[0].checkedOn = evidence.date;
  const projected = reconcileCalendarRecords([evidence, pending], [row('pending', 3)], today);
  assert.equal(projected.find(record => record.date === date), pending);
  assert.equal(pending.items[0].done, false);
});

test('legacy regrouping cannot replace verified per-source completion or minutes', () => {
  const rows = [row('a', 3), row('b', 4), row('c', 5)];
  const verified = record(rows);
  verified.items[0].done = true; verified.items[0].minutes = '20';
  verified.items[2].done = true; verified.items[2].minutes = '15';
  const regrouped = JSON.parse(JSON.stringify(verified)) as StudyRecord;
  for (const item of regrouped.items) { item.done = false; item.minutes = ''; item.source = 'groupedWork'; item.calendarGroupedChild = true; }
  const restored = reconcileCalendarRecord(regrouped, calendarItemsByDate(rows).get(date)!, verified.items)!;
  assert.equal(summarizeCompletionUnits(summaryCompletionUnitsForRecord(restored)).itemCompleted, 2);
  assert.equal(completedStudyTimeEntries([restored]).reduce((sum, item) => sum + item.minutes, 0), 35);
});
