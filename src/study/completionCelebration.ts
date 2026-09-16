export type CompletionCelebration = 'half' | 'complete' | null;

export interface SeenCompletionCelebrations {
  version?: number;
  half?: boolean;
  complete?: boolean;
}

/**
 * Celebrations are driven only by a user completing an item. Background sync,
 * deferral, and denominator changes must never produce a surprise animation.
 */
export function completionCelebrationForChange(
  previousPercent: number,
  currentPercent: number,
  seen: SeenCompletionCelebrations = {},
  completedByUser = true,
): CompletionCelebration {
  if (!completedByUser || currentPercent <= previousPercent) return null;
  if (currentPercent >= 100 && previousPercent < 100) return seen.complete ? null : 'complete';
  if (currentPercent >= 50 && !seen.half) return 'half';
  return null;
}
