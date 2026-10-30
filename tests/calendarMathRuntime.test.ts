import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { buildCalendarStudyTaskPlan } from '../src/application/calendar/calendarStudyTaskService.ts';
import { prioritizeCalendarPageRanges } from '../src/calendar/pagePriority.ts';
import { resolveMathCalendarPlan } from '../src/calendar/mathPlan.ts';
import { CALENDAR_MATH_PLAN } from '../src/data/mathCalendar.ts';
import { dedupePresetDefinitions } from '../src/study/presetDedup.ts';
import { isInteractiveStudyItem } from '../src/study/interactiveTasks.ts';
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
    isInteractiveStudyItem,
    buildCalendarStudyTaskPlan,
    prioritizeCalendarPageRanges,
    resolveMathCalendarPlan,
    cloneObj: <T>(value: T): T => JSON.parse(JSON.stringify(value)),
    CALENDAR_MATH_PLAN,
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

test('public edition keeps both Calendar math events visible and resolves their page-map guidance', () => {
  for (const rows of [[newKey, teaching], [teaching, newKey]]) {
    const context = app(rows);
    assert.equal(context.cloudMathPlansByDate[date].length, 2);
    assert.deepEqual(
      Array.from(context.cloudMathPlansByDate[date], (plan: { title: string }) => plan.title).sort(),
      ['1–2｜實數與指對數', '2｜數列與求和'].sort(),
    );
    assert.equal(context.cloudMathPlanByDate[date].title, '2｜數列與求和');

    const calendarDefinitions = context.cloudCalendarDefsForDate(date);
    assert.equal(calendarDefinitions.length, 2);
    const newKeyDefinition = calendarDefinitions.find((definition: { f: Record<string, string> }) => definition.f.material === '新關鍵');
    assert.ok(newKeyDefinition);
    assert.deepEqual(
      [
        newKeyDefinition.f.material,
        newKeyDefinition.f.book,
        newKeyDefinition.f.start,
        newKeyDefinition.f.end,
      ],
      ['新關鍵', '1~2', '2', '5'],
    );
    assert.equal(newKeyDefinition.f.calendarPreserveSeparate, true);
    assert.equal(dedupePresetDefinitions(calendarDefinitions).length, 2);
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

test('fraction-only Calendar math uses page-map guidance without creating an offline schedule', () => {
  const moved = '2026-10-29';
  const context = app([1, 2].map(part => row(`moved-${part}`, '4A｜條件機率與貝氏定理',
    `【講義版本】教學講義 【冊別】4A 【單元進度】條件機率與貝氏定理（${part}/4） 【來源日期】2026/10/${6 + part}`, moved)));
  const definitions = context.cloudCalendarDefsForDate(moved);
  assert.equal(definitions.length, 2);
  assert.equal(dedupePresetDefinitions(definitions).length, 2);
  assert.deepEqual(Array.from(definitions, (definition: { f: Record<string, string> }) => [definition.f.book, definition.f.start, definition.f.end]),
    [['4A', '151', '162'], ['4A', '163', '174']]);
});
