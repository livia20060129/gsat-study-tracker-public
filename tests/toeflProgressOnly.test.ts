import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { TOEFL_VOCABULARY_3800_BOOK, UNLOCK_3_BOOK } from '../src/data/bookPageMaps.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import { isProgressOnlyStudyItem, studyItemProgress } from '../src/study/itemProgress.ts';
import { overdueTasks, updateOverdueTaskProgress } from '../src/study/overdueTasks.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(overrides: Partial<StudyItem> = {}): StudyItem {
  return {
    id: 'toefl', type: 'extra', source: 'preset', required: true, done: false, minutes: '12',
    title: TOEFL_VOCABULARY_3800_BOOK,
    f: { title: TOEFL_VOCABULARY_3800_BOOK, start: '1', end: '8', progress: false, graded: true, corrected: true, reason: '保留既有備註' },
    ...overrides,
  };
}

function runtimeContext(): ReturnType<typeof createContext> {
  const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
  const context = createContext({
    isProgressOnlyStudyItem,
    checked: (value: unknown) => value ? ' checked' : '',
    reasonField: () => '<textarea data-field="reason"></textarea>',
  });
  for (const name of ['renderExtraProgressChecks', 'refreshCorrectionReasonField']) {
    const start = runtime.indexOf(`function ${name}(`);
    const end = runtime.indexOf('\nfunction ', start + 1);
    assert.ok(start >= 0 && end > start, name);
    runInContext(runtime.slice(start, end), context);
  }
  return context;
}

test('progress-only policy identifies only the TOEFL vocabulary extra card including aliases and carried scopes', () => {
  assert.equal(isProgressOnlyStudyItem(item()), true);
  assert.equal(isProgressOnlyStudyItem(item({ f: { book: 'TOEFL 托福決戰字彙 3800', scopeKind: 'unit', unitStart: '1' } })), true);
  assert.equal(isProgressOnlyStudyItem(item({ f: { title: UNLOCK_3_BOOK } })), false);
  assert.equal(isProgressOnlyStudyItem(item({ f: { title: 'ACE Reading' } })), false);
  assert.equal(isProgressOnlyStudyItem(item({ type: 'scienceReview' })), false);
});

test('TOEFL progress ignores old grading/correction/review flags without mutating or deleting them', () => {
  const source = item();
  source.f.review = true;
  const before = structuredClone(source);
  assert.deepEqual(studyItemProgress(source), [{ key: 'progress', label: '進度', checked: false }]);
  source.f.progress = true;
  assert.deepEqual(studyItemProgress(source), [{ key: 'progress', label: '進度', checked: true }]);
  source.f.progress = false;
  assert.deepEqual(source, before);
  assert.deepEqual(studyItemProgress(item({ f: { title: TOEFL_VOCABULARY_3800_BOOK } })), [
    { key: 'progress', label: '進度', checked: false },
  ]);
});

test('real TOEFL controls render only progress in both normal and review mode even with old corrected=true', () => {
  const context = runtimeContext();
  const source = item();
  const before = structuredClone(source);
  for (const reviewMode of [false, true]) {
    const html = context.renderExtraProgressChecks(source, reviewMode) as string;
    assert.equal((html.match(/data-check=/g) ?? []).length, 1);
    assert.match(html, /data-check="progress"/);
    assert.doesNotMatch(html, /data-check="graded"|data-check="corrected"|data-field="reason"|批改|訂正/);
  }
  assert.deepEqual(source, before);
});

test('other English controls keep grading/correction and the existing review-mode reason editor', () => {
  const context = runtimeContext();
  const source = item({ f: { title: UNLOCK_3_BOOK, progress: true, graded: true, corrected: true } });
  assert.deepEqual(studyItemProgress(source).map(progress => progress.key), ['progress', 'graded', 'corrected']);
  const normal = context.renderExtraProgressChecks(source, false) as string;
  assert.match(normal, /data-check="graded"/);
  assert.match(normal, /data-check="corrected"/);
  assert.match(normal, /data-field="reason"/);
  const review = context.renderExtraProgressChecks(source, true) as string;
  assert.doesNotMatch(review, /data-check=/);
  assert.match(review, /data-field="reason"/);
});

test('correction refresh removes a stale TOEFL reason element instead of recreating it from hidden legacy flags', () => {
  const context = runtimeContext();
  let removed = false;
  let inserted = false;
  const card = {
    children: [{ classList: { contains: () => true }, insertAdjacentHTML: () => { inserted = true; } }],
    querySelector: () => ({ remove: () => { removed = true; } }),
  };
  const source = item();
  assert.equal(context.refreshCorrectionReasonField(card, source), true);
  assert.equal(removed, true);
  assert.equal(inserted, false);
  assert.equal(source.f.corrected, true);
  assert.equal(source.f.reason, '保留既有備註');
});

test('todo exposes and accepts only TOEFL progress while keeping old flags, minutes and page range', () => {
  const source: StudyRecord = { date: '2026-10-22', items: [item()] };
  const [todo] = overdueTasks([source], '2026-10-24');
  assert.deepEqual(todo.progress.map(progress => progress.key), ['progress']);
  assert.equal(updateOverdueTaskProgress(source, 'toefl', 'graded', false), null);
  assert.equal(updateOverdueTaskProgress(source, 'toefl', 'corrected', false), null);
  const updated = updateOverdueTaskProgress(source, 'toefl', 'progress', true)!;
  assert.equal(updated.items[0].f.progress, true);
  assert.equal(updated.items[0].f.graded, true);
  assert.equal(updated.items[0].f.corrected, true);
  assert.equal(updated.items[0].minutes, '12');
  assert.equal(updated.items[0].f.end, '8');
  assert.equal(source.items[0].f.progress, false);
});

test('hiding unsupported controls preserves original data through a record round-trip', () => {
  const source: StudyRecord = { schemaVersion: 2, date: '2026-10-22', items: [item()] };
  studyItemProgress(source.items[0]);
  const decoded = decodeStudyRecord(encodeStudyRecord(source));
  assert.equal(decoded.ok, true);
  if (decoded.ok) assert.deepEqual(decoded.record, source);
});
