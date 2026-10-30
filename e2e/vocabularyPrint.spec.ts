import { expect, test } from '@playwright/test';

test('PDF previews use filtered words, merged cells and separate meaning rows without changing saved data', async ({ page, context }) => {
  await page.goto('/vocabulary.review.html');
  await page.evaluate(() => {
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-10-24', JSON.stringify({ date: '2026-10-24', items: [{
      id: 'words', type: 'englishVocabInteractive', done: false, minutes: '15', required: false,
      f: { words: [
        { text: 'alternate', noun: true, verb: true, adjective: true,
          translationsByPartOfSpeech: { noun: ['代替者', '候補者'], verb: ['輪流'], adjective: ['輪流的'] } },
        { text: 'zebra', noun: true, translation: '斑馬' },
      ] },
    }] }));
  });
  await page.reload();
  await page.locator('#vocabularySearch').fill('alternate');
  await page.getByRole('button', { name: '隱藏中文', exact: true }).click();
  const original = await page.evaluate(() => localStorage.getItem('study-v11:guest:2026-10-24'));
  for (const withTranslations of [true, false]) {
    const popup = context.waitForEvent('page');
    await page.getByRole('button', { name: `匯出 PDF（${withTranslations ? '有' : '無'}翻譯）`, exact: true }).click();
    const preview = await popup;
    await expect(preview.locator('thead th')).toHaveText(['英文', '詞性', '中文翻譯']);
    await expect(preview.locator('tbody')).toHaveCount(1);
    await expect(preview.locator('td.english')).toHaveText('alternate');
    await expect(preview.locator('td.english')).toHaveAttribute('rowspan', '4');
    await expect(preview.locator('td.part').first()).toHaveAttribute('rowspan', '2');
    await expect(preview.locator('td.part')).toHaveText(['Noun', 'Verb', 'Adjective']);
    await expect(preview.locator('td.meaning')).toHaveText(withTranslations ? ['代替者', '候補者', '輪流', '輪流的'] : ['', '', '', '']);
    expect(await preview.evaluate(() => window.opener === null)).toBe(true);
    if (!withTranslations) expect(await preview.content()).not.toContain('代替者');
    await preview.evaluate(() => { window.print = () => { document.body.dataset.printRequested = 'true'; }; });
    await preview.getByRole('button', { name: '列印／儲存為 PDF', exact: true }).click();
    await expect(preview.locator('body')).toHaveAttribute('data-print-requested', 'true');
    await preview.close();
  }
  expect(await page.evaluate(() => localStorage.getItem('study-v11:guest:2026-10-24'))).toBe(original);
  await page.locator('#vocabularySearch').fill('does-not-exist');
  for (const button of await page.locator('[data-export-vocabulary]').all()) await expect(button).toBeDisabled();
});

test('multipage PDF tables preserve Chinese text, blank cells and the selected Level order', async ({ page, context }, testInfo) => {
  await page.goto('/vocabulary.review.html');
  await page.evaluate(() => {
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    const words = Array.from({ length: 60 }, (_, index) => ({
      text: `word ${String(index + 1).padStart(2, '0')}`, noun: true,
      gsatLevel: index < 30 ? 2 : 1, showGsatLevel: true,
      translationsByPartOfSpeech: { noun: ['第一個意思', '第二個意思較長，用於確認列印時能夠自然換行而不截斷內容。'] },
    }));
    words.push({ text: 'alternate', noun: true, gsatLevel: 1, showGsatLevel: false,
      translationsByPartOfSpeech: { noun: ['不應匯出', '未勾選級數'] } });
    localStorage.setItem('study-v11:guest:2026-10-24', JSON.stringify({ date: '2026-10-24', items: [{
      id: 'many', type: 'englishVocabInteractive', done: false, minutes: '', required: false, f: { words },
    }] }));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Level', exact: true }).click();
  for (const withTranslations of [true, false]) {
    const popup = context.waitForEvent('page');
    await page.locator(`[data-export-vocabulary="${withTranslations ? 'translated' : 'blank'}"]`).click();
    const preview = await popup;
    await expect(preview.locator('tbody')).toHaveCount(60);
    await expect(preview.locator('td.english').first()).toHaveText('word 31');
    await expect(preview.locator('td.english').nth(30)).toHaveText('word 01');
    await preview.emulateMedia({ media: 'print' });
    await expect(preview.locator('.print-actions')).toBeHidden();
    if (testInfo.project.name === 'chromium') {
      await preview.pdf({ path: testInfo.outputPath(withTranslations ? 'vocabulary-translated.pdf' : 'vocabulary-blank.pdf'),
        preferCSSPageSize: true, printBackground: true });
    }
    await preview.close();
  }
});
