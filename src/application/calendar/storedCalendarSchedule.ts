import type { CalendarTaskRow } from '../../calendar/calendarBridge.ts';
import { LocalStudyRecordRepository, type KeyValueStorage } from '../../infrastructure/storage/localStudyRecordRepository.ts';
import { readBrowserRecordHistory } from '../../infrastructure/storage/localRecordHistory.ts';
import { markRecordLocallyEdited, sameStudyContent } from '../../storage/recordSync.ts';
import { reconcileCalendarRecords } from './reconcileCalendarSchedule.ts';
import { resolveStudyTimerTarget, studyTimerTargetState, type StudyTimerPointer } from '../timer/studyTimerController.ts';
import { clearUnrecordedCalendarConflict, isUnrecordedCalendarCache } from '../../study/recordedActivity.ts';

/** All writes use fresh records and the normal sync baseline; an upload can never revive a removed task. */
export function synchronizeStoredCalendarSchedule(storage: KeyValueStorage, prefix: string, rows: CalendarTaskRow[], today: string): {
  savedDates: string[]; failedDates: string[];
} {
  const result = { savedDates: [] as string[], failedDates: [] as string[] };
  if (!/^study-v11:user:[^:]+:$/.test(prefix)) return result;
  const repository = new LocalStudyRecordRepository(storage, prefix);
  const history = readBrowserRecordHistory(storage, prefix, true);
  for (const candidate of reconcileCalendarRecords(history, rows, today)) {
    const loaded = repository.loadResult(candidate.date);
    if (loaded.status === 'invalid') { result.failedDates.push(candidate.date); continue; }
    const previous = loaded.status === 'ok' ? loaded.record : null;
    if (previous && sameStudyContent(previous, candidate) && previous.syncConflict === candidate.syncConflict
      && !(previous.localDirty && isUnrecordedCalendarCache(candidate, previous))) continue;
    const edited = markRecordLocallyEdited(candidate, previous ? clearUnrecordedCalendarConflict(previous) : previous);
    if (repository.save(edited)) result.savedDates.push(candidate.date);
    else result.failedDates.push(candidate.date);
  }
  const timerKey = prefix + 'active-timer';
  try {
    const raw = storage.getItem(timerKey);
    const pointer = raw ? JSON.parse(raw) as StudyTimerPointer : null;
    if (pointer && result.savedDates.includes(pointer.date)) {
      const target = resolveStudyTimerTarget(repository.load(pointer.date), pointer);
      if (!target || target.item.f?.calendarScheduleArchived || studyTimerTargetState(target).startedAt === null) storage.removeItem(timerKey);
    }
  } catch { /* A stale optional timer pointer cannot invalidate a saved record. */ }
  return result;
}
