import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  BOOK_PAGE_MAPS,
  HISTORY_HAOHAOXUE_BOOK,
} from '../src/data/bookPageMaps.ts';
import { LECTURE_IDENTIFIERS, lectureIdentifierMatch, PHYSICS_COMEBACK_PAGE_MAP } from '../src/data/lecturePageMaps.ts';
import {
  BIOLOGY_NEW_KEY_PAGE_MAP,
  CHEMISTRY_NEW_KEY_PAGE_MAP,
  EARTH_SCIENCE_NEW_KEY_PAGE_MAP,
  PHYSICS_NEW_KEY_PAGE_MAP,
} from '../src/data/naturalMaterialPageMaps.ts';

const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
const calendarPrompt = readFileSync(new URL('../public/gpt.prompt.html', import.meta.url), 'utf8');

test('public edition only creates presets from the connected Google Calendar cache', () => {
  assert.match(runtime, /function calendarDefsForDate\(date\)\{\s*return calendarConnected&&calendarCacheLoaded\?cloudCalendarDefsForDate\(date\):\[\];\s*\}/);
  assert.match(runtime, /function presetsForDate\(date\)\{\s*return dedupePresetDefinitions\(calendarDefsForDate\(date\)\);\s*\}/);
  assert.match(runtime, /function calendarDateHasBuiltInMathStudy\(\)\{return false\}/);
  assert.match(runtime, /function calendarWeekMathTarget\(date\)\{\s*return 0;\s*\}/);
  assert.match(runtime, /function resolveCloudMathPlan\(parsed\)\{\s*return resolveMathCalendarPlan\(parsed,CALENDAR_MATH_PLAN\|\|\{\}\);\s*\}/);
  assert.match(runtime, /function calendarNaturalRecommended\(date,item\)\{\s*if\(!\(calendarConnected&&calendarCacheLoaded\)\)return null;/);
  assert.match(runtime, /var defs=calendarConnected&&calendarCacheLoaded\?\(cloudNaturalIntegrationItemsByDate\[date\]\|\|null\):null;/);
});

test('Calendar prompt publishes the Haohaoxue History identifier and complete page map', () => {
  assert.ok(calendarPrompt.includes(LECTURE_IDENTIFIERS.historyHaohaoxue));
  assert.ok(BOOK_PAGE_MAPS[HISTORY_HAOHAOXUE_BOOK].length === 9);
  assert.match(calendarPrompt, /歷史《好好學》/);
  assert.match(calendarPrompt, /單元1 多元族群社會的形成 p\.2–24/);
  assert.match(calendarPrompt, /單元9 世界變遷與現代性 p\.252–281/);
  assert.match(calendarPrompt, /只有單元名稱、未提供教材名或識別碼時不得猜測教材/);
});

test('public edition removes legacy built-in preset items while retaining custom items', () => {
  assert.match(runtime, /x&&x\.source==='preset'&&managed\[x\.presetKey\]&&!allowed\[x\.presetKey\]/);
  assert.doesNotMatch(runtime, /function presetsForDate\(date\)\{[^}]*weekdayPresets/s);
});

test('Calendar prompt includes the verified Physics Comeback page map', () => {
  const statusMarkup = '物理《逆轉勝》</td><td><code>GSAT-PHYS-NIZHUANSHENG</code></td><td><span class="tag">頁碼地圖已建立';
  assert.ok(calendarPrompt.includes(statusMarkup));
  assert.doesNotMatch(calendarPrompt, /目前只有 p\.1–255 全書範圍|目前只確認全書 p\.1–255|不得建立或猜測單元頁碼界線/);
  for (const [start, end, unit, detail] of PHYSICS_COMEBACK_PAGE_MAP) {
    assert.ok(calendarPrompt.includes(`${detail ?? unit} p.${start}–${end}`), `${detail ?? unit} p.${start}–${end}`);
  }
});

test('public edition removes the three social weekly plans from Calendar recognition and prompt guidance', () => {
  for (const identifier of ['GSAT-GEO-WEEKPLAN', 'GSAT-HIST-WEEKPLAN', 'GSAT-CIVICS-WEEKPLAN']) {
    assert.equal(lectureIdentifierMatch(identifier), null);
    assert.ok(!calendarPrompt.includes(identifier), identifier);
  }
  assert.doesNotMatch(calendarPrompt, /地理《學測週計畫》|歷史《學測週計畫》|公民《學測週計畫》/);
  assert.match(calendarPrompt, /歷史《好好學》/);
});

test('Calendar prompt publishes the High-Frequency Vocabulary identifier and photographed ranges', () => {
  assert.ok(calendarPrompt.includes(LECTURE_IDENTIFIERS.englishHighFrequencyVocabulary));
  assert.match(calendarPrompt, /英語高頻字彙完全攻略/);
  assert.match(calendarPrompt, /Unit 1 極地冰冠融化中 p\.8–12/);
  assert.match(calendarPrompt, /Unit 18 元宇宙：虛擬世界的模糊界線 p\.238–244/);
  assert.match(calendarPrompt, /單字索引 p\.254 起（照片未提供末頁，不得自行猜測）/);
});

test('Calendar prompt publishes identifiers and full page-map boundaries for all four New Key science books', () => {
  const books = [
    [LECTURE_IDENTIFIERS.biologyNewKey, BIOLOGY_NEW_KEY_PAGE_MAP, '生物'],
    [LECTURE_IDENTIFIERS.chemistryNewKey, CHEMISTRY_NEW_KEY_PAGE_MAP, '化學'],
    [LECTURE_IDENTIFIERS.physicsNewKey, PHYSICS_NEW_KEY_PAGE_MAP, '物理'],
    [LECTURE_IDENTIFIERS.earthScienceNewKey, EARTH_SCIENCE_NEW_KEY_PAGE_MAP, '地科'],
  ] as const;

  for (const [identifier, rows, subject] of books) {
    assert.ok(calendarPrompt.includes(identifier), identifier);
    assert.ok(calendarPrompt.includes(`${subject}《新關鍵》`), subject);
    assert.ok(calendarPrompt.includes(`p.${rows[0][0]}–${rows[0][1]}`), `${subject} first range`);
    assert.ok(calendarPrompt.includes(`p.${rows.at(-1)?.[0]}–${rows.at(-1)?.[1]}`), `${subject} final range`);
  }
});
