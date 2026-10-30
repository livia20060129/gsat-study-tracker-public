import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizedOverdueItemFilter, overdueEntriesForItem, overdueItemFilterForSubject, overdueItemKey, overdueItemOptions, overdueItemTitle } from '../src/study/overdueItemFilter.ts';
import { overdueEntriesForPeriod } from '../src/study/overduePeriod.ts';
import { overdueTasks } from '../src/study/overdueTasks.ts';
import type { OverdueItemSubject } from '../src/study/overdueTasks.ts';
import type { StudyRecord } from '../src/types.ts';

function entry(subject: OverdueItemSubject, title: string, recordDate = '2026-10-27') {
  const labels = { chinese: '國文', english: '英文', math: '數學', natural: '自然', other: '其他' };
  return { subject, subjectLabel: labels[subject], title, recordDate };
}

test('item options group identical titles across dates, separate subjects and have stable ordering', () => {
  const entries = [entry('natural', '共同項目'), entry('english', 'ACE Reading', '2026-09-30'),
    entry('english', 'ACE Reading'), entry('english', '共同項目')];
  const snapshot = structuredClone(entries);
  const options = overdueItemOptions(entries);
  assert.equal(options.length, 3);
  assert.ok(options.slice(0, 2).every(option => option.value.startsWith('english:')));
  assert.ok(options.some(option => option.label === '英文｜ACE Reading'));
  assert.deepEqual(options, overdueItemOptions([...entries].reverse()));
  assert.notEqual(overdueItemKey(entries[0]), overdueItemKey(entries[3]));
  assert.deepEqual(entries, snapshot);
});

test('rounds, retained listening tests and grammar chapters group with one subject prefix each', () => {
  const entries = [45, 46, 50, 71].map(round => entry('chinese', `國文｜國文｜古今悅讀一百 第 ${round} 回`));
  entries.push(...[1, 2, 10].map(round => entry('english', `英文｜英聽補充教材 Test ${round}`)));
  entries.push(...['Ch.1 英文基本句型', 'Ch.2 動詞時態', 'Ch.3 被動語態'].map(chapter => entry('english', `英文｜英文文法總複習｜${chapter}`)));
  const options = overdueItemOptions(entries);
  assert.equal(options.length, 3);
  assert.deepEqual(new Set(options.map(option => option.label)), new Set(['國文｜古今悅讀一百', '英文｜英聽補充教材', '英文｜英文文法總複習']));
  assert.equal(overdueItemTitle('english', '英文：混合題與作文練習'), '混合題與作文練習');
});

test('unknown books group Unit, round, chapter and page scopes without a book whitelist', () => {
  const variants = ['自訂教材｜Unit 1 Animals（1/2）', '自訂教材｜Units 2–3', '自訂教材 Round 4',
    '自訂教材 Test 5', '自訂教材｜Chapter 6 名稱', '自訂教材｜Ch.7 名稱', '自訂教材｜第八章 名稱',
    '自訂教材｜第 9–10 回', '自訂教材｜單元１１ 名稱', '自訂教材｜Lesson 12', '自訂教材｜p.14–20'];
  for (const title of variants) assert.equal(overdueItemKey(entry('english', title)), 'english:自訂教材', title);
  assert.equal(overdueItemTitle('english', 'Unlock 3｜Unit 2 The environment'), 'Unlock 3');
  assert.equal(overdueItemTitle('english', 'TOEFL托福決戰字彙3800｜RANK 3'), 'TOEFL托福決戰字彙3800');
});

test('book names, editions, different tasks and natural subjects are not collapsed by plain numbers', () => {
  for (const title of ['Unlock 3', 'TOEFL托福決戰字彙3800', '123日的淬鍊', 'Unit 731', 'Units of Measurement', '原子第2冊', '英文文法總複習']) {
    assert.equal(overdueItemTitle('english', title), title);
  }
  assert.notEqual(overdueItemKey(entry('math', '數學講義：進度')), overdueItemKey(entry('math', '數學講義：訂正')));
  assert.notEqual(overdueItemKey(entry('natural', '物理｜新關鍵｜第1章')), overdueItemKey(entry('natural', '化學｜新關鍵｜第1章')));
  assert.notEqual(overdueItemKey(entry('english', '教材甲 Unit 1')), overdueItemKey(entry('english', '教材乙 Unit 1')));
});

test('old item URLs normalize to the grouped selection and match every round without changing the entries', () => {
  const entries = [entry('chinese', '國文｜古今悅讀一百 第45回'), entry('chinese', '國文｜古今悅讀一百 第46回')];
  const before = structuredClone(entries);
  const oldKey = 'chinese:國文｜古今悅讀一百 第45回';
  assert.equal(normalizedOverdueItemFilter(oldKey), 'chinese:古今悅讀一百');
  assert.deepEqual(overdueEntriesForItem(entries, oldKey), entries);
  assert.equal(overdueItemKey(entries[0]), overdueItemKey(entries[1]));
  assert.deepEqual(entries, before);
});

test('real overdue rounds and Units remain separate records after grouping with all their original progress', () => {
  const records: StudyRecord[] = [1, 2].map(unit => ({ date: `2026-10-${24 + unit}`, items: [{
    id: `unlock-${unit}`, type: 'extra', title: `英文｜Unlock 3｜Unit ${unit}`, source: 'preset', required: true,
    done: false, minutes: String(unit * 10), f: { title: 'Unlock 3', unitStart: String(unit), unitEnd: String(unit), progress: unit === 1 },
  }] }));
  const before = structuredClone(records);
  const entries = overdueTasks(records, '2026-10-28');
  const options = overdueItemOptions(entries);
  assert.deepEqual(options, [{ value: 'english:Unlock 3', label: '英文｜Unlock 3' }]);
  const selected = overdueEntriesForItem(entries, options[0].value);
  assert.deepEqual(selected.map(item => item.itemId), ['unlock-1', 'unlock-2']);
  assert.deepEqual(selected.map(item => item.minutes), ['10', '20']);
  assert.deepEqual(records, before);
});

test('item and period filtering intersect without mutating, reordering or copying individual entries', () => {
  const entries = [entry('english', 'ACE Reading', '2026-09-30'), entry('natural', '物理'), entry('english', 'ACE Reading')];
  const snapshot = structuredClone(entries);
  assert.deepEqual(overdueEntriesForItem(entries, ''), entries);
  const key = overdueItemKey(entries[0]);
  assert.deepEqual(overdueEntriesForItem(entries, key), [entries[0], entries[2]]);
  const filtered = overdueEntriesForItem(overdueEntriesForPeriod(entries, 'week', '2026-10-28'), key);
  assert.deepEqual(filtered, [entries[2]]);
  assert.equal(filtered[0], entries[2]);
  assert.deepEqual(overdueEntriesForItem(entries, 'english:已無待辦'), []);
  assert.deepEqual(entries, snapshot);
});

test('subject changes reset incompatible item selections and old excluded selections cannot reappear', () => {
  assert.equal(overdueItemFilterForSubject('chinese:國文｜古今悅讀一百 第45回', 'chinese'), 'chinese:古今悅讀一百');
  assert.equal(overdueItemFilterForSubject('chinese:古今悅讀一百', 'all'), 'chinese:古今悅讀一百');
  assert.equal(overdueItemFilterForSubject('english:ACE Reading', 'chinese'), '');
  assert.equal(overdueItemFilterForSubject('chinese:古今悅讀一百', 'english'), '');
  for (const selected of ['english:大考英聽A攻略', 'english:英文歷屆／模考：批改與訂正', 'english:混合題與作文練習']) {
    assert.equal(overdueItemFilterForSubject(selected, 'all'), '');
    assert.equal(normalizedOverdueItemFilter(selected), '');
  }
});

test('item URL values normalize safely and preserve punctuation in real titles', () => {
  for (const value of [null, undefined, 1, '', 'all', 'all:全部', '__proto__:x', 'unknown:x', 'english:  ']) {
    assert.equal(normalizedOverdueItemFilter(value), '');
  }
  assert.equal(normalizedOverdueItemFilter('english:  主題：A & B／"C"  '), 'english:主題：A & B／"C"');
  const key = overdueItemKey(entry('english', '<標題> & / Unit 1'));
  const url = new URL('https://example.test/todo.html?period=week#english');
  url.searchParams.set('item', key);
  assert.equal(normalizedOverdueItemFilter(url.searchParams.get('item')), key);
});

test('options are derived only from eligible overdue work and preserve all source records', () => {
  const record: StudyRecord = { date: '2026-10-27', items: [
    { id: 'ace', type: 'extra', title: 'ACE Reading', required: true, source: 'preset', done: false, minutes: '12', f: { title: 'ACE Reading', round: '1' } },
    { id: 'interactive', type: 'interactiveDaily', title: '互動題', required: true, done: false, minutes: '', f: {} },
    { id: 'done', type: 'scienceReview', title: '已完成', required: true, done: true, minutes: '20', f: { subject: '物理' } },
  ] };
  const snapshot = structuredClone(record);
  const options = overdueItemOptions(overdueTasks([record], '2026-10-28'));
  assert.deepEqual(options, [{ value: 'english:ACE Reading', label: '英文｜ACE Reading' }]);
  assert.deepEqual(record, snapshot);
});
