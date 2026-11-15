import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

test('vocabulary tools use centered labeled groups and wrap into centered rows on narrow screens', async ({ page }) => {
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/vocabulary.review.html');
    const reading = page.locator('.vocabulary-reading-tools');
    const exporting = page.locator('.vocabulary-export-tools');
    await expect(reading.locator('#toggleVocabularyTranslations')).toBeVisible();
    await expect(reading.locator('#vocabularyAccent')).toBeVisible();
    await expect(exporting.locator('#vocabularyExportFormat')).toBeVisible();
    await expect(exporting.locator('.vocabulary-export-format>span')).toBeVisible();
    await expect(exporting.locator('.vocabulary-export-format>span')).toHaveText('匯出格式');
    await expect(exporting.getByLabel('匯出格式', { exact: true })).toHaveId('vocabularyExportFormat');
    expect((await exporting.locator('#vocabularyExportFormat').boundingBox())!.width).toBeGreaterThanOrEqual(62);
    await expect(exporting.locator('#vocabularyExportFormat option')).toHaveText(['.pdf', '.docx']);
    for (const format of ['pdf', 'docx', 'pdf']) {
      await exporting.locator('#vocabularyExportFormat').selectOption(format);
      for (const label of ['有翻譯', '無翻譯']) {
        const button = exporting.getByRole('button', { name: label, exact: true });
        await expect(button).toHaveText(label);
        await expect(button.locator('[data-ui-icon="download"] svg')).toBeVisible();
        await expect(button.locator('svg path')).not.toHaveCount(0);
      }
      // On a narrow phone the format label and the two download actions may
      // wrap independently, but each resulting row remains centered.
      const groups = await exporting.locator('.vocabulary-export-format,.vocabulary-export-actions').evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }));
      const box = (await exporting.boundingBox())!;
      const rows = new Map<number, typeof groups>();
      for (const group of groups) { const y = Math.round(group.y + group.height / 2); rows.set(y, [...(rows.get(y) ?? []), group]); }
      for (const row of rows.values()) {
        const left = Math.min(...row.map(group => group.x)), right = Math.max(...row.map(group => group.x + group.width));
        expect(Math.abs((left + right) / 2 - box.x - box.width / 2)).toBeLessThan(1);
      }
    }
    await expect(page.locator('.vocabulary-translation-tools')).toContainText('中文翻譯');
    await expect(reading.getByLabel('發音口音')).toBeVisible();
    await expect(reading.getByLabel('辭典版本')).toBeVisible();
    const first = (await reading.boundingBox())!, second = (await exporting.boundingBox())!;
    const toolbar = (await page.locator('.vocabulary-tool-columns').boundingBox())!;
    const onSameRow = Math.abs(first.y + first.height / 2 - second.y - second.height / 2) < 1;
    if (width === 1440) expect(onSameRow).toBe(true);
    if (onSameRow) expect(Math.abs((first.x + second.x + second.width) / 2 - toolbar.x - toolbar.width / 2)).toBeLessThan(1);
    else for (const row of [first, second]) expect(Math.abs(row.x + row.width / 2 - toolbar.x - toolbar.width / 2)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

async function seedVocabulary(page: Page): Promise<void> {
  await page.goto('/vocabulary.review.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-10-29', JSON.stringify({
      schemaVersion: 2, date: '2026-10-29', notes: '保留筆記',
      items: [{ id: 'layout', type: 'englishVocabInteractive', done: false, minutes: '12', required: false,
        f: { words: ['ability', 'apple', 'cell', 'dog'].map((text, index) => ({
          id: text, text, noun: true, gsatLevel: 1, showGsatLevel: true,
          translationsByPartOfSpeech: { noun: [['能力', '才幹'], ['蘋果'], ['細胞', '小室'], ['狗']][index] },
          dictionarySources: [{ provider: 'ecdict', word: text, sourceUrl: 'https://github.com/skywind3000/ECDICT' }],
        })) } }],
    }));
  });
  await page.reload();
}

async function expectTwoColumns(rows: Locator): Promise<void> {
  await expect.poll(() => rows.evaluateAll(nodes => nodes.every(node => !node.hasAttribute('data-disclosure-motion')))).toBe(true);
  const [first, second, third] = await rows.evaluateAll(nodes => nodes.slice(0, 3).map(node => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  expect(Math.abs(first.y - second.y)).toBeLessThan(1);
  expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);
  expect(third.y).toBeGreaterThanOrEqual(first.y + first.height);
  expect(Math.abs(first.width - second.width)).toBeLessThan(1);
}

test('the Google badge and references sit under the title and all word groupings use two desktop columns', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1200, height: 1000 });
  await seedVocabulary(page);
  const before = await page.evaluate(() => localStorage.getItem('study-v11:guest:2026-10-29'));
  const references = page.locator('#vocabularyReferences');
  expect(await page.locator('h1:visible').evaluate(node => node.nextElementSibling?.id)).toBe('googleTranslationSupport');
  expect(await page.locator('#googleTranslationSupport').evaluate(node => node.nextElementSibling?.id)).toBe('vocabularyReferences');
  await expect(page.locator('#googleTranslationSupport img')).toHaveAttribute('alt', 'Powered by Google Translate');
  await expect(references.getByRole('link')).toHaveCount(4);
  await expect(references).toContainText('大考中心（Level）');
  await expect(references).toContainText('ECDICT（中文翻譯／詞性）');
  await expect(references.getByRole('link', { name: 'Google Translate（按需機器翻譯）', exact: true })).toHaveAttribute('href', 'https://cloud.google.com/translate');
  await expect(page.locator('#vocabularyLegacySources')).toBeHidden();
  await expect(page.locator('.vocabulary-row a[href*="ECDICT"], .vocabulary-row .vocabulary-reference-sources')).toHaveCount(0);
  const rows = page.locator('.vocabulary-row');
  await expect(rows.first()).toHaveCSS('border-top-width', '1px');
  await expect(rows.first()).toHaveCSS('border-radius', '14px');
  await expect(rows.first()).toHaveCSS('background-color', 'rgb(251, 253, 255)');
  for (const grouping of ['字母排序', '詞性', 'Level']) {
    await page.getByRole('button', { name: grouping, exact: true }).click();
    await expect(rows).toHaveCount(4);
    await expect(rows.locator('.vocabulary-word-link')).toHaveText(['ability', 'apple', 'cell', 'dog']);
    await expectTwoColumns(rows);
    const size = await rows.first().boundingBox();
    await page.getByRole('button', { name: '隱藏中文', exact: true }).click();
    await expect(rows.first().locator('.vocabulary-meaning-mask')).toHaveText(['－', '－']);
    expect((await rows.first().boundingBox())!.height).toBe(size!.height);
    await page.getByRole('button', { name: '顯示中文', exact: true }).click();
  }
  expect(await page.evaluate(() => localStorage.getItem('study-v11:guest:2026-10-29'))).toBe(before);
  await page.getByRole('button', { name: '字母排序', exact: true }).click();
  await page.locator('#vocabularyGrouping').evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished)));
  await page.screenshot({ path: testInfo.outputPath('vocabulary-two-columns.png'), fullPage: true });
  const first = rows.first();
  await first.getByRole('button', { name: '編輯「ability」', exact: true }).click();
  const chinese = first.getByLabel('Noun 中文翻譯 1', { exact: true });
  await chinese.fill('本領');
  await first.getByRole('button', { name: '完成「ability」', exact: true }).click();
  await expectTwoColumns(rows);
  await page.reload();
  await expect(rows.first().locator('.vocabulary-meaning-answer')).toHaveText(['本領', '才幹']);
  await page.getByLabel('搜尋單字或詞性', { exact: true }).fill('apple');
  await expect(rows).toHaveCount(1);
  await expect(rows.locator('.vocabulary-word-link')).toHaveText('apple');
});

test('mobile word cards stay in one column with references, masks and editing fully inside the page', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await seedVocabulary(page);
  const rows = page.locator('.vocabulary-row');
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const grouping of ['字母排序', '詞性', 'Level']) {
      await page.getByRole('button', { name: grouping, exact: true }).click();
      const first = (await rows.nth(0).boundingBox())!;
      const second = (await rows.nth(1).boundingBox())!;
      expect(Math.abs(first.x - second.x)).toBeLessThan(1);
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await rows.first().getByRole('button', { name: '編輯「ability」', exact: true }).click();
    await expect(rows.first().getByLabel('Noun 中文翻譯 1', { exact: true })).toBeVisible();
    expect(await rows.first().evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await rows.first().getByRole('button', { name: '完成「ability」', exact: true }).click();
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page.getByRole('button', { name: '字母排序', exact: true }).click();
  await page.locator('#vocabularyGrouping').evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished)));
  await page.screenshot({ path: testInfo.outputPath('vocabulary-mobile-one-column.png'), fullPage: true });
});
