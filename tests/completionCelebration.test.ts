import assert from 'node:assert/strict';
import test from 'node:test';

import { completionCelebrationForChange } from '../src/study/completionCelebration.ts';

test('celebrates as soon as completion reaches fifty percent', () => {
  assert.equal(completionCelebrationForChange(40, 50), 'half');
  assert.equal(completionCelebrationForChange(50, 60), 'half');
});

test('recovers an unseen half milestone on the next completed item', () => {
  assert.equal(completionCelebrationForChange(60, 70), 'half');
});

test('uses the stronger message when one completion reaches one hundred percent', () => {
  assert.equal(completionCelebrationForChange(50, 100), 'complete');
  assert.equal(completionCelebrationForChange(80, 100), 'complete');
});

test('does not repeat a milestone that was already celebrated', () => {
  assert.equal(completionCelebrationForChange(50, 60, { half: true }), null);
  assert.equal(completionCelebrationForChange(90, 100, { complete: true }), null);
});

test('ignores unchecking, sync, and denominator-only percentage changes', () => {
  assert.equal(completionCelebrationForChange(60, 40), null);
  assert.equal(completionCelebrationForChange(40, 60, {}, false), null);
});
