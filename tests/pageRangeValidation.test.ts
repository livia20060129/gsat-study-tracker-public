import assert from 'node:assert/strict';
import test from 'node:test';

import { orderedEndPage, validatePageRange } from '../src/study/pageRangeValidation.ts';

test('頁碼範圍允許同頁並拒絕結束頁小於起始頁', () => {
  assert.deepEqual(validatePageRange('20', '20'), { valid: true, message: '' });
  assert.deepEqual(validatePageRange('20', '21'), { valid: true, message: '' });
  assert.deepEqual(validatePageRange('20', '19'), {
    valid: false,
    message: '結束頁必須大於或等於起始頁。',
  });
});

test('頁碼邊界編輯期間可留空但不能是非正整數', () => {
  assert.equal(validatePageRange('', '').valid, true);
  assert.equal(validatePageRange('1', '').valid, true);
  assert.equal(validatePageRange('', '8').valid, true);
  assert.equal(validatePageRange('0', '8').valid, false);
  assert.equal(validatePageRange('1.5', '8').valid, false);
});

test('倒置範圍會直接把結束頁限制為起始頁', () => {
  assert.equal(orderedEndPage('20', '19'), '20');
  assert.equal(orderedEndPage('20', '20'), '20');
  assert.equal(orderedEndPage('20', '21'), '21');
  assert.equal(orderedEndPage('20', ''), '');
});
