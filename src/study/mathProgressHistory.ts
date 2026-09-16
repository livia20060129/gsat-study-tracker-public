type JsonMap = Record<string, unknown>;

type StudyItemLike = {
  type?: string;
  done?: boolean;
  presetKey?: string;
  title?: string;
  f?: JsonMap;
};

type StudyRecordLike = {
  date?: string;
  mood?: string;
  items?: StudyItemLike[];
};

type MathRange = {
  key: string;
  start: number;
  end: number;
};

const STORE_PREFIX = 'study-v10.4:';
const TEACHING_BOOKS = new Set(['1', '2', '3A', '4A']);

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function studyDateKeys(): string[] {
  const dates: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const storageKey = localStorage.key(index);
    if (!storageKey?.startsWith(STORE_PREFIX)) continue;
    const date = storageKey.slice(STORE_PREFIX.length);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.push(date);
  }
  return dates.sort();
}

function readRecord(date: string): StudyRecordLike | null {
  const raw = localStorage.getItem(STORE_PREFIX + date);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StudyRecordLike;
  } catch {
    return null;
  }
}

function mathMaterialKey(fields: JsonMap | undefined): string {
  const f = fields ?? {};
  const material = text(f.material);
  const edition = text(f.edition || f.version);
  const book = text(f.book);
  const volume = text(f.volume || f.booklet);

  // Compatibility for older records: book 1／2／3A／4A without material
  // came from the teaching workbook before material was stored explicitly.
  const normalizedMaterial =
    material || edition || (!material && !edition && TEACHING_BOOKS.has(book) ? '教學講義' : '');
  const normalizedBook = book || volume;

  return `${normalizedMaterial}||${normalizedBook}`;
}

function pushRange(out: MathRange[], fields: JsonMap | undefined): void {
  if (!fields) return;
  let start = Number(fields.start);
  let end = Number(fields.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < 1) return;
  if (start > end) [start, end] = [end, start];
  out.push({
    key: mathMaterialKey(fields),
    start: Math.floor(start),
    end: Math.floor(end),
  });
}

function isSaturdayMakeup(item: StudyItemLike): boolean {
  return item.type === 'general' &&
    (item.presetKey === 'sat_makeup' || item.title === '回補本週未完成項目');
}

function completedMathRanges(record: StudyRecordLike | null): MathRange[] {
  const out: MathRange[] = [];
  if (!record || !Array.isArray(record.items) || record.mood === '外出') return out;

  for (const item of record.items) {
    if (!item) continue;
    if (item.type === 'mathStudy' && item.done) pushRange(out, item.f);
    if (item.type === 'mathLecture' && item.done && Boolean(item.f?.progress)) pushRange(out, item.f);

    if (isSaturdayMakeup(item)) {
      const makeupEntries = item.f?.makeupEntries;
      if (!Array.isArray(makeupEntries)) continue;
      for (const raw of makeupEntries) {
        const makeup = raw as StudyItemLike;
        if (makeup?.type === 'mathLecture' && makeup.done && Boolean(makeup.f?.progress)) {
          pushRange(out, makeup.f);
        }
      }
    }
  }

  return out;
}

function addRangesToSets(sets: Map<string, Set<number>>, ranges: MathRange[]): void {
  for (const range of ranges) {
    let pages = sets.get(range.key);
    if (!pages) {
      pages = new Set<number>();
      sets.set(range.key, pages);
    }
    for (let page = range.start; page <= range.end; page += 1) pages.add(page);
  }
}

function pageSetsForDates(predicate: (date: string) => boolean): Map<string, Set<number>> {
  const sets = new Map<string, Set<number>>();
  for (const date of studyDateKeys()) {
    if (!predicate(date)) continue;
    addRangesToSets(sets, completedMathRanges(readRecord(date)));
  }
  return sets;
}

function countPagesNotPreviouslyDone(
  current: Map<string, Set<number>>,
  previous: Map<string, Set<number>>,
): number {
  let count = 0;
  for (const [key, pages] of current) {
    const oldPages = previous.get(key);
    for (const page of pages) {
      if (!oldPages?.has(page)) count += 1;
    }
  }
  return count;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year, month - 1, day, 12, 0, 0);
  value.setDate(value.getDate() + days);
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function mondayOf(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year, month - 1, day, 12, 0, 0);
  const weekday = value.getDay();
  return addDays(date, -(weekday === 0 ? 6 : weekday - 1));
}

export function dailyNewMathPageCount(date: string): number {
  const current = pageSetsForDates((candidate) => candidate === date);
  const previous = pageSetsForDates((candidate) => candidate < date);
  return countPagesNotPreviouslyDone(current, previous);
}

export function weeklyNewMathPageCount(date: string): number {
  const monday = mondayOf(date);
  const sunday = addDays(monday, 6);
  const currentWeek = pageSetsForDates((candidate) => candidate >= monday && candidate <= sunday);
  const beforeWeek = pageSetsForDates((candidate) => candidate < monday);
  return countPagesNotPreviouslyDone(currentWeek, beforeWeek);
}

function updateDisplayedMathProgress(): void {
  const dateInput = document.getElementById('studyDate') as HTMLInputElement | null;
  const date = dateInput?.value ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  const dailyPages = dailyNewMathPageCount(date);
  const weeklyPages = weeklyNewMathPageCount(date);

  const dailyNode = document.getElementById('mathPagesTop');
  const weeklyNode = document.getElementById('weekMathPages');
  const targetNode = document.getElementById('weekMathTarget');
  const percentNode = document.getElementById('weekMathPercent');
  const barNode = document.getElementById('weekMathBar') as HTMLElement | null;

  if (dailyNode && dailyNode.textContent !== String(dailyPages)) dailyNode.textContent = String(dailyPages);
  if (weeklyNode && weeklyNode.textContent !== String(weeklyPages)) weeklyNode.textContent = String(weeklyPages);

  const target = Number(targetNode?.textContent ?? 0);
  const percent = target > 0 ? Math.min(100, Math.round((weeklyPages / target) * 100)) : 0;
  if (percentNode && percentNode.textContent !== `${percent}%`) percentNode.textContent = `${percent}%`;
  if (barNode && barNode.style.width !== `${percent}%`) barNode.style.width = `${percent}%`;

  if (dailyNode) dailyNode.title = '僅計入此前未完成過的相同教材／冊別頁碼';
  if (weeklyNode) weeklyNode.title = '已排除前週完成過的相同教材／冊別頁碼';
}

export function initHistoricalMathProgressGuard(): void {
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      updateDisplayedMathProgress();
    });
  };

  schedule();

  document.addEventListener('input', schedule);
  document.addEventListener('change', schedule);
  document.addEventListener('click', schedule);

  const completionText = document.getElementById('completionText');
  if (completionText) {
    const observer = new MutationObserver(schedule);
    observer.observe(completionText, { childList: true, characterData: true, subtree: true });
  }
}
