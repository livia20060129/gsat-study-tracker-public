import type { StudyItem, StudyRecord, StudyTimerState } from '../types.ts';
import {
  applyManualCompletionMetadata,
  completionChildItems,
  findCompletionItem,
  refreshCompletionTree,
} from './completionTree.ts';
import {
  propagateDailyWorkDone,
  propagateDailyWorkField,
  propagateDailyWorkMinutes,
} from './dailyWorkGroup.ts';
import { deferredCapacityCandidates, isConfirmedDeferred, isDeferrableStudyItem } from './deferDays.ts';
import { activeEnglishTaskItems } from './englishTaskChoice.ts';
import { studyItemSubject } from './subjectOrder.ts';
import { normalizeStudyTimerState } from './studyTimer.ts';

export const OVERDUE_TASK_SUBJECTS = ['all', 'chinese', 'english', 'math', 'natural', 'other'] as const;
export type OverdueTaskSubject = typeof OVERDUE_TASK_SUBJECTS[number];
export type OverdueItemSubject = Exclude<OverdueTaskSubject, 'all'>;

export interface OverdueTaskDetail {
  label: string;
  value: string;
}

export interface OverdueTaskProgress {
  key: string;
  label: string;
  checked: boolean;
}

export interface OverdueTaskEntry {
  key: string;
  recordDate: string;
  itemId: string;
  subject: OverdueItemSubject;
  subjectLabel: string;
  title: string;
  description: string;
  minutes: string;
  timer: StudyTimerState;
  details: OverdueTaskDetail[];
  progress: OverdueTaskProgress[];
  daysOverdue: number;
}

export interface OverdueHandledEntry {
  key: string;
  recordDate: string;
  itemId: string;
  subject: OverdueItemSubject;
  subjectLabel: string;
  title: string;
  kind: 'complete' | 'skip';
  handledAt: string;
  expiresAt: string;
}

export const OVERDUE_UNDO_WINDOW_MS = 72 * 60 * 60 * 1000;

const SUBJECT_LABELS: Record<OverdueItemSubject, string> = {
  chinese: '國文',
  english: '英文',
  math: '數學',
  natural: '自然',
  other: '其他',
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  mathStudy: '數學進度',
  mathLecture: '數學講義',
  mathPractice: '數學練習',
  mathOral: '數學互動題',
  magazine: '英文雜誌',
  englishPractice: '英文練習',
  englishVocabInteractive: '英文單字／片語',
  englishMixedWriting: '英文混合題與作文',
  biologyInteractive: '生物互動題',
  scienceReview: '自然複習',
  chineseReading: '國文',
  mock: '歷屆／模考',
  extra: '英文教材',
  interactive: '互動題',
  interactiveDaily: '每日互動題',
  calendarStudy: 'Calendar 排程',
  general: '一般項目',
};

const DETAIL_FIELDS: Array<[string, string]> = [
  ['subject', '科目'], ['material', '講義'], ['book', '書名／冊別'], ['title', '教材'],
  ['start', '起始頁'], ['end', '結束頁'], ['unit', '單元'], ['unitStart', '起始單元'],
  ['unitEnd', '結束單元'], ['chapter', '章節'], ['topic', '主題'], ['round', '回次'],
  ['year', '年份'], ['exam', '考試'], ['status', '狀態'], ['level', '級別'],
  ['calendarTopic', 'Google Calendar 當日主題'], ['calendarFocus', '重點'],
  ['pageText', '頁碼'], ['chapterText', '頁碼對應章節'], ['result', '結果／仍不熟處'],
  ['essayScore', '作文分數'], ['mixedScore', '混合題分數'], ['priorityFix', '優先修改錯誤'],
  ['correctCount', '答對題數'], ['translationScore1', '中翻英第一句'],
  ['translationScore2', '中翻英第二句'], ['errorConceptGrammar', '錯誤觀念／文法'],
  ['score', '分數'], ['writingType', '題型'], ['improvement', '改進方向'],
  ['name', '雜誌'], ['month', '月份'], ['warriorsBook', '冊別'], ['extended', '延續做到'],
  ['reason', '錯因／不熟觀念'], ['progress', '進度'], ['graded', '批改'],
  ['corrected', '訂正'], ['review', '需要再複習'], ['listening', '英聽'], ['vocab', '單字'],
  ['translation', '中譯英'], ['gsatPart1', 'GSAT 第壹部分'],
];

const PROGRESS_FIELDS: Array<[string, string]> = [
  ['progress', '進度'], ['graded', '批改'], ['corrected', '訂正'], ['review', '需要再複習'],
  ['listening', '英聽'], ['vocab', '單字'], ['translation', '中譯英'],
  ['gsatPart1', 'GSAT 第壹部分'],
];

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

function detailValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? '已勾選' : '未勾選';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return typeof value === 'string' ? value.trim() : '';
}

function wordDetails(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map(function wordText(entry): string {
    if (typeof entry === 'string') return entry.trim();
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
    return String((entry as Record<string, unknown>).text ?? '').trim();
  }).filter(Boolean).join('、');
}

function magazineDetails(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map(function entryText(entry, index): string {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
    const row = entry as Record<string, unknown>;
    const parts = [
      String(row.name ?? '').trim(),
      row.month ? `${row.month} 月號` : '',
      row.unit ? `Unit ${row.unit}` : '',
      row.minutes !== undefined && String(row.minutes).trim() ? `${row.minutes} 分鐘` : '',
    ].filter(Boolean);
    return parts.length ? `第 ${index + 1} 筆：${parts.join('｜')}` : '';
  }).filter(Boolean).join('；');
}

function taskDetails(item: StudyItem): OverdueTaskDetail[] {
  const details: OverdueTaskDetail[] = [{
    label: '項目類型',
    value: ITEM_TYPE_LABELS[item.type] ?? item.type,
  }];
  const fields = item.f ?? {};
  for (const [key, label] of DETAIL_FIELDS) {
    if (!(key in fields)) continue;
    if (PROGRESS_FIELDS.some(([progressKey]) => progressKey === key) && typeof fields[key] === 'boolean') continue;
    const value = detailValue(fields[key]);
    if (value) details.push({ label, value });
  }
  const words = wordDetails(fields.words);
  if (words) details.push({ label: '單字／組合／句子', value: words });
  const entries = magazineDetails(fields.entries);
  if (entries) details.push({ label: '雜誌紀錄', value: entries });
  return details;
}

function taskProgress(item: StudyItem): OverdueTaskProgress[] {
  const fields = item.f ?? {};
  return PROGRESS_FIELDS.filter(([key]) => typeof fields[key] === 'boolean').map(([key, label]) => ({
    key,
    label,
    checked: fields[key] === true,
  }));
}

function overdueCandidates(record: StudyRecord): StudyItem[] {
  const activeItems = activeEnglishTaskItems(record, Array.isArray(record.items) ? record.items : []);
  return deferredCapacityCandidates(activeItems) as StudyItem[];
}

function isPendingOverdueTask(item: StudyItem): boolean {
  return isDeferrableStudyItem(item)
    && !item.done
    && !isConfirmedDeferred(item)
    && !item.deferredCarry
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
        minutes: String(item.minutes ?? ''),
        timer: normalizeStudyTimerState(item.f?.timeTracking),
        details: taskDetails(item),
        progress: taskProgress(item),
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
  handledAt = new Date().toISOString(),
): StudyRecord | null {
  const updated = JSON.parse(JSON.stringify(record)) as StudyRecord;
  const item = findCompletionItem(updated.items, itemId);
  if (!item) return null;
  item.f = item.f || {};
  if (skippedOn) {
    item.f.overdueSkippedOn = skippedOn;
    item.f.overdueTodoAction = { kind: 'skip', handledAt };
  } else {
    delete item.f.overdueSkippedOn;
    delete item.f.overdueTodoAction;
  }
  return updated;
}

export function updateOverdueTaskMinutes(
  record: StudyRecord,
  itemId: string,
  minutes: string,
): StudyRecord | null {
  const numeric = Number(minutes);
  if (minutes !== '' && (!Number.isFinite(numeric) || numeric < 0)) return null;
  const updated = JSON.parse(JSON.stringify(record)) as StudyRecord;
  const item = findCompletionItem(updated.items, itemId);
  if (!item) return null;
  propagateDailyWorkMinutes(item, minutes);
  return updated;
}

export function updateOverdueTaskTimer(
  record: StudyRecord,
  itemId: string,
  timer: StudyTimerState,
  minutes?: string,
): StudyRecord | null {
  const updated = JSON.parse(JSON.stringify(record)) as StudyRecord;
  const item = findCompletionItem(updated.items, itemId);
  if (!item) return null;
  propagateDailyWorkField(item, 'timeTracking', normalizeStudyTimerState(timer));
  if (minutes !== undefined) propagateDailyWorkMinutes(item, minutes);
  return updated;
}

export function overdueTaskTimer(record: StudyRecord, itemId: string): StudyTimerState | null {
  const item = findCompletionItem(record.items, itemId);
  return item ? normalizeStudyTimerState(item.f?.timeTracking) : null;
}

export function updateOverdueTaskProgress(
  record: StudyRecord,
  itemId: string,
  field: string,
  checked: boolean,
): StudyRecord | null {
  if (!PROGRESS_FIELDS.some(([key]) => key === field)) return null;
  const updated = JSON.parse(JSON.stringify(record)) as StudyRecord;
  const item = findCompletionItem(updated.items, itemId);
  if (!item) return null;
  propagateDailyWorkField(item, field, checked);
  return updated;
}

export function updateOverdueTaskCompletion(
  record: StudyRecord,
  itemId: string,
  completed: boolean,
  completionDate: string,
  handledAt = new Date().toISOString(),
): StudyRecord | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(completionDate)) return null;
  const updated = JSON.parse(JSON.stringify(record)) as StudyRecord;
  const item = findCompletionItem(updated.items, itemId);
  if (!item) return null;
  applyManualCompletionMetadata(item, completed, record.date, completionDate, updated.items);
  propagateDailyWorkDone(item, completed);
  item.f ||= {};
  if (completed) item.f.overdueTodoAction = { kind: 'complete', handledAt };
  else delete item.f.overdueTodoAction;
  updated.items.forEach(function refreshItem(root): void {
    refreshCompletionTree(root);
  });
  return updated;
}

function allRecordItems(record: StudyRecord): StudyItem[] {
  const output: StudyItem[] = [];
  const visited = new Set<StudyItem>();
  function visit(items: StudyItem[]): void {
    for (const item of items) {
      if (!item || visited.has(item)) continue;
      visited.add(item);
      output.push(item);
      visit(completionChildItems(item, true));
    }
  }
  visit(record.items);
  return output;
}

export function overdueHandledTasks(
  records: StudyRecord[],
  now = Date.now(),
): OverdueHandledEntry[] {
  const entries: OverdueHandledEntry[] = [];
  for (const record of records) {
    for (const item of allRecordItems(record)) {
      const action = item.f?.overdueTodoAction;
      if (!action || (action.kind === 'complete' ? !item.done : !item.f?.overdueSkippedOn)) continue;
      const handledAt = Date.parse(action.handledAt);
      const age = now - handledAt;
      if (!Number.isFinite(handledAt) || age < 0 || age >= OVERDUE_UNDO_WINDOW_MS) continue;
      const subject = taskSubject(item);
      entries.push({
        key: `${record.date}:${item.id}:${action.kind}`,
        recordDate: record.date,
        itemId: item.id,
        subject,
        subjectLabel: SUBJECT_LABELS[subject],
        title: taskTitle(item),
        kind: action.kind,
        handledAt: action.handledAt,
        expiresAt: new Date(handledAt + OVERDUE_UNDO_WINDOW_MS).toISOString(),
      });
    }
  }
  return entries.sort((left, right) => right.handledAt.localeCompare(left.handledAt));
}

export function undoOverdueTaskAction(
  record: StudyRecord,
  itemId: string,
  actionDate: string,
): StudyRecord | null {
  const item = findCompletionItem(record.items, itemId);
  const kind = item?.f?.overdueTodoAction?.kind;
  if (kind === 'skip') return updateOverdueTaskSkip(record, itemId, null);
  if (kind === 'complete') return updateOverdueTaskCompletion(record, itemId, false, actionDate);
  return null;
}

export function normalizedOverdueSubject(value: unknown): OverdueTaskSubject {
  return OVERDUE_TASK_SUBJECTS.includes(value as OverdueTaskSubject)
    ? value as OverdueTaskSubject
    : 'all';
}

export function overdueSubjectIndex(subject: OverdueTaskSubject): number {
  return Math.max(0, OVERDUE_TASK_SUBJECTS.indexOf(subject));
}
