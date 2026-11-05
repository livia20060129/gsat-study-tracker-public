import assert from 'node:assert/strict';
import test from 'node:test';
import { UNLOCK_3_BOOK } from '../src/data/bookPageMaps.ts';
import { todoRangeSummary, todoStudyDisplay } from '../src/ui/todoStudyDisplay.ts';

test('todo display preserves range controls, scores and notes while removing repeated book and scope text', () => {
  const entry = { title: '英文｜Unlock 3｜Unit 2 The environment（1/2）', description: `${UNLOCK_3_BOOK}｜p.36–46`, details: [
    { label: '教材', value: UNLOCK_3_BOOK }, { label: '書名／冊別', value: UNLOCK_3_BOOK },
    { label: '起始頁', value: '36', editableRange: 'start' as const }, { label: '結束頁', value: '46', editableRange: 'end' as const },
    { label: '主題', value: 'The environment' }, { label: '作文分數', value: '12' }, { label: '錯因／不熟觀念', value: 'The environment' },
  ] };
  const snapshot = JSON.stringify(entry);
  const display = todoStudyDisplay(entry);
  assert.equal(display.title, entry.title);
  assert.equal(display.description, '');
  assert.equal(display.rangeSummary, 'p.36–46');
  assert.deepEqual(display.details.map(detail => detail.label), ['起始頁', '結束頁', '作文分數', '錯因／不熟觀念']);
  assert.equal(JSON.stringify(entry), snapshot);
});

test('todo numbered controls replace heading scopes but keep unrelated instructions and different materials', () => {
  const display = todoStudyDisplay({ title: '英文｜自訂教材 第 12 回', description: '先讀 p.99 的範例再作答', details: [
    { label: '起始 回次', value: '12', editableRange: 'start', rangeKind: 'round' },
    { label: '結束 回次', value: '13', editableRange: 'end', rangeKind: 'round' },
    { label: '作文分數', value: '12' }, { label: '講義', value: '另一份參考書' },
  ] });
  assert.equal(display.title, '英文｜自訂教材');
  assert.equal(display.description, '先讀 p.99 的範例再作答');
  assert.equal(display.details.length, 4);
  assert.equal(display.rangeSummary, '另一份參考書｜第 12–13 回');
});

test('collapsed scope summaries distinguish page, book, Unit and round templates without assuming missing endpoints', () => {
  assert.equal(todoRangeSummary([{ label: '書名／冊別', value: '2' },
    { label: '起始頁', value: '10', editableRange: 'start' }, { label: '結束頁', value: '12', editableRange: 'end' }]), '第 2 冊｜p.10–12');
  assert.equal(todoRangeSummary([{ label: '起始 Unit', value: '3', editableRange: 'start', rangeKind: 'unit' },
    { label: '結束 Unit', value: '3', editableRange: 'end', rangeKind: 'unit' }]), 'Unit 3');
  assert.equal(todoRangeSummary([{ label: '結束 回次', value: '5', editableRange: 'end', rangeKind: 'round' }]), '第 5 回');
  assert.equal(todoRangeSummary([{ label: '起始頁', value: '', editableRange: 'start' }, { label: '結束頁', value: '', editableRange: 'end' }]), '');
  assert.equal(todoRangeSummary([{ label: '教材', value: 'ACE Reading' }, { label: '分數', value: '15' }]), '');
});

test('read-only scope summaries retain nonnumeric ranges and do not mutate the source details', () => {
  const details = [{ label: '單元', value: 'Lesson A–B' }, { label: '頁碼', value: 'p.10–12 或 p.20–22' }];
  const before = structuredClone(details);
  assert.equal(todoRangeSummary(details), '單元 Lesson A–B｜頁碼 p.10–12 或 p.20–22');
  assert.deepEqual(details, before);
});

test('lecture versions remain visible in compact cards and 3A volumes keep their page scope', () => {
  const details = [{ label: '講義版本', value: '教學講義' }, { label: '書名／冊別', value: '3A' },
    { label: '起始頁', value: '1', editableRange: 'start' as const }, { label: '結束頁', value: '10', editableRange: 'end' as const }];
  const source = { title: '數學講義：進度', description: '', details };
  const before = structuredClone(source);
  const display = todoStudyDisplay(source);
  assert.equal(display.rangeSummary, '教學講義｜第 3A 冊｜p.1–10');
  assert.ok(display.details.some(detail => detail.label === '講義版本' && detail.value === '教學講義'));
  assert.equal(todoStudyDisplay({ ...source, title: '數學｜教學講義' }).rangeSummary, '第 3A 冊｜p.1–10');
  assert.equal(todoStudyDisplay({ ...source, title: '數學｜新關鍵' }).rangeSummary, '教學講義｜第 3A 冊｜p.1–10');
  assert.deepEqual(source, before);
});
