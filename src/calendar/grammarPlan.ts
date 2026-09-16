export interface GrammarPlanCandidate {
  title: string;
  start?: number | null;
  end?: number | null;
  [key: string]: unknown;
}

function progressKey(value: unknown): string {
  const match = String(value ?? '').match(/(\d+)\s*[／/]\s*(\d+)/);
  return match ? `${Number(match[1])}/${Number(match[2])}` : '';
}

export function normalizedGrammarUnitTitle(value: unknown): string {
  return String(value ?? '')
    .replace(/^英文文法\s*[｜:：]\s*/, '')
    .replace(/[（(]\s*\d+\s*[／/]\s*\d+\s*[）)]/g, '')
    .replace(/\s*＋\s*Review\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Selects a split grammar unit by explicit pages first, then by its n/total progress. */
export function selectGrammarPlan<T extends GrammarPlanCandidate>(
  title: unknown,
  unitProgress: unknown,
  explicitStart: unknown,
  explicitEnd: unknown,
  candidates: readonly T[],
): T | null {
  const unitTitle = normalizedGrammarUnitTitle(title);
  const matches = candidates.filter(candidate => normalizedGrammarUnitTitle(candidate.title) === unitTitle);
  if (!matches.length) return null;

  const start = Number(explicitStart);
  const end = Number(explicitEnd ?? explicitStart);
  if (Number.isInteger(start) && start > 0) {
    const pageMatch = matches.find(candidate => Number(candidate.start) === start && Number(candidate.end ?? candidate.start) === end);
    if (pageMatch) return pageMatch;
  }

  const requestedProgress = progressKey(unitProgress) || progressKey(title);
  if (requestedProgress) {
    const progressMatch = matches.find(candidate => progressKey(candidate.title) === requestedProgress);
    if (progressMatch) return progressMatch;
  }

  return matches[0] ?? null;
}
