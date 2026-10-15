import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizedOverdueSubject,
  overdueSubjectIndex,
  overdueTasks,
  updateOverdueTaskSkip,
} from '../src/study/overdueTasks.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(overrides: Partial<StudyItem> = {}): StudyItem {
  return {
    id: 'scheduled-item',
    type: 'general',
    title: '排程項目',
    done: false,
    minutes: '',
    required: true,
    source: 'preset',
    f: {},
    ...overrides,
  };
}

function record(date: string, items: StudyItem[]): StudyRecord {
  return { date, items };
}

test('待辦只列出今天以前尚未完成、未延期且未跳過的正式排程', () => {
  const results = overdueTasks([
    record('2026-10-04', [
      item({ id: 'english', title: '英文閱讀', type: 'englishPractice', f: { subject: '英文' } }),
      item({ id: 'done', title: '已完成', done: true }),
      item({ id: 'deferred', title: '已延期', deferred: true, deferredTargetDay: 5 }),
      item({ id: 'skipped', title: '已跳過', f: { overdueSkippedOn: '2026-10-06' } }),
      item({ id: 'custom', title: '自行新增', source: 'custom' }),
    ]),
    record('2026-10-07', [item({ id: 'today', title: '今日項目' })]),
    record('2026-10-08', [item({ id: 'future', title: '未來項目' })]),
  ], '2026-10-07');

  assert.deepEqual(results.map(result => result.itemId), ['english']);
  assert.equal(results[0].subject, 'english');
  assert.equal(results[0].subjectLabel, '英文');
  assert.equal(results[0].daysOverdue, 3);
});

test('合併卡片中的真實排程子項目各自出現在待辦且依科目分類', () => {
  const grouped = item({
    id: 'merged-card',
    required: false,
    source: 'summary',
    f: {
      dailyWorkSourceItems: [
        item({ id: 'math-child', title: '數學講義', type: 'mathStudy', f: { subject: '數學A' } }),
        item({ id: 'science-child', title: '物理複習', type: 'scienceReview', f: { subject: '物理' } }),
      ],
    },
  });

  const results = overdueTasks([record('2026-10-05', [grouped])], '2026-10-07');
  assert.deepEqual(
    results.map(result => [result.itemId, result.subject]).sort(),
    [['math-child', 'math'], ['science-child', 'natural']],
  );
});

test('跳過與復原會更新巢狀項目但不改動完成狀態或原紀錄', () => {
  const original = record('2026-10-05', [item({
    id: 'parent',
    source: 'summary',
    required: false,
    f: { groupedWorkEntries: [item({ id: 'child', title: '子項目' })] },
  })]);

  const skipped = updateOverdueTaskSkip(original, 'child', '2026-10-07');
  assert.ok(skipped);
  const skippedChild = skipped.items[0].f.groupedWorkEntries?.[0];
  assert.equal(skippedChild?.f.overdueSkippedOn, '2026-10-07');
  assert.equal(skippedChild?.done, false);
  assert.equal(original.items[0].f.groupedWorkEntries?.[0].f.overdueSkippedOn, undefined);

  const restored = updateOverdueTaskSkip(skipped, 'child', null);
  assert.ok(restored);
  assert.equal(restored.items[0].f.groupedWorkEntries?.[0].f.overdueSkippedOn, undefined);
  assert.equal(restored.items[0].f.groupedWorkEntries?.[0].done, false);
  assert.equal(updateOverdueTaskSkip(original, 'missing', '2026-10-07'), null);
});

test('待辦科目滑塊將無效網址值還原為全部', () => {
  assert.equal(normalizedOverdueSubject('natural'), 'natural');
  assert.equal(normalizedOverdueSubject('invalid'), 'all');
  assert.equal(overdueSubjectIndex('all'), 0);
  assert.equal(overdueSubjectIndex('other'), 5);
});
