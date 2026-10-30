import assert from 'node:assert/strict';
import test from 'node:test';
import { saveLocalRecordEdit } from '../src/application/records/localRecordEdits.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import { cambridgeDictionaryUrl, dictionaryQuery, dictionaryResult, dictionarySource, ECDICT_SOURCE_URL, type DictionaryLookupResult } from '../src/study/dictionaryEntries.ts';
import { applyDictionarySelection, dictionarySources } from '../src/study/dictionarySelection.ts';
import { localDictionaryLookup } from '../src/study/localDictionaryLookup.ts';
import { updateVocabularyWordEntries, vocabularyReviewEntries } from '../src/study/vocabularyReview.ts';
import { vocabularyPrintDocument } from '../src/study/vocabularyPrint.ts';
import type { EnglishReviewWordEntry, StudyRecord } from '../src/types.ts';
import { cambridgeApiResult } from '../supabase/functions/_shared/cambridgeEntries.ts';
import { lookupCambridge } from '../src/infrastructure/dictionary/cambridgeLookup.ts';
import { createDictionaryLookupHandler } from '../supabase/functions/_shared/dictionaryLookup.ts';

const result: DictionaryLookupResult = { provider: 'ecdict', word: 'cell', sourceUrl: ECDICT_SOURCE_URL,
  meanings: [{ partOfSpeech: 'noun', text: '測試意思甲' }, { partOfSpeech: 'verb', text: '測試意思乙' }] };

function record(word: EnglishReviewWordEntry = { id: 'word', text: 'cell', noun: true, translation: '手動翻譯', gsatLevel: 4, showGsatLevel: false }): StudyRecord {
  return { date: '2026-10-26', notes: '保留筆記', items: [{ id: 'item', type: 'englishVocabInteractive', done: true,
    required: false, minutes: '25', checkedOn: '2026-10-26', f: { words: [word] } }] };
}

test('dictionary query accepts short Latin words and phrases but rejects URLs, markup and oversized input', () => {
  assert.equal(dictionaryQuery(' Cell '), 'cell');
  assert.equal(dictionaryQuery('Café'), 'café');
  assert.equal(dictionaryQuery('mother-in-law'), 'mother-in-law');
  assert.equal(dictionaryQuery('look  after'), 'look after');
  for (const value of ['', null, {}, 'https://example.com', '../cell', '<script>x</script>', 'cell?x=y', 'cell 中文', 'a'.repeat(81)]) {
    assert.equal(dictionaryQuery(value), null);
  }
});

test('local dictionary contract rejects wrong headwords, unknown POS and untrusted source URLs', () => {
  assert.deepEqual(dictionaryResult(result, 'CELL'), result);
  assert.equal(dictionaryResult(result, 'other'), null);
  for (const sourceUrl of ['javascript:alert(1)', 'https://dictionary.cambridge.org.evil/dictionary/english-chinese-traditional/cell',
    'https://user@dictionary.cambridge.org/dictionary/english-chinese-traditional/cell', 'https://dictionary.cambridge.org/elsewhere']) {
    assert.equal(dictionaryResult({ ...result, sourceUrl }, 'cell'), null);
  }
  assert.equal(dictionaryResult({ ...result, meanings: [{ partOfSpeech: 'anything', text: '意思' }] }, 'cell'), null);
  assert.equal(dictionaryResult({ ...result, meanings: [{ partOfSpeech: 'noun', text: '<img src=x>' }] }, 'cell'), null);
});

test('retired API parsing never creates a new translation result', () => {
  assert.equal(cambridgeApiResult({ entryLabel: 'cell', entryContent: '<span class="trans">舊翻譯</span>' }, 'cell'), null);
});

test('legacy attribution remains readable but cannot be used as a new translation selection', () => {
  const legacy = { provider: 'cambridge', word: 'cell', sourceUrl: cambridgeDictionaryUrl('cell') };
  assert.deepEqual(dictionarySource(legacy), legacy);
  assert.equal(dictionaryResult({ ...legacy, meanings: result.meanings }, 'cell'), null);
  const value = record({ text: 'cell', noun: true, translation: '已保存的舊中文', dictionarySources: [legacy] });
  const decoded = decodeStudyRecord(encodeStudyRecord(value));
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  const entry = vocabularyReviewEntries([decoded.record])[0];
  assert.equal(entry.translation, '已保存的舊中文');
  assert.equal(entry.dictionarySources?.[0].provider, 'cambridge');
  assert.match(vocabularyPrintDocument([entry], '單字', true), /歷史保存釋義來源：Cambridge Dictionary/);
});

test('confirming selected senses appends to manual data and never changes English text, levels, disabled Level visibility or time', () => {
  const word: EnglishReviewWordEntry = { text: 'Cell', noun: true, translation: '原有意思',
    gsatLevel: 4, showGsatLevel: false, arbitrary: '保留' };
  assert.equal(applyDictionarySelection(word, { ...result, meanings: [result.meanings[0]] }), true);
  assert.deepEqual(word.translationsByPartOfSpeech?.noun, ['原有意思', '測試意思甲']);
  assert.equal(word.verb, undefined);
  assert.equal(word.text, 'Cell');
  assert.equal(word.gsatLevel, 4);
  assert.equal(word.showGsatLevel, false);
  assert.equal(word.arbitrary, '保留');
  const once = structuredClone(word);
  assert.equal(applyDictionarySelection(word, { ...result, meanings: [result.meanings[0]] }), false);
  assert.deepEqual(word, once);
});

test('local preview uses the shipped dictionary, requires no fetch and confirmation ignores combinations and sentences', () => {
  const local = localDictionaryLookup('cell');
  assert.equal(local?.provider, 'ecdict');
  assert.ok(local?.meanings.length);
  assert.equal(localDictionaryLookup('zzzzunlistedwordzzzz'), null);
  for (const kind of ['fixedCombination', 'beautifulSentences']) {
    const word = { text: 'cell', [kind]: true };
    assert.equal(applyDictionarySelection(word, result), false);
    assert.deepEqual(word, { text: 'cell', [kind]: true });
  }
});

test('reconfirming an existing source does not evict another attribution from a full source list', () => {
  const sources = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'].map(word => ({
    provider: 'ecdict' as const, word, sourceUrl: ECDICT_SOURCE_URL,
  }));
  assert.deepEqual(dictionarySources([...sources, sources[3]]), sources);
});

test('dictionary selection updates matching word occurrences only and survives JSON/local/cloud codec round-trips with source attribution', () => {
  const original = record();
  original.items[0].f.words!.push({ id: 'other', text: 'other', translation: '不要改' });
  original.items.push({ ...original.items[0], id: 'duplicate', minutes: '10', f: { words: [{ text: 'cell', translation: '另一筆手動內容', noun: true }] } });
  assert.equal(updateVocabularyWordEntries(original, 'cell', { dictionarySelection: result }), true);
  const decoded = decodeStudyRecord(encodeStudyRecord(JSON.parse(JSON.stringify(original))));
  assert.equal(decoded.ok, true);
  if (!decoded.ok) throw new Error('Expected valid record');
  assert.equal(decoded.record.notes, '保留筆記');
  assert.equal(decoded.record.items[0].minutes, '25');
  assert.equal(decoded.record.items[0].done, true);
  const words = decoded.record.items[0].f.words as EnglishReviewWordEntry[];
  assert.equal(words[1].translation, '不要改');
  assert.deepEqual(words[0].dictionarySources, [{ provider: 'ecdict', word: 'cell', sourceUrl: result.sourceUrl }]);
  const entries = vocabularyReviewEntries([decoded.record]);
  assert.equal(entries.find(entry => entry.key === 'cell')?.dictionarySources?.[0].provider, 'ecdict');
  assert.ok((decoded.record.items[1].f.words as EnglishReviewWordEntry[])[0].translationsByPartOfSpeech?.noun?.includes('另一筆手動內容'));
});

test('dictionary confirmation merges newer unrelated edits instead of replacing notes or completion in another tab', () => {
  const base = record();
  const latest = structuredClone(base);
  latest.notes = '另一個分頁的最新筆記';
  latest.items[0].minutes = '40';
  const values = new Map([[`p:${base.date}`, JSON.stringify(latest)]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const saved = saveLocalRecordEdit(storage, 'p:', base, function confirm(record): StudyRecord {
    const copy = structuredClone(record);
    updateVocabularyWordEntries(copy, 'cell', { dictionarySelection: result });
    return copy;
  });
  assert.equal(saved?.notes, latest.notes);
  assert.equal(saved?.items[0].minutes, '40');
  assert.equal(saved?.localDirty, true);
});

test('translated PDF attribution follows selected sources and the blank export never embeds the Chinese answers', () => {
  const value = record();
  updateVocabularyWordEntries(value, 'cell', { dictionarySelection: result });
  const entries = vocabularyReviewEntries([value]);
  assert.match(vocabularyPrintDocument(entries, '單字', true), /ECDICT/);
  assert.doesNotMatch(vocabularyPrintDocument(entries, '單字', false), /測試意思甲|測試意思乙|ECDICT/);
  const local = localDictionaryLookup('cell')!;
  updateVocabularyWordEntries(value, 'cell', { dictionarySelection: local });
  assert.match(vocabularyPrintDocument(vocabularyReviewEntries([value]), '單字', true), /MIT License/);
});


test('retired endpoint never reads query bodies, validates tokens or calls external APIs', async () => {
  let calls = 0;
  const handler = createDictionaryLookupHandler({ apiKey: 'unused-secret', fetch: async () => { calls++; throw new Error('must not fetch'); } });
  const request = new Request('https://example.test/dictionary-lookup', { method: 'POST',
    headers: { Authorization: 'Bearer private-token', 'Content-Type': 'application/json' }, body: '{"word":"private-query"}' });
  const response = await handler(request);
  assert.equal(response.status, 410);
  assert.equal(request.bodyUsed, false);
  assert.equal(calls, 0);
  const body = await response.text();
  assert.match(body, /dictionary_retired/);
  assert.doesNotMatch(body, /private-token|private-query|unused-secret/);
});

test('retired endpoint responds consistently to old methods and supplies a safe preflight', async () => {
  const handler = createDictionaryLookupHandler();
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const response = await handler(new Request('https://example.test/dictionary-lookup', { method }));
    assert.equal(response.status, 410);
    assert.equal((await response.json()).provider, 'ecdict');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  const preflight = await handler(new Request('https://example.test/dictionary-lookup', { method: 'OPTIONS' }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*');
});

test('outdated browser lookup adapters fail locally without requiring an account', async () => {
  await assert.rejects(lookupCambridge('cell', 'study-v11:guest:', new AbortController().signal), /本機 ECDICT/);
});
