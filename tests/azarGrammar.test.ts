import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';

import { parseCalendarTask, type CalendarTaskRow } from '../src/calendar/calendarBridge.ts';
import {
  AZAR_GRAMMAR_BOOK_TITLE,
  AZAR_GRAMMAR_CHAPTERS,
  AZAR_GRAMMAR_SECTIONS,
  azarGrammarChaptersForPages,
  isAzarGrammarIdentifier,
} from '../src/data/azarGrammar.ts';

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

test('Azar intermediate table contains all 14 chapters and 149 independently trackable sections', () => {
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

test('keeps same-page Azar subsections separate and rejects pages outside the photographed chapters', () => {
  assert.deepEqual(
    azarGrammarChaptersForPages(85, 85)[0].sections.map(section => section.code),
    ['3-9', '3-10'],
  );
  assert.deepEqual(azarGrammarChaptersForPages(429, 430), []);
});

test('recognizes the exact GAST-AZAR-2026 identifier family', () => {
  assert.equal(isAzarGrammarIdentifier('GAST-AZAR-2026-001'), true);
  assert.equal(isAzarGrammarIdentifier(' GAST-AZAR-2026-XXX '), true);
  assert.equal(isAzarGrammarIdentifier('GSAT-AZAR-2026-001'), false);
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

test('recognizes the deployed title without 系列 and maps p.18–29 to the two expected rows', () => {
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

test('identifier alone still selects Azar and builds a separate Tracker row for every section', () => {
  const parsed = parseCalendarTask(row(
    '英文文法｜本日進度',
    '【頁碼範圍】31–39\n【識別碼】GAST-AZAR-2026-002',
    'grammar',
  ));
  assert.equal(parsed.kind, 'azarGrammar');

  const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
  const context = createContext({
    AZAR_GRAMMAR_BOOK_TITLE,
    calendarParsedByDate: { '2026-09-11': [parsed] },
  });
  for (const name of ['calendarEventToken', 'calendarIdentifierToken', 'calendarAzarSectionDef', 'presetDef', 'cloudCalendarDefsForDate']) {
    const start = runtime.indexOf(`function ${name}(`);
    const relativeEnd = runtime.slice(start + 1).search(/\n(?:async )?function /);
    assert.ok(start >= 0 && relativeEnd >= 0, name);
    runInContext(runtime.slice(start, start + 1 + relativeEnd), context);
  }

  const definitions = context.cloudCalendarDefsForDate('2026-09-11');
  assert.equal(definitions.length, 3);
  assert.deepEqual(
    Array.from(definitions, (definition: { title: string }) => String(definition.title)),
    [
      'Azar英文文法（中階）｜Ch.2 過去式｜2-1過去簡單式：規則變化動詞',
      'Azar英文文法（中階）｜Ch.2 過去式｜2-2表達過去的時間：過去簡單式、不規則變化動詞',
      'Azar英文文法（中階）｜Ch.2 過去式｜2-3常見的不規則變化動詞：參考表',
    ],
  );
  assert.ok(definitions.every((definition: { f: { groupedWorkEntries?: unknown } }) => !definition.f.groupedWorkEntries));
});
