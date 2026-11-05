import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import JSZip from 'jszip';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { vocabularyReviewEntries } from '../src/study/vocabularyReview.ts';
import { vocabularyDocxDocument } from '../src/study/vocabularyDocx.ts';
import { vocabularyPdfDocument } from '../src/study/vocabularyPdf.ts';
import { vocabularyPrintDocument } from '../src/study/vocabularyPrint.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import { googleTranslationBadgeBytes } from '../src/data/googleTranslationBadge.ts';
import { inspectVocabularyPdf } from './helpers/pdfText.ts';
import type { StudyRecord } from '../src/types.ts';

const record: StudyRecord = { date: '2026-11-05', items: [{ id: 'words', type: 'englishVocabInteractive', done: false, required: false, minutes: '', f: {
  words: [{ id: 'cell', text: 'cell', noun: true, translationsByPartOfSpeech: { noun: ['人工翻譯'], unclassified: ['Google 測試中文'] },
    cloudTranslationSources: [{ provider: 'google-cloud-translation', text: 'cell', translatedText: 'Google 測試中文', sourceLanguage: 'en', targetLanguage: 'zh-TW' }] }],
} }] };
const words = vocabularyReviewEntries([record]);
const fontBytes = await readFile(new URL('../public/fonts/NotoSansTC-Regular.ttf', import.meta.url));

test('record codecs preserve confirmed Google attribution and the official embedded asset matches the displayed badge', async () => {
  const decoded = decodeStudyRecord(encodeStudyRecord(record));
  assert.ok(decoded.ok);
  if (decoded.ok) assert.deepEqual(vocabularyReviewEntries([decoded.record])[0].cloudTranslationSources, words[0].cloudTranslationSources);
  assert.deepEqual(Buffer.from(googleTranslationBadgeBytes()), await readFile(new URL('../public/google-translate-attribution.png', import.meta.url)));
});

test('translated Word, PDF and print exports include the Google badge and source notice while blank exports contain no answers or Google metadata', async () => {
  const before = structuredClone(words);
  for (const withTranslations of [true, false]) {
    const zip = await JSZip.loadAsync(await (await vocabularyDocxDocument(words, '單字', withTranslations)).arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    const headers = Object.keys(zip.files).filter(name => name.startsWith('word/header') && name.endsWith('.xml'));
    assert.equal(headers.length > 0, withTranslations);
    const media = Object.keys(zip.files).filter(name => name.startsWith('word/media/') && !zip.files[name].dir);
    assert.equal(media.length > 0, withTranslations);
    assert.equal(xml.includes('Cloud Translation API'), withTranslations);
    assert.equal(xml.includes('Google 測試中文'), withTranslations);
    if (!withTranslations) {
      for (const file of Object.values(zip.files)) {
        if (!file.dir && file.name.endsWith('.xml')) assert.doesNotMatch(await file.async('string'), /人工翻譯|Google 測試中文/);
      }
    }
    const html = vocabularyPrintDocument(words, '單字', withTranslations);
    assert.equal(html.includes('powered by Google Translate'), withTranslations);
    assert.equal(html.includes('Google 測試中文'), withTranslations);
    const bytes = await vocabularyPdfDocument(words, '單字', withTranslations, fontBytes);
    const inspected = await inspectVocabularyPdf(bytes);
    assert.equal(inspected.text.includes('Google 測試中文'), withTranslations);
    assert.equal(inspected.text.includes('Cloud Translation API'), withTranslations);
    const pdf = await PDFDocument.load(bytes);
    const images = pdf.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
    assert.equal((images?.keys().length ?? 0) > 0, withTranslations);
  }
  assert.deepEqual(words, before);
});
