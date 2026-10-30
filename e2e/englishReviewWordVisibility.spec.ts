import { expect, test } from '@playwright/test';

test('review POS follows word/combination/sentence modes on mobile, preserves checks and reloads correctly', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-23T12:00:00+08:00') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(prefix + '2026-10-22', JSON.stringify({ schemaVersion: 2, date: '2026-10-22', items: [{
      id: 'review-visibility', type: 'englishVocabInteractive', source: 'custom', done: false, minutes: '15', required: false,
      f: { words: [
        { id: 'word', text: 'novelty', noun: true },
        { id: 'phrase', text: 'pay an insurance premium', fixedCombination: true, verb: true },
        { id: 'sentence', text: 'Practice makes perfect.', beautifulSentences: true, adverb: true },
        'legacy word',
      ] },
    }] }));
  });
  await page.reload();
  await page.locator('#studyDate').fill('2026-10-22');
  await page.locator('#studyDate').dispatchEvent('change');
  const card = page.locator('[data-item="review-visibility"]');
  const word = card.locator('.field').filter({ has: page.locator('[data-word-text][data-index="0"]') });
  const phrase = card.locator('.field').filter({ has: page.locator('[data-word-text][data-index="1"]') });
  const sentence = card.locator('.field').filter({ has: page.locator('[data-word-text][data-index="2"]') });
  await expect(word.locator('.word-pos-primary')).toBeVisible();
  await expect(word.getByLabel('Noun', { exact: true })).toBeChecked();
  await expect(phrase.locator('.word-pos-primary')).toBeHidden();
  await expect(sentence.locator('.word-pos-primary')).toBeHidden();
  const indicator = await word.locator('.word-kind-indicator').elementHandle();
  await word.getByRole('button', { name: '組合', exact: true }).click();
  await expect(word.locator('.word-pos-primary')).toBeHidden();
  await word.getByRole('button', { name: '句子', exact: true }).click();
  await expect(word.locator('.word-pos-primary')).toBeHidden();
  await word.getByRole('button', { name: '單字', exact: true }).click();
  await expect(word.locator('.word-pos-primary')).toBeVisible();
  await expect(word.getByLabel('Noun', { exact: true })).toBeChecked();
  expect(await indicator!.evaluate(node => node.isConnected)).toBe(true);
  await phrase.getByRole('button', { name: '單字', exact: true }).click();
  await expect(phrase.getByLabel('Verb', { exact: true })).toBeVisible();
  await expect(phrase.getByLabel('Verb', { exact: true })).toBeChecked();
  await phrase.getByRole('button', { name: '組合', exact: true }).click();
  await sentence.getByRole('button', { name: '單字', exact: true }).click();
  await expect(sentence.getByLabel('Adverb', { exact: true })).toBeChecked();
  await sentence.getByRole('button', { name: '句子', exact: true }).click();
  await page.reload();
  await page.locator('#studyDate').fill('2026-10-22');
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(word.locator('.word-pos-primary')).toBeVisible();
  await expect(phrase.locator('.word-pos-primary')).toBeHidden();
  await expect(sentence.locator('.word-pos-primary')).toBeHidden();
  await expect(card.locator('[data-minutes]')).toHaveValue('15');
  await expect(card.locator('[data-word-text][data-index="3"]')).toHaveValue('legacy word');
  const words = await page.evaluate(() => JSON.parse(localStorage.getItem('study-v11:guest:2026-10-22')!).items
    .find((item: { id: string }) => item.id === 'review-visibility').f.words);
  expect(words[0]).toEqual(expect.objectContaining({ text: 'novelty', noun: true, fixedCombination: false, beautifulSentences: false }));
  expect(words[1]).toEqual(expect.objectContaining({ verb: true, fixedCombination: true, beautifulSentences: false }));
  expect(words[2]).toEqual(expect.objectContaining({ adverb: true, fixedCombination: false, beautifulSentences: true }));
});
