import { AZAR_GRAMMAR_BOOK_TITLE } from './azarGrammar.ts';
import { ENGLISH_HIGH_FREQUENCY_VOCABULARY_BOOK, ENGLISH_MIXED_30_BOOK, ENGLISH_TOPIC_CLOZE_BOOK, ENGLISH_TOPIC_READING_BOOK, ENGLISH_WEEKLY_PLAN_BOOK, TOEFL_VOCABULARY_3800_BOOK, UNLOCK_3_BOOK } from './bookPageMaps.ts';

export const LISTENING_TEST_BOOK_TITLE = '大考英聽A攻略';
export const LISTENING_TEST_MIN = 1;
export const LISTENING_TEST_MAX = 10;

export const GSAT_ENGLISH_TITLES = ['ACE Reading', '英文寫作測驗', ENGLISH_WEEKLY_PLAN_BOOK, ENGLISH_MIXED_30_BOOK, ENGLISH_HIGH_FREQUENCY_VOCABULARY_BOOK, ENGLISH_TOPIC_READING_BOOK, ENGLISH_TOPIC_CLOZE_BOOK, '英文文法總複習講義', LISTENING_TEST_BOOK_TITLE];
export const SUPPLEMENT_ENGLISH_TITLES = ['雜誌', AZAR_GRAMMAR_BOOK_TITLE, 'Essential Grammar in Use', UNLOCK_3_BOOK, TOEFL_VOCABULARY_3800_BOOK,
  'Prism Reading', 'Traumaland- Josh Silver', 'Warriors- Erin Hunter', 'NEW TOEIC 新制多益900+ 高頻必考字彙',
  '英文字彙王: 核心單字2001~ 4000', '英文字彙王: 核心單字4001~ 6000', 'ENGLISH VOCABULARY IN USE', '學一次用一輩子的字首．字根．字尾'];

export function isListeningTestBookTitle(value: unknown): boolean {
  const title = String(value ?? '').trim();
  return title === LISTENING_TEST_BOOK_TITLE || title === `英文：${LISTENING_TEST_BOOK_TITLE}`;
}

/** Reads `Test N` and `Test N-M` scopes while rejecting tests outside the book's 1-10 range. */
export function listeningTestNumbers(value: string): number[] {
  const tests = new Set<number>();
  const pattern = /\bTest\s*(\d+)(?:\s*[–—~\-至到]\s*(?:Test\s*)?(\d+))?/gi;
  for (const match of value.matchAll(pattern)) {
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) continue;
    for (let test = start; test <= end; test += 1) {
      if (test >= LISTENING_TEST_MIN && test <= LISTENING_TEST_MAX) tests.add(test);
    }
  }
  return [...tests].sort((left, right) => left - right);
}
