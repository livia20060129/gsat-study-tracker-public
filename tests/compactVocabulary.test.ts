import assert from 'node:assert/strict';
import test from 'node:test';
import { CEEC_VOCABULARY } from '../src/data/ceecVocabulary.ts';
import { CEEC_TRANSLATIONS } from '../src/data/ceecTranslations.ts';
import { ceecReferenceMetadata } from '../src/study/ceecReferenceIndex.ts';
import { ceecCoreTranslations } from '../src/study/ceecCoreTranslations.ts';

test('compact offline indices preserve every official spelling, POS, level and licensed meaning', () => {
  for (const [word, entry] of Object.entries(CEEC_VOCABULARY)) {
    const compact = ceecReferenceMetadata(word)!;
    assert.equal(compact.level, entry.level, word);
    assert.deepEqual(compact.levels, entry.levels, word);
    assert.deepEqual(compact.parts, entry.parts, word);
    assert.deepEqual(ceecCoreTranslations(word), CEEC_TRANSLATIONS[word] ?? null, word);
  }
  for (const word of ['toString', '__proto__', 'not-listed-in-official-list']) {
    assert.equal(ceecReferenceMetadata(word), null);
    assert.equal(ceecCoreTranslations(word), null);
  }
});

test('individual cached meanings are detached and remain exact after cache eviction', () => {
  const first = ceecCoreTranslations('ability')!;
  first.noun!.push('手動修改');
  for (const word of Object.keys(CEEC_TRANSLATIONS).slice(0, 300)) ceecCoreTranslations(word);
  assert.deepEqual(ceecCoreTranslations('ability'), CEEC_TRANSLATIONS.ability);
});
