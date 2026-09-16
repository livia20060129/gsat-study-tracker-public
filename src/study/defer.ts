import type { StudyRecord } from '../types';
import { countDeferredToDay, DEFERRED_TARGET_LIMIT } from './deferDays';

export function countDeferredToTarget(records: StudyRecord[], targetDay: number): number {
  return countDeferredToDay(records.flatMap(record => record.items), targetDay);
}

export function canDeferToTarget(records: StudyRecord[], targetDay: number): boolean {
  return countDeferredToTarget(records, targetDay) < DEFERRED_TARGET_LIMIT;
}

export { DEFERRED_TARGET_LIMIT };
