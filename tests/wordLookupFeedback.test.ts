import assert from 'node:assert/strict';
import test from 'node:test';
import { WordLookupFeedback } from '../src/ui/wordLookupFeedback.ts';

test('feedback survives rebuilding an input but applies only to the same account, date, word and spelling', () => {
  const state = new WordLookupFeedback();
  const key = JSON.stringify(['account', '2026-11-05', 'card', 'word-id']);
  const attempt = state.begin(key, 'example');
  state.fail(key, attempt, 'monthly limit');
  assert.equal(state.message(key, 'example'), 'monthly limit');
  assert.equal(state.message(key, 'newword'), '');
  assert.equal(state.message(JSON.stringify(['another', '2026-11-05', 'card', 'word-id']), 'example'), '');
});

test('an old failure cannot replace a newer request or its successful result', () => {
  const state = new WordLookupFeedback();
  const old = state.begin('word', 'example');
  const current = state.begin('word', 'example');
  assert.equal(state.fail('word', old, 'stale'), false);
  state.succeed('word', current);
  assert.equal(state.fail('word', current, 'too late'), false);
  assert.equal(state.message('word', 'example'), '');
});

test('a stale success cannot dismiss a newer failure', () => {
  const state = new WordLookupFeedback();
  const old = state.begin('word', 'before');
  const current = state.begin('word', 'after');
  state.fail('word', current, 'quota unavailable');
  state.succeed('word', old);
  assert.equal(state.message('word', 'after'), 'quota unavailable');
});

test('the in-memory feedback cache stays bounded', () => {
  const state = new WordLookupFeedback();
  const oldest = state.begin('oldest', 'word');
  for (let i = 0; i < 128; i++) state.begin(String(i), 'word');
  assert.equal(state.fail('oldest', oldest, 'evicted'), false);
});
