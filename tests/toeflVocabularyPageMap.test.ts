import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCalendarTask, type CalendarTaskRow } from '../src/calendar/calendarBridge.ts';
import {
  BOOK_PAGE_MAPS,
  bookPageDetailText,
  bookPageMatches,
  bookPageText,
  bookPageTopicText,
  bookTopics,
  canonicalPageMappedBook,
  isEnglishPageMappedBook,
  pageMappedBookUsesScopeSelection,
  TOEFL_VOCABULARY_3800_BOOK,
} from '../src/data/bookPageMaps.ts';
import { numberedStudyScope } from '../src/data/numberedScopes.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import { materialProgressRows, type MaterialProgressRow } from '../src/study/materialProgress.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

const book = TOEFL_VOCABULARY_3800_BOOK;

function item(start: string, end: string, overrides: Partial<StudyItem> = {}): StudyItem {
  return {
    id: 'toefl-pages', type: 'extra', source: 'custom', done: true, minutes: '30', required: false,
    title: `英文｜${book}`, f: { title: book, book, start, end },
    ...overrides,
  };
}

function progress(items: StudyItem[]): MaterialProgressRow {
  const row = materialProgressRows([{ date: '2026-10-23', items }])
    .find(row => row.id === `book:${book}`);
  assert.ok(row);
  return row;
}

function calendarRow(description: string): CalendarTaskRow {
  return {
    event_key: 'primary:toefl', source_event_id: 'toefl', calendar_id: 'primary',
    event_date: '2026-10-23', title: `英文｜${book}｜RANK 1`, description, category: 'studyItem',
  };
}

test('TOEFL aliases select the English page template, never infer Unit/round or pages from 3800/RANK', () => {
  for (const title of [book, '英文｜TOEFL 托福決戰字彙 3800｜RANK 1', '托福決戰字彙3800', '托福決戰字匯3800']) {
    assert.equal(canonicalPageMappedBook(title), book);
    assert.equal(isEnglishPageMappedBook(title), true);
    assert.equal(pageMappedBookUsesScopeSelection(title), false);
    assert.equal(numberedStudyScope({ title }), null);
  }
  assert.equal(canonicalPageMappedBook('TOEFL 其他字彙3800'), null);
  assert.equal(canonicalPageMappedBook('TOEFL托福決戰字彙3000'), null);
});

test('TOEFL maps every supplied TOC start continuously through printed page 298', () => {
  const expected = [
    [1, 'RANK 1', '字彙'], [11, 'RANK 1', 'TIPS：開始留學的準備工作'],
    [21, 'RANK 1', 'TIPS：安排適合自己的應考計畫'], [31, 'RANK 1', 'TIPS：看似相近、實則不同的單字'],
    [36, 'RANK 1', 'Vocabulary Building：字首'], [39, 'RANK 1', 'Vocabulary Building：字根'],
    [42, 'RANK 1', 'Vocabulary Building：數字字首'], [44, 'RANK 1', 'Vocabulary Building：聯想法'],
    [45, 'RANK 2', '字彙'], [65, 'RANK 2', 'TIPS：TOEFL 測驗的單字範圍'],
    [85, 'RANK 2', 'TIPS：拼字或發音相似的單字'], [105, 'RANK 2', 'TIPS：關於一字多義'],
    [115, 'RANK 3', '字彙'], [125, 'RANK 3', 'TIPS：閱讀測驗解題法'],
    [145, 'RANK 3', 'TIPS：聽力測驗解題法'], [165, 'RANK 3', 'TIPS：口說測驗解題法'],
    [185, 'RANK 3', 'TIPS：寫作測驗解題法'], [197, 'RANK 4', '字彙'],
    [207, 'RANK 4', 'TIPS：讓語意更清楚的字詞①'], [227, 'RANK 4', 'TIPS：讓語意更清楚的字詞②'],
    [247, 'RANK 4', 'TIPS：讓語意更清楚的字詞③'], [271, '索引', '索引'],
  ] as const;
  const sections = BOOK_PAGE_MAPS[book];
  assert.equal(sections.length, expected.length);
  for (const [index, [start, topic, detail]] of expected.entries()) {
    const end = index + 1 < expected.length ? expected[index + 1][0] - 1 : 298;
    assert.deepEqual(sections[index], { start, end, topic, detail });
    for (const page of [start, end]) {
      assert.equal(bookPageTopicText(book, page, page), topic);
      assert.equal(bookPageDetailText(book, page, page), detail);
    }
  }
});

test('TOEFL cross-RANK lookups clip each range and exclude roman front matter/out-of-book pages', () => {
  assert.equal(bookPageText(book, 44, 45), 'RANK 1｜Vocabulary Building：聯想法（p.44）、RANK 2｜字彙（p.45）');
  assert.equal(bookPageTopicText(book, 270, 271), 'RANK 4、索引');
  assert.equal(bookPageText(book, 298, 298), '索引｜索引（p.298）');
  for (const page of [0, 299, 'iii', 'vi', 'ix']) assert.deepEqual(bookPageMatches(book, page, page), []);
  assert.deepEqual(bookTopics(book), ['RANK 1', 'RANK 2', 'RANK 3', 'RANK 4', '索引']);
});

test('TOEFL progress is supplemental and has only five large page-weighted segments', () => {
  const row = progress([]);
  assert.equal(row.group, '補充');
  assert.equal(row.subject, 'english');
  assert.equal(row.unitLabel, '大單元');
  assert.equal(row.total, 5);
  assert.equal(row.recorded, 0);
  assert.deepEqual(row.segments.map(segment => segment.label), [
    'RANK 1（p.1–44）', 'RANK 2（p.45–114）', 'RANK 3（p.115–196）',
    'RANK 4（p.197–270）', '索引（p.271–298）',
  ]);
  assert.deepEqual(row.segments.map(segment => segment.completionWeight), [44, 70, 82, 74, 28]);
  assert.equal(row.segments.reduce((sum, segment) => sum + segment.completionWeight, 0), 298);
});

test('TOEFL progress records actual pages, deduplicates overlaps, and reaches 100% at 298', () => {
  const row = progress([item('1', '44'), item('11', '50', { id: 'overlap' })]);
  assert.equal(row.recorded, 2);
  assert.deepEqual(row.segments.map(segment => segment.completionPercent), [100, 9, 0, 0, 0]);
  assert.equal(progress([item('1', '298')]).completionPercent, 100);
  assert.equal(progress([item('299', '300')]).recorded, 0);
  assert.equal(progress([item('1', '114', { done: false, minutes: '' })]).recorded, 0);
});

test('TOEFL Calendar import reads structured or explicit pages without interpreting RANK as a numbered template', () => {
  for (const description of ['【頁碼範圍】p.44–45\n【識別碼】toefl-test', 'p.44–45']) {
    const parsed = parseCalendarTask(calendarRow(description));
    assert.equal(parsed.kind, 'bookPages');
    if (parsed.kind !== 'bookPages') continue;
    assert.equal(parsed.subject, '英文');
    assert.equal(parsed.book, book);
    assert.equal(parsed.startPage, 44);
    assert.equal(parsed.endPage, 45);
  }
  const missing = parseCalendarTask(calendarRow(''));
  assert.equal(missing.kind, 'bookPages');
  if (missing.kind === 'bookPages') {
    assert.equal(missing.startPage, null);
    assert.equal(missing.endPage, null);
  }
});

test('TOEFL book/pages/completion survive the existing record codec without a new schema', () => {
  const record: StudyRecord = {
    schemaVersion: 2, date: '2026-10-23',
    items: [item('1', '114', { checkedOn: '2026-10-23' })],
  };
  const decoded = decodeStudyRecord(encodeStudyRecord(record));
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.record, record);
  const row = progress(decoded.record.items);
  assert.equal(row.completionPercent, 38);
  assert.deepEqual(row.segments.map(segment => segment.completionPercent), [100, 100, 0, 0, 0]);
});
