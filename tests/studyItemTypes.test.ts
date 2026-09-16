import assert from 'node:assert/strict';
import test from 'node:test';

import { isMathPageStudyItem, isMathProgressStudyItem } from '../src/domain/study/studyItemTypes.ts';
import type { StudyItem } from '../src/types.ts';

function item(type: string): StudyItem {
  return { id: type, type, done: false, minutes: '', required: true, f: {} };
}

test('the first gradual card union recognizes three math page cards', () => {
  assert.equal(isMathPageStudyItem(item('mathStudy')), true);
  assert.equal(isMathPageStudyItem(item('mathLecture')), true);
  assert.equal(isMathPageStudyItem(item('mathPractice')), true);
  assert.equal(isMathPageStudyItem(item('magazine')), false);
});

test('math progress narrows only to cards that contribute completed pages', () => {
  assert.equal(isMathProgressStudyItem(item('mathStudy')), true);
  assert.equal(isMathProgressStudyItem(item('mathLecture')), true);
  assert.equal(isMathProgressStudyItem(item('mathPractice')), false);
});
