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
  await page.locator('#studyDate').fill('2026-10-24');
  await page.locator('#studyDate').dispatchEvent('change');
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
  await page.locator('#studyDate').fill('2026-10-24');
  await page.locator('#studyDate').dispatchEvent('change');
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
  await expect(alternate.getByLabel('Noun', { exact: true })).toBeChecked();
  await expect(alternate.getByLabel('Noun 中文翻譯 1', { exact: true })).toHaveValue('');
  await alternate.getByRole('button', { name: '完成「alternate」' }).click();
  await page.locator('#vocabularySearch').fill('alternate');
  for (const withTranslations of [true, false]) {
    const popup = context.waitForEvent('page');
    await page.locator(`[data-export-vocabulary="${withTranslations ? 'translated' : 'blank'}"]`).click();
    const preview = await popup;
    await expect(preview.locator('.source-notices')).toContainText('大學入學考試中心');
    if (withTranslations) await expect(preview.locator('.source-notices')).toContainText('Copyright (c) 2025 Linwei');
    else expect(await preview.content()).not.toContain('輪流');
    if (testInfo.project.name === 'chromium') {
      await preview.pdf({ path: testInfo.outputPath(`attributed-${withTranslations ? 'translated' : 'blank'}.pdf`),
        preferCSSPageSize: true, printBackground: true });
    }
    await preview.close();
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
  await page.getByRole('link', { name: '返回英文單字複習', exact: true }).click();
  await expect(page).toHaveURL(/\/vocabulary\.review\.html$/);
  await expect(page.locator('.vocabulary-row[data-entry-key="alternate"]')).toBeVisible();
  expect(context.pages()).toHaveLength(pageCount);
});
