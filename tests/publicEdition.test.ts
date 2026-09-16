import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');

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
