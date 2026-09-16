import type { StudyRecord } from '../types.ts';
import { decodeStudyRecord } from '../storage/studyRecordCodec.ts';

export type ProgressImportRecord = Record<string, unknown> & { date: string };

export type ProgressImportParseResult =
  | { ok: true; records: ProgressImportRecord[] }
  | { ok: false; errors: string[] };

export interface ProgressImportCommitSummary {
  localSucceeded: number;
  localFailed: number;
  cloudSucceeded: number;
  cloudConflicts: number;
  cloudFailed: number;
  cloudSkipped: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

const MAX_IMPORT_TEXT_LENGTH = 5_000_000;
const MAX_IMPORT_RECORDS = 1_000;
const MAX_ITEMS_PER_LIST = 1_000;
const MAX_OBJECT_DEPTH = 14;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const NESTED_ITEM_FIELDS = [
  'interactiveEntries',
  'makeupEntries',
  'reviewEntries',
  'groupedWorkEntries',
  'dailyWorkSourceItems',
] as const;
const WORD_BOOLEAN_FIELDS = [
  'noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction',
  'fixedCombination', 'beautifulSentences',
] as const;

function validateSafeValue(value: unknown, label: string, errors: string[], depth = 0): void {
  if (depth > MAX_OBJECT_DEPTH) {
    errors.push(`${label}巢狀層級過深。`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ITEMS_PER_LIST) errors.push(`${label}超過 ${MAX_ITEMS_PER_LIST} 筆上限。`);
    value.forEach((entry, index) => validateSafeValue(entry, `${label}[${index}]`, errors, depth + 1));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      errors.push(`${label}含有不允許的欄位 ${key}。`);
      continue;
    }
    validateSafeValue(entry, `${label}.${key}`, errors, depth + 1);
  }
}

function validateOptionalString(value: unknown, label: string, errors: string[]): void {
  if (value !== undefined && typeof value !== 'string') errors.push(`${label}必須是文字。`);
}

function validateOptionalBoolean(value: unknown, label: string, errors: string[]): void {
  if (value !== undefined && typeof value !== 'boolean') errors.push(`${label}必須是 true 或 false。`);
}

function validateWords(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${label}必須是陣列。`);
    return;
  }
  if (value.length > MAX_ITEMS_PER_LIST) errors.push(`${label}超過 ${MAX_ITEMS_PER_LIST} 筆上限。`);
  value.forEach((word, index) => {
    const wordLabel = `${label}第 ${index + 1} 筆`;
    if (typeof word === 'string') return;
    if (!isObject(word)) {
      errors.push(`${wordLabel}必須是文字或物件。`);
      return;
    }
    validateOptionalString(word.id, `${wordLabel}的 id`, errors);
    validateOptionalString(word.text, `${wordLabel}的 text`, errors);
    WORD_BOOLEAN_FIELDS.forEach((field) => validateOptionalBoolean(word[field], `${wordLabel}的 ${field}`, errors));
  });
}

function validateTimeTracking(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    errors.push(`${label}必須是物件。`);
    return;
  }
  if (value.mode !== 'manual' && value.mode !== 'timer') errors.push(`${label}.mode 必須是 manual 或 timer。`);
  if (!Number.isFinite(value.accumulatedSeconds) || Number(value.accumulatedSeconds) < 0) {
    errors.push(`${label}.accumulatedSeconds 必須是大於或等於 0 的數字。`);
  }
  if (value.startedAt !== null && !Number.isFinite(value.startedAt)) {
    errors.push(`${label}.startedAt 必須是數字或 null。`);
  }
}

function validateCalendarIntegrationEntries(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${label}必須是陣列。`);
    return;
  }
  if (value.length > MAX_ITEMS_PER_LIST) errors.push(`${label}超過 ${MAX_ITEMS_PER_LIST} 筆上限。`);
  value.forEach((entry, index) => {
    const entryLabel = `${label}第 ${index + 1} 筆`;
    if (!isObject(entry)) {
      errors.push(`${entryLabel}必須是物件。`);
      return;
    }
    if (entry.subject !== undefined && typeof entry.subject !== 'string') errors.push(`${entryLabel}的 subject 必須是文字。`);
    validateOptionalBoolean(entry.done, `${entryLabel}的 done`, errors);
    if (entry.minutes !== undefined) {
      const validMinutes = typeof entry.minutes === 'string'
        || (typeof entry.minutes === 'number' && Number.isFinite(entry.minutes) && entry.minutes >= 0);
      if (!validMinutes) errors.push(`${entryLabel}的 minutes 必須是文字或非負數字。`);
    }
    if (entry.f !== undefined && !isObject(entry.f)) errors.push(`${entryLabel}的 f 必須是物件。`);
    else if (isObject(entry.f)) validateTimeTracking(entry.f.timeTracking, `${entryLabel}.f.timeTracking`, errors);
    if (entry.ranges !== undefined) {
      if (!Array.isArray(entry.ranges)) errors.push(`${entryLabel}的 ranges 必須是陣列。`);
      else entry.ranges.forEach((range, rangeIndex) => {
        const valid = Array.isArray(range) && range.length === 2
          && range.every((page) => typeof page === 'number' && Number.isFinite(page) && page >= 0);
        if (!valid) errors.push(`${entryLabel}的第 ${rangeIndex + 1} 組頁碼必須是兩個非負數字。`);
      });
    }
  });
}

function validateStudyItem(item: unknown, label: string, errors: string[], depth: number): void {
  if (!isObject(item)) {
    errors.push(`${label}格式不正確。`);
    return;
  }
  if (depth > MAX_OBJECT_DEPTH) {
    errors.push(`${label}巢狀層級過深。`);
    return;
  }
  if (item.id !== undefined && (typeof item.id !== 'string' || !item.id.trim())) errors.push(`${label}的 id 必須是非空白文字。`);
  if (item.type !== undefined && (typeof item.type !== 'string' || !item.type.trim())) errors.push(`${label}的 type 必須是非空白文字。`);
  validateOptionalBoolean(item.done, `${label}的 done`, errors);
  validateOptionalBoolean(item.required, `${label}的 required`, errors);
  validateOptionalString(item.source, `${label}的 source`, errors);
  validateOptionalString(item.title, `${label}的 title`, errors);
  validateOptionalString(item.description, `${label}的 description`, errors);
  if (item.minutes !== undefined) {
    const validMinutes = typeof item.minutes === 'string'
      || (typeof item.minutes === 'number' && Number.isFinite(item.minutes) && item.minutes >= 0);
    if (!validMinutes) errors.push(`${label}的 minutes 必須是文字或非負數字。`);
  }
  if (item.f !== undefined && !isObject(item.f)) {
    errors.push(`${label}的欄位 f 必須是物件。`);
    return;
  }
  const fields = isObject(item.f) ? item.f : {};
  validateWords(fields.words, `${label}.f.words`, errors);
  validateTimeTracking(fields.timeTracking, `${label}.f.timeTracking`, errors);
  validateCalendarIntegrationEntries(fields.calendarIntegrationEntries, `${label}.f.calendarIntegrationEntries`, errors);
  for (const field of NESTED_ITEM_FIELDS) {
    const nested = fields[field];
    if (nested === undefined) continue;
    if (!Array.isArray(nested)) {
      errors.push(`${label}.f.${field} 必須是陣列。`);
      continue;
    }
    if (nested.length > MAX_ITEMS_PER_LIST) errors.push(`${label}.f.${field} 超過 ${MAX_ITEMS_PER_LIST} 筆上限。`);
    const ids = new Set<string>();
    nested.forEach((child, index) => {
      if (isObject(child) && typeof child.id === 'string' && child.id.trim()) {
        if (ids.has(child.id)) errors.push(`${label}.f.${field} 出現重複 id：${child.id}。`);
        ids.add(child.id);
      }
      validateStudyItem(child, `${label}.f.${field} 第 ${index + 1} 筆`, errors, depth + 1);
    });
  }
}

function validateItems(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${label}的 items 必須是陣列。`);
    return;
  }
  if (value.length > MAX_ITEMS_PER_LIST) errors.push(`${label}的 items 超過 ${MAX_ITEMS_PER_LIST} 筆上限。`);
  const ids = new Set<string>();
  value.forEach((item, itemIndex) => {
    if (isObject(item) && typeof item.id === 'string' && item.id.trim()) {
      if (ids.has(item.id)) errors.push(`${label}的 items 出現重複 id：${item.id}。`);
      ids.add(item.id);
    }
    validateStudyItem(item, `${label}的第 ${itemIndex + 1} 個項目`, errors, 0);
  });
}

function recordFrom(
  value: unknown,
  label: string,
  dateHint: string,
  errors: string[],
): ProgressImportRecord | null {
  if (!isObject(value)) {
    errors.push(`${label}必須是物件。`);
    return null;
  }

  const suppliedDate = String(value.date ?? '').trim();
  if (dateHint && suppliedDate && suppliedDate !== dateHint) {
    errors.push(`${label}的日期 ${suppliedDate} 與外層日期 ${dateHint} 不一致。`);
    return null;
  }
  const date = suppliedDate || dateHint;
  if (!isCalendarDate(date)) {
    errors.push(`${label}缺少有效的 YYYY-MM-DD 日期。`);
    return null;
  }

  validateSafeValue(value, label, errors);
  const decoded = decodeStudyRecord(value, date);
  if (!decoded.ok) errors.push(`${label}無法解碼（${decoded.error}）。`);
  validateOptionalString(value.mood, `${label}的 mood`, errors);
  validateOptionalString(value.wakeTime, `${label}的 wakeTime`, errors);
  validateOptionalString(value.biggestBlock, `${label}的 biggestBlock`, errors);
  validateOptionalString(value.firstThingTomorrow, `${label}的 firstThingTomorrow`, errors);
  validateOptionalString(value.notes, `${label}的 notes`, errors);
  if (typeof value.wakeTime === 'string' && value.wakeTime) {
    const match = value.wakeTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) errors.push(`${label}的 wakeTime 必須是 00:00～23:59。`);
  }
  validateItems(value.items, label, errors);
  const output = cloneRecord(value) as ProgressImportRecord;
  output.date = date;
  return output;
}

/**
 * Parses every supported import shape without mutating storage. If any record
 * is malformed the complete batch is rejected, preventing partial imports.
 */
export function parseProgressImportText(text: string): ProgressImportParseResult {
  if (text.length > MAX_IMPORT_TEXT_LENGTH) {
    return { ok: false, errors: [`匯入內容超過 ${MAX_IMPORT_TEXT_LENGTH.toLocaleString()} 字元上限。`] };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['內容不是有效的 JSON。'] };
  }

  const errors: string[] = [];
  const records: ProgressImportRecord[] = [];
  const add = (entry: unknown, label: string, dateHint = '') => {
    const record = recordFrom(entry, label, dateHint, errors);
    if (record) records.push(record);
  };

  if (Array.isArray(value)) {
    value.forEach((entry, index) => add(entry, `第 ${index + 1} 筆紀錄`));
  } else if (isObject(value) && Object.prototype.hasOwnProperty.call(value, 'records')) {
    if (!Array.isArray(value.records)) {
      errors.push('records 必須是陣列。');
    } else {
      value.records.forEach((entry, index) => add(entry, `第 ${index + 1} 筆紀錄`));
    }
  } else if (isObject(value) && value.date !== undefined) {
    add(value, '紀錄');
  } else if (isObject(value)) {
    const keys = Object.keys(value);
    const dateKeys = keys.filter(isCalendarDate);
    if (!dateKeys.length) errors.push('找不到有效的 YYYY-MM-DD 日期紀錄。');
    keys.filter((key) => !isCalendarDate(key)).forEach((key) => errors.push(`日期對應物件含有無法辨識的鍵：${key}。`));
    dateKeys.forEach((date) => add(value[date], `${date} 紀錄`, date));
  } else {
    errors.push('匯入內容必須是單筆紀錄、多筆陣列或日期對應物件。');
  }

  if (records.length > MAX_IMPORT_RECORDS) errors.push(`一次最多匯入 ${MAX_IMPORT_RECORDS} 個日期。`);
  if (!records.length && !errors.length) errors.push('找不到可匯入的進度紀錄。');
  return errors.length ? { ok: false, errors } : { ok: true, records };
}

export function progressImportResultText(summary: ProgressImportCommitSummary): string {
  const local = summary.localFailed
    ? `本機成功 ${summary.localSucceeded} 筆、失敗 ${summary.localFailed} 筆`
    : `本機成功 ${summary.localSucceeded} 筆`;
  const cloudTotal = summary.cloudSucceeded
    + summary.cloudConflicts
    + summary.cloudFailed
    + summary.cloudSkipped;
  if (!cloudTotal) return `${local}。`;
  return `${local}；雲端成功 ${summary.cloudSucceeded} 筆、衝突 ${summary.cloudConflicts} 筆、失敗 ${summary.cloudFailed} 筆、未同步 ${summary.cloudSkipped} 筆。`;
}

export function progressImportBackupPayload(
  records: StudyRecord[],
  createdAt = new Date().toISOString(),
): { version: 1; createdAt: string; records: StudyRecord[] } {
  return {
    version: 1,
    createdAt,
    records: JSON.parse(JSON.stringify(records)) as StudyRecord[],
  };
}
