import assert from 'node:assert/strict';
import test from 'node:test';

import { activeEnglishTaskItems, hasEnglishTaskCollision, resolvedEnglishTaskChoice } from '../src/study/englishTaskChoice.ts';
import { completedStudyTimeEntries } from '../src/study/completedStudyTime.ts';
import { summaryCompletionUnitsForRecord } from '../src/study/learningSummary.ts';
import { summarizeCompletionUnits } from '../src/study/completionMetrics.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import { mergeStudyRecordsThreeWay, stripRecordSyncMeta } from '../src/storage/recordSync.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(id: string, type: string, presetKey: string, done = false): StudyItem {
  return { id, type, presetKey, templatePresetKey: presetKey, source: 'preset', required: true, done, minutes: done ? '30' : '', f: {} };
}

function record(): StudyRecord {
  return { date: '2026-09-25', items: [
    item('mixed', 'englishMixedWriting', 'english_mixed_writing', true),
    item('mock', 'mock', 'fri_mock_timed'),
    item('math', 'mathStudy', 'fri_math_study', true),
  ] };
}

test('collision requires a choice, keeping both stored but only the chosen option active', () => {
  const current = record();
  current.items[0].done = false;
  current.items[0].minutes = '';
  assert.equal(hasEnglishTaskCollision(current.items), true);
  assert.equal(resolvedEnglishTaskChoice(current), null);
  assert.deepEqual(activeEnglishTaskItems(current, current.items).map(item => item.id), ['math']);

  current.englishTaskChoice = 'mock';
  assert.deepEqual(activeEnglishTaskItems(current, current.items).map(item => item.id), ['mock', 'math']);
  current.englishTaskChoice = 'mixed';
  assert.deepEqual(activeEnglishTaskItems(current, current.items).map(item => item.id), ['mixed', 'math']);
  assert.equal(current.items.length, 3);
});

test('legacy progress selects the worked option and a non-collision day stays unchanged', () => {
  const current = record();
  assert.equal(resolvedEnglishTaskChoice(current), 'mixed');
  assert.deepEqual(activeEnglishTaskItems(current, current.items).map(item => item.id), ['mixed', 'math']);
  current.items = current.items.filter(item => item.id !== 'mock');
  assert.equal(hasEnglishTaskCollision(current.items), false);
  assert.deepEqual(activeEnglishTaskItems(current, current.items).map(item => item.id), ['mixed', 'math']);
});

test('Calendar timed mocks participate while an inactive Saturday correction remains recoverable', () => {
  const current = record();
  current.items[1].presetKey = 'cal_fixed_englishMockTimed_event-1';
  current.items[1].templatePresetKey = current.items[1].presetKey;
  assert.equal(hasEnglishTaskCollision(current.items), true);

  const saturday: StudyRecord = { date: '2026-09-26', items: [
    { ...item('correction', 'mock', 'sat_mock_correction', true), f: { englishMockCorrectionInactive: true } },
  ] };
  assert.deepEqual(activeEnglishTaskItems(saturday, saturday.items), []);
  assert.equal(completedStudyTimeEntries([saturday]).length, 0);
  assert.equal(saturday.items[0].done, true);
});

test('inactive completed work is preserved but excluded from time and completion metrics', () => {
  const current = record();
  current.englishTaskChoice = 'mock';
  const mock = summarizeCompletionUnits(summaryCompletionUnitsForRecord(current));
  assert.equal(mock.itemTotal, 2);
  assert.equal(mock.itemCompleted, 1);
  assert.equal(completedStudyTimeEntries([current]).some(entry => entry.itemLabel === '混合題與作文'), false);

  current.englishTaskChoice = 'mixed';
  const mixed = summarizeCompletionUnits(summaryCompletionUnitsForRecord(current));
  assert.equal(mixed.itemTotal, 2);
  assert.equal(mixed.itemCompleted, 2);
  assert.equal(completedStudyTimeEntries([current]).some(entry => entry.itemLabel === '混合題與作文'), true);
});

test('daily choice survives local export/import and the cloud payload merge', () => {
  const current = record();
  current.englishTaskChoice = 'mock';
  const decoded = decodeStudyRecord(encodeStudyRecord(current), current.date);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.record.englishTaskChoice, 'mock');
  assert.equal(stripRecordSyncMeta(decoded.record).englishTaskChoice, 'mock');

  const base = record();
  base.items[0].done = false;
  base.items[0].minutes = '';
  const remote = structuredClone(base);
  remote.englishTaskChoice = 'mock';
  const local = structuredClone(base);
  local.notes = '今日筆記';
  const merged = mergeStudyRecordsThreeWay(local, remote, base);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.record.englishTaskChoice, 'mock');
  assert.equal(merged.record.notes, '今日筆記');
});
