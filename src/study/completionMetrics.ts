export interface CompletionUnit {
  /** Confirmed deferrals and workload-only additions do not enter the original item metric. */
  itemIncluded?: boolean;
  /** Actual completion only; deferral never earns completion credit. */
  itemAccepted: boolean;
  /** Confirmed deferrals and item-metric-only detail rows do not enter the workload metric. */
  workloadIncluded?: boolean;
  /** Counts as actual completed workload (done only; deferred work is not done). */
  workloadCompleted: boolean;
}

export interface CompletionMetrics {
  itemCompleted: number;
  itemTotal: number;
  itemPercent: number;
  workloadCompleted: number;
  workloadTotal: number;
  workloadPercent: number;
  settlementPercent: number;
}

/** Confirmed deferral removes the unit from both denominators instead of counting it as completed. */
export function originalCompletionUnit(completed: boolean, deferred = false): CompletionUnit {
  return {
    itemIncluded: !deferred,
    itemAccepted: completed && !deferred,
    workloadIncluded: !deferred,
    workloadCompleted: completed && !deferred,
  };
}

/** Makeup enters the target day's workload only, unless it has been deferred again. */
export function makeupCompletionUnit(completed: boolean, deferred = false): CompletionUnit {
  return {
    itemIncluded: false,
    itemAccepted: false,
    workloadIncluded: !deferred,
    workloadCompleted: completed && !deferred,
  };
}

/** One parent card may contain multiple original items; every child remains one completion unit. */
export function groupedOriginalCompletionUnits(completed: boolean[], deferred = false): CompletionUnit[] {
  return completed.map(done => originalCompletionUnit(done, deferred));
}

/** Deferred/Calendar makeup children add workload one by one without duplicating original totals. */
export function groupedMakeupCompletionUnits(completed: boolean[], deferred = false): CompletionUnit[] {
  return completed.map(done => makeupCompletionUnit(done, deferred));
}

function percentage(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export function summarizeCompletionUnits(
  units: CompletionUnit[],
): CompletionMetrics {
  let itemCompleted = 0;
  let itemTotal = 0;
  let workloadCompleted = 0;
  let workloadTotal = 0;

  for (const unit of units) {
    if (unit.itemIncluded !== false) {
      itemTotal += 1;
      if (unit.itemAccepted) itemCompleted += 1;
    }
    if (unit.workloadIncluded !== false) {
      workloadTotal += 1;
      if (unit.workloadCompleted) workloadCompleted += 1;
    }
  }

  const itemPercent = percentage(itemCompleted, itemTotal);
  const workloadPercent = percentage(workloadCompleted, workloadTotal);

  return {
    itemCompleted,
    itemTotal,
    itemPercent,
    workloadCompleted,
    workloadTotal,
    workloadPercent,
    settlementPercent: Math.round((itemPercent + workloadPercent) / 2),
  };
}

export function formatPercentagePointDelta(delta: number): string {
  const rounded = Math.round(delta);
  if (rounded > 0) return `+${rounded}%`;
  if (rounded < 0) return `${rounded}%`;
  return '±0%';
}
