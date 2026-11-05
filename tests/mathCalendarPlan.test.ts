import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCalendarTask, type ParsedCalendarTask } from '../src/calendar/calendarBridge.ts';
import { resolveMathCalendarPlan } from '../src/calendar/mathPlan.ts';
import { CALENDAR_MATH_PLAN } from '../src/data/mathCalendar.ts';

type MathTask = Extract<ParsedCalendarTask, { kind: 'math' }>;

function task(title: string, description: string): MathTask {
  const parsed = parseCalendarTask({ event_key: 'test:math', source_event_id: 'math-event', calendar_id: 'test',
    event_date: '2026-10-29', title, description, category: 'math' });
  assert.equal(parsed.kind, 'math');
  if (parsed.kind !== 'math') throw new Error('Expected math task');
  return parsed;
}

function conditional(part: string): MathTask {
  return task('4A｜條件機率與貝氏定理', `【講義版本】教學講義 【冊別】4A 【單元進度】條件機率與貝氏定理（${part}） 【來源日期】2026/10/7`);
}

test('rescheduled conditional-probability fractions map only to the four 4A segments, not volume 2 or today', () => {
  const expected = [[151, 162], [163, 174], [175, 185], [186, 196]];
  for (let index = 0; index < expected.length; index += 1) {
    const parsed = conditional(`${index + 1}/4`);
    assert.equal(parsed.makeup, true);
    const plan = resolveMathCalendarPlan(parsed, CALENDAR_MATH_PLAN);
    assert.ok(plan);
    assert.deepEqual([plan.book, plan.start, plan.end], ['4A', ...expected[index]]);
    assert.equal(plan.calendarRangeSource, 'unit');
    assert.equal(plan.unitPages, 46);
  }
});

test('combined-unit schedule titles resolve each volume independently across other math units', () => {
  for (const [book, topic, part, start, end] of [
    ['2', '三角', '1/7', 219, 227], ['3A', '三角函數', '1/8', 1, 10],
    ['2', '數列與級數', '3/5', 23, 32], ['2', '數據分析', '2/5', 64, 74],
    ['3A', '指數與對數函數', '7/7', 139, 148],
  ] as const) {
    const parsed = task(`${book}｜${topic}`, `【講義版本】教學講義 【冊別】${book} 【單元進度】${part}`);
    const plan = resolveMathCalendarPlan(parsed, CALENDAR_MATH_PLAN);
    assert.deepEqual(plan && [plan.book, plan.start, plan.end], [book, start, end], topic);
  }
});

test('explicit pages take priority over fractions, title variants and material defaults', () => {
  const parsed = task('4A｜條件機率與貝氏定理', '【講義版本】新關鍵 【冊別】3A–4A 【頁碼範圍】141–143 【單元進度】9/4');
  const plan = resolveMathCalendarPlan(parsed, CALENDAR_MATH_PLAN);
  assert.deepEqual(plan && [plan.material, plan.book, plan.start, plan.end, plan.calendarRangeSource], ['新關鍵', '3A~4A', 141, 143, 'calendar']);
  assert.equal(plan?.calendarMaterialSource, 'calendar');
});

test('explicit combined-volume titles retain their original fraction sequence only when the selected volume agrees', () => {
  const title = '2＋4A｜基本機率＋條件機率';
  const correct = task(title, '【講義版本】教學講義 【冊別】4A 【單元進度】4/7');
  assert.equal(resolveMathCalendarPlan(correct, CALENDAR_MATH_PLAN)?.start, 151);
  const otherVolume = task(title, '【講義版本】教學講義 【冊別】2 【單元進度】1/7');
  assert.equal(resolveMathCalendarPlan(otherVolume, CALENDAR_MATH_PLAN)?.start, 179);
  const contradictory = task(title, '【講義版本】教學講義 【冊別】4A 【單元進度】1/7');
  assert.equal(resolveMathCalendarPlan(contradictory, CALENDAR_MATH_PLAN), null);
});

test('other materials, unknown units and invalid fractions never borrow teaching pages', () => {
  const candidates = [
    { ...conditional('1/4'), material: '新關鍵' }, { ...conditional('1/4'), material: '智慧型' },
    { ...conditional('1/4'), title: '4A｜尚未收錄的單元' },
    conditional('5/4'), conditional('0/4'), conditional('1/0'), conditional('1/100'),
  ];
  for (const parsed of candidates) assert.equal(resolveMathCalendarPlan(parsed, CALENDAR_MATH_PLAN), null);
});

test('ambiguous topic groups do not use the first match or silently divide a chapter into pages', () => {
  const parsed = conditional('1/4');
  const plans = { ...CALENDAR_MATH_PLAN, '2026-12-10': {
    title: '4A｜條件機率', book: '4A', start: 300, end: 310, pages: 11, unitPages: 11, weekTarget: 11,
  } };
  assert.equal(resolveMathCalendarPlan(parsed, plans), null);
  assert.equal(resolveMathCalendarPlan(parsed, {}), null);
});

test('source date remains useful for moved non-fraction tasks and duplicates do not change fraction indices', () => {
  const parsed = task('3A｜平面向量', '【講義版本】教學講義 【冊別】3A 【來源日期】2026/11/5');
  assert.deepEqual(resolveMathCalendarPlan(parsed, CALENDAR_MATH_PLAN)?.start, 197);
  const duplicate = { ...CALENDAR_MATH_PLAN, '2026-12-20': { ...CALENDAR_MATH_PLAN['2026-10-07'] } };
  assert.equal(resolveMathCalendarPlan(conditional('2/4'), duplicate)?.start, 163);
});

test('fullwidth and title-only fractions are parsed while an explicit page range still overrides them', () => {
  assert.equal(resolveMathCalendarPlan(conditional('２／４'), CALENDAR_MATH_PLAN)?.start, 163);
  const parsed = task('4A｜條件機率與貝氏定理（2/4）', '【講義版本】教學講義 【冊別】4A');
  assert.equal(parsed.progressIndex, 2);
  assert.equal(resolveMathCalendarPlan(parsed, CALENDAR_MATH_PLAN)?.start, 163);
});

test('resolving a fraction preserves the parsed event, source identities and schedule table', () => {
  const parsed = conditional('2/4');
  const before = structuredClone(parsed);
  const plans = structuredClone(CALENDAR_MATH_PLAN);
  const plan = resolveMathCalendarPlan(parsed, plans)!;
  assert.equal(plan.calendarEventKey, parsed.eventKey);
  assert.equal(plan.calendarSourceEventId, parsed.sourceEventId);
  assert.equal(plan.pages, 12);
  plan.start = 1;
  assert.deepEqual(parsed, before);
  assert.deepEqual(plans, CALENDAR_MATH_PLAN);
});

test('revised triangle fractions divide the known chapter into five parts instead of selecting an old source-date segment', () => {
  for (const [part, sourceDay, start, end] of [[2, 13, 232, 243], [3, 14, 244, 255]]) {
    const parsed = task('2｜三角比', `【講義版本】教學講義 【冊別】2 【單元進度】三角比（${part}/5） 【來源日期】2026/10/${sourceDay} 【識別碼】GSAT-SPLIT-\nMATH-2026-10-${sourceDay}`);
    parsed.date = '2026-11-02';
    const plan = resolveMathCalendarPlan(parsed, CALENDAR_MATH_PLAN);
    assert.deepEqual(plan && [plan.book, plan.start, plan.end], ['2', start, end]);
    assert.equal(plan?.calendarRangeSource, 'unit');
  }
});

test('revised fractions require the same known material, volume and topic but do not depend on a moved source date', () => {
  const parsed = task('2｜三角比', '【講義版本】教學講義 【冊別】2 【單元進度】三角比（3/5） 【來源日期】2026/10/14');
  for (const candidate of [
    { ...parsed, sourceDate: undefined }, { ...parsed, sourceDate: '2026/10/11' },
    { ...parsed, sourceDate: '2026/10/7' },
  ]) assert.deepEqual([resolveMathCalendarPlan(candidate, CALENDAR_MATH_PLAN)?.start, resolveMathCalendarPlan(candidate, CALENDAR_MATH_PLAN)?.end], [244, 255]);
  for (const candidate of [
    { ...parsed, material: '新關鍵' },
    { ...parsed, book: '4A' }, { ...parsed, title: '2｜尚未收錄的主題' },
    { ...parsed, progressIndex: 6, progressTotal: 5 },
  ]) assert.equal(resolveMathCalendarPlan(candidate, CALENDAR_MATH_PLAN), null);
});

test('November 4 3A trigonometry uses a tenth of pages 1 to 78 and does not borrow the source-date volume 2 range', () => {
  const description = '【講義版本】教學講義 【冊別】3A 【單元進度】三角函數（1/10） 【來源日期】2026/10/17 【識別碼】GSAT-SPLIT-\nMATH-2026-10-17';
  const parsed = task('3A｜三角函數', description);
  parsed.date = '2026-11-04';
  assert.equal(parsed.book, '3A');
  assert.equal(parsed.material, '教學講義');
  assert.deepEqual([parsed.progressIndex, parsed.progressTotal], [1, 10]);
  const fraction = resolveMathCalendarPlan(parsed, CALENDAR_MATH_PLAN)!;
  assert.deepEqual([fraction.book, fraction.start, fraction.end], ['3A', 1, 8]);
  assert.equal(fraction.calendarRangeSource, 'unit');
  const explicit = task('3A｜三角函數', description + '【頁碼範圍】p.4–9');
  const resolved = resolveMathCalendarPlan(explicit, CALENDAR_MATH_PLAN)!;
  assert.deepEqual([resolved.material, resolved.book, resolved.start, resolved.end], ['教學講義', '3A', 4, 9]);
  assert.equal(resolved.calendarRangeSource, 'calendar');
});

test('repartitioned fractions cover each known chapter page exactly once with no empty or overlapping parts', () => {
  for (const [book, topic, total, first, last] of [
    ['3A', '三角函數', 10, 1, 78], ['2', '三角比', 5, 219, 279], ['4A', '條件機率與貝氏定理', 3, 151, 196],
  ] as const) {
    const pages: number[] = [];
    const sizes: number[] = [];
    for (let part = 1; part <= total; part += 1) {
      const parsed = task(`${book}｜${topic}`, `【講義版本】教學講義 【冊別】${book} 【單元進度】${part}/${total}`);
      const plan = resolveMathCalendarPlan(parsed, CALENDAR_MATH_PLAN)!;
      assert.ok(plan);
      sizes.push(plan.pages);
      for (let page = plan.start; page <= plan.end; page += 1) pages.push(page);
    }
    assert.deepEqual(pages, Array.from({ length: last - first + 1 }, (_, index) => first + index));
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  }
});

test('repartitioning refuses incomplete, overlapping or mixed-volume chapter boundaries', () => {
  const parsed = task('3A｜三角函數', '【講義版本】教學講義 【冊別】3A 【單元進度】1/10');
  const gap = { ...CALENDAR_MATH_PLAN };
  delete gap['2026-10-22'];
  assert.equal(resolveMathCalendarPlan(parsed, gap), null);
  const overlap = { ...CALENDAR_MATH_PLAN, '2026-12-01': { ...CALENDAR_MATH_PLAN['2026-10-20'], end: 12, pages: 12 } };
  assert.equal(resolveMathCalendarPlan(parsed, overlap), null);
  const mixed = task('2＋4A｜基本機率＋條件機率', '【講義版本】教學講義 【冊別】2＋4A 【單元進度】1/6');
  assert.equal(resolveMathCalendarPlan(mixed, CALENDAR_MATH_PLAN), null);
});
