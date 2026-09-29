import assert from 'node:assert/strict';
import test from 'node:test';
import {
  materialSelectionKey,
  parseMaterialSelection,
  readMaterialSelection,
  writeMaterialSelection,
} from '../src/study/materialSelection.ts';
import {
  includeCurrentMaterialValue,
  manualMaterialChoice,
  selectedManualMaterialChoices,
} from '../src/study/manualMaterialSelection.ts';
import type { MaterialProgressRow } from '../src/study/materialProgress.ts';

function row(id: string, subject: MaterialProgressRow['subject'], title: string): MaterialProgressRow {
  return { id, subject, title, unitLabel: '單元', recorded: 0, total: 1, completionPercent: 0, segments: [] };
}

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

test('checked materials map to manual-selector values without changing the full catalog', () => {
  const rows = [
    row('math:對話式:1', 'math', '數學｜對話式｜1'),
    row('math:新關鍵:1~2', 'math', '數學｜新關鍵｜1~2'),
    row('natural:物理:逆轉勝', 'natural', '自然｜物理｜逆轉勝'),
    row('english:ace', 'english', '英文｜ACE Reading'),
    row('chinese:gujin', 'chinese', '國文｜古今悅讀一百'),
    row('book:公民｜學測週計畫', 'social', '公民｜學測週計畫'),
  ];

  assert.deepEqual(manualMaterialChoice(rows[0]), {
    id: 'math:對話式:1', subject: 'math', value: '對話式', book: '1',
  });
  assert.deepEqual(manualMaterialChoice(rows[2]), {
    id: 'natural:物理:逆轉勝', subject: 'natural', value: '逆轉勝', book: '物理',
  });
  assert.deepEqual(manualMaterialChoice(rows[4]), {
    id: 'chinese:gujin', subject: 'chinese', value: 'reading',
  });
  assert.deepEqual(manualMaterialChoice(rows[5]), {
    id: 'book:公民｜學測週計畫', subject: 'social', value: '公民｜學測週計畫', book: '公民',
  });
  assert.deepEqual(
    selectedManualMaterialChoices(rows, ['math:新關鍵:1~2', 'english:ace']).map(choice => choice.id),
    ['math:新關鍵:1~2', 'english:ace'],
  );
  assert.equal(rows.length, 6);
});

test('an unchecked value is retained only as the current existing record', () => {
  assert.deepEqual(includeCurrentMaterialValue(['對話式'], '新關鍵'), ['對話式', '新關鍵']);
  assert.deepEqual(includeCurrentMaterialValue(['對話式'], '對話式'), ['對話式']);
  assert.deepEqual(includeCurrentMaterialValue([], ''), []);
});
