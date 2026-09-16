import { parseCalendarTask } from '../../calendar/calendarBridge.ts';
import type { CalendarTaskRow, ParsedCalendarTask } from '../../calendar/calendarBridge.ts';

type UsableParsedCalendarTask = Exclude<ParsedCalendarTask, { kind: 'other' }>;

export type CalendarStudyTask = UsableParsedCalendarTask & {
  taskId: string;
  origin: 'google-calendar';
  route: 'today' | 'week';
  makeup: boolean;
};

export interface CalendarStudyTaskPlan {
  tasks: CalendarStudyTask[];
  byDate: Record<string, CalendarStudyTask[]>;
}

function stableTaskId(task: UsableParsedCalendarTask): string {
  const source = task.identifier || task.eventKey || task.sourceEventId || `${task.date}:${task.title}`;
  return `google-calendar:${source}`;
}

/** Application boundary: turns Google rows into Tracker-ready tasks without UI or storage work. */
export function createCalendarStudyTask(row: CalendarTaskRow): CalendarStudyTask | null {
  const parsed = parseCalendarTask(row);
  if (parsed.kind === 'other') return null;
  return {
    ...parsed,
    taskId: stableTaskId(parsed),
    origin: 'google-calendar',
    route: parsed.makeup ? 'today' : (parsed.route ?? 'today'),
    makeup: Boolean(parsed.makeup),
  } as CalendarStudyTask;
}

export function buildCalendarStudyTaskPlan(rows: CalendarTaskRow[]): CalendarStudyTaskPlan {
  const tasks = rows.map(createCalendarStudyTask).filter((task): task is CalendarStudyTask => task !== null);
  const byDate: Record<string, CalendarStudyTask[]> = {};
  for (const task of tasks) (byDate[task.date] ||= []).push(task);
  return { tasks, byDate };
}
