import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { buildCalendarStudyTaskPlan } from '../src/application/calendar/calendarStudyTaskService.ts';
import { prioritizeCalendarPageRanges } from '../src/calendar/pagePriority.ts';
import { dedupePresetDefinitions } from '../src/study/presetDedup.ts';
import type { CalendarTaskRow } from '../src/calendar/calendarBridge.ts';

const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
const date = '2026-09-14';

function loadRuntime(context: ReturnType<typeof createContext>, names: string[]) {
  for (const name of names) {
    const start = runtime.indexOf(`function ${name}(`);
    const relativeEnd = runtime.slice(start + 1).search(/\n(?:async )?function /);
    assert.ok(start >= 0 && relativeEnd >= 0, name);
    runInContext(runtime.slice(start, start + 1 + relativeEnd), context);
  }
}

function row(id: string, title: string, description: string, eventDate = date): CalendarTaskRow {
  return {
    event_key: `primary:${id}`,
    source_event_id: id,
    calendar_id: 'primary',
    event_date: eventDate,
    title,
    description,
    category: 'math',
  };
}

function app(rows: CalendarTaskRow[]) {
  const context = createContext({
    buildCalendarStudyTaskPlan,
    prioritizeCalendarPageRanges,
    cloneObj: <T>(value: T): T => JSON.parse(JSON.stringify(value)),
    CALENDAR_MATH_PLAN: {
      [date]: { title: '2｜數列與求和', material: '教學講義', book: '2', start: 1, end: 11, pages: 11 },
    },
    parseDate: (value: string) => {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day, 12);
    },
    cloudMathPlanByDate: {},
    cloudMathPlansByDate: {},
    cloudNaturalIntegrationItemsByDate: {},
    cloudNaturalIntegrationDetailsByDate: {},
    calendarParsedByDate: {},
  });
  loadRuntime(context, [
    'resolveCloudMathPlan', 'selectPrimaryCloudMathPlan', 'buildCalendarRuntime',
    'calendarEventToken', 'calendarIdentifierToken', 'presetDef',
    'calendarMathStudyDef', 'calendarDateHasBuiltInMathStudy', 'cloudCalendarDefsForDate',
  ]);
  context.buildCalendarRuntime(rows);
  return context;
}

const newKey = row(
  'new-key',
  '1–2｜實數與指對數',
  '【講義版本】新關鍵\n【冊別】1–2\n【頁碼範圍】p.2–5\n【識別碼】GSAT-NEWKEY-MATH-20260914',
);
const teaching = row(
  'teaching',
  '2｜數列與求和',
  '【講義版本】教學講義\n【冊別】2\n【單元進度】1/5\n【識別碼】GSAT-SPLIT-MATH-2026-09-14',
);

test('public edition keeps every recognizable Calendar math event as a visible card', () => {
  for (const rows of [[newKey, teaching], [teaching, newKey]]) {
    const context = app(rows);
    assert.equal(context.cloudMathPlansByDate[date].length, 1);
    assert.equal(context.cloudMathPlanByDate[date].title, newKey.title);

    const calendarDefinitions = context.cloudCalendarDefsForDate(date);
    assert.equal(calendarDefinitions.length, 2);
    const newKeyDefinition = calendarDefinitions.find((definition: any) => definition.f.material === '新關鍵');
    assert.ok(newKeyDefinition);
    assert.deepEqual(
      [newKeyDefinition.f.book, newKeyDefinition.f.start, newKeyDefinition.f.end],
      ['1~2', '2', '5'],
    );
    assert.equal(newKeyDefinition.f.calendarPreserveSeparate, true);

    const builtIn = context.presetDef(
      'weekday_math_study', 'mathStudy', '數學講義：進度', 'built in', true,
    );
    const combined = dedupePresetDefinitions([builtIn, ...calendarDefinitions]);
    assert.equal(combined.length, 3);
    assert.ok(combined.some(definition => definition.f.material === '新關鍵'));
  }
});

test('Sunday Calendar math still creates a card when there is no built-in math progress card', () => {
  const sunday = '2026-09-20';
  const context = app([row(
    'new-key-sunday',
    '1–2｜實數與指對數',
    '【講義版本】新關鍵\n【冊別】1–2\n【頁碼範圍】p.26–28\n【識別碼】GSAT-NEWKEY-MATH-20260920',
    sunday,
  )]);
  const definitions = context.cloudCalendarDefsForDate(sunday);
  assert.equal(definitions.length, 1);
  assert.deepEqual([definitions[0].f.start, definitions[0].f.end], ['26', '28']);
});
