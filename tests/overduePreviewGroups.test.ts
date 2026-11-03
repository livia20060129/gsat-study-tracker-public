import assert from 'node:assert/strict';
import test from 'node:test';
import { overduePreviewGroups } from '../src/study/overdueItemFilter.ts';

test('weekly preview combines Units and rounds per book while preserving all source entries', () => {
  const entries = [16, 18, 19, 20].map(unit => ({ subject: 'english' as const, subjectLabel: '英文', title: `英文｜Essential Grammar in Use｜Unit ${unit}` }));
  const before = structuredClone(entries);
  const groups = overduePreviewGroups(entries);
  assert.deepEqual(groups, [{ key: 'english:Essential Grammar in Use', title: 'Essential Grammar in Use', subject: 'english', subjectLabel: '英文', count: 4 }]);
  assert.deepEqual(entries, before);
});

test('matching names across subjects remain separate and counts represent individual overdue work', () => {
  const groups = overduePreviewGroups([
    { subject: 'english', subjectLabel: '英文', title: '英文｜閱讀 第 1 回' },
    { subject: 'english', subjectLabel: '英文', title: '英文｜閱讀 第 2 回' },
    { subject: 'chinese', subjectLabel: '國文', title: '國文｜閱讀 第 1 回' },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups.find(group => group.subject === 'english')?.count, 2);
  assert.equal(groups.find(group => group.subject === 'chinese')?.count, 1);
  assert.deepEqual(overduePreviewGroups([]), []);
});
