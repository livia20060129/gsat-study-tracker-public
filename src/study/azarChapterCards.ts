import type { StudyItem } from '../types.ts';

function sectionMinutes(items: StudyItem[]): number {
  return items.reduce((total, item) => {
    const minutes = Number(item.minutes);
    return total + (Number.isFinite(minutes) && minutes > 0 ? minutes : 0);
  }, 0);
}

/** Moves retired subsection progress into one chapter card without counting it twice. */
export function mergeAzarSectionProgress(
  chapterItem: StudyItem,
  oldSections: StudyItem[],
  preserveExisting: boolean,
): boolean {
  let changed = false;
  for (const field of ['azarSectionCode', 'azarSectionTitle', 'round']) {
    if (Object.hasOwn(chapterItem.f, field)) {
      delete chapterItem.f[field];
      changed = true;
    }
  }

  if (!oldSections.length) return changed;

  const previous = Array.isArray(chapterItem.f.azarLegacySections)
    ? chapterItem.f.azarLegacySections as StudyItem[]
    : [];
  const savedIds = new Set(previous.map(item => item.id));
  const additions = oldSections.filter(item => !savedIds.has(item.id));
  if (!additions.length) return changed;

  const allSections = [...previous, ...additions];
  chapterItem.f.azarLegacySections = structuredClone(allSections);
  changed = true;

  if (!preserveExisting && !previous.length) {
    chapterItem.minutes = String(Number(sectionMinutes(allSections).toFixed(4)));
    chapterItem.done = allSections.every(item => item.done);
    const checkedDates = allSections.map(item => item.checkedOn).filter((date): date is string => !!date);
    if (chapterItem.done && checkedDates.length) chapterItem.checkedOn = checkedDates.sort().at(-1);
    else delete chapterItem.checkedOn;

    const hasEditedPages = allSections.some(item => {
      const edits = item.f.dailyWorkUserFields;
      return !!edits && typeof edits === 'object'
        && (Object.hasOwn(edits, 'start') || Object.hasOwn(edits, 'end'));
    });
    if (hasEditedPages) {
      const pages = allSections.flatMap(item => [Number(item.f.start), Number(item.f.end)])
        .filter(page => Number.isInteger(page) && page > 0);
      if (pages.length) {
        const start = String(Math.min(...pages));
        const end = String(Math.max(...pages));
        chapterItem.f.start = start;
        chapterItem.f.end = end;
        chapterItem.f.dailyWorkUserFields = { start, end };
      }
    }
    return changed;
  }

  // A later Calendar refresh may reveal another old row. Preserve manual edits
  // to the new chapter card while retaining every old subsection in the archive.
  return changed;
}
