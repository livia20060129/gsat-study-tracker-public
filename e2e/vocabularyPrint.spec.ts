import { expect, test } from '@playwright/test';
import { downloadVocabularyPdf } from './helpers/vocabularyPdf.ts';

test('PDF downloads contain filtered words and separate meanings without changing saved data or opening print previews', async ({ page, context }, testInfo) => {
  const fontRequests: string[] = [];
  page.on('request', request => { if (request.url().endsWith('/fonts/NotoSansTC-Regular.ttf')) fontRequests.push(request.url()); });
  await page.goto('/vocabulary.review.html');
  await page.evaluate(() => {
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-10-24', JSON.stringify({ date: '2026-10-24', items: [{ id: 'words', type: 'englishVocabInteractive', done: false, minutes: '15', required: false,
      f: { words: [{ text: 'alternate', noun: true, verb: true, adjective: true, translationsByPartOfSpeech: { noun: ['代替者', '候補者'], verb: ['輪流'], adjective: ['輪流的'] } }, { text: 'zebra', noun: true, translation: '斑馬' }] } }] }));
  });
  await page.reload();
  expect(fontRequests).toHaveLength(0);
  await page.locator('#vocabularySearch').fill('alternate');
  await page.getByRole('button', { name: '隱藏中文', exact: true }).click();
  const original = await page.evaluate(() => localStorage.getItem('study-v11:guest:2026-10-24'));
  for (const translated of [true, false]) {
    const result = await downloadVocabularyPdf(page, translated, testInfo.outputPath(`single-${translated ? 'translated' : 'blank'}.pdf`));
    for (const term of ['英文', '詞性', '中文翻譯', 'alternate', 'Noun', 'Verb', 'Adjective']) expect(result.text).toContain(term);
    expect(result.text).not.toContain('zebra');
    for (const meaning of ['代替者', '候補者', '輪流', '輪流的']) expect(result.text.includes(meaning)).toBe(translated);
    expect(result.pageTexts).toHaveLength(1);
  }
  expect(context.pages()).toHaveLength(1);
  expect(fontRequests).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('study-v11:guest:2026-10-24'))).toBe(original);
  await page.locator('#vocabularySearch').fill('does-not-exist');
  for (const button of await page.locator('[data-export-vocabulary]').all()) await expect(button).toBeDisabled();
});

test('multi-page PDF downloads preserve Chinese, blank cells and selected Level order', async ({ page }, testInfo) => {
  await page.goto('/vocabulary.review.html');
  await page.evaluate(() => {
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    const words = Array.from({ length: 60 }, (_, index) => ({ text: `word ${String(index + 1).padStart(2, '0')}`, noun: true,
      gsatLevel: index < 30 ? 2 : 1, showGsatLevel: true,
      translationsByPartOfSpeech: { noun: ['第一個意思', '第二個意思較長，用於確認列印時能夠自然換行而不截斷內容。'] } }));
    words.push({ text: 'alternate', noun: true, gsatLevel: 1, showGsatLevel: false, translationsByPartOfSpeech: { noun: ['不應匯出', '未勾選級數'] } });
    localStorage.setItem('study-v11:guest:2026-10-24', JSON.stringify({ date: '2026-10-24', items: [{ id: 'many', type: 'englishVocabInteractive', done: false, minutes: '', required: false, f: { words } }] }));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Level', exact: true }).click();
  for (const translated of [true, false]) {
    const result = await downloadVocabularyPdf(page, translated, testInfo.outputPath(`multipage-${translated ? 'translated' : 'blank'}.pdf`));
    expect(result.pageTexts.length).toBeGreaterThan(1);
    expect(result.text.indexOf('word 31')).toBeLessThan(result.text.indexOf('word 01'));
    for (let index = 1; index <= 60; index += 1) expect(result.text).toContain(`word ${String(index).padStart(2, '0')}`);
    expect(result.text).not.toContain('alternate');
    expect(result.text.includes('第一個意思')).toBe(translated);
    expect(result.text.includes('第二個意思')).toBe(translated);
    for (const text of result.pageTexts) expect(text).toContain('英文\n詞性\n中文翻譯');
  }
});

test('a PDF font load error retains words and allows another download attempt', async ({ page }, testInfo) => {
  await page.goto('/vocabulary.review.html');
  await page.evaluate(() => {
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-10-24', JSON.stringify({ date: '2026-10-24', items: [{ id: 'word', type: 'englishVocabInteractive', done: false, minutes: '', required: false, f: { words: [{ text: 'test', noun: true, translation: '測試' }] } }] }));
  });
  await page.reload();
  const original = await page.evaluate(() => localStorage.getItem('study-v11:guest:2026-10-24'));
  await page.route('**/fonts/NotoSansTC-Regular.ttf', route => route.fulfill({ status: 503, body: '' }));
  await page.locator('[data-export-vocabulary="translated"]').click();
  await expect(page.locator('#vocabularyError')).toContainText('PDF 匯出失敗');
  await expect(page.locator('[data-export-vocabulary="translated"]')).toBeEnabled();
  await page.unroute('**/fonts/NotoSansTC-Regular.ttf');
  const result = await downloadVocabularyPdf(page, true, testInfo.outputPath('retry.pdf'));
  expect(result.text).toContain('測試');
  expect(await page.evaluate(() => localStorage.getItem('study-v11:guest:2026-10-24'))).toBe(original);
});
