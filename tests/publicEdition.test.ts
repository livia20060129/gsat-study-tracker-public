import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PHYSICS_COMEBACK_PAGE_MAP } from '../src/data/lecturePageMaps.ts';

const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
const calendarPrompt = readFileSync(new URL('../public/gpt.prompt.html', import.meta.url), 'utf8');

test('public edition only creates presets from the connected Google Calendar cache', () => {
  assert.match(runtime, /function calendarDefsForDate\(date\)\{\s*return calendarConnected&&calendarCacheLoaded\?cloudCalendarDefsForDate\(date\):\[\];\s*\}/);
  assert.match(runtime, /function presetsForDate\(date\)\{\s*return dedupePresetDefinitions\(calendarDefsForDate\(date\)\);\s*\}/);
  assert.match(runtime, /function calendarDateHasBuiltInMathStudy\(\)\{return false\}/);
  assert.match(runtime, /function calendarWeekMathTarget\(date\)\{\s*return 0;\s*\}/);
  assert.doesNotMatch(runtime, /function resolveCloudMathPlan\(parsed\)\{[^}]*CALENDAR_MATH_PLAN/s);
  assert.match(runtime, /function calendarNaturalRecommended\(date,item\)\{\s*if\(!\(calendarConnected&&calendarCacheLoaded\)\)return null;/);
  assert.match(runtime, /var defs=calendarConnected&&calendarCacheLoaded\?\(cloudNaturalIntegrationItemsByDate\[date\]\|\|null\):null;/);
});

test('public edition removes legacy built-in preset items while retaining custom items', () => {
  assert.match(runtime, /x&&x\.source==='preset'&&!\/\^cal_\/\.test\(x\.presetKey\|\|''\)&&!allowed\[x\.presetKey\]/);
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
