import type { ParsedCalendarTask } from './calendarBridge.ts';
import { prioritizeCalendarPageRanges } from './pagePriority.ts';

type NaturalTask = Extract<ParsedCalendarTask, { kind: 'natural' }>;

export interface NaturalCalendarPlan {
  subject: string;
  material: string;
  label: string;
  basis: string;
  ranges: Array<[number, number]>;
  calendarRangeSource?: 'calendar' | 'unit' | null;
}

/** Resolve one event, never the last natural-science event on the same date. */
export function resolveNaturalCalendarPlan(
  task: NaturalTask,
  fallback?: NaturalCalendarPlan | null,
): NaturalCalendarPlan | null {
  const compatible = fallback?.subject === task.subject
    && (!task.material || task.material === fallback.material) ? fallback : null;
  const selected = prioritizeCalendarPageRanges(task.startPage, task.endPage, compatible?.ranges);
  if (!selected.ranges.length) return null;
  return {
    subject: task.subject,
    material: task.material || compatible?.material || '123日的淬鍊',
    label: task.topic,
    basis: selected.source === 'calendar' ? 'Google Calendar 明確頁碼範圍。' : (compatible?.basis || ''),
    ranges: selected.ranges,
    calendarRangeSource: selected.source,
  };
}

/** Only combine events explicitly represented by a merged card of the same subject/material. */
export function combineNaturalCalendarPlans(plans: NaturalCalendarPlan[]): NaturalCalendarPlan | null {
  const first = plans[0];
  if (!first || plans.some(plan => plan.subject !== first.subject || plan.material !== first.material)) return null;
  const ranges: Array<[number, number]> = [];
  for (const [start, end] of plans.flatMap(plan => plan.ranges).sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = ranges.at(-1);
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }
  return {
    ...first,
    ranges,
    label: [...new Set(plans.map(plan => plan.label))].join('、'),
    basis: [...new Set(plans.map(plan => plan.basis).filter(Boolean))].join('、'),
    calendarRangeSource: plans.every(plan => plan.calendarRangeSource === 'calendar') ? 'calendar' : 'unit',
  };
}
