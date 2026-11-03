import { downloadVocabularyPdf } from './helpers/vocabularyPdf.ts';
import { navigateSite, selectStudyDate } from './helpers/siteNavigation.ts';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { EnglishReviewWordEntry } from '../src/types.ts';

async function seedWords(page: Page, words: EnglishReviewWordEntry[]): Promise<void> {
  await page.goto('/vocabulary.review.html');
  await page.evaluate(entries => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-10-24', JSON.stringify({ schemaVersion: 2, date: '2026-10-24', items: [{
      id: 'autofill', type: 'englishVocabInteractive', source: 'custom', done: false, minutes: '15', required: false,
      f: { words: entries },
    }] }));
  }, words);
}

async function storedWords(page: Page): Promise<EnglishReviewWordEntry[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('study-v11:guest:2026-10-24')!).items
    .find((item: { id: string }) => item.id === 'autofill').f.words);
}

test('completed English input fills official metadata locally, preserves the typing node and survives tracker/review reloads', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const externalLookups: string[] = [];
  page.on('request', request => {
    if (/ecdict|oxfordlearnersdictionaries|ceec\.edu/.test(request.url())) externalLookups.push(request.url());
  });
  await seedWords(page, [{ id: 'stable', text: '' }, { id: 'article', text: '' }, { id: 'auxiliary', text: '' }]);
  await page.goto('/');
  await selectStudyDate(page, '2026-10-24');
  const card = page.locator('[data-item="autofill"]');
  const input = card.locator('[data-word-text][data-index="0"]');
  const row = card.locator('.field').filter({ has: page.locator('[data-word-text][data-index="0"]') });
  const originalNode = await input.elementHandle();
  await input.fill('a');
  await input.fill('ability');
  await expect(row.getByLabel('Noun', { exact: true })).not.toBeChecked();
  await expect(row.locator('[data-word-reference]')).toBeEmpty();
  await input.press('Tab');
  await expect(row.getByLabel('Noun', { exact: true })).toBeChecked();
  await expect(row.locator('[data-word-reference]')).toContainText('大考中心 Level 1');
  expect(await originalNode!.evaluate(node => node.isConnected)).toBe(true);
  await expect.poll(async () => (await storedWords(page))[0]).toMatchObject({ id: 'stable', text: 'ability',
    noun: true, gsatLevel: 1, showGsatLevel: true, translationsByPartOfSpeech: { noun: ['能力', '才幹'] } });
  for (const [index, text, label] of [[1, 'the', 'Article'], [2, 'may', 'Auxiliary']] as const) {
    const nextInput = card.locator(`[data-word-text][data-index="${index}"]`);
    await nextInput.fill(text);
    await nextInput.press('Tab');
    await expect(card.locator('.field').filter({ has: page.locator(`[data-word-text][data-index="${index}"]`) })
      .getByLabel(label, { exact: true })).toBeChecked();
  }
  expect(await row.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.reload();
  await selectStudyDate(page, '2026-10-24');
  await expect(row.getByLabel('Noun', { exact: true })).toBeChecked();
  await expect(card.locator('[data-minutes]')).toHaveValue('15');
  await page.goto('/vocabulary.review.html');
  const review = page.locator('.vocabulary-row[data-entry-key="ability"]');
  await expect(review.locator('.vocabulary-meaning-answer')).toHaveText(['能力', '才幹']);
  await expect(review.locator('.vocabulary-gsat-level')).toHaveText('學測 Level 1');
  await page.getByRole('button', { name: 'Level', exact: true }).click();
  await expect(page.locator('#vocabulary-group-level-1')).toContainText('ability');
  await page.getByRole('button', { name: '詞性', exact: true }).click();
  await expect(page.locator('#vocabulary-group-article')).toContainText('the');
  await expect(page.locator('#vocabulary-group-auxiliary')).toContainText('may');
  expect(externalLookups).toEqual([]);
});

test('review-page English changes fill new words but preserve manual meanings, POS and disabled Level display', async ({ page }) => {
  await seedWords(page, [{ id: 'stable', text: 'new-test-word' }]);
  await page.reload();
  async function rename(from: string, to: string): Promise<void> {
    const row = page.locator(`.vocabulary-row[data-entry-key="${from}"]`);
    if (!await row.locator('[data-vocabulary-text]').count()) await row.getByRole('button', { name: `編輯「${from}」` }).click();
    await row.getByLabel('英文內容').fill(to);
    await row.getByLabel('英文內容').press('Tab');
  }
  await rename('new-test-word', 'ability');
  await rename('ability', 'abandon');
  const row = page.locator('.vocabulary-row[data-entry-key="abandon"]');
  await expect(row.getByLabel('Verb', { exact: true })).toBeChecked();
  await expect(row.getByRole('combobox', { name: '學測單字級數', exact: true })).toHaveValue('4');
  await expect(row.getByLabel('Verb 中文翻譯 1', { exact: true })).toHaveValue('放棄');
  await row.getByLabel('Verb 中文翻譯 1', { exact: true }).fill('我手動寫的意思');
  await row.getByLabel('Adjective', { exact: true }).check();
  await row.getByRole('combobox', { name: '學測單字級數', exact: true }).selectOption('6');
  await row.getByLabel('顯示學測單字級數', { exact: true }).uncheck();
  await rename('abandon', 'you');
  const renamed = page.locator('.vocabulary-row[data-entry-key="you"]');
  await expect(renamed.getByLabel('Adjective', { exact: true })).toBeChecked();
  await expect(renamed.getByLabel('顯示學測單字級數', { exact: true })).not.toBeChecked();
  await expect(renamed.getByRole('combobox', { name: '學測單字級數', exact: true })).toHaveValue('6');
  const word = (await storedWords(page))[0];
  expect(word.id).toBe('stable');
  expect(word.translationsByPartOfSpeech?.verb?.[0]).toBe('我手動寫的意思');
  await renamed.getByRole('button', { name: '完成「you」' }).click();
  await page.reload();
  await expect(renamed.locator('.vocabulary-gsat-level')).toHaveCount(0);
  expect((await storedWords(page))[0]).toEqual(word);
});

test('old data is read-only until edited, phrases are excluded, and source notices accompany real PDF exports', async ({ page, context }, testInfo) => {
  await seedWords(page, [{ id: 'old', text: 'ability', noun: true, translation: '舊中文' },
    { id: 'phrase', text: 'you', fixedCombination: true }, { id: 'new', text: 'new-test-word' }]);
  const original = await storedWords(page);
  await page.reload();
  expect(await storedWords(page)).toEqual(original);
  const row = page.locator('.vocabulary-row[data-entry-key="new-test-word"]');
  await row.getByRole('button', { name: '編輯「new-test-word」' }).click();
  await row.getByLabel('英文內容').fill('alternate');
  await row.getByLabel('英文內容').press('Tab');
  const alternate = page.locator('.vocabulary-row[data-entry-key="alternate"]');
  await expect(alternate.getByLabel('Noun', { exact: true })).not.toBeChecked();
  await expect(alternate.getByLabel('Verb', { exact: true })).toBeChecked();
  await expect(alternate.getByLabel('Verb 中文翻譯 1', { exact: true })).toHaveValue('輪流');
  await alternate.getByRole('button', { name: '完成「alternate」' }).click();
  await page.locator('#vocabularySearch').fill('alternate');
  for (const withTranslations of [true, false]) {
    const result = await downloadVocabularyPdf(page, withTranslations, testInfo.outputPath(`attributed-${withTranslations ? 'translated' : 'blank'}.pdf`));
    expect(result.text).toContain('大學入學考試中心');
    if (withTranslations) expect(result.text).toContain('Copyright (c) 2025 Linwei');
    else expect(result.text).not.toContain('輪流');
  }
  expect((await storedWords(page))[1]).toEqual(original[1]);
  const pageCount = context.pages().length;
  await page.getByRole('link', { name: '單字資料來源與授權', exact: true }).click();
  await expect(page).toHaveURL(/\/vocabulary\.sources\.html$/);
  expect(context.pages()).toHaveLength(pageCount);
  await expect(page.locator('body')).toContainText('ECDICT');
  const license = await page.request.get('/licenses/ECDICT-MIT.txt');
  expect(license.ok()).toBe(true);
  expect(await license.text()).toContain('Copyright (c) 2025 Linwei');
  const manifest = await page.request.get('/vocabulary-reference-manifest.json');
  expect((await manifest.json()).official.lookupSpellings).toBe(6191);
  const returnToVocabulary = page.locator('.source-navigation a[href="./vocabulary.review.html"]');
  await expect(returnToVocabulary).toHaveText('英文單字複習');
  await expect(returnToVocabulary).toHaveAttribute('data-navigation', 'vocabulary');
  await navigateSite(page, 'vocabulary.review.html');
  await expect(page).toHaveURL(/\/vocabulary\.review\.html$/);
  await expect(page.locator('.vocabulary-row[data-entry-key="alternate"]')).toBeVisible();
  expect(context.pages()).toHaveLength(pageCount);
});

async function openTrackerWord(page: Page): Promise<void> {
  await page.goto('/');
  await selectStudyDate(page, '2026-10-24');
}

for (const returnBeforeResponse of [false, true]) test(`an ECDICT word saves across date changes when returning ${returnBeforeResponse ? 'before' : 'after'} its response`, async ({ page }) => {
  await seedWords(page, [{ id: 'extended', text: '' }]);
  let release = function (): void {};
  let requests = 0;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/dictionaries/ecdict-v1/*.json', async route => { requests++; await pending; await route.continue(); });
  await openTrackerWord(page);
  const input = page.locator('[data-item="autofill"] [data-word-text]');
  await input.fill('novelty'); await input.press('Tab');
  await expect.poll(() => requests).toBe(1);
  await expect.poll(async () => (await storedWords(page))[0].text).toBe('novelty');
  await selectStudyDate(page, '2026-10-25');
  if (returnBeforeResponse) {
    await selectStudyDate(page, '2026-10-24');
  }
  release();
  await expect.poll(async () => (await storedWords(page))[0]).toMatchObject({ noun: true,
    translationsByPartOfSpeech: { noun: ['新奇', '新鮮', '新奇的事物'] } });
  expect((await storedWords(page))[0].gsatLevel).toBeUndefined();
  if (returnBeforeResponse) await expect(page.locator('[data-item="autofill"] [data-word-pos="noun"]')).toBeChecked();
  await page.reload();
  await page.goto('/vocabulary.review.html');
  const row = page.locator('[data-entry-key="novelty"]');
  await expect(row.locator('.vocabulary-meaning-answer')).toHaveText(['新奇', '新鮮', '新奇的事物']);
  await expect(row.locator('.vocabulary-gsat-level')).toHaveCount(0);
  await row.getByRole('button', { name: '編輯「novelty」' }).click();
  await row.getByLabel('Noun 中文翻譯 1', { exact: true }).fill('我的手動翻譯');
  await row.getByLabel('Verb', { exact: true }).check();
  await row.getByLabel('Noun', { exact: true }).uncheck();
  await row.getByRole('button', { name: '完成「novelty」' }).click();
  await page.reload();
  expect((await storedWords(page))[0].translationsByPartOfSpeech?.noun?.[0]).toBe('我的手動翻譯');
  expect((await storedWords(page))[0]).toMatchObject({ noun: false, verb: true });
});

test('late dictionary responses cannot replace newer English or overwrite a manual unchecked POS', async ({ page }) => {
  await seedWords(page, [{ id: 'extended', text: '' }, { id: 'manual', text: '' }]);
  let release = function (): void {};
  let requests = 0;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/dictionaries/ecdict-v1/*.json', async route => { requests++; await pending; await route.continue(); });
  await openTrackerWord(page);
  const card = page.locator('[data-item="autofill"]');
  const first = card.locator('[data-word-text][data-index="0"]');
  const second = card.locator('[data-word-text][data-index="1"]');
  await first.fill('novelty'); await first.press('Tab');
  await second.fill('novelty'); await second.press('Tab');
  const noun = card.locator('[data-word-pos="noun"][data-index="1"]');
  await noun.check(); await noun.uncheck();
  await first.fill('ability'); await first.press('Tab');
  release();
  await expect.poll(async () => (await storedWords(page))[1].translation).toContain('新奇');
  expect(requests).toBe(1);
  expect((await storedWords(page))[0]).toMatchObject({ text: 'ability', translationsByPartOfSpeech: { noun: ['能力', '才幹'] } });
  expect((await storedWords(page))[1].noun).toBe(false);
  await expect(noun).not.toBeChecked();
});

test('review English changes use ECDICT automatically without the preview confirmation step', async ({ page }) => {
  await seedWords(page, [{ id: 'extended', text: 'new-test-word' }]);
  await page.reload();
  const original = page.locator('[data-entry-key="new-test-word"]');
  await original.getByRole('button', { name: '編輯「new-test-word」' }).click();
  await original.getByLabel('英文內容').fill('novelty');
  await original.getByLabel('英文內容').press('Tab');
  const row = page.locator('[data-entry-key="novelty"]');
  await expect(row.getByLabel('Noun', { exact: true })).toBeChecked();
  await expect(row.getByLabel('Noun 中文翻譯 1', { exact: true })).toHaveValue('新奇');
  expect((await storedWords(page))[0].showGsatLevel).toBeUndefined();
  await row.getByLabel('Noun 中文翻譯 1', { exact: true }).fill('自訂中文');
  await row.getByLabel('英文內容').focus();
  await row.getByLabel('英文內容').dispatchEvent('change');
  await expect(row.getByLabel('Noun 中文翻譯 1', { exact: true })).toHaveValue('自訂中文');
});

test('lookup failures keep English saved and let a later edit retry ECDICT', async ({ page }) => {
  await seedWords(page, [{ id: 'extended', text: '' }]);
  let requests = 0;
  await page.route('**/dictionaries/ecdict-v1/*.json', route => {
    requests++;
    return requests === 1 ? route.fulfill({ status: 503, body: '' }) : route.continue();
  });
  await openTrackerWord(page);
  const input = page.locator('[data-item="autofill"] [data-word-text]');
  await input.fill('novelty'); await input.press('Tab');
  await expect(page.locator('[data-item="autofill"] [data-word-reference]')).toContainText('ECDICT 暫時無法載入');
  expect((await storedWords(page))[0].text).toBe('novelty');
  await input.dispatchEvent('change');
  await expect.poll(async () => (await storedWords(page))[0].translation).toContain('新奇');
  expect(requests).toBe(2);
});
