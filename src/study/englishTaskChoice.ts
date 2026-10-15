import type { StudyItem, StudyRecord } from '../types.ts';

export type EnglishTaskChoice = 'mixed' | 'mock';

/** Only the scheduled English timed mock competes with mixed writing. */
export function englishTaskKind(item: StudyItem): EnglishTaskChoice | null {
  if (item.source !== 'preset') return null;
  if (item.type === 'englishMixedWriting') return 'mixed';
  if (item.type !== 'mock') return null;
  const key = String(item.templatePresetKey || item.presetKey || '');
  if (key === 'fri_mock_timed' || item.f?.calendarFixedTemplate === 'englishMockTimed'
    || key.startsWith('cal_fixed_englishMockTimed_')) return 'mock';
  return null;
}

export function hasEnglishTaskCollision(items: StudyItem[]): boolean {
  const kinds = new Set(items.map(englishTaskKind));
  return kinds.has('mixed') && kinds.has('mock');
}

function hasProgress(item: StudyItem): boolean {
  if (item.done || Number(item.minutes) > 0) return true;
  const fields = item.f || {};
  const keys = item.type === 'englishMixedWriting'
    ? ['essayScore', 'mixedScore', 'priorityFix']
    : ['year', 'exam', 'round', 'status', 'reason'];
  return keys.some(key => String(fields[key] ?? '').trim() !== '');
}

/** Older records with work on exactly one option keep that option active. */
export function resolvedEnglishTaskChoice(record: StudyRecord): EnglishTaskChoice | null {
  if (!hasEnglishTaskCollision(record.items || [])) return null;
  if (record.englishTaskChoice === 'mixed' || record.englishTaskChoice === 'mock') return record.englishTaskChoice;
  const worked = new Set((record.items || []).filter(hasProgress).map(englishTaskKind).filter(Boolean));
  if (worked.size === 1 && worked.has('mixed')) return 'mixed';
  if (worked.size === 1 && worked.has('mock')) return 'mock';
  return null;
}

/** Inactive work remains stored and recoverable, but never affects visible metrics. */
export function activeEnglishTaskItems(record: StudyRecord, items: StudyItem[]): StudyItem[] {
  const available = items.filter(item => item.f?.englishMockCorrectionInactive !== true);
  if (!hasEnglishTaskCollision(record.items || [])) return available;
  const choice = resolvedEnglishTaskChoice(record);
  return available.filter(item => {
    const kind = englishTaskKind(item);
    return !kind || kind === choice;
  });
}
