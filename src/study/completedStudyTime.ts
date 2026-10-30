import type { StudyItem, StudyRecord } from '../types.ts';
import { isConfirmedDeferred } from './deferDays.ts';
import { activeEnglishTaskItems } from './englishTaskChoice.ts';
import { effectiveTemplatePresetKey, specialItemTemplate } from './makeup.ts';
import { studyItemSubject } from './subjectOrder.ts';
import {
  summarizeSubjectTime,
  type SubjectTimeSubject,
  type SubjectTimeSummary,
} from './subjectTime.ts';

export interface CompletedStudyTimeEntry {
  key: string;
  date: string;
  subject: SubjectTimeSubject;
  itemLabel: string;
  minutes: number;
}

export interface StudyItemTimeSlice {
  label: string;
  minutes: number;
  percent: number;
}

export interface NaturalScienceItemTimeSlice extends StudyItemTimeSlice {
  subject: SubjectTimeSubject;
}

export const NATURAL_SCIENCE_SUBJECTS = ['物理', '化學', '生物', '地科'] as const;

function childItems(item: StudyItem, key: string): StudyItem[] {
  const value = item.f?.[key];
  return Array.isArray(value) ? value.filter(Boolean) as StudyItem[] : [];
}

function groupedChildren(item: StudyItem): StudyItem[] {
  return childItems(item, 'groupedWorkEntries');
}

function isWeeklyCalendarItem(item: StudyItem): boolean {
  return item.source === 'preset' && item.f?.calendarRoute === 'week';
}

function visibleItems(record: StudyRecord): StudyItem[] {
  const items = Array.isArray(record.items) ? record.items : [];
  return activeEnglishTaskItems(record, items);
}

function isSaturdayMakeup(item: StudyItem): boolean {
  return item.type === 'general'
    && (effectiveTemplatePresetKey(item) === 'sat_makeup' || item.title === '回補本週未完成項目');
}

function numericMinutes(value: unknown): number {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizedTimeSubject(item: StudyItem, fallback?: SubjectTimeSubject): SubjectTimeSubject {
  const scienceIdentity = [item.f?.subject, item.f?.title, item.title, item.type].map(text).join(' ');
  if (/物理|physics/i.test(scienceIdentity)) return '物理';
  if (/化學|chemistry/i.test(scienceIdentity)) return '化學';
  if (/生物|biology/i.test(scienceIdentity)) return '生物';
  if (/地科|地球科學|earth/i.test(scienceIdentity)) return '地科';
  const subject = studyItemSubject(item);
  if (subject !== '其他' && ['數學', '國文', '英文', '自然', '社會', '公民', '歷史', '地理'].includes(subject)) {
    return subject as SubjectTimeSubject;
  }
  return fallback ?? '其他';
}

function withoutSubjectPrefix(value: unknown): string {
  return text(value)
    .replace(/^(?:數學\s*A?|數\s*A|國文|英文|自然|社會|物理|化學|生物|地科)\s*(?:[｜|：:·\-–—]\s*)?/i, '')
    .trim();
}

function withoutRoundSuffix(value: string, round: unknown): string {
  const roundText = text(round);
  if (!value || !roundText) return value;
  const escapedRound = roundText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(
    new RegExp(`\\s*(?:[｜|：:·\\-–—]\\s*)?(?:第\\s*${escapedRound}\\s*回|Test\\s*${escapedRound}|${escapedRound}\\s*回)\\s*$`, 'i'),
    '',
  ).trim();
}

function lectureVersionLabel(item: StudyItem): string {
  const material = withoutSubjectPrefix(item.f?.material);
  const rawBook = text(item.f?.book);
  const book = rawBook && !/冊$/.test(rawBook) ? `${rawBook}冊` : rawBook;
  return [material, book]
    .filter(Boolean)
    .filter(function removeDuplicateBook(part, index, parts): boolean {
      return index === 0 || !parts[0].includes(part);
    })
    .join(' ');
}

function normalizedMagazineLabel(value: string): string {
  if (/^(?:CNN\s*互動(?:英文|英語)|常春藤)$/i.test(value.trim())) return '雜誌';
  return value;
}

function studyItemTimeLabel(item: StudyItem, fallback = ''): string {
  const explicit = withoutRoundSuffix(withoutSubjectPrefix(text(item.f?.title) || text(item.title)), item.f?.round);
  const fallbackLabel = withoutRoundSuffix(withoutSubjectPrefix(fallback), item.f?.round);
  const lectureVersion = lectureVersionLabel(item);
  if (/^歷屆[／/]模考(?:$|[：:｜|])/i.test(explicit)
    || /^歷屆[／/]模考(?:$|[：:｜|])/i.test(fallbackLabel)) return '歷屆／模考';
  if (item.type === 'magazine') return normalizedMagazineLabel(fallbackLabel || explicit) || '雜誌';
  if (item.type === 'englishVocabInteractive') return '單字／片語';
  if (item.type === 'englishMixedWriting') return '混合題與作文';
  if (item.type === 'mathStudy' || item.type === 'mathLecture') {
    return lectureVersion ? `${lectureVersion}｜進度` : '講義進度';
  }
  if (item.type === 'mathPractice') return lectureVersion ? `${lectureVersion}｜題目` : '講義題目';
  if (item.type === 'mathOral' || item.type === 'biologyInteractive') return '互動題';
  if (item.type === 'scienceReview') return lectureVersion || explicit || fallbackLabel || '講義複習';
  if (item.type === 'chineseReading') return explicit || fallbackLabel || '閱讀';
  if (item.type === 'mock') return '歷屆／模考';
  if (item.type === 'englishPractice') return explicit || fallbackLabel || '閱讀／練習';
  return explicit || fallbackLabel || '其他項目';
}

function stableTimeKey(recordDate: string, item: StudyItem, label: string, childKey = ''): string {
  const fields = item.f ?? {};
  const originId = text(item.deferredOriginId)
    || (Array.isArray(item.deferredOriginIds) ? text(item.deferredOriginIds[0]) : '');
  const calendarKey = text(fields.calendarEventKey)
    || text(fields.calendarEventId)
    || (Array.isArray(fields.calendarEventKeys) ? text(fields.calendarEventKeys[0]) : '');
  const semantic = [item.type, label, fields.start, fields.end, fields.round, fields.unit, childKey]
    .map(text).join('|');
  if (originId) return `origin:${originId}:${semantic}`;
  if (calendarKey) return `calendar:${calendarKey}:${semantic}`;
  if (item.id) return `item:${recordDate}:${item.id}:${childKey}`;
  return `record:${recordDate}:${semantic}`;
}

function completedTimeDate(item: StudyItem, fallbackDate: string): string {
  const checkedOn = text(item.checkedOn);
  if (/^\d{4}-\d{2}-\d{2}$/.test(checkedOn)) return checkedOn;
  const deferredCompletedOn = text(item.deferredCompletedOn);
  if (/^\d{4}-\d{2}-\d{2}$/.test(deferredCompletedOn)) return deferredCompletedOn;
  return fallbackDate;
}

function addCompletedTime(
  output: CompletedStudyTimeEntry[],
  recordDate: string,
  completionDate: string,
  item: StudyItem,
  minutes: number,
  fallbackSubject?: SubjectTimeSubject,
  fallbackLabel = '',
  childKey = '',
): void {
  if (minutes <= 0) return;
  const subject = normalizedTimeSubject(item, fallbackSubject);
  const itemLabel = studyItemTimeLabel(item, fallbackLabel);
  output.push({
    key: stableTimeKey(recordDate, item, itemLabel, childKey),
    date: completionDate,
    subject,
    itemLabel,
    minutes,
  });
}

function collectCompletedTime(
  item: StudyItem,
  recordDate: string,
  output: CompletedStudyTimeEntry[],
  fallbackSubject?: SubjectTimeSubject,
  fallbackLabel = '',
  inheritedCompletionDate?: string,
): void {
  if (isConfirmedDeferred(item)) return;
  const itemSubject = normalizedTimeSubject(item, fallbackSubject);
  const itemLabel = studyItemTimeLabel(item, fallbackLabel);
  const completionDate = completedTimeDate(item, inheritedCompletionDate ?? recordDate);
  const grouped = groupedChildren(item);
  if (grouped.length) {
    grouped.forEach(function collectGrouped(child): void {
      collectCompletedTime(child, recordDate, output, itemSubject, itemLabel, completionDate);
    });
    return;
  }
  const interactive = childItems(item, 'interactiveEntries');
  if (interactive.length) {
    interactive.forEach(function collectInteractive(child): void {
      collectCompletedTime(child, recordDate, output, itemSubject, itemLabel, completionDate);
    });
    return;
  }
  const integration = childItems(item, 'calendarIntegrationEntries');
  if (integration.length) {
    integration.forEach(function collectIntegration(child): void {
      collectCompletedTime(child, recordDate, output, itemSubject, itemLabel, completionDate);
    });
    return;
  }
  if (isSaturdayMakeup(item)) {
    childItems(item, 'makeupEntries').forEach(function collectMakeup(child): void {
      collectCompletedTime(child, recordDate, output, itemSubject, itemLabel, completionDate);
    });
    return;
  }
  const reviewEntries = childItems(item, 'reviewEntries');
  if (reviewEntries.length) {
    reviewEntries.forEach(function collectReview(child): void {
      collectCompletedTime(child, recordDate, output, itemSubject, itemLabel, completionDate);
    });
    return;
  }
  if (!item.done) return;
  if (specialItemTemplate(item) === 'fixedMagazine') {
    const entries = Array.isArray(item.f?.entries)
      ? item.f.entries as Array<{ id?: unknown; name?: unknown; minutes?: unknown }>
      : [];
    entries.forEach(function collectMagazine(entry, index): void {
      const label = text(entry?.name) || itemLabel;
      addCompletedTime(
        output,
        recordDate,
        completionDate,
        item,
        numericMinutes(entry?.minutes),
        itemSubject,
        label,
        `magazine:${text(entry?.id) || `${label}:${index}`}`,
      );
    });
    return;
  }
  addCompletedTime(
    output,
    recordDate,
    completionDate,
    item,
    numericMinutes(item.minutes),
    fallbackSubject,
    fallbackLabel,
  );
}

/** Deduplicates the same saved, deferred, or Calendar task and keeps its strongest completion. */
export function completedStudyTimeEntries(records: StudyRecord[]): CompletedStudyTimeEntry[] {
  const unique = new Map<string, CompletedStudyTimeEntry>();
  for (const record of records) {
    const candidates: CompletedStudyTimeEntry[] = [];
    visibleItems(record)
      .filter(function excludeWeeklyCalendar(item): boolean {
        return !isWeeklyCalendarItem(item);
      })
      .forEach(function collectItem(item): void {
        collectCompletedTime(item, record.date, candidates);
      });
    for (const candidate of candidates) {
      const existing = unique.get(candidate.key);
      const hasMoreMinutes = !existing || candidate.minutes > existing.minutes;
      const isNewerEquivalent = existing
        && candidate.minutes === existing.minutes
        && candidate.date > existing.date;
      if (hasMoreMinutes || isNewerEquivalent) unique.set(candidate.key, candidate);
    }
  }
  return [...unique.values()].sort(function sortByDateAndKey(left, right): number {
    return left.date.localeCompare(right.date) || left.key.localeCompare(right.key);
  });
}

export function completedSubjectTimeForRecord(record: StudyRecord): SubjectTimeSummary {
  return summarizeSubjectTime(completedStudyTimeEntries([record]));
}

/** Groups detailed natural-science subjects into one overview slice without changing stored entries. */
export function groupedSummarySubjectTime(entries: CompletedStudyTimeEntry[]): SubjectTimeSummary {
  return summarizeSubjectTime(entries.map(function groupNaturalScience(entry) {
    const isNaturalScience = NATURAL_SCIENCE_SUBJECTS.includes(
      entry.subject as typeof NATURAL_SCIENCE_SUBJECTS[number],
    );
    return {
      subject: isNaturalScience ? '自然' : entry.subject,
      minutes: entry.minutes,
    };
  }));
}

function roundOne(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function slicePercent(minutes: number, totalMinutes: number, allocated: number, isLast: boolean): number {
  if (isLast) return roundOne(100 - allocated);
  if (totalMinutes <= 0) return 0;
  return roundOne(minutes / totalMinutes * 100);
}

export function summarizeStudyItemTime(
  entries: CompletedStudyTimeEntry[],
  subject: SubjectTimeSubject,
): { totalMinutes: number; slices: StudyItemTimeSlice[] } {
  const totals = new Map<string, number>();
  entries.filter(function matchesSubject(entry): boolean {
    return entry.subject === subject;
  }).forEach(function addEntry(entry): void {
    totals.set(entry.itemLabel, (totals.get(entry.itemLabel) ?? 0) + entry.minutes);
  });
  const sorted = [...totals.entries()].sort(function sortTotals(left, right): number {
    return right[1] - left[1] || left[0].localeCompare(right[0], 'zh-Hant');
  });
  const totalMinutes = roundOne(sorted.reduce(function addMinutes(sum, entry): number {
    return sum + entry[1];
  }, 0));
  let allocated = 0;
  const slices = sorted.map(function makeSlice([label, minutes], index): StudyItemTimeSlice {
    const percent = slicePercent(minutes, totalMinutes, allocated, index === sorted.length - 1);
    allocated = roundOne(allocated + percent);
    return { label, minutes: roundOne(minutes), percent };
  });
  return { totalMinutes, slices };
}

/** Keeps item detail while the natural-science overview remains a single slice. */
export function summarizeNaturalScienceTime(
  entries: CompletedStudyTimeEntry[],
): { totalMinutes: number; slices: NaturalScienceItemTimeSlice[] } {
  const subjectOrder: SubjectTimeSubject[] = [...NATURAL_SCIENCE_SUBJECTS, '自然'];
  const totals = new Map<string, { subject: SubjectTimeSubject; itemLabel: string; minutes: number }>();
  entries.forEach(function addNaturalScienceEntry(entry): void {
    const isDetailedScience = NATURAL_SCIENCE_SUBJECTS.includes(
      entry.subject as typeof NATURAL_SCIENCE_SUBJECTS[number],
    );
    if (!isDetailedScience && entry.subject !== '自然') return;
    const key = `${entry.subject}\u0000${entry.itemLabel}`;
    const existing = totals.get(key);
    totals.set(key, {
      subject: entry.subject,
      itemLabel: entry.itemLabel,
      minutes: (existing?.minutes ?? 0) + entry.minutes,
    });
  });
  const populated = [...totals.values()]
    .filter(function hasMinutes(entry): boolean {
      return entry.minutes > 0;
    })
    .sort(function sortNaturalScience(left, right): number {
      return subjectOrder.indexOf(left.subject) - subjectOrder.indexOf(right.subject)
        || right.minutes - left.minutes
        || left.itemLabel.localeCompare(right.itemLabel, 'zh-Hant');
    });
  const totalMinutes = roundOne(populated.reduce(function addMinutes(sum, entry): number {
    return sum + entry.minutes;
  }, 0));
  let allocated = 0;
  const slices = populated.map(function makeNaturalScienceSlice(entry, index): NaturalScienceItemTimeSlice {
    const percent = slicePercent(entry.minutes, totalMinutes, allocated, index === populated.length - 1);
    allocated = roundOne(allocated + percent);
    const subjectLabel = entry.subject === '自然' ? '自然整合' : entry.subject;
    return {
      subject: entry.subject,
      label: `${subjectLabel}｜${entry.itemLabel}`,
      minutes: roundOne(entry.minutes),
      percent,
    };
  });
  return { totalMinutes, slices };
}
