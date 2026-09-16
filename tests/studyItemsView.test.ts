import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adjacentStudyItemsView,
  normalizeStudyItemsView,
  studyItemsViewIndex,
} from '../src/ui/studyItemsView.ts';

test('normalizes today and weekly study item views', () => {
  assert.equal(normalizeStudyItemsView('today'), 'today');
  assert.equal(normalizeStudyItemsView('week'), 'week');
  assert.equal(normalizeStudyItemsView('unknown'), 'today');
});

test('returns the correct slider position for both item views', () => {
  assert.equal(studyItemsViewIndex('today'), 0);
  assert.equal(studyItemsViewIndex('week'), 1);
});

test('keyboard navigation moves between both item views', () => {
  assert.equal(adjacentStudyItemsView('today', 1), 'week');
  assert.equal(adjacentStudyItemsView('week', 1), 'today');
  assert.equal(adjacentStudyItemsView('today', -1), 'week');
});
