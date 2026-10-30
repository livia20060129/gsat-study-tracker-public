import assert from 'node:assert/strict';
import test from 'node:test';
import { completedItemsForPeriod } from '../src/study/completedItems.ts';
import { completedStudyTimeEntries } from '../src/study/completedStudyTime.ts';
import { overdueHandledTasks, overdueTasks } from '../src/study/overdueTasks.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(id: string, overrides: Partial<StudyItem> = {}): StudyItem {
  return { id, type: 'general', title: id, source: 'preset', required: true, done: false, minutes: '25', f: {}, ...overrides };
}

test('only the specified English routines are excluded by title', () => {
  const excluded = ['英文歷屆／模考：限時作答', '英文歷屆/模考 : 限時作答', '英文歷屆／模考｜限時作答｜10/23',
    '學測英文訓練：英文雜誌', '學測英文訓練: 英文雜誌', '學測英文訓練：英文雜誌｜10/23',
    '英文歷屆／模考：批改與訂正', '英文歷屆/模考 : 批改與訂正', '英文｜英文歷屆／模考：批改與訂正｜10/23',
    '英文：混合題與作文練習', '英文混合題與作文', '英文｜混合題與作文練習'];
  const retained = ['數學歷屆／模考：限時作答', '數學歷屆／模考：批改與訂正', '英文雜誌補充閱讀', '英文輕量閱讀'];
  const record: StudyRecord = { date: '2026-10-24', items: [
    ...excluded.map(title => item(title, { title, f: { subject: '英文' } })), ...retained.map(title => item(title, { title })),
  ] };
  const before = structuredClone(record);
  assert.deepEqual(overdueTasks([record], '2026-10-25').map(entry => entry.title).sort(), [...retained].sort());
  assert.deepEqual(record, before);
});

test('legacy preset, carried template and Calendar identities exclude the fixed routines without a title dependency', () => {
  const keys = ['fri_mock_timed', 'weekday_magazine', 'fri_magazine', 'cal_fixed_englishMockTimed_event',
    'cal_fixed_fixedMagazine_event', 'cal_magazine_legacy', 'sat_mock_correction', 'english_mixed_writing',
    'cal_fixed_englishMockCorrection_event', 'cal_fixed_englishMixedWriting_event'];
  const record: StudyRecord = { date: '2026-10-24', items: [
    ...keys.flatMap(key => [item(key, { presetKey: key }), item(`${key}-carried`, { templatePresetKey: key })]),
    ...['englishMockTimed', 'englishMockCorrection', 'englishMixedWriting', 'fixedMagazine'].map(template => item(template, { f: { calendarFixedTemplate: template } })),
    item('original-title', { f: { calendarOriginalTitle: '英文歷屆／模考：限時作答' } }),
    item('regular-mock', { type: 'mock', f: { subject: '英文' } }),
    item('regular-magazine', { type: 'magazine', f: { name: '常春藤' } }),
    item('correction', { type: 'mock', presetKey: 'sat_mock_correction', f: { calendarFixedTemplate: 'englishMockCorrection' } }),
  ] };
  assert.deepEqual(overdueTasks([record], '2026-10-25').map(entry => entry.itemId).sort(), ['regular-magazine', 'regular-mock']);
});

test('mixed merged sources retain ordinary work when fixed English routines and listening material are filtered', () => {
  const regular = item('science', { type: 'scienceReview', f: { subject: '物理' } });
  const record: StudyRecord = { date: '2026-10-24', items: [item('parent', { source: 'summary', required: false, f: {
    dailyWorkSourceItems: [item('timed', { presetKey: 'fri_mock_timed' }), item('correction', { presetKey: 'sat_mock_correction' }), regular],
  } }), item('grouped', { source: 'summary', required: false, f: { groupedWorkEntries: [
    item('magazine', { presetKey: 'weekday_magazine' }), item('mixed', { type: 'englishMixedWriting' }),
    item('listening', { type: 'extra', f: { title: '大考英聽A攻略', round: '3' } }), item('math', { type: 'mathLecture' }),
  ] } })] };
  const before = structuredClone(record);
  assert.deepEqual(overdueTasks([record], '2026-10-25').map(entry => entry.itemId).sort(), ['math', 'science']);
  assert.deepEqual(record, before);
});

test('handled routines are hidden but their completion history and study time remain intact', () => {
  const handledAt = '2026-10-25T04:00:00Z';
  const action = { overdueTodoAction: { kind: 'complete' as const, handledAt } };
  const record: StudyRecord = { date: '2026-10-24', items: [
    item('timed', { type: 'mock', presetKey: 'fri_mock_timed', title: '英文歷屆／模考：限時作答',
      done: true, checkedOn: '2026-10-25', f: { ...action, subject: '英文' } }),
    item('magazine', { type: 'magazine', presetKey: 'weekday_magazine', title: '學測英文訓練：英文雜誌',
      done: true, checkedOn: '2026-10-25', f: { ...action, entries: [{ name: '常春藤', month: '10', unit: '2', minutes: '25' }] } }),
    item('skipped', { presetKey: 'fri_magazine', f: { overdueSkippedOn: '2026-10-25', overdueTodoAction: { kind: 'skip', handledAt } } }),
    item('correction', { type: 'mock', presetKey: 'sat_mock_correction', title: '英文歷屆／模考：批改與訂正',
      done: true, checkedOn: '2026-10-25', f: { ...action, subject: '英文' } }),
    item('mixed', { type: 'englishMixedWriting', title: '英文：混合題與作文練習', done: true, checkedOn: '2026-10-25', f: action }),
  ] };
  const before = structuredClone(record);
  const period = { start: '2026-10-25', end: '2026-10-25' };
  const completed = completedItemsForPeriod([record], period);
  const time = completedStudyTimeEntries([record]);
  assert.ok(completed.some(entry => entry.title === '英文歷屆／模考：限時作答'));
  assert.ok(completed.some(entry => entry.title === '學測英文訓練：英文雜誌'));
  assert.ok(completed.some(entry => entry.title === '英文歷屆／模考：批改與訂正'));
  assert.ok(completed.some(entry => entry.title === '英文：混合題與作文練習'));
  assert.deepEqual(overdueHandledTasks([record], Date.parse(handledAt)), []);
  assert.deepEqual(completedItemsForPeriod([record], period), completed);
  assert.deepEqual(completedStudyTimeEntries([record]), time);
  assert.deepEqual(record, before);
});

test('renamed mixed-writing types are excluded while near-match titles and other subjects remain eligible', () => {
  const record: StudyRecord = { date: '2026-10-24', items: [
    item('renamed-mixed', { type: 'englishMixedWriting', title: '自行改名的固定排程' }),
    item('short-mixed', { title: '混合題與作文練習', f: { subject: '英文' } }),
    item('original-correction', { f: { calendarOriginalTitle: '英文歷屆／模考：批改與訂正' } }),
    item('chinese-writing', { title: '混合題與作文練習', f: { subject: '國文' } }),
    item('other-correction', { type: 'mock', title: '英文歷屆／模考：批改與訂正補充練習', f: { subject: '英文' } }),
    item('other-mixed', { title: '英文：混合題與作文練習補充教材', f: { subject: '英文' } }),
  ] };
  const before = structuredClone(record);
  assert.deepEqual(overdueTasks([record], '2026-10-25').map(entry => entry.itemId).sort(), ['chinese-writing', 'other-correction', 'other-mixed']);
  assert.deepEqual(record, before);
});

test('all listening-book tests and legacy fields are excluded without changing stored completion or time', () => {
  const record: StudyRecord = { date: '2026-10-24', items: [
    ...Array.from({ length: 10 }, (_, index) => item(`test-${index + 1}`, { type: 'extra',
      title: `英文｜大考英聽A攻略 Test ${index + 1}`, f: { title: '大考英聽A攻略', round: String(index + 1) } })),
    item('book-field', { f: { book: '英文：大考英聽A攻略' } }),
    item('material-field', { f: { material: '大考英聽A攻略' } }),
    item('legacy-key', { presetKey: 'cal_listening_a_5_event' }),
    item('carried-key', { templatePresetKey: 'cal_listening_a_7_event' }),
    item('listening-done', { type: 'extra', done: true, checkedOn: '2026-10-25',
      f: { title: '大考英聽A攻略', round: '6', overdueTodoAction: { kind: 'complete', handledAt: '2026-10-25T04:00:00Z' } } }),
    item('other-book', { type: 'extra', title: '其他英聽教材 Test 1', f: { title: '其他英聽教材', round: '1' } }),
  ] };
  const before = structuredClone(record);
  assert.deepEqual(overdueTasks([record], '2026-10-25').map(entry => entry.itemId), ['other-book']);
  assert.deepEqual(overdueHandledTasks([record], Date.parse('2026-10-25T04:00:00Z')), []);
  assert.ok(completedItemsForPeriod([record], { start: '2026-10-25', end: '2026-10-25' }).some(entry => entry.title === 'listening-done'));
  assert.ok(completedStudyTimeEntries([record]).length > 0);
  assert.deepEqual(record, before);
});
