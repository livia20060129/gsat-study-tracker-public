import assert from 'node:assert/strict';
import test from 'node:test';

import { grammarScheduleSummary } from '../src/calendar/scheduleSummary.ts';
import { normalizedGrammarUnitTitle, selectGrammarPlan } from '../src/calendar/grammarPlan.ts';

test('shows optional focus before the always-present suggested page range', () => {
  assert.deepEqual(
    grammarScheduleSummary('過去簡單式、進行式、完成式、完成進行式', 'p.18–22'),
    {
      details: ['重點：過去簡單式、進行式、完成式、完成進行式', '建議頁碼：p.18–22'],
    },
  );
});

test('omits the focus line but still shows suggested pages when focus is absent', () => {
  assert.deepEqual(
    grammarScheduleSummary('', 'p.28–44'),
    {
      details: ['建議頁碼：p.28–44'],
    },
  );
});

test('selects the matching split unit from title plus unit progress', () => {
  const plans = [
    { title: 'Ch.2 動詞時態（1／3）', start: 12, end: 17 },
    { title: 'Ch.2 動詞時態（2／3）', start: 18, end: 22 },
    { title: 'Ch.2 動詞時態（3／3）', start: 23, end: 27 },
  ];

  assert.deepEqual(selectGrammarPlan('英文文法｜Ch.2 動詞時態', '2/3', null, null, plans), plans[1]);
  assert.equal(normalizedGrammarUnitTitle(plans[1].title), 'Ch.2 動詞時態');
});

test('explicit Calendar pages still win when selecting a split grammar unit', () => {
  const plans = [
    { title: 'Ch.2 動詞時態（1／3）', start: 12, end: 17 },
    { title: 'Ch.2 動詞時態（2／3）', start: 18, end: 22 },
  ];

  assert.deepEqual(selectGrammarPlan('Ch.2 動詞時態', '1/3', 18, 22, plans), plans[1]);
});
