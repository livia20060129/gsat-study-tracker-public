import assert from 'node:assert/strict';
import test from 'node:test';
import { WordInputCommitGate } from '../src/ui/wordInputCommitGate.ts';

const scope = { prefix: 'study-v11:user:one:', date: '2026-11-05' };
test('an unchanged blank input can retry once on leaving and a native change is not duplicated', () => {
  const gate = new WordInputCommitGate(), input = {};
  gate.focus(input, scope);
  assert.equal(gate.leave(input, scope), true);
  assert.equal(gate.leave(input, scope), false);
  gate.focus(input, scope); gate.change(input);
  assert.equal(gate.leave(input, scope), false);
  gate.focus(input, scope);
  assert.equal(gate.leave(input, scope), true);
});
test('a field from another account or date cannot commit into the current record', () => {
  const gate = new WordInputCommitGate(), input = {};
  gate.focus(input, scope);
  assert.equal(gate.leave(input, { ...scope, date: '2026-11-06' }), false);
  gate.focus(input, scope);
  assert.equal(gate.leave(input, { ...scope, prefix: 'study-v11:user:two:' }), false);
  assert.equal(gate.leave({}, scope), false);
});
