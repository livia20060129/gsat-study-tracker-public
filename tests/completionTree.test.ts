import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyManualCompletionMetadata,
  completionTargetWithinOrigin,
  deferredCarrierForItem,
  findCompletionItem,
  refreshCompletionTree,
} from '../src/study/completionTree.ts';
import type { StudyItem } from '../src/types.ts';

function item(id: string, overrides: Partial<StudyItem> = {}): StudyItem {
  return { id, type: 'general', done: false, minutes: '', required: true, source: 'preset', f: {}, ...overrides };
}

test('completion traversal finds nested rows and their deferred carrier', () => {
  const child = item('child');
  const carrier = item('carrier', { deferredCarry: true, f: { groupedWorkEntries: [child] } });
  assert.equal(findCompletionItem([carrier], 'child'), child);
  assert.equal(deferredCarrierForItem([carrier], child), carrier);
});

test('manual completion metadata reaches represented source rows', () => {
  const source = item('source');
  const visible = item('visible', { f: { dailyWorkSourceItems: [source] } });
  const requests = applyManualCompletionMetadata(visible, true, '2026-09-16', '2026-09-18', [visible]);
  assert.equal(visible.checkedOn, '2026-09-18');
  assert.equal(source.checkedOn, '2026-09-18');
  assert.deepEqual(requests, []);
});

test('deferred leaf completion requests origin synchronization', () => {
  const carried = item('carried', {
    deferredCarry: true,
    deferredOriginId: 'origin',
    deferredOriginDate: '2026-09-16',
  });
  const requests = applyManualCompletionMetadata(carried, true, '2026-09-18', '2026-09-18', [carried]);
  assert.equal(carried.deferredCompletedOn, '2026-09-18');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].carrier, carried);
});

test('origin matching prefers nested origin ids before semantic fallback', () => {
  const originChild = item('origin-child');
  const origin = item('origin', { f: { groupedWorkEntries: [originChild] } });
  const carrier = item('carrier', { deferredCarry: true, deferredOriginId: 'origin' });
  const target = item('copy', { deferredOriginId: 'origin-child' });
  assert.equal(completionTargetWithinOrigin(origin, target, carrier), originChild);
});

test('origin matching preserves Calendar round and Azar section identities', () => {
  const calendarChild = item('calendar-child', {
    type: 'englishPractice',
    f: { calendarEventKey: 'event-1', round: '2', topic: '主題', book: '教材' },
  });
  const azarChild = item('azar-child', {
    type: 'englishPractice',
    f: { azarSectionCode: '2-1' },
  });
  const origin = item('origin', { f: { groupedWorkEntries: [calendarChild, azarChild] } });
  const carrier = item('carrier', { deferredCarry: true });
  const calendarCopy = item('calendar-copy', {
    type: 'englishPractice',
    f: { calendarEventKeys: ['event-1'], round: '2', topic: '主題', book: '教材' },
  });
  const azarCopy = item('azar-copy', {
    type: 'englishPractice',
    f: { azarSectionCode: '2-1' },
  });

  assert.equal(completionTargetWithinOrigin(origin, calendarCopy, carrier), calendarChild);
  assert.equal(completionTargetWithinOrigin(origin, azarCopy, carrier), azarChild);
});

test('refreshCompletionTree recalculates nested aggregate completion', () => {
  const first = item('first', { done: true });
  const second = item('second', { done: false });
  const parent = item('parent', { done: true, f: { groupedWorkEntries: [first, second] } });
  refreshCompletionTree(parent);
  assert.equal(parent.done, false);
  second.done = true;
  refreshCompletionTree(parent);
  assert.equal(parent.done, true);
});
