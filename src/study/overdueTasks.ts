import type { StudyItem, StudyRecord } from '../types.ts';
import { findCompletionItem } from './completionTree.ts';
import { deferredCapacityCandidates, isConfirmedDeferred, isDeferrableStudyItem } from './deferDays.ts';
import { activeEnglishTaskItems } from './englishTaskChoice.ts';
import { studyItemSubject } from './subjectOrder.ts';

export const OVERDUE_TASK_SUBJECTS = ['all', 'chinese', 'english', 'math', 'natural', 'other'] as const;
export type OverdueTaskSubject = typeof OVERDUE_TASK_SUBJECTS[number];
export type OverdueItemSubject = Exclude<OverdueTaskSubject, 'all'>;

export interface OverdueTaskEntry {
  key: string;
  recordDate: string;
  itemId: string;
  subject: OverdueItemSubject;
  subjectLabel: string;
  title: string;
  description: string;
  daysOverdue: number;
}

const SUBJECT_LABELS: Record<OverdueItemSubject, string> = {
  chinese: '國文',
  english: '英文',
  math: '數學',
  natural: '自然',
  other: '其他',
};

function dateNumber(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function taskSubject(item: StudyItem): OverdueItemSubject {
  const subject = studyItemSubject(item);
  if (subject === '國文') return 'chinese';
  if (subject === '英文') return 'english';
  if (subject === '數學') return 'math';
  if (subject === '自然') return 'natural';
  return 'other';
}

function taskTitle(item: StudyItem): string {
  return String(item.title || item.f?.calendarTopic || item.f?.title || item.description || '未命名項目').trim();
}

function taskDescription(item: StudyItem): string {
  const description = String(item.description ?? '').trim();
  if (description && description !== taskTitle(item)) return description;
  const material = String(item.f?.material || item.f?.book || '').trim();
  const pages = [item.f?.start, item.f?.end].map(value => String(value ?? '').trim()).filter(Boolean);
  if (material && pages.length) return `${material}｜p.${pages.join('–')}`;
  return material;
}

function overdueCandidates(record: StudyRecord): StudyItem[] {
  const activeItems = activeEnglishTaskItems(record, Array.isArray(record.items) ? record.items : []);
  return deferredCapacityCandidates(activeItems) as StudyItem[];
}

function isPendingOverdueTask(item: StudyItem): boolean {
  return isDeferrableStudyItem(item)
    && !item.done
    && !isConfirmedDeferred(item)
    && !String(item.f?.overdueSkippedOn ?? '').trim();
}

export function overdueTasks(records: StudyRecord[], today: string): OverdueTaskEntry[] {
  const todayNumber = dateNumber(today);
  if (todayNumber === null) return [];
  const entries: OverdueTaskEntry[] = [];

  for (const record of records) {
    const recordNumber = dateNumber(record.date);
    if (recordNumber === null || recordNumber >= todayNumber) continue;
    const daysOverdue = Math.round((todayNumber - recordNumber) / 86_400_000);
    for (const item of overdueCandidates(record)) {
      if (!isPendingOverdueTask(item)) continue;
      const subject = taskSubject(item);
      entries.push({
        key: `${record.date}:${item.id}`,
        recordDate: record.date,
        itemId: item.id,
        subject,
        subjectLabel: SUBJECT_LABELS[subject],
        title: taskTitle(item),
        description: taskDescription(item),
        daysOverdue,
      });
    }
  }

  return entries.sort((left, right) => (
    left.recordDate.localeCompare(right.recordDate)
    || left.subjectLabel.localeCompare(right.subjectLabel, 'zh-Hant')
    || left.title.localeCompare(right.title, 'zh-Hant')
  ));
}

export function updateOverdueTaskSkip(
  record: StudyRecord,
  itemId: string,
  skippedOn: string | null,
): StudyRecord | null {
  const updated = JSON.parse(JSON.stringify(record)) as StudyRecord;
  const item = findCompletionItem(updated.items, itemId);
  if (!item) return null;
  item.f = item.f || {};
  if (skippedOn) item.f.overdueSkippedOn = skippedOn;
  else delete item.f.overdueSkippedOn;
  return updated;
}

export function normalizedOverdueSubject(value: unknown): OverdueTaskSubject {
  return OVERDUE_TASK_SUBJECTS.includes(value as OverdueTaskSubject)
    ? value as OverdueTaskSubject
    : 'all';
}

export function overdueSubjectIndex(subject: OverdueTaskSubject): number {
  return Math.max(0, OVERDUE_TASK_SUBJECTS.indexOf(subject));
}
