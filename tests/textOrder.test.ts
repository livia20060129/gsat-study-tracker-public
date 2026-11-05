import assert from 'node:assert/strict';
import test from 'node:test';
import { compareNumberedChinese, compareTraditionalChinese } from '../src/study/textOrder.ts';

test('task sorting retains traditional Chinese and numeric ordering including ties', () => {
  const names = ['英文｜Unit 10', '英文｜Unit 2', '生物', '化學', '地科', '物理', '國文', 'Azar', 'azar', 'é', 'e', '第 2 回', '第 10 回', ''];
  for (const left of names) {
    for (const right of names) {
      assert.equal(Math.sign(compareTraditionalChinese(left, right)), Math.sign(left.localeCompare(right, 'zh-Hant')));
      assert.equal(Math.sign(compareNumberedChinese(left, right)), Math.sign(left.localeCompare(right, 'zh-TW', { numeric: true })));
    }
  }
  assert.ok(compareNumberedChinese('英文｜Unit 2', '英文｜Unit 10') < 0);
});
