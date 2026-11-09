import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarItemsByDate, isArchivedCalendarItem, reconcileCalendarRecords } from '../src/application/calendar/reconcileCalendarSchedule.ts';
import { studyItemSubject, studyItemSubjectClass } from '../src/study/subjectOrder.ts';
import { completedStudyTimeEntries } from '../src/study/completedStudyTime.ts';
import { summaryCompletionUnitsForRecord } from '../src/study/learningSummary.ts';
import { summarizeCompletionUnits } from '../src/study/completionMetrics.ts';
import type { CalendarTaskRow } from '../src/calendar/calendarBridge.ts';
import type { StudyRecord } from '../src/types.ts';

const date = '2026-11-09';
function row(title: string, identifier: string): CalendarTaskRow {
  return { event_key: `primary:${identifier}`, source_event_id: identifier, calendar_id: 'primary', event_date: date,
    title, description: `【識別碼】${identifier}\n【頁碼範圍】p.2–24`, category: 'studyItem' };
}

test('shared cross-page schedule projection retains the public history book type, subject and printed page map', () => {
  const items = calendarItemsByDate([row('歷史｜好好學', 'GSAT-HIST-HAOHAOXUE')]).get(date)!;
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'socialStudy');
  assert.equal(items[0].f.book, '歷史｜好好學');
  assert.equal(items[0].f.start, '2');
  assert.equal(items[0].f.end, '24');
  assert.equal(studyItemSubject(items[0]), '歷史');
  assert.equal(studyItemSubjectClass(items[0]), 'subject-card subject-history');
});

test('shared schedule refresh accepts related identifiers without restricting imports to built-in materials', () => {
  const items = calendarItemsByDate([row('自訂複習項目', 'GSAT-CUSTOM-REVIEW-CHAPTER')]).get(date)!;
  assert.equal(items.length, 1);
  assert.equal(items[0].title, '自訂複習項目');
  assert.equal(items[0].f.calendarIdentifier, 'GSAT-CUSTOM-REVIEW-CHAPTER');
  assert.equal(studyItemSubject(items[0]), '其他');
  assert.equal(calendarItemsByDate([]).size, 0);
});

test('retiring public history work preserves recorded history time and excludes only its obsolete workload', () => {
  const items = calendarItemsByDate([row('歷史｜好好學', 'GSAT-HIST-HAOHAOXUE')]).get(date)!;
  const record: StudyRecord = structuredClone({ date, notes: '保留歷史筆記', items });
  record.items[0].done = true;
  record.items[0].minutes = '25';
  const result = reconcileCalendarRecords([record], [], date)[0];
  assert.equal(result.notes, '保留歷史筆記');
  assert.equal(result.items.filter(isArchivedCalendarItem).length, 1);
  assert.equal(summarizeCompletionUnits(summaryCompletionUnitsForRecord(result)).itemTotal, 0);
  assert.equal(completedStudyTimeEntries([result]).find(entry => entry.subject === '歷史')?.minutes, 25);
});
