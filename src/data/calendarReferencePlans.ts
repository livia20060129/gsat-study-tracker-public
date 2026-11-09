import type { NaturalCalendarPlan } from '../calendar/naturalPlan.ts';
import type { GrammarPlanCandidate } from '../calendar/grammarPlan.ts';

// Public schedules come exclusively from Calendar imports or manual entries.
export const CALENDAR_NATURAL_RECOMMENDED_PAGES: Record<string, NaturalCalendarPlan> = {};
export const CALENDAR_GRAMMAR_PLAN: Record<string, GrammarPlanCandidate> = {};
