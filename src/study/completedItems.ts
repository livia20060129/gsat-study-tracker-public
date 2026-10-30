import type { CalendarNaturalIntegrationEntry, StudyItem, StudyRecord } from '../types.ts';
import { numberedStudyScope } from '../data/numberedScopes.ts';
import { numberedScopeText } from './numberedScopeProgress.ts';
import { bookUnitText } from './unitBookProgress.ts';
import { completionDateValue } from './completionCheckedOn.ts';
import { NATURAL_SCIENCE_SUBJECTS } from './completedStudyTime.ts';
import { activeEnglishTaskItems } from './englishTaskChoice.ts';
import type { SummaryPeriod } from './learningSummary.ts';
import { studyItemSubject } from './subjectOrder.ts';
import { SUBJECT_TIME_SUBJECTS, type SubjectTimeSubject } from './subjectTime.ts';

export interface CompletedItemEntry {
  key: string;
  date: string;
  recordDate: string;
  subject: string;
  title: string;
  detail: string;
}

/** Keeps the list palette and the donut's subject families aligned, including social/other work. */
export function completedItemSummarySubject(subject: string): SubjectTimeSubject {
  return SUBJECT_TIME_SUBJECTS.find(function matchesSubject(candidate): boolean {
    return candidate === subject;
  }) ?? '其他';
}

export function completedItemsForSubject(
  entries: CompletedItemEntry[],
  subject: SubjectTimeSubject | null,
): CompletedItemEntry[] {
  if (!subject) return entries;
  return entries.filter(function matchesSelection(entry): boolean {
    const itemSubject = completedItemSummarySubject(entry.subject);
    if (subject === '自然') {
      return itemSubject === '自然' || NATURAL_SCIENCE_SUBJECTS.some(function isScience(science): boolean {
        return science === itemSubject;
      });
    }
    return itemSubject === subject;
  });
}

const TYPE_TITLES: Record<string, string> = {
  mathStudy: '數學進度', mathLecture: '數學講義', mathPractice: '數學練習',
  mathOral: '數學互動題', magazine: '英文雜誌', englishPractice: '英文練習',
  englishVocabInteractive: '英文單字／片語', englishMixedWriting: '英文混合題與作文',
  biologyInteractive: '生物互動題', scienceReview: '自然複習', chineseReading: '國文閱讀',
  mock: '歷屆／模考', interactiveDaily: '每日互動題', interactive: '互動題',
};

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Canonical sources take precedence over possibly stale grouped display copies. */
function children(item: StudyItem): StudyItem[] {
  for (const field of ['dailyWorkSourceItems', 'groupedWorkEntries', 'interactiveEntries',
    'calendarIntegrationEntries', 'makeupEntries', 'reviewEntries']) {
    const entries = item.f?.[field];
    if (!Array.isArray(entries) || !entries.length) continue;
    if (field !== 'calendarIntegrationEntries') return entries as StudyItem[];
    return (entries as CalendarNaturalIntegrationEntry[]).map(function integrationChild(entry): StudyItem {
      return {
        ...entry,
        id: entry.id ?? '', type: entry.type ?? 'scienceReview',
        done: Boolean(entry.done), minutes: entry.minutes ?? '', required: Boolean(entry.required),
        f: { ...entry.f, subject: entry.subject, material: entry.material,
          pageText: entry.pageText, chapterText: entry.chapterText },
      };
    });
  }
  return [];
}

function subjectLabel(item: StudyItem, fallback: string): string {
  const explicit = text(item.f?.subject);
  if (['物理', '化學', '生物', '地科', '公民', '歷史', '地理', '社會'].includes(explicit)) return explicit;
  const subject = studyItemSubject(item);
  return subject === '其他' ? fallback : subject;
}

function itemDetail(item: StudyItem, title: string): string {
  const fields = item.f ?? {};
  const scope = numberedStudyScope(item);
  if (scope) return scope.kind === 'unit' ? bookUnitText(item) : numberedScopeText(item);
  const start = text(fields.start) || text(fields.calendarSuggestedStart);
  const end = text(fields.end) || text(fields.calendarSuggestedEnd);
  let pages = text(fields.pageText);
  if (start && end) pages = start === end ? `p.${start}` : `p.${start}–${end}`;
  else if (start || end) pages = `p.${start || end}`;
  const parts = [fields.material, fields.book, fields.title, pages, fields.topic,
    fields.unit, fields.chapter, fields.chapterText, fields.year, fields.exam,
    text(fields.round) ? `第 ${text(fields.round)} 回` : ''];
  const detail = [...new Set(parts.map(text).filter(function distinct(part): boolean {
    return Boolean(part) && part !== title;
  }))].join('｜');
  if (detail) return detail;
  const description = text(item.description);
  return description === title ? '' : description;
}

function itemKey(item: StudyItem, originDate: string, path: string, subject: string): string {
  const fields = item.f ?? {};
  const originId = text(item.deferredOriginId)
    || text(Array.isArray(item.deferredOriginIds) ? item.deferredOriginIds[0] : '');
  const calendarKey = text(fields.calendarEventKey)
    || text(Array.isArray(fields.calendarEventKeys) ? fields.calendarEventKeys[0] : '');
  if (calendarKey) {
    const scope = [item.type, subject, fields.material, fields.book, fields.title,
      fields.start, fields.end, fields.round, fields.roundEnd, fields.unit, fields.unitStart, fields.unitEnd, fields.topic, fields.pageText].map(text);
    return JSON.stringify(['calendar', calendarKey, ...scope]);
  }
  return JSON.stringify(['item', originDate, originId || item.id || path]);
}

/** Read-only list of finished tasks; neither minutes nor completion-rate exclusions gate membership. */
export function completedItemsForPeriod(
  records: StudyRecord[],
  period: Pick<SummaryPeriod, 'start' | 'end'>,
): CompletedItemEntry[] {
  const unique = new Map<string, CompletedItemEntry>();
  for (const record of records) {
    if (!validDate(record.date)) continue;
    const visited = new Set<StudyItem>();
    const activeItems = new Set(activeEnglishTaskItems(record, record.items ?? []));
    function collect(
      item: StudyItem, path: string, inheritedDate: string, inheritedOrigin: string,
      fallbackTitle = '', fallbackSubject = '其他', onlyTodoCompletions = false,
    ): void {
      if (!item || visited.has(item)) return;
      visited.add(item);
      const date = completionDateValue(item, inheritedDate) || inheritedDate;
      const originDate = text(item.deferredOriginDate) || inheritedOrigin;
      const title = text(item.title) || text(item.f?.title) || text(item.f?.calendarTopic)
        || fallbackTitle || TYPE_TITLES[item.type] || '未命名項目';
      const subject = subjectLabel(item, fallbackSubject);
      const completedInTodo = item.done && item.f?.overdueTodoAction?.kind === 'complete';
      const nested = children(item);
      if (nested.length) {
        nested.forEach(function collectChild(child, index): void {
          collect(child, `${path}.${index}`, date, originDate, title, subject,
            onlyTodoCompletions && !completedInTodo);
        });
        return;
      }
      if (!item.done || !validDate(date) || (onlyTodoCompletions && !completedInTodo)) return;
      const key = itemKey(item, originDate, path, subject);
      const existing = unique.get(key);
      // The original and its deferred copy represent one task, not two accomplishments.
      if (!existing || date > existing.date) {
        unique.set(key, { key, date, recordDate: originDate, subject, title, detail: itemDetail(item, title) });
      }
    }
    // A later English-option change must not erase an explicit todo accomplishment from history.
    (record.items ?? []).forEach(function collectRoot(item, index): void {
      collect(item, String(index), record.date, record.date, '', '其他', !activeItems.has(item));
    });
  }
  // Filter after deduplication so an older mirrored completion cannot leak into another period.
  return [...unique.values()].filter(function withinPeriod(entry): boolean {
    return entry.date >= period.start && entry.date <= period.end;
  }).sort(function newestFirst(left, right): number {
    return right.date.localeCompare(left.date)
      || left.subject.localeCompare(right.subject, 'zh-Hant')
      || left.title.localeCompare(right.title, 'zh-Hant')
      || left.key.localeCompare(right.key);
  });
}
