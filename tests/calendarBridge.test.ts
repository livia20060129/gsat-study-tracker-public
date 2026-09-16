import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calendarDescriptionText,
  calendarStructuredNote,
  parseCalendarTask,
  type CalendarTaskRow,
} from '../src/calendar/calendarBridge.ts';

function row(title: string, description = '', category = 'other'): CalendarTaskRow {
  return {
    event_key: 'primary:event-1',
    source_event_id: 'event-1',
    calendar_id: 'primary',
    event_date: '2026-08-31',
    title,
    description,
    category,
  };
}

test('parses an Essential Grammar unit range into individual units', () => {
  const parsed = parseCalendarTask(row('Essential Grammar in Use｜Unit 12–14'));
  assert.equal(parsed.kind, 'essentialGrammar');
  if (parsed.kind === 'essentialGrammar') assert.deepEqual(parsed.units, [12, 13, 14]);
});

test('parses 大考英聽A攻略 Test 1-10 as the ACE-style test template', () => {
  const single = parseCalendarTask(row('大考英聽A攻略｜Test 3'));
  const range = parseCalendarTask(row('英文｜大考英聽A攻略｜Test 8-12'));
  const spaced = parseCalendarTask(row('大考英聽A攻略 Test 5'));

  assert.equal(single.kind, 'listeningA');
  if (single.kind === 'listeningA') assert.deepEqual(single.tests, [3]);
  assert.equal(range.kind, 'listeningA');
  if (range.kind === 'listeningA') assert.deepEqual(range.tests, [8, 9, 10]);
  assert.equal(spaced.kind, 'listeningA');
  if (spaced.kind === 'listeningA') assert.deepEqual(spaced.tests, [5]);
});

test('reads 大考英聽A攻略 Test from the Calendar note and keeps an invalid range as an English item', () => {
  const fromNote = parseCalendarTask(row('大考英聽A攻略', '【單元進度】Test 6'));
  const invalid = parseCalendarTask(row('大考英聽A攻略｜Test 11'));

  assert.equal(fromNote.kind, 'listeningA');
  if (fromNote.kind === 'listeningA') assert.deepEqual(fromNote.tests, [6]);
  assert.equal(invalid.kind, 'subjectItem');
  if (invalid.kind === 'subjectItem') assert.equal(invalid.subject, '英文');
});

test('parses separate Essential Grammar units from the description', () => {
  const parsed = parseCalendarTask(row('Essential Grammar in Use', 'Unit：1、3、5'));
  assert.equal(parsed.kind, 'essentialGrammar');
  if (parsed.kind === 'essentialGrammar') assert.deepEqual(parsed.units, [1, 3, 5]);
});

test('does not create Essential Grammar units beyond Unit 115', () => {
  const parsed = parseCalendarTask(row('Essential Grammar in Use｜Unit 114–118'));
  assert.equal(parsed.kind, 'essentialGrammar');
  if (parsed.kind === 'essentialGrammar') assert.deepEqual(parsed.units, [114, 115]);
});

test('route prefixes preserve subject-recognizable Calendar items', () => {
  const today = parseCalendarTask(row('今日項目｜英文單字複習'));
  const week = parseCalendarTask(row('本週項目｜整理自然錯題'));
  assert.equal(today.kind, 'subjectItem');
  if (today.kind === 'subjectItem') assert.equal(today.subject, '英文');
  assert.equal(today.route, 'today');
  assert.equal(today.title, '英文單字複習');
  assert.equal(week.kind, 'subjectItem');
  if (week.kind === 'subjectItem') assert.equal(week.subject, '自然');
  assert.equal(week.route, 'week');
  assert.equal(week.title, '整理自然錯題');
});

test('keeps an unprefixed subject item and ignores a fully unknown item', () => {
  const generic = parseCalendarTask(row('整理化學錯題'));
  const unknown = parseCalendarTask(row('準備明天行程'));
  const essentialGrammar = parseCalendarTask(row('Essential Grammar in Use｜Unit 20'));
  assert.equal(generic.kind, 'subjectItem');
  if (generic.kind === 'subjectItem') assert.equal(generic.subject, '化學');
  assert.equal(generic.route, 'today');
  assert.equal(unknown.kind, 'other');
  assert.equal(essentialGrammar.route, 'today');
});

test('routes Essential Grammar to this week only with the weekly prefix', () => {
  const weekly = parseCalendarTask(row('本週項目｜Essential Grammar in Use｜Unit 21'));
  assert.equal(weekly.kind, 'essentialGrammar');
  assert.equal(weekly.route, 'week');
});

test('routes Calendar makeup to today and preserves a recognized item template', () => {
  const makeup = parseCalendarTask(row('補做｜Essential Grammar in Use｜Unit 22'));
  assert.equal(makeup.kind, 'essentialGrammar');
  assert.equal(makeup.route, 'today');
  assert.equal(makeup.makeup, true);
  assert.equal(makeup.title, 'Essential Grammar in Use｜Unit 22');
});

test('subject-recognizable Calendar makeup is routed to today', () => {
  const makeup = parseCalendarTask(row('本週項目｜補做項目｜整理自然錯題'));
  assert.equal(makeup.kind, 'subjectItem');
  if (makeup.kind === 'subjectItem') assert.equal(makeup.subject, '自然');
  assert.equal(makeup.route, 'today');
  assert.equal(makeup.makeup, true);
  assert.equal(makeup.title, '整理自然錯題');
});

test('recognizes special fixed templates read from Calendar', () => {
  const englishReview = parseCalendarTask(row('補做｜英文訂正與搭配詞整理'));
  const interactive = parseCalendarTask(row('補做｜互動題'));
  const magazine = parseCalendarTask(row('補做｜學測英文訓練：英文雜誌'));

  assert.equal(englishReview.kind, 'fixedTemplate');
  assert.equal(interactive.kind, 'fixedTemplate');
  assert.equal(magazine.kind, 'fixedTemplate');
  if (englishReview.kind === 'fixedTemplate') assert.equal(englishReview.template, 'englishReview');
  if (interactive.kind === 'fixedTemplate') assert.equal(interactive.template, 'interactiveDaily');
  if (magazine.kind === 'fixedTemplate') assert.equal(magazine.template, 'fixedMagazine');
  assert.equal(englishReview.route, 'today');
  assert.equal(interactive.route, 'today');
  assert.equal(magazine.route, 'today');
  assert.equal(englishReview.makeup, true);
  assert.equal(interactive.makeup, true);
  assert.equal(magazine.makeup, true);
});

test('keeps the magazine template when date and makeup notes are appended', () => {
  const parsed = parseCalendarTask(row('學測英文訓練：英文雜誌｜8/28＋補做8/26'));

  assert.equal(parsed.kind, 'fixedTemplate');
  if (parsed.kind === 'fixedTemplate') assert.equal(parsed.template, 'fixedMagazine');
  assert.equal(parsed.route, 'today');
  assert.equal(parsed.makeup, true);
});

test('canonicalizes the Calendar mock delimiter to the built-in timed template', () => {
  const parsed = parseCalendarTask(row('英文歷屆／模考｜限時作答'));

  assert.equal(parsed.kind, 'fixedTemplate');
  if (parsed.kind === 'fixedTemplate') assert.equal(parsed.template, 'englishMockTimed');
});

test('recognizes every fixed Calendar template with an appended note', () => {
  const cases = [
    ['數學講義：進度｜8/28', 'mathStudy'],
    ['數學講義題目：理解檢查＋錯題標記＋訂正｜8/28', 'mathPractice'],
    ['互動題｜8/28', 'interactiveDaily'],
    ['英文訂正與搭配詞整理｜8/28', 'englishReview'],
    ['英文：混合題與作文練習｜8/28', 'englishMixedWriting'],
    ['英文歷屆／模考：批改與訂正｜8/28', 'englishMockCorrection'],
    ['本週完成度與錯題整理｜8/28', 'weekReview'],
    ['英文輕量閱讀｜8/28', 'englishLightReading'],
  ] as const;

  for (const [title, template] of cases) {
    const parsed = parseCalendarTask(row(title));
    assert.equal(parsed.kind, 'fixedTemplate', title);
    if (parsed.kind === 'fixedTemplate') assert.equal(parsed.template, template, title);
  }
});

test('restores fixed templates after the same Calendar item is deferred more than once', () => {
  const math = parseCalendarTask(row(
    '數學講義題目｜理解檢查＋錯題標記＋訂正',
    '日麻花卷 8/25 欠項。針對本週已完成的數學講義進行理解檢查。',
  ));
  const english = parseCalendarTask(row('英文混合題與作文｜補8/26＋8/29'));

  assert.equal(math.kind, 'fixedTemplate');
  if (math.kind === 'fixedTemplate') assert.equal(math.template, 'mathPractice');
  assert.equal(english.kind, 'fixedTemplate');
  if (english.kind === 'fixedTemplate') assert.equal(english.template, 'englishMixedWriting');
  assert.equal(english.makeup, true);
  assert.equal(english.route, 'today');
  assert.equal(english.sourceDate, '8/26');
});

test('recognizes a deferred math event from a standard title and note-only metadata', () => {
  const parsed = parseCalendarTask(row(
    '1｜多項式函數',
    '<p>【延期來源】8/25　【範圍】第一冊數學講義 p.149–157　【單元】多項式函數</p>',
    'studyItem',
  ));

  assert.equal(parsed.kind, 'math');
  assert.equal(parsed.makeup, true);
  assert.equal(parsed.route, 'today');
  assert.equal(parsed.sourceDate, '8/25');
  assert.equal(parsed.title, '1｜多項式函數');
  assert.doesNotMatch(parsed.description, /<\/?p>/);
  if (parsed.kind === 'math') {
    assert.equal(parsed.book, '1');
    assert.equal(parsed.startPage, 149);
    assert.equal(parsed.endPage, 157);
  }
});

test('reads explicit Calendar page ranges for every natural-science subject', () => {
  for (const subject of ['物理', '化學', '生物', '地科'] as const) {
    const parsed = parseCalendarTask(row(
      `${subject}｜牛頓定律、摩擦與圓周運動`,
      '【頁碼範圍】80–88頁\n【單元進度】／\n【重點】牛頓定律\n【來源日期】8/31\n【識別碼】natural-01',
      'natural',
    ));
    assert.equal(parsed.kind, 'natural', subject);
    if (parsed.kind === 'natural') {
      assert.equal(parsed.subject, subject);
      assert.equal(parsed.material, '');
      assert.equal(parsed.startPage, 80);
      assert.equal(parsed.endPage, 88);
    }
  }
});

test('recognizes deferred Gujin and writing from standard titles and note-only source dates', () => {
  const gujin = parseCalendarTask(row(
    '古今悅讀一百｜第 10 回＋訂正',
    '<p>【延期來源】8/26　【第 10–11 回延期】本行程只完成第 10 回</p>',
    'studyItem',
  ));
  const writing = parseCalendarTask(row(
    '英文寫作測驗｜第 1 回：讓步、原因與條件',
    '<p>【延期來源】8/26　【教材】英文寫作測驗</p>',
    'studyItem',
  ));

  assert.equal(gujin.kind, 'gujin');
  assert.equal(gujin.makeup, true);
  assert.equal(gujin.sourceDate, '8/26');
  if (gujin.kind === 'gujin') assert.deepEqual(gujin.rounds, [10]);
  assert.equal(writing.kind, 'writing');
  assert.equal(writing.makeup, true);
  assert.equal(writing.sourceDate, '8/26');
  if (writing.kind === 'writing') {
    assert.equal(writing.round, 1);
    assert.equal(writing.focus, '讓步、原因與條件');
  }
});

test('reads Chinese books by fixed pages and English topic books by fixed topic plus round', () => {
  const cases = [
    ['國文｜深耕十五', '深耕十五', '國文', 8, 25],
    ['國文｜主題百匯 閱讀寫作新進化', '主題百匯：閱讀寫作新進化', '國文', 2, 6],
  ] as const;

  for (const [title, book, subject, startPage, endPage] of cases) {
    const parsed = parseCalendarTask(row(title, `【頁碼範圍】p.${startPage}–${endPage}\n【識別碼】book-test`, 'studyItem'));
    assert.equal(parsed.kind, 'bookPages', title);
    if (parsed.kind === 'bookPages') {
      assert.equal(parsed.book, book);
      assert.equal(parsed.subject, subject);
      assert.equal(parsed.startPage, startPage);
      assert.equal(parsed.endPage, endPage);
    }
  }

  const englishCases = [
    ['英文｜主題百匯 篇章結構·閱讀測驗｜科技生活', '【單元進度】第一回', '主題百匯：篇章結構·閱讀測驗', '科技生活', '第一回'],
    ['英文｜主題百匯 克漏字｜新新世代', '【單元進度】第二回\n【頁碼範圍】p.99–100', '主題百匯：克漏字', '新新世代', '第二回'],
  ] as const;
  for (const [title, note, book, topic, round] of englishCases) {
    const parsed = parseCalendarTask(row(title, `${note}\n【識別碼】english-book-test`, 'studyItem'));
    assert.equal(parsed.kind, 'bookScope', title);
    if (parsed.kind === 'bookScope') {
      assert.equal(parsed.book, book);
      assert.equal(parsed.subject, '英文');
      assert.equal(parsed.topic, topic);
      assert.deepEqual(parsed.rounds, [round]);
      assert.equal('startPage' in parsed, false, 'English topic books must not interpret pages');
    }
  }
});

test('a deferred English topic book stays typed and never falls back to page parsing', () => {
  const parsed = parseCalendarTask(row(
    '補做｜英文｜主題百匯 克漏字｜新新世代',
    '【單元進度】第三回\n【頁碼範圍】p.5–7\n【來源日期】9/2\n【識別碼】cloze-02',
    'studyItem',
  ));

  assert.equal(parsed.kind, 'bookScope');
  assert.equal(parsed.route, 'today');
  assert.equal(parsed.makeup, true);
  assert.equal(parsed.sourceDate, '9/2');
  if (parsed.kind === 'bookScope') {
    assert.equal(parsed.book, '主題百匯：克漏字');
    assert.equal(parsed.topic, '新新世代');
    assert.deepEqual(parsed.rounds, ['第三回']);
    assert.equal('startPage' in parsed, false);
  }
});

test('reads the new English lecture books from actual Calendar page ranges', () => {
  const weekly = parseCalendarTask(row(
    '英文｜學測週計畫',
    '【講義版本】學測週計畫\n【頁碼範圍】p.146–155\n【識別碼】weekly-plan-15',
    'studyItem',
  ));
  const mixed = parseCalendarTask(row(
    '英文｜混合題30篇實戰演練',
    '【講義版本】混合題30篇 實戰演練\n【頁碼範圍】p.62–63\n【識別碼】mixed-30-26',
    'studyItem',
  ));

  for (const parsed of [weekly, mixed]) {
    assert.equal(parsed.kind, 'bookPages');
    if (parsed.kind === 'bookPages') assert.equal(parsed.subject, '英文');
  }
  if (weekly.kind === 'bookPages') assert.deepEqual([weekly.book, weekly.startPage, weekly.endPage], ['學測週計畫', 146, 155]);
  if (mixed.kind === 'bookPages') assert.deepEqual([mixed.book, mixed.startPage, mixed.endPage], ['混合題30篇實戰演練', 62, 63]);
});

test('reads New Grand Slam, Navigator and Advantage lecture names from standardized notes', () => {
  const math = parseCalendarTask(row(
    '數學A｜矩陣',
    '【講義版本】新大滿貫\n【冊別】數學A\n【頁碼範圍】p.316–320\n【識別碼】grand-slam-matrix',
    'math',
  ));
  const chemistry = parseCalendarTask(row(
    '化學｜水溶液中的酸鹼反應',
    '【講義版本】領航\n【頁碼範圍】p.173–187\n【識別碼】navigator-acid-base',
    'natural',
  ));
  const physics = parseCalendarTask(row(
    '物理｜原子光譜',
    '【講義版本】優勢\n【頁碼範圍】p.230–244\n【識別碼】advantage-spectrum',
    'natural',
  ));

  assert.equal(math.kind, 'math');
  if (math.kind === 'math') assert.deepEqual([math.material, math.book, math.startPage, math.endPage], ['新大滿貫', 'A', 316, 320]);
  assert.equal(chemistry.kind, 'natural');
  if (chemistry.kind === 'natural') assert.deepEqual([chemistry.material, chemistry.startPage, chemistry.endPage], ['領航', 173, 187]);
  assert.equal(physics.kind, 'natural');
  if (physics.kind === 'natural') assert.deepEqual([physics.material, physics.startPage, physics.endPage], ['優勢', 230, 244]);
});

test('lecture identifiers select the correct map even with a shortened Calendar title', () => {
  const chemistry = parseCalendarTask(row(
    '酸鹼反應',
    '【頁碼範圍】173–187\n【識別碼】GSAT-CHEM-LINGHANG',
    'studyItem',
  ));
  const math = parseCalendarTask(row(
    '矩陣',
    '【頁碼範圍】316–320\n【識別碼】GSAT-MATHA-NEW-DAMANFEN',
    'studyItem',
  ));
  const english = parseCalendarTask(row(
    '第15回',
    '【頁碼範圍】146–155\n【識別碼】GSAT-ENG-WEEKPLAN',
    'studyItem',
  ));

  assert.equal(chemistry.kind, 'natural');
  if (chemistry.kind === 'natural') assert.deepEqual([chemistry.subject, chemistry.material], ['化學', '領航']);
  assert.equal(math.kind, 'math');
  if (math.kind === 'math') assert.deepEqual([math.material, math.book], ['新大滿貫', 'A']);
  assert.equal(english.kind, 'bookPages');
  if (english.kind === 'bookPages') assert.deepEqual([english.subject, english.book], ['英文', '學測週計畫']);
});

test('lecture identifiers still select the material after adding a unique event suffix', () => {
  const chemistry = parseCalendarTask(row(
    '酸鹼反應',
    '【頁碼範圍】173–187\n【識別碼】GSAT-CHEM-LINGHANG-20260916-01',
    'studyItem',
  ));

  assert.equal(chemistry.kind, 'natural');
  if (chemistry.kind === 'natural') {
    assert.deepEqual(
      [chemistry.subject, chemistry.material, chemistry.startPage, chemistry.endPage],
      ['化學', '領航', 173, 187],
    );
  }
});

test('infers an abbreviated English Topic Collection title from its topic and reads flexible round notation', () => {
  const cases = [
    ['英文｜主題百匯｜新新世代', '【單元進度】第２回', '主題百匯：克漏字', '新新世代', '第二回'],
    ['英文｜主題百匯｜科技生活', '【單元進度】2', '主題百匯：篇章結構·閱讀測驗', '科技生活', '第二回'],
    ['英文｜主題百匯', '【單元進度】新新世代｜第二回', '主題百匯：克漏字', '新新世代', '第二回'],
  ] as const;

  for (const [title, progress, book, topic, round] of cases) {
    const parsed = parseCalendarTask(row(title, `${progress}\n【識別碼】topic-short-title`, 'studyItem'));
    assert.equal(parsed.kind, 'bookScope', title);
    if (parsed.kind === 'bookScope') {
      assert.equal(parsed.book, book);
      assert.equal(parsed.topic, topic);
      assert.deepEqual(parsed.rounds, [round]);
      assert.equal('startPage' in parsed, false);
    }
  }
});

test('converts Calendar rich text to readable plain text', () => {
  assert.equal(
    calendarDescriptionText('<p>第一行&nbsp;&amp;內容</p><p>第二行<br>第三行</p>'),
    '第一行 &內容\n第二行\n第三行',
  );
});

test('reads every field from the standardized Calendar note', () => {
  const note = calendarStructuredNote(`
【講義版本】智慧型
【冊別】2＋4A
【頁碼範圍】p.174–181
【單元進度】／
【重點】多項式函數與運算
【來源日期】8/26
【識別碼】math-polynomial-01
  `);

  assert.deepEqual(note, {
    material: '智慧型',
    book: '2＋4A',
    pageRange: 'p.174–181',
    unitProgress: '',
    focus: '多項式函數與運算',
    sourceDate: '8/26',
    identifier: 'math-polynomial-01',
    hasStandardFields: true,
  });
});

test('infers New Key math from standardized notes and normalizes grouped book spellings', () => {
  const cases = [
    ['1-2冊', '1~2', 29, 59],
    ['1～2', '1~2', 60, 84],
    ['3A-4A冊', '3A~4A', 31, 57],
    ['3A～4A', '3A~4A', 154, 187],
  ] as const;

  for (const [calendarBook, expectedBook, start, end] of cases) {
    const parsed = parseCalendarTask(row(
      '數學講義：進度',
      `【講義版本】新 關鍵
【冊別】${calendarBook}
【頁碼範圍】p.${start}–${end}
【識別碼】new-key-${calendarBook}`,
      'studyItem',
    ));
    assert.equal(parsed.kind, 'math');
    if (parsed.kind !== 'math') throw new Error('Expected math Calendar item');
    assert.equal(parsed.material, '新關鍵');
    assert.equal(parsed.book, expectedBook);
    assert.deepEqual([parsed.startPage, parsed.endPage], [start, end]);
  }
});

test('removes Calendar line wrapping and whitespace from standardized identifiers', () => {
  const note = calendarStructuredNote(
    '【單元進度】第29回 【重點】分詞、比較與目的 【識別碼】 GSAT-\n WRITING-TEST-2026-17 ',
  );

  assert.equal(note.identifier, 'GSAT-WRITING-TEST-2026-17');
  const parsed = parseCalendarTask(row(
    '英文寫作測驗｜第29回：分詞、比較與目的',
    '【單元進度】第29回 【重點】named／or／so that 【識別碼】GSAT-\nWRITING-TEST-2026-17',
    'writing',
  ));
  assert.equal(parsed.identifier, 'GSAT-WRITING-TEST-2026-17');
});

test('reads standardized natural-integration pages and focus from a real Calendar note', () => {
  const parsed = parseCalendarTask(row(
    '自然整合｜微觀作用：鍵結、酵素、ATP、受力',
    '【頁碼範圍】生物 p.14–15；化學 p.45–83；物理 p.20–55 【來源日期】2026/8/29 【重點】鍵結、酵素、ATP、基本交互作用與受力\n【識別碼】GSAT-CALENDAR-NATURAL-INTEGRATION',
    'naturalIntegration',
  ));

  assert.equal(parsed.kind, 'naturalIntegration');
  if (parsed.kind === 'naturalIntegration') {
    assert.equal(parsed.review, '鍵結、酵素、ATP、基本交互作用與受力');
    assert.equal(parsed.pages, '生物 p.14–15；化學 p.45–83；物理 p.20–55');
    assert.deepEqual(parsed.pageItems, [
      { subject: '生物', start: 14, end: 15 },
      { subject: '化學', start: 45, end: 83 },
      { subject: '物理', start: 20, end: 55 },
    ]);
  }
});

test('keeps legacy natural-integration review labels compatible', () => {
  const parsed = parseCalendarTask(row(
    '自然整合｜108 診斷選題（作答後回查）',
    '【複習規則】作答後回查觀念\n【講義／頁碼】物理 p.20–25\n【指定輸出】整理錯題',
    'naturalIntegration',
  ));

  assert.equal(parsed.kind, 'naturalIntegration');
  if (parsed.kind === 'naturalIntegration') {
    assert.equal(parsed.review, '作答後回查觀念');
    assert.equal(parsed.pages, '物理 p.20–25');
  }
});

test('standard page range wins and unit progress is ignored when both are present', () => {
  const parsed = parseCalendarTask(row(
    '2＋4A｜多項式函數',
    `【講義版本】智慧型
【冊別】2＋4A
【頁碼範圍】174–181
【單元進度】3/11
【重點】備註中的其他數字 p.999 不得干擾
【來源日期】8/26
【識別碼】math-polynomial-01`,
    'math',
  ));

  assert.equal(parsed.kind, 'math');
  assert.equal(parsed.identifier, 'math-polynomial-01');
  assert.equal(parsed.sourceDate, '8/26');
  assert.equal(parsed.makeup, true);
  if (parsed.kind === 'math') {
    assert.equal(parsed.material, '智慧型');
    assert.equal(parsed.book, '2＋4A');
    assert.equal(parsed.startPage, 174);
    assert.equal(parsed.endPage, 181);
    assert.equal(parsed.progressIndex, null);
    assert.equal(parsed.progressTotal, null);
  }
});

test('uses unit progress only when the standardized page-range field is empty', () => {
  const parsed = parseCalendarTask(row(
    '1｜多項式函數',
    `【冊別】1
【頁碼範圍】／
【單元進度】3/11
【重點】自由文字 p.999 不得被當成頁碼
【來源日期】8/31
【識別碼】math-unit-progress-03`,
    'math',
  ));

  assert.equal(parsed.kind, 'math');
  assert.equal(parsed.makeup, undefined);
  if (parsed.kind === 'math') {
    assert.equal(parsed.title, '1｜多項式函數');
    assert.equal(parsed.startPage, null);
    assert.equal(parsed.endPage, null);
    assert.equal(parsed.progressIndex, 3);
    assert.equal(parsed.progressTotal, 11);
  }
});

test('standardized natural-science notes keep the unit name in the title', () => {
  const parsed = parseCalendarTask(row(
    '物理｜牛頓定律、摩擦與圓周運動',
    `【講義版本】好考點
【頁碼範圍】80–88
【單元進度】／
【重點】自由文字 p.999 不得干擾
【來源日期】8/31
【識別碼】physics-newton-01`,
    'natural',
  ));

  assert.equal(parsed.kind, 'natural');
  if (parsed.kind === 'natural') {
    assert.equal(parsed.topic, '牛頓定律、摩擦與圓周運動');
    assert.equal(parsed.material, '好考點');
    assert.equal(parsed.startPage, 80);
    assert.equal(parsed.endPage, 88);
  }
});

test('standardized page ranges apply to English grammar and fixed page templates', () => {
  const description = `【頁碼範圍】20–25
【單元進度】／
【重點】關係詞
【來源日期】8/31
【識別碼】page-template-01`;
  const grammar = parseCalendarTask(row('英文文法｜關係詞', description, 'grammar'));
  const fixed = parseCalendarTask(row('數學講義：進度', description));

  assert.equal(grammar.kind, 'grammar');
  if (grammar.kind === 'grammar') {
    assert.equal(grammar.startPage, 20);
    assert.equal(grammar.endPage, 25);
    assert.equal(grammar.focus, '關係詞');
  }
  assert.equal(fixed.kind, 'fixedTemplate');
  if (fixed.kind === 'fixedTemplate') {
    assert.equal(fixed.startPage, 20);
    assert.equal(fixed.endPage, 25);
  }
});

test('non-math standardized notes may omit both book and focus fields', () => {
  const parsed = parseCalendarTask(row(
    '英文文法｜Ch.3 被動語態',
    `【頁碼範圍】28–44
【單元進度】／
【來源日期】8/31
【識別碼】grammar-passive-01`,
    'grammar',
  ));

  assert.equal(parsed.kind, 'grammar');
  if (parsed.kind === 'grammar') {
    assert.equal(parsed.startPage, 28);
    assert.equal(parsed.endPage, 44);
    assert.equal(parsed.focus, '');
  }
});
