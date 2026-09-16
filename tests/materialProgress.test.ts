import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_RECORD_PREFIX_KEY,
  activeStudyRecordPrefix,
  materialProgressRows,
  readMaterialProgressRecords,
} from '../src/study/materialProgress.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(overrides: Partial<StudyItem> = {}): StudyItem {
  return {
    id: 'item',
    type: 'general',
    done: false,
    minutes: '',
    required: true,
    f: {},
    ...overrides,
  };
}

function record(items: StudyItem[], date = '2026-09-11'): StudyRecord {
  return { date, items };
}

test('leaves unrecorded material segments empty and alternates segment tones', () => {
  const rows = materialProgressRows([]);
  const ace = rows.find(row => row.id === 'english:ace');
  assert.ok(ace);
  assert.equal(ace.recorded, 0);
  assert.equal(ace.total, 60);
  assert.deepEqual(ace.segments.slice(0, 4).map(segment => segment.tone), ['deep', 'light', 'deep', 'light']);
  assert.ok(ace.segments.every(segment => !segment.recorded));
});

test('reads a recorded math range from a grouped child without filling untouched units', () => {
  const child = item({
    id: 'math-child',
    type: 'mathLecture',
    done: true,
    f: { material: '教學講義', book: '1', start: '149', end: '165', progress: true },
  });
  const parent = item({ id: 'group', f: { groupedWorkEntries: [child] } });
  const math = materialProgressRows([record([parent])]).find(row => row.id === 'math:教學講義:1');
  assert.ok(math);
  assert.equal(math.recorded, 1);
  assert.match(math.segments.find(segment => segment.recorded)?.label ?? '', /多項式及其運算/);
  assert.equal(math.segments.find(segment => segment.recorded)?.completionPercent, 71);
});

test('uses the printed New Key books 1-2 page boundaries through the final p.191', () => {
  const math = materialProgressRows([]).find(row => row.id === 'math:新關鍵:1~2');
  assert.ok(math);
  assert.deepEqual(
    math.segments.map(segment => segment.label),
    [
      '實數與指對數（p.2–28）',
      '多項式函數（p.29–59）',
      '直線與圓（p.60–84）',
      '數列與級數（p.85–106）',
      '排列組合與機率（p.107–137）',
      '數據分析（p.138–166）',
      '三角比（p.167–191）',
    ],
  );
});

test('records New Key books 1-2 pages against the correct unit boundary', () => {
  const mathItem = item({
    id: 'new-key-boundary',
    type: 'mathLecture',
    done: true,
    f: { material: '新關鍵', book: '1～2冊', start: '28', end: '29' },
  });
  const math = materialProgressRows([record([mathItem])]).find(row => row.id === 'math:新關鍵:1~2');
  assert.ok(math);
  assert.deepEqual(math.segments.map(segment => segment.recorded), [true, true, false, false, false, false, false]);
  assert.equal(math.segments[0].completionPercent, 4);
  assert.equal(math.segments[1].completionPercent, 3);
});

test('checked Calendar math fills material progress from actual recorded pages, not suggested pages', () => {
  const suggested = item({
    id: 'calendar-suggestion',
    type: 'mathStudy',
    done: true,
    f: {
      material: '新關鍵', book: '1~2', start: '29', end: '59',
      calendarSuggestedStart: 29, calendarSuggestedEnd: 59,
    },
  });
  let math = materialProgressRows([record([suggested])]).find(row => row.id === 'math:新關鍵:1~2');
  assert.ok(math);
  assert.equal(math.recorded, 0);

  suggested.f.dailyWorkUserFields = { start: '29', end: '34' };
  suggested.done = false;
  math = materialProgressRows([record([suggested])]).find(row => row.id === 'math:新關鍵:1~2');
  assert.ok(math);
  assert.equal(math.recorded, 0);

  suggested.done = true;
  math = materialProgressRows([record([suggested])]).find(row => row.id === 'math:新關鍵:1~2');
  assert.ok(math);
  assert.equal(math.recorded, 1);
  assert.equal(math.segments[1].completionPercent, 19);
});

test('material progress supports legacy boolean markers for actual Calendar page records', () => {
  const completed = item({
    id: 'legacy-calendar-record',
    type: 'mathStudy',
    done: true,
    f: {
      material: '新關鍵', book: '1~2', start: '29', end: '34',
      calendarSuggestedStart: 29, calendarSuggestedEnd: 59,
      dailyWorkUserFields: { start: true, end: true },
    },
  });
  const math = materialProgressRows([record([completed])]).find(row => row.id === 'math:新關鍵:1~2');
  assert.ok(math);
  assert.equal(math.segments[1].completionPercent, 19);
});

test('accepts p.191 as New Key books 1-2 and rejects pages after the printed ending', () => {
  const finalPage = item({
    id: 'new-key-final-page',
    type: 'mathLecture',
    done: true,
    f: { material: '新關鍵', book: '1~2', start: '191', end: '192' },
  });
  const math = materialProgressRows([record([finalPage])]).find(row => row.id === 'math:新關鍵:1~2');
  assert.ok(math);
  assert.equal(math.segments.filter(segment => segment.recorded).length, 1);
  assert.equal(math.segments[6].recorded, true);
  assert.equal(math.segments[6].completionPercent, 4);
});

test('uses the printed New Key books 3A-4A page boundaries through the final p.187', () => {
  const math = materialProgressRows([]).find(row => row.id === 'math:新關鍵:3A~4A');
  assert.ok(math);
  assert.deepEqual(
    math.segments.map(segment => segment.label),
    [
      '三角函數（p.2–30）',
      '指數與對數函數（p.31–57）',
      '平面向量（p.58–90）',
      '空間向量（p.91–115）',
      '空間中的平面與直線（p.116–140）',
      '條件機率與貝氏定理（p.141–153）',
      '矩陣（p.154–187）',
    ],
  );
});

test('records New Key books 3A-4A boundaries and stops at p.187', () => {
  const mathItem = item({
    id: 'new-key-34-boundaries',
    type: 'mathLecture',
    done: true,
    f: { material: '新關鍵', book: '3A～4A冊', start: '30', end: '31' },
  });
  const finalPage = item({
    id: 'new-key-34-final-page',
    type: 'mathLecture',
    done: true,
    f: { material: '新關鍵', book: '3A~4A', start: '187', end: '188' },
  });
  const math = materialProgressRows([record([mathItem, finalPage])]).find(row => row.id === 'math:新關鍵:3A~4A');
  assert.ok(math);
  assert.deepEqual(math.segments.map(segment => segment.recorded), [true, true, false, false, false, false, true]);
  assert.equal(math.segments[0].completionPercent, 3);
  assert.equal(math.segments[1].completionPercent, 4);
  assert.equal(math.segments[6].completionPercent, 3);
});

test('adds the supplied New Grand Slam Math A map through p.353', () => {
  const math = materialProgressRows([]).find(row => row.id === 'math:新大滿貫:A');
  assert.ok(math);
  assert.equal(math.segments[0].label, '單元1 數與式（p.6–19）');
  assert.equal(math.segments[13].label, '單元14 矩陣（p.316–348）');
  assert.equal(math.segments[14].label, '114學年度學科能力測驗（數學A考科）（p.349–353）');
});

test('adds Navigator, Advantage and Comeback lecture ranges without inventing Comeback unit pages', () => {
  const rows = materialProgressRows([]);
  const chemistry = rows.find(row => row.id === 'natural:化學:領航');
  const physics = rows.find(row => row.id === 'natural:物理:優勢');
  const comeback = rows.find(row => row.id === 'natural:物理:逆轉勝');
  assert.ok(chemistry && physics && comeback);
  assert.equal(chemistry.segments.at(-1)?.label, '第4章 生活中的化學｜4-4 化學的現代應用（p.265–290）');
  assert.equal(physics.segments.at(-1)?.label, '第6章 量子現象｜6-2 原子光譜（p.230–244）');
  assert.deepEqual(comeback.segments.map(segment => segment.label), [
    '16週複習計畫｜來源未提供各單元頁界（p.1–255）',
  ]);
});

test('records actual pages for the newly mapped math and natural lectures', () => {
  const mathItem = item({
    id: 'grand-slam', type: 'mathLecture', done: true,
    f: { material: '新大滿貫', book: '數學A', start: '316', end: '320' },
  });
  const chemistryItem = item({
    id: 'navigator', type: 'scienceReview', done: true,
    f: { subject: '化學', material: '領航', start: '173', end: '187' },
  });
  const rows = materialProgressRows([record([mathItem, chemistryItem])]);
  assert.equal(rows.find(row => row.id === 'math:新大滿貫:A')?.segments[13].recorded, true);
  assert.match(
    rows.find(row => row.id === 'natural:化學:領航')?.segments.find(segment => segment.recorded)?.label ?? '',
    /3-4 水溶液中的酸鹼反應/,
  );
});

test('fills a page-based segment only by its actual covered percentage and deduplicates overlap', () => {
  const first = item({
    id: 'biology-first', type: 'scienceReview', done: true,
    f: { subject: '生物', material: '123日的淬鍊', start: '16', end: '18' },
  });
  const overlapping = item({
    id: 'biology-overlap', type: 'scienceReview', done: true,
    f: { subject: '生物', material: '123日的淬鍊', start: '18', end: '20' },
  });
  const biology = materialProgressRows([record([first, overlapping])])
    .find(row => row.id === 'natural:生物:123日的淬鍊');
  assert.ok(biology);
  const chapter = biology.segments[0];
  assert.equal(chapter.recorded, true);
  assert.equal(chapter.completionPercent, 9);
  assert.equal(biology.completionPercent, 3);
});

test('does not let a grouped parent fill the interrupted range between its source children', () => {
  const first = item({
    id: 'first', type: 'mathLecture', done: true,
    f: { material: '教學講義', book: '1', start: '1', end: '15' },
  });
  const third = item({
    id: 'third', type: 'mathLecture', done: true,
    f: { material: '教學講義', book: '1', start: '34', end: '43' },
  });
  const parent = item({
    id: 'grouped', type: 'mathLecture', done: true,
    f: { material: '教學講義', book: '1', start: '1', end: '43', groupedWorkEntries: [first, third] },
  });
  const math = materialProgressRows([record([parent])]).find(row => row.id === 'math:教學講義:1');
  assert.ok(math);
  assert.equal(math.recorded, 2);
  assert.deepEqual(math.segments.slice(0, 3).map(segment => segment.recorded), [true, false, true]);
});

test('requires actual activity before an English topic round is filled', () => {
  const untouched = item({
    id: 'untouched',
    type: 'extra',
    f: { title: '主題百匯：篇章結構·閱讀測驗', topic: '科技生活', round: '第一回' },
  });
  const written = item({
    id: 'written',
    type: 'extra',
    minutes: '18',
    f: { title: '主題百匯：篇章結構·閱讀測驗', topic: '科技生活', round: '第二回' },
  });
  const row = materialProgressRows([record([untouched, written])]).find(value => value.id === 'book:主題百匯：篇章結構·閱讀測驗');
  assert.ok(row);
  assert.equal(row.recorded, 1);
  assert.match(row.segments.find(segment => segment.recorded)?.label ?? '', /第二回/);
});

test('includes completed Calendar natural integration child ranges', () => {
  const calendar = item({
    id: 'calendar-natural',
    type: 'scienceReview',
    f: {
      calendarIntegrationEntries: [
        { subject: '生物', material: '123日的淬鍊', ranges: [[58, 62]], done: true },
      ],
    },
  });
  const biology = materialProgressRows([record([calendar])]).find(row => row.id === 'natural:生物:123日的淬鍊');
  assert.ok(biology);
  assert.equal(biology.recorded, 1);
  assert.match(biology.segments.find(segment => segment.recorded)?.label ?? '', /Chapter 2 遺傳/);
});

test('records Azar Calendar child sections independently instead of filling the whole page range', () => {
  const first = item({
    id: 'azar-2-1', type: 'extra', done: true,
    f: { title: 'Azar英文文法（中階）', azarSectionCode: '2-1', start: '31', end: '31' },
  });
  const second = item({
    id: 'azar-2-2', type: 'extra', done: false,
    f: { title: 'Azar英文文法（中階）', azarSectionCode: '2-2', start: '32', end: '32' },
  });
  const parent = item({ id: 'azar-chapter', f: { groupedWorkEntries: [first, second] } });
  const azar = materialProgressRows([record([parent])]).find(row => row.id === 'english:azar-intermediate');
  assert.ok(azar);
  assert.equal(azar.total, 149);
  assert.equal(azar.recorded, 1);
  assert.equal(azar.segments.find(segment => segment.key === '2-1')?.recorded, true);
  assert.equal(azar.segments.find(segment => segment.key === '2-2')?.recorded, false);
});

test('uses the Tracker active account prefix and ignores other account records', () => {
  const values = new Map<string, string>([
    [ACTIVE_RECORD_PREFIX_KEY, 'study-v11:user:user-a:'],
    ['study-v11:user:user-a:2026-09-11', JSON.stringify(record([], '2026-09-11'))],
    ['study-v11:user:user-b:2026-09-12', JSON.stringify(record([], '2026-09-12'))],
  ]);
  const keys = [...values.keys()];
  const storage = {
    get length() { return keys.length; },
    key(index: number) { return keys[index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
  } as Pick<Storage, 'length' | 'key' | 'getItem'>;

  assert.equal(activeStudyRecordPrefix(storage), 'study-v11:user:user-a:');
  const result = readMaterialProgressRecords(storage);
  assert.equal(result.prefix, 'study-v11:user:user-a:');
  assert.deepEqual(result.records.map(value => value.date), ['2026-09-11']);
});
