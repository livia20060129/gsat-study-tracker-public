import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOOK_PAGE_MAPS,
  bookDetails,
  bookDetailsForTopic,
  bookPageDetailText,
  bookPageMatches,
  bookPageText,
  bookPageTopicText,
  bookTopics,
  canonicalPageMappedBook,
  CHINESE_TOPIC_BOOK,
  DEEP_FIFTEEN_BOOK,
  ENGLISH_TOPIC_CLOZE_BOOK,
  ENGLISH_TOPIC_READING_BOOK,
  ENGLISH_MIXED_30_BOOK,
  ENGLISH_WEEKLY_PLAN_BOOK,
} from '../src/data/bookPageMaps.ts';
import { cloneOriginalItemForMakeup } from '../src/study/makeup.ts';
import type { StudyItem } from '../src/types.ts';

test('identifies every supported book from punctuation and surrounding Calendar text', () => {
  assert.equal(canonicalPageMappedBook('國文｜深耕十五'), DEEP_FIFTEEN_BOOK);
  assert.equal(canonicalPageMappedBook('主題百匯 閱讀寫作新進化'), CHINESE_TOPIC_BOOK);
  assert.equal(canonicalPageMappedBook('英文｜主題百匯：篇章結構．閱讀測驗'), ENGLISH_TOPIC_READING_BOOK);
  assert.equal(canonicalPageMappedBook('【講義版本】主題百匯 克漏字'), ENGLISH_TOPIC_CLOZE_BOOK);
  assert.equal(canonicalPageMappedBook('英文 學測週計畫'), ENGLISH_WEEKLY_PLAN_BOOK);
  assert.equal(canonicalPageMappedBook('英文｜混合題30篇 實戰演練'), ENGLISH_MIXED_30_BOOK);
  assert.equal(canonicalPageMappedBook('【識別碼】GSAT-ENG-WEEKPLAN'), ENGLISH_WEEKLY_PLAN_BOOK);
  assert.equal(canonicalPageMappedBook('GSAT-ENG-MIXED30'), ENGLISH_MIXED_30_BOOK);
});

test('uses the supplied endings for the two new English lecture books', () => {
  assert.equal(
    bookPageText(ENGLISH_WEEKLY_PLAN_BOOK, 156, 165),
    '學測模擬試題｜第16回（第1～5冊）（p.156–165）',
  );
  assert.equal(
    bookPageText(ENGLISH_WEEKLY_PLAN_BOOK, 183, 191),
    '附錄｜附錄2 113學年度學科能力測驗試題（p.183–191）',
  );
  assert.equal(
    bookPageText(ENGLISH_MIXED_30_BOOK, 62, 63),
    'Chapter 6 聚焦臺灣｜Test 1（p.62–63）',
  );
  assert.equal(bookPageText(ENGLISH_MIXED_30_BOOK, 71, 71), '附錄｜測驗用答案紙（p.71）');
  assert.equal(bookPageText(ENGLISH_MIXED_30_BOOK, 72, 72), '頁碼不在已建立的教材本文範圍內。');
});

test('looks up the requested topic and lesson, level, or round', () => {
  assert.equal(bookPageText(DEEP_FIFTEEN_BOOK, 8, 25), '先秦文學主流與發展｜燭之武退秦師（p.8–25）');
  assert.equal(bookPageText(CHINESE_TOPIC_BOOK, 2, 6), '自我覺察與生命教育｜新手級（p.2–6）');
  assert.equal(bookPageTopicText(DEEP_FIFTEEN_BOOK, 8, 25), '先秦文學主流與發展');
  assert.equal(bookPageDetailText(DEEP_FIFTEEN_BOOK, 8, 25), '燭之武退秦師');
  assert.equal(bookPageTopicText(CHINESE_TOPIC_BOOK, 2, 6), '自我覺察與生命教育');
  assert.equal(bookPageDetailText(CHINESE_TOPIC_BOOK, 2, 6), '新手級');
  assert.ok(bookTopics(ENGLISH_TOPIC_READING_BOOK).includes('科技生活'));
  assert.deepEqual(bookDetailsForTopic(ENGLISH_TOPIC_READING_BOOK, '科技生活'), ['第一回', '第二回']);
  assert.ok(bookTopics(ENGLISH_TOPIC_CLOZE_BOOK).includes('新新世代'));
  assert.deepEqual(bookDetails(ENGLISH_TOPIC_READING_BOOK), ['第一回', '第二回']);
  assert.deepEqual(bookDetails(ENGLISH_TOPIC_CLOZE_BOOK), ['第一回', '第二回', '第三回', '第四回']);
  assert.deepEqual(bookDetailsForTopic(ENGLISH_TOPIC_CLOZE_BOOK, '新新世代'), ['第一回', '第二回', '第三回', '第四回']);
});

test('a page range crossing sections lists each affected section with its own clipped pages', () => {
  assert.equal(
    bookPageText(DEEP_FIFTEEN_BOOK, 24, 28),
    '先秦文學主流與發展｜燭之武退秦師（p.24–25）、先秦文學主流與發展｜大同與小康（p.26–28）',
  );
  assert.equal(bookPageTopicText(DEEP_FIFTEEN_BOOK, 24, 28), '先秦文學主流與發展');
  assert.equal(bookPageDetailText(DEEP_FIFTEEN_BOOK, 24, 28), '燭之武退秦師、大同與小康');
});

test('every book map is ordered and has no overlap or gap inside its mapped textbook pages', () => {
  for (const sections of Object.values(BOOK_PAGE_MAPS)) {
    assert.ok(sections.length > 0);
    for (let index = 1; index < sections.length; index += 1) {
      assert.equal(sections[index].start, sections[index - 1].end + 1);
    }
  }
});

test('an unsupported or out-of-range page has an explicit readable result', () => {
  assert.deepEqual(bookPageMatches('不存在的書', 1, 2), []);
  assert.equal(bookPageText(DEEP_FIFTEEN_BOOK, 1, 1), '頁碼不在已建立的教材本文範圍內。');
});

test('defer keeps book, pages, and therefore the same page mapping after reload', () => {
  const original: StudyItem = {
    id: 'calendar-book-item',
    type: 'chineseReading',
    done: false,
    minutes: '',
    required: true,
    source: 'preset',
    presetKey: 'cal_book_event-1',
    title: `國文｜${DEEP_FIFTEEN_BOOK}`,
    description: 'Google Calendar API',
    deferred: true,
    deferredTargetDay: 5,
    f: { kind: 'book', book: DEEP_FIFTEEN_BOOK, start: '8', end: '25' },
  };
  const deferred = cloneOriginalItemForMakeup(original, {
    id: 'deferred-book-item',
    presetKey: 'deferred_calendar-book-item',
    originDate: '2026-09-03',
  });

  assert.deepEqual(deferred.f, original.f);
  assert.equal(bookPageText(deferred.f.book, deferred.f.start, deferred.f.end), '先秦文學主流與發展｜燭之武退秦師（p.8–25）');
});

test('defer keeps an English Topic Collection scope without creating page fields', () => {
  const original: StudyItem = {
    id: 'calendar-english-topic',
    type: 'extra',
    done: false,
    minutes: '',
    required: true,
    source: 'preset',
    presetKey: 'cal_book_english-topic',
    title: `英文｜${ENGLISH_TOPIC_CLOZE_BOOK}`,
    f: {
      title: ENGLISH_TOPIC_CLOZE_BOOK,
      book: ENGLISH_TOPIC_CLOZE_BOOK,
      topic: '新新世代',
      round: '第三回',
      calendarBookRangeLocked: true,
    },
  };
  const deferred = cloneOriginalItemForMakeup(original, {
    id: 'deferred-english-topic', presetKey: 'deferred_calendar-english-topic', originDate: '2026-09-03',
  });

  assert.deepEqual([deferred.f.book, deferred.f.topic, deferred.f.round], [ENGLISH_TOPIC_CLOZE_BOOK, '新新世代', '第三回']);
  assert.equal(deferred.f.calendarBookRangeLocked, true);
  assert.equal(deferred.f.start, undefined);
  assert.equal(deferred.f.end, undefined);
});
