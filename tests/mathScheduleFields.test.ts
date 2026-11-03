import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeMakeupProgress } from '../src/study/makeup.ts';
import { restoreMathScheduleFields } from '../src/study/mathScheduleFields.ts';
import type { StudyItem } from '../src/types.ts';

function math(fields: StudyItem['f']): StudyItem {
  return { id: 'math', type: 'mathStudy', title: '數學講義：進度', source: 'preset', required: true, done: false, minutes: '19', f: fields };
}

test('recovered makeup templates repair blank math ranges and retain recorded progress', () => {
  const template = math({ material: '教學講義', book: '2', start: '237', end: '245', calendarSuggestedStart: 237, calendarSuggestedEnd: 245 });
  const existing = math({ material: '教學講義', book: '2', start: '', end: '', calendarSuggestedStart: '', corrected: true, reason: '保留筆記' });
  existing.done = true; existing.checkedOn = '2026-11-02';
  const snapshot = JSON.stringify(existing);
  const merged = mergeMakeupProgress(template, existing);
  assert.deepEqual([merged.f.start, merged.f.end, merged.f.calendarSuggestedStart], ['237', '245', 237]);
  assert.deepEqual([merged.done, merged.checkedOn, merged.minutes, merged.f.corrected, merged.f.reason], [true, '2026-11-02', '19', true, '保留筆記']);
  assert.equal(JSON.stringify(existing), snapshot);
});

test('math refresh preserves explicit manual boundaries, including deliberately cleared values', () => {
  const template = math({ material: '教學講義', book: '2', start: '237', end: '245' });
  for (const start of ['240', '']) {
    const existing = math({ material: '教學講義', book: '2', start, end: '243', dailyWorkUserFields: { start, end: '243' } });
    const merged = mergeMakeupProgress(template, existing);
    assert.deepEqual([merged.f.start, merged.f.end], [start, '243']);
  }
});

test('empty refreshed math templates cannot wipe previously saved ranges or suggestions', () => {
  const template = math({ material: '教學講義', book: '2', start: '', end: '', calendarSuggestedStart: '', calendarSuggestedEnd: '' });
  const existing = math({ material: '教學講義', book: '2', start: '228', end: '236', calendarSuggestedStart: 228, calendarSuggestedEnd: 236 });
  const merged = { ...template, f: { ...template.f } };
  restoreMathScheduleFields(merged, template, existing);
  assert.deepEqual([merged.f.start, merged.f.end, merged.f.calendarSuggestedStart, merged.f.calendarSuggestedEnd], ['228', '236', 228, 236]);
});

test('grouped makeup children keep manual ranges through a template rebuild', () => {
  const child = math({ material: '教學講義', book: '2', start: '228', end: '236' });
  const template = math({ groupedWorkEntries: [child] });
  const existing = structuredClone(template);
  Object.assign(existing.f.groupedWorkEntries![0].f, { start: '230', end: '234', dailyWorkUserFields: { start: '230', end: '234' } });
  const merged = mergeMakeupProgress(template, existing);
  assert.deepEqual([merged.f.groupedWorkEntries![0].f.start, merged.f.groupedWorkEntries![0].f.end], ['230', '234']);
});

test('math fallback does not assign pages from a different material or volume', () => {
  const existing = math({ material: '教學講義', book: '2', start: '228', end: '236', calendarSuggestedStart: 228, calendarSuggestedEnd: 236 });
  for (const fields of [{ material: '新關鍵', book: '1~2' }, { material: '教學講義', book: '4A' }]) {
    const template = math({ ...fields, start: '', end: '', calendarSuggestedStart: '', calendarSuggestedEnd: '' });
    const merged = mergeMakeupProgress(template, existing);
    assert.deepEqual([merged.f.start, merged.f.end, merged.f.calendarSuggestedStart, merged.f.calendarSuggestedEnd], ['', '', '', '']);
  }
});
