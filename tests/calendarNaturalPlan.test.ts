import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { parseCalendarTask, calendarFixedTemplate } from '../src/calendar/calendarBridge.ts';
import type { CalendarTaskRow } from '../src/calendar/calendarBridge.ts';
import { combineNaturalCalendarPlans, resolveNaturalCalendarPlan } from '../src/calendar/naturalPlan.ts';
import { buildCalendarStudyTaskPlan } from '../src/application/calendar/calendarStudyTaskService.ts';
import { dedupePresetDefinitions, presetDefinitionSemanticKey } from '../src/study/presetDedup.ts';
import { applyDailyWorkRangeOverrides, groupDailyWorkItems, propagateDailyWorkField, propagateDailyWorkRangeField, ungroupDailyWorkItems } from '../src/study/dailyWorkGroup.ts';
import { summarizeCompletionUnits } from '../src/study/completionMetrics.ts';
import { cloneOriginalItemForMakeup, effectiveTemplatePresetKey, mergeMakeupProgress } from '../src/study/makeup.ts';
import { reconcileCalendarNaturalPriorCoverage } from '../src/study/calendarNaturalCompletion.ts';

const date = '2026-09-02';
function row(id: string, title: string, description: string): CalendarTaskRow {
  return { event_key: `primary:${id}`, source_event_id: id, calendar_id: 'primary', event_date: date, title, description, category: 'natural' };
}
// Descriptions reproduced from the two Google Calendar events read on 2026-09-04.
const biology = row('biology', '生物｜光合作用', '`【講義版本】123日的淬鍊 【頁碼範圍】p.16–18 【重點】光合作用 【識別碼】GSAT-SPLIT-NATURAL-2026-09-02`\n\n');
const chemistry = row('chemistry', '化學｜原子結構、同位素與週期表', '`【講義版本】123日的淬鍊 【頁碼範圍】p.45–62 【來源日期】2026/8/24 【重點】原子結構、同位素與週期表 【識別碼】GSAT-SPLIT-\nNATURAL-2026-08-24`\n\n');
const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));

function loadRuntime(ctx: ReturnType<typeof createContext>, names: string[]) {
  for (const name of names) {
    const start = runtime.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    const end = runtime.slice(start + 1).search(/\n(?:async )?function /);
    runInContext(runtime.slice(start, start + 1 + end), ctx);
  }
}

// Exercise the real runtime orchestration without network, DOM, or user storage.
function app(rows = [biology, chemistry]) {
  const ctx = createContext({
    buildCalendarStudyTaskPlan, resolveNaturalCalendarPlan, combineNaturalCalendarPlans,
    calendarFixedTemplate, dedupePresetDefinitions, presetDefinitionSemanticKey,
    groupDailyWorkItems, ungroupDailyWorkItems, applyDailyWorkRangeOverrides,
    effectiveTemplatePresetKey, reconcileCalendarNaturalPriorCoverage,
    cloneObj: clone, cloneValue: clone,
    calendarConnected: true, calendarCacheLoaded: true, DAILY_PRESET_START: '2026-08-17',
    CALENDAR_NATURAL_RECOMMENDED_PAGES: {
      [date]: { subject: '生物', material: '123日的淬鍊', label: '光合作用', basis: 'unit fallback', ranges: [[16, 20]] },
    },
    normalizeItem: () => {}, ensureInteractiveEntries: () => [],
    applyCalendarMathPlan: () => false, ensureDeferredForDate: () => false,
    completedNaturalIntervalsBefore: (_date: string, subject: string) => subject === '化學' ? [[45, 62]] : [],
  });
  loadRuntime(ctx, ['naturalRecommendationByTopic', 'buildCalendarRuntime', 'calendarNaturalRecommended',
    'calendarNaturalRanges', 'calendarNaturalPriorCoverage', 'applyCalendarNaturalRecommended',
    'calendarEventToken', 'calendarIdentifierToken', 'cloudCalendarDefsForDate', 'presetDef', 'makePresetItem',
    'calendarEventKeysFromFields', 'itemTitle', 'isCalendarNatural', 'isCalendarNaturalIntegration',
    'groupedWorkEntries', 'isGroupedWork', 'deferredCarryOriginIds', 'groupedEntryMatch',
    'mergeGroupedEntry', 'reconcileGroupedWorkEntries', 'ensureDailyPresets']);
  ctx.presetsForDate = (day: string) => dedupePresetDefinitions(ctx.cloudCalendarDefsForDate(day));
  ctx.buildCalendarRuntime(rows);
  return ctx;
}

test('the real September 2 note parses biology as 16–18, despite its outer backticks', () => {
  const parsed = parseCalendarTask(biology);
  assert.equal(parsed.kind, 'natural');
  if (parsed.kind !== 'natural') throw new Error('Expected natural');
  assert.deepEqual([parsed.startPage, parsed.endPage], [16, 18]);
  assert.equal(resolveNaturalCalendarPlan(parsed)?.material, '123日的淬鍊');
});

test('runtime cards keep biology and chemistry pages independent in either fetch order', () => {
  for (const rows of [[biology, chemistry], [chemistry, biology]]) {
    const ctx = app(rows);
    const defs = ctx.cloudCalendarDefsForDate(date);
    const bio = defs.find((def: any) => def.f.subject === '生物');
    const chem = defs.find((def: any) => def.f.subject === '化學');
    assert.deepEqual([bio.f.start, bio.f.end], ['16', '18']);
    assert.deepEqual([chem.f.start, chem.f.end], ['45', '62']);
    assert.equal(bio.required, true);
    assert.equal(chem.required, false);
    assert.match(bio.description, /p\.16–18/);
    assert.doesNotMatch(bio.description, /45–62/);
  }
});

test('runtime locks Chinese pages and English topic plus round from Calendar', () => {
  const rows = [
    row('deep-fifteen', '國文｜深耕十五', '【頁碼範圍】p.8–25【識別碼】deep-01'),
    row('english-cloze', '英文｜主題百匯 克漏字｜新新世代', '【單元進度】第二回【頁碼範圍】p.2–4【識別碼】cloze-01'),
  ];
  const ctx = app(rows);
  const defs = ctx.cloudCalendarDefsForDate(date);
  const chinese = defs.find((definition: any) => definition.f.book === '深耕十五');
  const english = defs.find((definition: any) => definition.f.title === '主題百匯：克漏字');

  assert.equal(chinese.type, 'chineseReading');
  assert.equal(chinese.f.kind, 'book');
  assert.deepEqual([chinese.f.start, chinese.f.end], ['8', '25']);
  assert.equal(chinese.f.calendarBookRangeLocked, true);
  assert.equal(english.type, 'extra');
  assert.deepEqual([english.f.topic, english.f.round], ['新新世代', '第二回']);
  assert.equal(english.f.start, undefined);
  assert.equal(english.f.end, undefined);
  assert.equal(english.f.calendarBookRangeLocked, true);
  assert.equal(chinese.f.calendarEventKey, 'primary:deep-fifteen');
  assert.equal(english.f.calendarEventKey, 'primary:english-cloze');
});

test('existing wrong pages repair on reconciliation/reload without losing time or explicit completion', () => {
  const ctx = app();
  let rec = { date, items: ctx.cloudCalendarDefsForDate(date).map((def: any) => ctx.makePresetItem(def, date)) };
  const bio = rec.items.find((item: any) => item.f.subject === '生物');
  bio.f.start = '45'; bio.f.end = '62'; bio.minutes = '27';
  bio.done = true; bio.f.calendarCompletionSetByUser = true;
  ctx.ensureDailyPresets(rec, date);
  rec = clone(rec);
  ctx.ensureDailyPresets(rec, date);
  const fixed = ungroupDailyWorkItems(rec.items).find(item => item.f.subject === '生物')!;
  assert.deepEqual([fixed.f.start, fixed.f.end], ['16', '18']);
  assert.equal(fixed.minutes, '27');
  assert.equal(fixed.done, true);
});

test('all natural cards get their own coverage; chemistry completion does not mark biology done', () => {
  const ctx = app();
  const rec = { date, items: ctx.cloudCalendarDefsForDate(date).map((def: any) => ctx.makePresetItem(def, date)) };
  ctx.applyCalendarNaturalRecommended(rec, date);
  const bio = rec.items.find((item: any) => item.f.subject === '生物');
  const chem = rec.items.find((item: any) => item.f.subject === '化學');
  assert.equal(bio.done, false);
  assert.equal(bio.f.calendarSuggestedTotalPages, 3);
  assert.equal(bio.f.calendarSuggestedDonePages, 0);
  assert.equal(chem.done, true);
  assert.equal(chem.f.calendarSuggestedTotalPages, 18);
  assert.equal(chem.f.calendarSuggestedDonePages, 18);
});

test('separate ranges of the same subject survive grouped-card creation and reload', () => {
  const extra = row('biology-2', '生物｜另一單元', '【講義版本】123日的淬鍊【頁碼範圍】30–32');
  const ctx = app([biology, extra, chemistry]);
  const rec = { date, items: [] };
  ctx.ensureDailyPresets(rec, date);
  ctx.ensureDailyPresets(rec, date);
  const leaves = ungroupDailyWorkItems(rec.items).flatMap(item => item.f.groupedWorkEntries || [item]).filter(item => item.f.subject === '生物');
  assert.deepEqual(leaves.map(item => [item.f.start, item.f.end]).sort(), [['16', '18'], ['30', '32']]);
  assert.ok(leaves.every(item => item.f.calendarSuggestedTotalPages === 3));
});

test('manual range edits remain authoritative after repairing the Calendar defaults', () => {
  const ctx = app();
  const rec = { date, items: ctx.cloudCalendarDefsForDate(date).map((def: any) => ctx.makePresetItem(def, date)) };
  const bio = rec.items.find((item: any) => item.f.subject === '生物');
  bio.f.dailyWorkUserFields = { start: '17', end: '19' };
  ctx.ensureDailyPresets(rec, date);
  const fixed = ungroupDailyWorkItems(rec.items).find(item => item.f.subject === '生物')!;
  assert.deepEqual([fixed.f.start, fixed.f.end], ['17', '19']);
});

test('another subject/material cannot supply fallback pages for an event', () => {
  const task = parseCalendarTask(row('missing', '生物｜光合作用', '【講義版本】好考點'));
  if (task.kind !== 'natural') throw new Error('Expected natural');
  const fallback = { subject: '生物', material: '123日的淬鍊', label: '光合作用', basis: '', ranges: [[16, 20]] as [number, number][] };
  assert.equal(resolveNaturalCalendarPlan(task, fallback), null);
  assert.deepEqual(resolveNaturalCalendarPlan({ ...task, material: '123日的淬鍊' }, fallback)?.ranges, [[16, 20]]);
  assert.equal(resolveNaturalCalendarPlan(task, { ...fallback, subject: '化學', material: '好考點' }), null);
});

test('adjacent merged events keep a union; unrelated events are not combined', () => {
  const first = { subject: '生物', material: '123日的淬鍊', label: 'A', basis: '', ranges: [[16, 18]] as [number, number][] };
  const second = { ...first, label: 'B', ranges: [[19, 21]] as [number, number][] };
  assert.deepEqual(combineNaturalCalendarPlans([first, second, first])?.ranges, [[16, 21]]);
  assert.equal(combineNaturalCalendarPlans([first, { ...second, subject: '化學' }]), null);
});

test('deferral and repeated deferral refresh inherited wrong pages and retain makeup user data', () => {
  const ctx = app();
  const original = ctx.makePresetItem(ctx.cloudCalendarDefsForDate(date)[0], date);
  const carried = cloneOriginalItemForMakeup(original, { id: 'carry', presetKey: 'deferred_bio', originDate: date });
  const existing = clone(carried);
  existing.f.start = '45'; existing.f.end = '62'; existing.minutes = '15'; existing.f.reason = '保留筆記';
  const repaired = mergeMakeupProgress(carried, existing);
  assert.deepEqual([repaired.f.start, repaired.f.end], ['16', '18']);
  assert.equal(repaired.minutes, '15');
  assert.equal(repaired.f.reason, '保留筆記');
  const second = cloneOriginalItemForMakeup(repaired, { id: 'carry-again', presetKey: 'deferred_again', originDate: '2026-09-03' });
  assert.deepEqual([second.f.start, second.f.end], ['16', '18']);
  existing.f.dailyWorkUserFields = { end: '19' };
  assert.equal(mergeMakeupProgress(carried, existing).f.end, '19');
});

test('each child of a deferred natural group keeps its own pages and manual edits', () => {
  const ctx = app();
  const bio = ctx.makePresetItem(ctx.cloudCalendarDefsForDate(date)[0], date);
  const second = clone(bio);
  second.id = 'bio-second'; second.presetKey = 'cal_natural_second';
  second.f.calendarEventKey = 'primary:bio-second'; second.f.start = '30'; second.f.end = '32';
  const parent = { ...bio, f: { ...bio.f, groupedWorkEntries: [bio, second] } };
  const existing = clone(parent);
  existing.f.groupedWorkEntries[0].f.start = '45';
  existing.f.groupedWorkEntries[0].f.end = '62';
  existing.f.groupedWorkEntries[1].f.dailyWorkUserFields = { end: '33' };
  const merged = mergeMakeupProgress(parent, existing);
  assert.deepEqual(merged.f.groupedWorkEntries!.map(item => [item.f.start, item.f.end]), [['16', '18'], ['30', '33']]);
});

function editingApp(day: string, separated: boolean | 'biology', deferred = false) {
  const current = { ...row('chem-today', '化學｜反應熱、能量圖與催化', '【講義版本】123日的淬鍊【頁碼範圍】109–114'), event_date: day };
  const makeup = { ...row('chem-makeup', '化學｜原子結構', '【講義版本】123日的淬鍊【頁碼範圍】45–62【來源日期】2026/8/24'), event_date: day };
  const ctx = app(separated === 'biology' ? [current, { ...biology, event_date: day }] : separated ? [current, makeup] : [current]);
  const elements = new Map<string, { innerHTML: string; textContent: string }>();
  Object.assign(ctx, {
    propagateDailyWorkField, propagateDailyWorkRangeField, summarizeCompletionUnits,
    data: { date: day, items: [] },
    loadData: (date: string) => ({ date, items: [] }),
    visibleItems: (record: any) => record.items,
    completionUnitsForRecord: () => [],
    id: (id: string) => { if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '' }); return elements.get(id); },
    weekdays: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
    esc: (value: unknown) => String(value ?? ''),
    selected: (a: unknown, b: unknown) => a === b ? ' selected' : '',
    checked: (value: unknown) => value ? ' checked' : '',
    isCalendarPageMappedBook: () => false,
    scienceMaterialOptions: () => '<option>123日的淬鍊</option>',
    calendarTopicSourceRow: () => '',
  });
  const mapStart = runtime.indexOf('var DAY123_PAGE_MAPS=');
  runInContext(runtime.slice(mapStart, runtime.indexOf('function day123PageMap(', mapStart)), ctx);
  loadRuntime(ctx, ['pad', 'dateString', 'parseDate', 'mondayOf', 'findRecursive', 'findItem',
    'isWeeklyCalendarItem', 'studyRecordForOverview', 'completionMetricsForWeek', 'renderWeeklyItems',
    'day123PageMap', 'day123Matches', 'day123Text', 'normalizeScience', 'reasonField',
    'renderScienceFields', 'refreshAuto', 'handleInput', 'handleChange']);
  ctx.ensureDailyPresets(ctx.data, day);
  if (deferred) {
    const carried = cloneOriginalItemForMakeup(ctx.data.items[0], { id: 'carried-chemistry', presetKey: 'deferred_chemistry', originDate: '2026-08-31' });
    carried.f.start = '45'; carried.f.end = '62';
    carried.f.dailyWorkUserFields = { start: '45', end: '62' };
    ctx.data.items.push(carried);
    ctx.ensureDailyPresets(ctx.data, day);
  }
  ctx.updateSummary = () => ctx.completionMetricsForWeek(day, 6);
  ctx.persist = () => { ctx.saved = clone(ctx.data); };
  ctx.scheduleInputPersist = () => ctx.persist();
  ctx.render = () => {
    ctx.html = ctx.renderScienceFields(ctx.findItem(ctx.targetId), false);
    ctx.updateSummary();
    ctx.renderWeeklyItems();
  };
  const target = ctx.data.items.flatMap((x: any) => x.f.groupedWorkEntries || [x])
    .find((x: any) => x.f.calendarEventKey === current.event_key && !x.deferredCarry);
  ctx.targetId = target.id;
  const chapter = { textContent: '' };
  const card = { getAttribute: () => ctx.targetId, querySelector: () => chapter };
  const control = (kind: 'field' | 'check', key: string, value: string | boolean) => ({
    target: {
      closest: () => card,
      matches: (selector: string) => selector === `[data-${kind}]`,
      getAttribute: () => key,
      value: String(value), checked: value === true,
    },
  });
  return { ctx, target, chapter, control };
}

test('chemistry 109–114 maps only to Chapter 3; page boundaries are unchanged', () => {
  const { ctx } = editingApp('2026-09-04', false);
  assert.equal(ctx.day123Text('化學', '109', '114'), 'Chapter 3 物質間的反應（p.109–114）');
  assert.equal(ctx.day123Text('化學', '128', '129'), 'Chapter 3 物質間的反應（p.128）、Chapter 4 水溶液中的反應（p.129）');
});

test('regression fixture reproduces stale chapters and ignored correction with the old live-summary path', () => {
  const { ctx, chapter, control } = editingApp('2026-09-04', 'biology');
  // Reproduce the removed behaviour to ensure this fixture exercises the lost-ID bug,
  // not merely a different object reference with otherwise working interactions.
  ctx.studyRecordForOverview = (day: string) => {
    const rec = day === ctx.data.date ? ctx.data : ctx.loadData(day);
    ctx.ensureDailyPresets(rec, day);
    return rec;
  };
  ctx.handleInput(control('field', 'end', '1'));
  assert.equal(ctx.findItem(ctx.targetId), null, 'the old regrouping should orphan the rendered child');
  const staleChapter = chapter.textContent;
  ctx.handleInput(control('field', 'end', '114'));
  assert.equal(chapter.textContent, staleChapter);
  assert.match(staleChapter, /Chapter 0/);
  ctx.html = '';
  ctx.handleChange(control('check', 'corrected', true));
  assert.equal(ctx.html, '', 'the old handler cannot reveal correction without a matching item');
});

test('weekly rendering and settlement calculation never replace the current editing graph', () => {
  for (const day of ['2026-09-01', '2026-09-04', '2026-09-06']) {
    const { ctx, target } = editingApp(day, true);
    const items = ctx.data.items;
    const before = JSON.stringify(ctx.data);
    ctx.renderWeeklyItems();
    ctx.completionMetricsForWeek(day, 6);
    assert.equal(ctx.data.items, items, `${day}: live item array replaced`);
    assert.equal(ctx.findItem(target.id), target, `${day}: live child replaced`);
    assert.equal(JSON.stringify(ctx.data), before, `${day}: live content changed`);
  }
});

test('typing pages then checking correction preserves the card target and reveals the reason field', () => {
  for (const [separated, deferred] of [[false, false], [true, false], [false, true], ['biology', false]] as const) {
    const { ctx, target, chapter, control } = editingApp('2026-09-04', separated, deferred);
    // The first digit overlaps a makeup range; a read-only summary must not regroup the live card.
    for (const value of ['1', '10', '109']) {
      ctx.handleInput(control('field', 'start', value));
      assert.equal(ctx.findItem(ctx.targetId), target, 'input lost its live card');
    }
    for (const value of ['', '1', '11', '114']) {
      ctx.handleInput(control('field', 'end', value));
      assert.equal(ctx.findItem(ctx.targetId), target, 'partial end page orphaned the card');
    }
    assert.equal(chapter.textContent, 'Chapter 3 物質間的反應（p.109–114）');
    ctx.handleChange(control('check', 'corrected', true));
    assert.match(ctx.html, /data-field="reason"/);
    const siblings = ctx.data.items.flatMap((x: any) => x.f.groupedWorkEntries || [x]).filter((x: any) => x.id !== ctx.targetId);
    assert.ok(siblings.every((x: any) => !x.f.corrected), 'correction leaked to another child');
    ctx.handleInput(control('field', 'reason', '反應熱的正負號'));
    ctx.handleChange(control('check', 'corrected', false));
    assert.doesNotMatch(ctx.html, /data-field="reason"/);
    ctx.handleChange(control('check', 'corrected', true));
    assert.match(ctx.html, /反應熱的正負號/);
    ctx.data = clone(ctx.saved);
    ctx.ensureDailyPresets(ctx.data, ctx.data.date);
    const reloaded = ctx.data.items.flatMap((x: any) => x.f.groupedWorkEntries || [x])
      .find((x: any) => x.f.calendarEventKey === 'primary:chem-today' && !x.deferredCarry);
    assert.deepEqual([reloaded.f.start, reloaded.f.end], ['109', '114']);
    assert.equal(reloaded.f.corrected, true);
    assert.equal(reloaded.f.reason, '反應熱的正負號');
    assert.match(ctx.renderScienceFields(reloaded, false), /反應熱的正負號/);
  }
});

test('overview prepares other days but reads today as an isolated snapshot of unsaved edits', () => {
  const { ctx, target } = editingApp('2026-09-04', false);
  target.f.reason = '尚未儲存的錯因';
  const ensure = ctx.ensureDailyPresets;
  const prepared: string[] = [];
  ctx.ensureDailyPresets = (rec: any, date: string) => { prepared.push(date); return ensure(rec, date); };
  const today = ctx.studyRecordForOverview('2026-09-04');
  assert.equal(today.items[0].f.reason, '尚未儲存的錯因');
  today.items[0].f.reason = '只能修改副本';
  assert.equal(target.f.reason, '尚未儲存的錯因');
  ctx.studyRecordForOverview('2026-09-03');
  assert.deepEqual(prepared, ['2026-09-03']);
});
