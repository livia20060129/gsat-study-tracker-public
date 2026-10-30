import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProgressImportText } from '../src/application/progressImport.ts';
import { LocalStudyRecordRepository } from '../src/infrastructure/storage/localStudyRecordRepository.ts';
import { SupabaseStudyRecordRepository, type SupabaseStudyRecordClient } from '../src/infrastructure/storage/supabaseStudyRecordRepository.ts';
import { mergeStudyRecordsThreeWay } from '../src/storage/recordSync.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import { normalizedGsatVocabularyLevel, updateVocabularyWordEntries, vocabularyLevelGroups, vocabularyReviewEntries } from '../src/study/vocabularyReview.ts';
import {
  normalizedVocabularyTranslations,
  vocabularyTranslationCounts,
  vocabularyTranslationGroups,
  vocabularyTranslationText,
} from '../src/study/vocabularyTranslationCounts.ts';
import type { EnglishReviewWordEntry, StudyRecord } from '../src/types.ts';

function record(words: Array<string | EnglishReviewWordEntry> = []): StudyRecord {
  return {
    schemaVersion: 2, date: '2026-10-24',
    items: [{ id: 'review', type: 'englishVocabInteractive', done: true, minutes: '15', required: false, f: { words } }],
  };
}

function word(source: StudyRecord): EnglishReviewWordEntry {
  return source.items[0].f.words![0] as EnglishReviewWordEntry;
}

class MemoryStorage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

test('legacy POS labels create distinct translation groups and do not split bracketed notes', () => {
  const value = 'n. 影響力（經濟、政治）、槓桿；v. 運用；adj. 有利的';
  assert.deepEqual(vocabularyTranslationCounts(value, ['Noun', 'Verb', 'Adjective']), [
    { partOfSpeech: 'Noun', count: 2 }, { partOfSpeech: 'Verb', count: 1 }, { partOfSpeech: 'Adjective', count: 1 },
  ]);
  assert.deepEqual(vocabularyTranslationGroups('（名詞）新奇、獨創性'), { noun: ['新奇', '獨創性'] });
});

test('single-POS legacy meanings are assigned once; ambiguous multi-POS meanings stay unclassified', () => {
  assert.deepEqual(vocabularyTranslationCounts('新奇；獨創性', ['Noun']), [{ partOfSpeech: 'Noun', count: 2 }]);
  assert.deepEqual(vocabularyTranslationCounts('影響力；運用', ['Noun', 'Verb']), [
    { partOfSpeech: 'Noun', count: 0 }, { partOfSpeech: 'Verb', count: 0 }, { partOfSpeech: '未分詞性', count: 2 },
  ]);
  assert.deepEqual(vocabularyTranslationCounts('', ['Verb']), [{ partOfSpeech: 'Verb', count: 0 }]);
});

test('structured translation rows keep at least one editable field and count filled rows only', () => {
  assert.deepEqual(normalizedVocabularyTranslations({ noun: [], verb: [null, '運用', ''] }), { noun: [''], verb: ['運用', ''] });
  assert.deepEqual(vocabularyTranslationCounts('舊備份', ['Noun', 'Verb'], { noun: ['新奇', '獨創性'], verb: [''] }), [
    { partOfSpeech: 'Noun', count: 2 }, { partOfSpeech: 'Verb', count: 0 },
  ]);
  assert.equal(vocabularyTranslationText({ noun: ['新奇', '獨創性'], verb: [''], unclassified: ['備註'] }), 'Noun：新奇、獨創性；備註');
});

test('POS row updates preserve unrelated words, IDs, flags, time and other POS translations', () => {
  const source = record([
    { id: 'word-a', text: 'leverage', noun: true, verb: true, translationsByPartOfSpeech: { noun: ['影響力'], verb: ['運用'] } },
    { id: 'word-b', text: 'novelty', translation: '新奇', noun: true },
  ]);
  assert.equal(updateVocabularyWordEntries(source, 'leverage', { translationsByPartOfSpeech: { noun: [] } }), true);
  assert.deepEqual(word(source).translationsByPartOfSpeech, { noun: [''], verb: ['運用'] });
  assert.equal(word(source).translation, 'Verb：運用');
  assert.equal(word(source).id, 'word-a');
  assert.equal(word(source).verb, true);
  assert.equal(source.items[0].minutes, '15');
  assert.equal((source.items[0].f.words![1] as EnglishReviewWordEntry).translation, '新奇');
});

test('unchecking a POS or hiding the GSAT level does not delete saved meanings or the selected level', () => {
  const source = record([{ text: 'leverage', noun: true, gsatLevel: 4, showGsatLevel: true, translationsByPartOfSpeech: { noun: ['影響力'] } }]);
  updateVocabularyWordEntries(source, 'leverage', { partsOfSpeech: new Set(), showGsatLevel: false });
  assert.equal(word(source).noun, false);
  assert.equal(word(source).showGsatLevel, false);
  assert.equal(word(source).gsatLevel, 4);
  assert.deepEqual(word(source).translationsByPartOfSpeech, { noun: ['影響力'] });
});

test('combination/sentence free-text edits replace stale structured meanings while retaining level preferences', () => {
  const source = record([{ text: 'leverage', gsatLevel: 3, showGsatLevel: true, translationsByPartOfSpeech: { noun: ['影響力'] } }]);
  updateVocabularyWordEntries(source, 'leverage', { contentKind: '組合', translation: '運用資源' });
  assert.equal(word(source).translation, '運用資源');
  assert.equal(word(source).translationsByPartOfSpeech, undefined);
  assert.equal(word(source).gsatLevel, 3);
  assert.equal(word(source).fixedCombination, true);
});

test('GSAT supports exactly Level 1 to Level 6 without assigning a level to old data automatically', () => {
  for (let level = 1; level <= 6; level++) assert.equal(normalizedGsatVocabularyLevel(level), level);
  for (const value of [0, 7, -1, 2.5, '', null, undefined, true, 'Level 3']) assert.equal(normalizedGsatVocabularyLevel(value), null);
  const source = record(['legacy word']);
  const before = JSON.stringify(source);
  const entry = vocabularyReviewEntries([source])[0];
  assert.equal(entry.gsatLevel, null);
  assert.equal(entry.showGsatLevel, false);
  assert.equal(JSON.stringify(source), before);
});

test('duplicate occurrences share edits and an explicit later unchecked level wins over an older visible level', () => {
  const older = record([{ text: 'leverage', gsatLevel: 4, showGsatLevel: true }]);
  older.date = '2026-10-23';
  const newer = record([{ text: 'Leverage', gsatLevel: 5, showGsatLevel: false }]);
  assert.equal(vocabularyReviewEntries([older, newer])[0].showGsatLevel, false);
  assert.equal(vocabularyReviewEntries([older, newer])[0].gsatLevel, 5);
  for (const source of [older, newer]) updateVocabularyWordEntries(source, 'leverage', {
    gsatLevel: 6, showGsatLevel: true, translationsByPartOfSpeech: { verb: ['運用'] },
  });
  assert.equal(vocabularyReviewEntries([older, newer])[0].gsatLevel, 6);
  assert.deepEqual(word(older).translationsByPartOfSpeech, word(newer).translationsByPartOfSpeech);
});

test('legacy strings convert to editable translations and Level metadata without changing other nested items', () => {
  const source = record([]);
  source.items[0].f.reviewEntries = [record(['novelty']).items[0]];
  assert.equal(updateVocabularyWordEntries(source, 'novelty', { gsatLevel: 2, showGsatLevel: true, translationsByPartOfSpeech: { noun: ['新奇'] } }), true);
  const entry = vocabularyReviewEntries([source])[0];
  assert.equal(entry.gsatLevel, 2);
  assert.deepEqual(entry.translationsByPartOfSpeech, { noun: ['新奇'] });
  assert.equal(source.items[0].f.words!.length, 0);
});

test('local repository, JSON export/import and codec round-trip preserve per-POS rows and the unchecked Level', () => {
  const source = record([{ id: 'word-a', text: 'novelty', noun: true, gsatLevel: 2, showGsatLevel: false, translationsByPartOfSpeech: { noun: ['新奇', '獨創性'], verb: [''] } }]);
  const local = new LocalStudyRecordRepository(new MemoryStorage(), 'study-v11:guest:');
  assert.equal(local.save(source), true);
  const loaded = local.load(source.date)!;
  assert.deepEqual(word(loaded), word(source));
  const decoded = decodeStudyRecord(encodeStudyRecord(loaded));
  assert.equal(decoded.ok, true);
  const imported = parseProgressImportText(JSON.stringify({ records: [loaded] }));
  assert.equal(imported.ok, true);
  if (imported.ok) assert.deepEqual((imported.records[0] as unknown as StudyRecord).items[0].f.words, source.items[0].f.words);
});

test('Supabase repository RPC and response round-trip preserve all vocabulary metadata without a schema migration', async () => {
  const source = record([{ id: 'word-a', text: 'novelty', noun: true, gsatLevel: 2, showGsatLevel: true, translationsByPartOfSpeech: { noun: ['新奇', '獨創性'] } }]);
  let sent: StudyRecord | undefined;
  const client = {
    rpc(_name: string, parameters: Record<string, unknown>) {
      sent = parameters.p_payload as StudyRecord;
      return Promise.resolve({ data: [{ applied: true, payload: sent, revision: 2, updated_at: '2026-10-24T12:00:00Z' }], error: null });
    },
  } as unknown as SupabaseStudyRecordClient;
  const saved = await new SupabaseStudyRecordRepository(client).save(source, 1);
  assert.equal(saved.applied, true);
  assert.deepEqual(word(sent!), word(source));
  assert.deepEqual(word(saved.record!), word(source));
});

test('three-way merge keeps local translation edits and cloud Level edits on the same stable word', () => {
  const base = record([{ id: 'word-a', text: 'novelty', noun: true, translation: 'Noun：新奇', gsatLevel: 2, showGsatLevel: false, translationsByPartOfSpeech: { noun: ['新奇'] } }]);
  const local = structuredClone(base);
  const cloud = structuredClone(base);
  updateVocabularyWordEntries(local, 'novelty', { translationsByPartOfSpeech: { noun: ['新奇', '獨創性'] } });
  updateVocabularyWordEntries(cloud, 'novelty', { gsatLevel: 3, showGsatLevel: true });
  const merged = mergeStudyRecordsThreeWay(local, cloud, base);
  assert.equal(merged.conflicts.length, 0);
  assert.deepEqual(word(merged.record).translationsByPartOfSpeech, { noun: ['新奇', '獨創性'] });
  assert.equal(word(merged.record).gsatLevel, 3);
  assert.equal(word(merged.record).showGsatLevel, true);
});

test('import rejects invalid levels and zero-field translation arrays while accepting one blank field', () => {
  for (const fields of [{ gsatLevel: 7 }, { gsatLevel: '2' }, { showGsatLevel: 'yes' }, { translationsByPartOfSpeech: { noun: [] } }]) {
    assert.equal(parseProgressImportText(JSON.stringify(record([{ text: 'novelty', ...fields } as EnglishReviewWordEntry]))).ok, false);
  }
  assert.equal(parseProgressImportText(JSON.stringify(record([{ text: 'novelty', translationsByPartOfSpeech: { noun: [''] } }]))).ok, true);
});

test('GSAT sorting groups checked words by Level 1–6 and alphabetically within a level without mutating the input', () => {
  const entries = vocabularyReviewEntries([record([
    { text: 'zebra', gsatLevel: 1, showGsatLevel: true }, { text: 'alpha', gsatLevel: 1, showGsatLevel: true },
    { text: 'hotel', gsatLevel: 6, showGsatLevel: true }, { text: 'beta', gsatLevel: 2, showGsatLevel: true },
  ])]).reverse();
  const original = [...entries];
  const groups = vocabularyLevelGroups(entries);
  assert.deepEqual(groups.map(group => group.label), ['Level 1', 'Level 2', 'Level 6']);
  assert.deepEqual(groups[0].entries.map(entry => entry.text), ['alpha', 'zebra']);
  assert.deepEqual(entries, original);
});

test('GSAT sorting excludes unchecked, unassigned, invalid and combination entries without a fallback group', () => {
  const entries = vocabularyReviewEntries([record([
    { text: 'hidden', gsatLevel: 3, showGsatLevel: false }, { text: 'unassigned' },
    { text: 'invalid', gsatLevel: 7, showGsatLevel: true } as unknown as EnglishReviewWordEntry,
    { text: 'pay a premium', gsatLevel: 4, showGsatLevel: true, fixedCombination: true },
  ])]);
  assert.deepEqual(vocabularyLevelGroups(entries), []);
  assert.equal(entries.length, 4);
});
