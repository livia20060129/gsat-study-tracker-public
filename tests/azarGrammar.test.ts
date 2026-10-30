import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { unitBook } from '../src/data/unitBooks.ts';
import { numberedStudyScope, usesSharedNumberedTemplate } from '../src/data/numberedScopes.ts';

import { parseCalendarTask, type CalendarTaskRow } from '../src/calendar/calendarBridge.ts';
import {
  AZAR_GRAMMAR_BOOK_TITLE,
  AZAR_GRAMMAR_CHAPTERS,
  AZAR_GRAMMAR_SECTIONS,
  azarGrammarChapterSummary,
  azarGrammarChaptersForPages,
  azarGrammarPageSummary,
  isAzarGrammarIdentifier,
  isAzarGrammarBookTitle,
} from '../src/data/azarGrammar.ts';
import { applyDailyWorkRangeOverrides, propagateDailyWorkRangeField } from '../src/study/dailyWorkGroup.ts';
import { mergeAzarSectionProgress } from '../src/study/azarChapterCards.ts';
import { dedupePresetDefinitions } from '../src/study/presetDedup.ts';
import { isInteractiveStudyItem } from '../src/study/interactiveTasks.ts';
import type { StudyItem } from '../src/types.ts';

function row(title: string, description: string, category = 'other'): CalendarTaskRow {
  return {
    event_key: 'primary:azar-1',
    source_event_id: 'azar-1',
    calendar_id: 'primary',
    event_date: '2026-09-11',
    title,
    description,
    category,
  };
}

test('Azar intermediate table contains all 14 chapters and 149 mapped sections', () => {
  assert.equal(AZAR_GRAMMAR_CHAPTERS.length, 14);
  assert.equal(AZAR_GRAMMAR_SECTIONS.length, 149);
  assert.equal(AZAR_GRAMMAR_CHAPTERS[0].label, '第一章：現在式');
  assert.equal(AZAR_GRAMMAR_CHAPTERS[13].label, '第十四章：名詞子句');
});

test('maps Calendar pages to the requested chapter and subsection labels', () => {
  const chapters = azarGrammarChaptersForPages(31, 43);
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].label, '第二章：過去式');
  assert.deepEqual(chapters[0].sections.map(section => section.code), ['2-1', '2-2', '2-3', '2-4', '2-5']);
  assert.equal(chapters[0].sections[0].title, '過去簡單式：規則變化動詞');
});

test('keeps same-page Azar mappings distinct and rejects pages outside the photographed chapters', () => {
  assert.deepEqual(
    azarGrammarChaptersForPages(85, 85)[0].sections.map(section => section.code),
    ['3-9', '3-10'],
  );
  assert.deepEqual(azarGrammarChaptersForPages(429, 430), []);
});

test('recognizes current GSAT and legacy GAST Azar event identifiers', () => {
  assert.equal(isAzarGrammarIdentifier('GAST-AZAR-2026-001'), true);
  assert.equal(isAzarGrammarIdentifier(' GAST-AZAR-2026-XXX '), true);
  assert.equal(isAzarGrammarIdentifier('GSAT-AZAR-2026-001'), true);
  assert.equal(isAzarGrammarIdentifier('GSAT-AZAR-2026-W07'), true);
  assert.equal(isAzarGrammarIdentifier('GSAT-OTHER-2026-W07'), false);
});

test('Azar reads printed-page notes without a material-version field', () => {
  const parsed = parseCalendarTask(row(
    '本週項目｜英文｜本週文法',
    `【頁碼範圍】p.18–29
【重點】自由文字 p.300 不得干擾
【識別碼】GSAT-AZAR-2026-W03`,
  ));
  assert.equal(parsed.kind, 'azarGrammar');
  if (parsed.kind !== 'azarGrammar') throw new Error('Expected Azar grammar');
  assert.equal(parsed.route, 'week');
  assert.deepEqual([parsed.startPage, parsed.endPage], [18, 29]);
  assert.deepEqual(parsed.chapters[0].sections.map(section => section.code), ['1-6', '1-7']);
});

test('Azar legacy page labels use the same natural-science page range fallback', () => {
  const parsed = parseCalendarTask(row(
    '英文｜Azar英文文法（中階）',
    '頁碼範圍：18–29 頁\n識別碼：GAST-AZAR-2026-003',
  ));
  assert.equal(parsed.kind, 'azarGrammar');
  if (parsed.kind !== 'azarGrammar') throw new Error('Expected Azar grammar');
  assert.deepEqual([parsed.startPage, parsed.endPage], [18, 29]);
});

test('Calendar parser gives Azar its own kind before the generic grammar parser', () => {
  const parsed = parseCalendarTask(row(
    `英文｜${AZAR_GRAMMAR_BOOK_TITLE}`,
    '【頁碼範圍】p.31–43\n【來源日期】2026/9/10\n【識別碼】GAST-AZAR-2026-001',
    'grammar',
  ));

  assert.equal(parsed.kind, 'azarGrammar');
  assert.equal(parsed.identifier, 'GAST-AZAR-2026-001');
  if (parsed.kind !== 'azarGrammar') throw new Error('Expected Azar grammar');
  assert.equal(parsed.book, AZAR_GRAMMAR_BOOK_TITLE);
  assert.deepEqual([parsed.startPage, parsed.endPage], [31, 43]);
  assert.equal(parsed.chapters[0].label, '第二章：過去式');
  assert.deepEqual(parsed.chapters[0].sections.map(section => section.code), ['2-1', '2-2', '2-3', '2-4', '2-5']);
});

test('recognizes the deployed title without 系列 and maps p.18–29 to two sections', () => {
  const parsed = parseCalendarTask(row(
    'Azar英文文法（中階）｜W1｜Ch.1 現在式',
    '【頁碼範圍】p.18–29\n【識別碼】GAST-AZAR-2026-003',
  ));
  assert.equal(parsed.kind, 'azarGrammar');
  if (parsed.kind !== 'azarGrammar') throw new Error('Expected Azar grammar');
  assert.deepEqual(parsed.chapters[0].sections.map(section => section.code), ['1-6', '1-7']);
  assert.deepEqual(
    parsed.chapters[0].sections.map(section =>
      `${AZAR_GRAMMAR_BOOK_TITLE}｜Ch.${section.chapter} ${section.chapterTitle}｜${section.code}${section.title}`),
    [
      'Azar英文文法（中階）｜Ch.1 現在式｜1-6通常不用於進行式的動詞',
      'Azar英文文法（中階）｜Ch.1 現在式｜1-7現在式動詞：Yes/No問句之簡答',
    ],
  );
});

test('identifier alone selects Azar and builds one Tracker row per chapter', () => {
  const parsed = parseCalendarTask(row(
    '英文文法｜本日進度',
    '【頁碼範圍】31–39\n【識別碼】GAST-AZAR-2026-002',
    'grammar',
  ));
  assert.equal(parsed.kind, 'azarGrammar');

  const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
  const context = createContext({
    AZAR_GRAMMAR_BOOK_TITLE,
    isInteractiveStudyItem,
    calendarParsedByDate: { '2026-09-11': [parsed] },
  });
  for (const name of ['calendarEventToken', 'calendarIdentifierToken', 'calendarAzarChapterDef', 'presetDef', 'cloudCalendarDefsForDate']) {
    const start = runtime.indexOf(`function ${name}(`);
    const relativeEnd = runtime.slice(start + 1).search(/\n(?:async )?function /);
    assert.ok(start >= 0 && relativeEnd >= 0, name);
    runInContext(runtime.slice(start, start + 1 + relativeEnd), context);
  }

  const definitions = context.cloudCalendarDefsForDate('2026-09-11');
  assert.equal(definitions.length, 1);
  assert.deepEqual(
    Array.from(definitions, (definition: { title: string }) => String(definition.title)),
    ['Azar英文文法（中階）｜Ch.2 過去式'],
  );
  assert.ok(definitions.every((definition: { f: { groupedWorkEntries?: unknown } }) => !definition.f.groupedWorkEntries));
  assert.ok(definitions.every((definition: { f: { calendarTopic: string; calendarBookRangeLocked: boolean } }) =>
    definition.f.calendarTopic === parsed.title && definition.f.calendarBookRangeLocked === false));
  assert.deepEqual(Array.from(definitions, (definition: { f: { start: string; end: string } }) =>
    [definition.f.start, definition.f.end]), [['31', '39']]);
  assert.equal(definitions[0].f.azarSectionCode, undefined);
});

test('adjacent Azar Calendar ranges in the same chapter merge without subsection labels', () => {
  const first = parseCalendarTask(row('Azar英文文法（中階）｜Ch.1 現在式',
    '【頁碼範圍】p.18–20\n【識別碼】GSAT-AZAR-2026-W03'));
  const second = parseCalendarTask({ ...row('Azar英文文法（中階）｜Ch.1 現在式',
    '【頁碼範圍】p.21\n【識別碼】GSAT-AZAR-2026-W04'), event_key: 'primary:azar-2', source_event_id: 'azar-2' });
  const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
  const context = createContext({
    AZAR_GRAMMAR_BOOK_TITLE,
    isInteractiveStudyItem,
    calendarParsedByDate: { '2026-09-11': [first, second] },
  });
  for (const name of ['calendarEventToken', 'calendarIdentifierToken', 'calendarAzarChapterDef', 'presetDef', 'cloudCalendarDefsForDate']) {
    const start = runtime.indexOf(`function ${name}(`);
    const relativeEnd = runtime.slice(start + 1).search(/\n(?:async )?function /);
    assert.ok(start >= 0 && relativeEnd >= 0, name);
    runInContext(runtime.slice(start, start + 1 + relativeEnd), context);
  }
  const definitions = dedupePresetDefinitions(context.cloudCalendarDefsForDate('2026-09-11'));
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0].title, 'Azar英文文法（中階）｜Ch.1 現在式');
  assert.deepEqual([definitions[0].f.start, definitions[0].f.end], ['18', '21']);
  assert.deepEqual(definitions[0].f.calendarEventKeys, ['primary:azar-1', 'primary:azar-2']);
  assert.equal(azarGrammarChapterSummary('18', '21'), '第一章：現在式');
});

test('old Azar subsection progress migrates to one chapter card only once', () => {
  const chapter = {
    id: 'chapter', type: 'extra', done: true, minutes: '12', required: true,
    f: { title: AZAR_GRAMMAR_BOOK_TITLE, azarSectionCode: '1-6', round: '1-6' },
  } as StudyItem;
  const sections = [
    { id: 'old-1', type: 'extra', done: true, checkedOn: '2026-09-11', minutes: '12', required: true, f: { azarSectionCode: '1-6' } },
    { id: 'old-2', type: 'extra', done: false, minutes: '8', required: true, f: { azarSectionCode: '1-7' } },
  ] as StudyItem[];
  assert.equal(mergeAzarSectionProgress(chapter, sections, false), true);
  assert.equal(chapter.done, false);
  assert.equal(chapter.minutes, '20');
  assert.equal(chapter.checkedOn, undefined);
  assert.equal(chapter.f.azarSectionCode, undefined);
  assert.equal((chapter.f.azarLegacySections as StudyItem[]).length, 2);
  assert.equal(mergeAzarSectionProgress(chapter, sections, true), false);
  assert.equal(chapter.minutes, '20');

  const alreadyEdited = {
    id: 'edited-chapter', type: 'extra', done: true, minutes: '45', required: true,
    checkedOn: '2026-09-12', f: { title: AZAR_GRAMMAR_BOOK_TITLE },
  } as StudyItem;
  assert.equal(mergeAzarSectionProgress(alreadyEdited, sections, true), true);
  assert.equal(alreadyEdited.minutes, '45');
  assert.equal(alreadyEdited.done, true);
  assert.equal(alreadyEdited.checkedOn, '2026-09-12');

  const editedRange = {
    id: 'edited-range', type: 'extra', done: false, minutes: '', required: true,
    f: { title: AZAR_GRAMMAR_BOOK_TITLE, start: '18', end: '21' },
  } as StudyItem;
  const editedSections = sections.map(section => structuredClone(section));
  editedSections[0].f.start = '19';
  editedSections[0].f.end = '20';
  editedSections[0].f.dailyWorkUserFields = { start: '19' };
  editedSections[1].f.start = '21';
  editedSections[1].f.end = '21';
  mergeAzarSectionProgress(editedRange, editedSections, false);
  assert.deepEqual([editedRange.f.start, editedRange.f.end], ['19', '21']);
  assert.deepEqual(editedRange.f.dailyWorkUserFields, { start: '19', end: '21' });
});

test('Calendar Azar card shows natural-style pages, topic, and page-to-chapter mapping', () => {
  const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
  const start = runtime.indexOf('function renderExtraFields(');
  const end = runtime.indexOf('\nfunction renderChineseFields(', start);
  assert.ok(start >= 0 && end > start);
  const context = createContext({
    unitBook,
    usesSharedNumberedTemplate,
    AZAR_GRAMMAR_BOOK_TITLE,
    azarGrammarChapterSummary,
    azarGrammarPageSummary,
    isAzarGrammar: isAzarGrammarBookTitle,
    isCalendarAzarGrammar: () => true,
    isPrism: () => false,
    isAce: () => false,
    isEnglishPageMappedBook: () => false,
    isListeningTestBook: () => false,
    isWritingTest: () => false,
    isGrammarReview: () => false,
    readingOptions: () => '',
    calendarTopicSourceRow: (item: StudyItem) => `<label>Google Calendar 當日主題</label>${item.f.calendarTopic}`,
    checked: () => '',
    reasonField: () => '',
    esc: (value: unknown) => String(value ?? ''),
  });
  runInContext(runtime.slice(start, end), context);
  const item = {
    id: 'azar-section', type: 'extra', title: AZAR_GRAMMAR_BOOK_TITLE,
    done: false, minutes: '', required: true, source: 'preset', presetKey: 'cal_azar_test_ch1_1-6',
    f: { title: AZAR_GRAMMAR_BOOK_TITLE, start: '18', end: '27', calendarTopic: 'Azar｜Ch.1 現在式' },
  } as StudyItem;
  const html = context.renderExtraFields(item, false) as string;
  for (const label of ['書名', '起始頁', '結束頁', 'Google Calendar 當日主題', '頁碼對應章節']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /data-field="start" value="18"/);
  assert.match(html, /data-field="end" value="27"/);
  assert.match(html, /第一章：現在式/);
  assert.doesNotMatch(html, /1-6通常不用於進行式的動詞/);
  assert.doesNotMatch(html, /講義版本|頁碼對照/);

  propagateDailyWorkRangeField(item, 'end', '25');
  item.f.end = '27'; // Simulate the next Calendar refresh supplying the suggested range.
  applyDailyWorkRangeOverrides(item);
  assert.equal(item.f.end, '25');
});

test('regrouping a Calendar Azar section keeps its manually recorded page range', () => {
  const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
  const start = runtime.indexOf('function mergeGroupedEntry(');
  const end = runtime.indexOf('\nfunction reconcileGroupedWorkEntries(', start);
  assert.ok(start >= 0 && end > start);
  const context = createContext({
    cloneValue: (value: unknown) => structuredClone(value),
    applyDailyWorkRangeOverrides,
    numberedStudyScope,
  });
  runInContext(runtime.slice(start, end), context);
  const template = {
    presetKey: 'cal_azar_test_ch1_1-6', type: 'extra', done: false, minutes: '',
    f: { title: AZAR_GRAMMAR_BOOK_TITLE, start: '18', end: '27', calendarTopic: '新的當日主題' },
  };
  const old = {
    ...template,
    f: { ...template.f, end: '25', calendarTopic: '舊主題', dailyWorkUserFields: { end: '25' } },
  };
  const merged = context.mergeGroupedEntry(template, old) as StudyItem;
  assert.equal(merged.f.start, '18');
  assert.equal(merged.f.end, '25');
  assert.equal(merged.f.calendarTopic, '新的當日主題');
});
