import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProgressImportText } from '../src/application/progressImport.ts';
import { LocalStudyRecordRepository } from '../src/infrastructure/storage/localStudyRecordRepository.ts';
import { SupabaseStudyRecordRepository, type SupabaseStudyRecordClient } from '../src/infrastructure/storage/supabaseStudyRecordRepository.ts';
import { mergeStudyRecordsThreeWay } from '../src/storage/recordSync.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import { updateVocabularyWordEntries, vocabularyReviewEntries } from '../src/study/vocabularyReview.ts';
import { normalizedVocabularyStars, vocabularyMeaningStarKeys, vocabularyWordTokens } from '../src/study/vocabularyStars.ts';
import type { EnglishReviewWordEntry, StudyRecord } from '../src/types.ts';

function record(word: EnglishReviewWordEntry = { text: 'alternate', noun: true, verb: true,
  translationsByPartOfSpeech: { noun: ['代替者', '候補者'], verb: ['輪流'] } }): StudyRecord {
  return { schemaVersion: 2, date: '2026-11-02', items: [{ id: 'review', type: 'englishVocabInteractive',
    done: true, minutes: '15', required: false, f: { words: [{ id: 'word-a', ...word }, { id: 'other', text: 'other' }] } }] };
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

test('legacy entries are unstarred without changing their saved data', () => {
  const source = record();
  const before = structuredClone(source);
  assert.equal(vocabularyReviewEntries([source])[0].vocabularyStars, undefined);
  assert.deepEqual(source, before);
  assert.deepEqual(normalizedVocabularyStars({ card: true, 'word:a:0': false, invalid: true, 'meaning:x': 1 }), { card: true, 'word:a:0': false });
});

test('card, individual word and individual meanings toggle independently without changing study progress', () => {
  const source = record();
  const meaning = vocabularyMeaningStarKeys('Noun', ['代替者', '候補者']);
  for (const key of ['card', 'word:alternate:0', meaning[1]]) updateVocabularyWordEntries(source, 'alternate', { star: { key, marked: true } });
  updateVocabularyWordEntries(source, 'alternate', { star: { key: 'card', marked: false } });
  assert.deepEqual(word(source).vocabularyStars, { card: false, 'word:alternate:0': true, [meaning[1]]: true });
  assert.equal(source.items[0].done, true);
  assert.equal(source.items[0].minutes, '15');
  assert.deepEqual(source.items[0].f.words![1], { id: 'other', text: 'other' });
});

test('tokens preserve punctuation, contractions and repeated-word independence when other words are inserted', () => {
  const tokens = vocabularyWordTokens("It's time—time to re-read.");
  assert.deepEqual(tokens.map(token => token.text), ["It's", 'time', 'time', 'to', 're-read']);
  assert.notEqual(tokens[1].key, tokens[2].key);
  assert.equal(vocabularyWordTokens("Now it's time—time to re-read.")[3].key, tokens[2].key);
  for (const token of tokens) assert.equal("It's time—time to re-read.".slice(token.start, token.end), token.text);
});

test('meanings have separate POS and duplicate identities and do not inherit deleted-row stars', () => {
  const source = record();
  const keys = vocabularyMeaningStarKeys('Noun', ['代替者', '候補者']);
  assert.notEqual(vocabularyMeaningStarKeys('Noun', ['輪流'])[0], vocabularyMeaningStarKeys('Verb', ['輪流'])[0]);
  assert.notEqual(...vocabularyMeaningStarKeys('Noun', ['重複', '重複']) as [string, string]);
  updateVocabularyWordEntries(source, 'alternate', { star: { key: keys[0], marked: true } });
  updateVocabularyWordEntries(source, 'alternate', { translationsByPartOfSpeech: { noun: ['候補者'] } });
  assert.notEqual(word(source).vocabularyStars?.[keys[1]], true);
  assert.equal(word(source).vocabularyStars?.[keys[0]], false);
});

test('a manual correction carries its own meaning star and retains its neighbor and English/card stars', () => {
  const source = record();
  const keys = vocabularyMeaningStarKeys('Noun', ['代替者', '候補者']);
  for (const key of ['card', 'word:alternate:0', ...keys]) updateVocabularyWordEntries(source, 'alternate', { star: { key, marked: true } });
  updateVocabularyWordEntries(source, 'alternate', { translationsByPartOfSpeech: { noun: ['替代者', '候補者'] } });
  assert.equal(word(source).vocabularyStars?.[vocabularyMeaningStarKeys('Noun', ['替代者'])[0]], true);
  assert.equal(word(source).vocabularyStars?.[keys[1]], true);
  assert.equal(word(source).vocabularyStars?.card, true);
  updateVocabularyWordEntries(source, 'alternate', { text: 'alternates' });
  assert.equal(word(source).vocabularyStars?.card, true);
});

test('deleting either identical translation keeps only the surviving rows own star', () => {
  for (const removedIndex of [0, 1]) {
    const source = record({ text: 'alternate', noun: true, translationsByPartOfSpeech: { noun: ['替代者', '替代者'] } });
    const keys = vocabularyMeaningStarKeys('Noun', ['替代者', '替代者']);
    updateVocabularyWordEntries(source, 'alternate', { star: { key: keys[0], marked: true } });
    updateVocabularyWordEntries(source, 'alternate', { translationsByPartOfSpeech: { noun: ['替代者'] }, translationRemoval: { field: 'noun', index: removedIndex } });
    assert.equal(word(source).vocabularyStars?.[keys[0]], removedIndex !== 0);
  }
});

test('phrase and sentence translations can each be starred and corrected separately', () => {
  for (const kind of ['fixedCombination', 'beautifulSentences']) {
    const source = record({ text: 'pay a premium', [kind]: true, translation: '支付保費；支付溢價' });
    const key = vocabularyMeaningStarKeys('', ['支付保費', '支付溢價'])[1];
    updateVocabularyWordEntries(source, 'pay a premium', { star: { key, marked: true } });
    updateVocabularyWordEntries(source, 'pay a premium', { translation: '支付保費；付出溢價' });
    assert.equal(word(source).vocabularyStars?.[vocabularyMeaningStarKeys('', ['支付保費', '付出溢價'])[1]], true);
  }
});

test('same-word duplicate dates and nested rows share stars, including an explicit later clear', () => {
  const older = record();
  older.date = '2026-11-01';
  updateVocabularyWordEntries(older, 'alternate', { star: { key: 'card', marked: true } });
  const newer = record({ text: 'Alternate', vocabularyStars: { card: false, 'word:alternate:0': true } });
  assert.deepEqual(vocabularyReviewEntries([newer, older])[0].vocabularyStars, { card: false, 'word:alternate:0': true });
  older.items[0].f.reviewEntries = structuredClone(newer.items);
  updateVocabularyWordEntries(older, 'alternate', { star: { key: 'card', marked: false } });
  assert.equal((older.items[0].f.reviewEntries[0].f.words![0] as EnglishReviewWordEntry).vocabularyStars?.card, false);
});

test('local storage, codec, JSON import/export and Supabase RPC round-trip preserve stars and clear markers', async () => {
  const source = record({ text: 'alternate', vocabularyStars: { card: false, 'word:alternate:0': true, 'meaning:Noun:test:0': true } });
  const repository = new LocalStudyRecordRepository(new MemoryStorage(), 'study-v11:guest:');
  assert.equal(repository.save(source), true);
  const loaded = repository.load(source.date)!;
  assert.deepEqual(word(loaded).vocabularyStars, word(source).vocabularyStars);
  const decoded = decodeStudyRecord(encodeStudyRecord(loaded));
  assert.equal(decoded.ok, true);
  if (decoded.ok) assert.deepEqual(word(decoded.record).vocabularyStars, word(source).vocabularyStars);
  const imported = parseProgressImportText(JSON.stringify({ records: [loaded] }));
  assert.equal(imported.ok, true);
  if (imported.ok) assert.deepEqual(word(imported.records[0] as unknown as StudyRecord).vocabularyStars, word(source).vocabularyStars);
  let sent: StudyRecord | undefined;
  const client = { rpc(_name: string, parameters: Record<string, unknown>) {
    sent = parameters.p_payload as StudyRecord;
    return Promise.resolve({ data: [{ applied: true, payload: sent, revision: 2, updated_at: '2026-11-02T12:00:00Z' }], error: null });
  } } as unknown as SupabaseStudyRecordClient;
  const saved = await new SupabaseStudyRecordRepository(client).save(source, 1);
  assert.deepEqual(word(sent!).vocabularyStars, word(source).vocabularyStars);
  assert.deepEqual(word(saved.record!).vocabularyStars, word(source).vocabularyStars);
});

test('concurrent different stars and translation edits merge without losing either change', () => {
  const base = record();
  const local = structuredClone(base);
  const cloud = structuredClone(base);
  updateVocabularyWordEntries(local, 'alternate', { star: { key: 'card', marked: true } });
  updateVocabularyWordEntries(cloud, 'alternate', { star: { key: 'word:alternate:0', marked: true }, translationsByPartOfSpeech: { verb: ['交替'] } });
  const merged = mergeStudyRecordsThreeWay(local, cloud, base);
  assert.equal(merged.conflicts.length, 0);
  assert.deepEqual(word(merged.record).vocabularyStars, { card: true, 'word:alternate:0': true });
  assert.deepEqual(word(merged.record).translationsByPartOfSpeech?.verb, ['交替']);
});

test('imports reject malformed star metadata and retain old records without it', () => {
  for (const invalid of [true, [], { card: 'true' }, { arbitrary: true }]) {
    const malformed = { ...record(), items: [{ ...record().items[0], f: { words: [{ text: 'alternate', vocabularyStars: invalid }] } }] };
    assert.equal(parseProgressImportText(JSON.stringify(malformed)).ok, false);
  }
  assert.equal(parseProgressImportText(JSON.stringify(record())).ok, true);
});
