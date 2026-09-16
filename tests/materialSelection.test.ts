import assert from 'node:assert/strict';
import test from 'node:test';
import {
  materialSelectionKey,
  parseMaterialSelection,
  readMaterialSelection,
  writeMaterialSelection,
} from '../src/study/materialSelection.ts';

test('material selection is scoped to the active study-record prefix', () => {
  assert.equal(
    materialSelectionKey('study-v11:user:abc:'),
    'study-v11:user:abc:material-selection',
  );
});

test('material selection keeps valid ids in catalog order and removes duplicates', () => {
  assert.deepEqual(
    parseMaterialSelection('["math:b","unknown","math:a","math:b"]', ['math:a', 'math:b']),
    ['math:a', 'math:b'],
  );
  assert.deepEqual(parseMaterialSelection('not-json', ['math:a']), []);
});

test('material selection can be written and read without selecting every material by default', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const prefix = 'study-v11:guest:';
  assert.deepEqual(readMaterialSelection(storage, prefix, ['english:ace']), []);
  writeMaterialSelection(storage, prefix, ['english:ace']);
  assert.deepEqual(readMaterialSelection(storage, prefix, ['english:ace']), ['english:ace']);
});
