import { expect, test } from '@playwright/test';

test('mobile POS translations add/delete with a one-field minimum, hide answers and persist optional GSAT levels', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/vocabulary.review.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    for (const date of ['2026-10-23', '2026-10-24']) localStorage.setItem('study-v11:guest:' + date, JSON.stringify({
      schemaVersion: 2, date, items: [{ id: 'words', type: 'englishVocabInteractive', done: false, minutes: '15', required: false,
        f: { words: [{ id: 'word-novelty', text: 'novelty' }] } }],
    }));
  });
  await page.reload();
  const row = page.locator('.vocabulary-row[data-entry-key="novelty"]');
  await page.getByRole('button', { name: '隱藏中文', exact: true }).click();
  await expect(row.locator('.vocabulary-gsat-level')).toHaveCount(0);
  await row.getByRole('button', { name: '編輯「novelty」' }).click();
  await expect(row.locator('[data-vocabulary-pos-translation]')).toHaveCount(0);
  await row.getByLabel('Noun', { exact: true }).check();
  const noun = row.locator('[data-translation-group="noun"]');
  await expect(noun.locator('input')).toHaveCount(1);
  await expect(noun.getByRole('button', { name: '刪除 Noun 第 1 個翻譯' })).toBeDisabled();
  await noun.getByLabel('Noun 中文翻譯 1', { exact: true }).fill('新奇');
  await noun.getByRole('button', { name: '新增 Noun 翻譯' }).click();
  await noun.getByLabel('Noun 中文翻譯 2', { exact: true }).fill('獨創性');
  await row.getByLabel('Verb', { exact: true }).check();
  await expect(row.locator('[data-translation-group="verb"] input')).toHaveCount(1);
  await row.getByLabel('Verb 中文翻譯 1', { exact: true }).fill('創新');
  const level = row.getByRole('combobox', { name: '學測單字級數', exact: true });
  await expect(level).toBeDisabled();
  await expect(level.locator('option')).toHaveText(['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6']);
  await row.getByLabel('顯示學測單字級數', { exact: true }).check();
  await level.selectOption('3');
  await row.getByRole('button', { name: '完成「novelty」' }).click();
  await expect(row.locator('.vocabulary-readonly-translations')).toHaveClass(/is-masked/);
  await expect(row.locator('.vocabulary-meaning-mask')).toHaveText(['－', '－', '－']);
  await expect(row.locator('.vocabulary-translation-counts')).toHaveCount(0);
  await expect(row.locator('.vocabulary-gsat-level')).toHaveText('學測 Level 3');
  await page.reload();
  await expect(row.locator('.vocabulary-gsat-level')).toHaveText('學測 Level 3');
  await expect(row.locator('.vocabulary-translation-counts')).toHaveCount(0);
  await expect(row.locator('.vocabulary-meaning-answer')).toHaveText(['新奇', '獨創性', '創新']);
  await row.getByRole('button', { name: '編輯「novelty」' }).click();
  await row.getByLabel('Noun', { exact: true }).uncheck();
  await expect(noun).toHaveCount(0);
  await row.getByLabel('Noun', { exact: true }).check();
  await expect(noun.getByLabel('Noun 中文翻譯 1', { exact: true })).toHaveValue('新奇');
  await expect(noun.getByLabel('Noun 中文翻譯 2', { exact: true })).toHaveValue('獨創性');
  await noun.getByRole('button', { name: '刪除 Noun 第 2 個翻譯' }).click();
  await expect(noun.locator('input')).toHaveCount(1);
  await expect(noun.getByRole('button', { name: '刪除 Noun 第 1 個翻譯' })).toBeDisabled();
  await row.getByLabel('顯示學測單字級數', { exact: true }).uncheck();
  await row.getByRole('button', { name: '完成「novelty」' }).click();
  await expect(row.locator('.vocabulary-gsat-level')).toHaveCount(0);
  await page.reload();
  await expect(row.locator('.vocabulary-gsat-level')).toHaveCount(0);
  await row.getByRole('button', { name: '編輯「novelty」' }).click();
  await expect(level).toHaveValue('3');
  await expect(level).toBeDisabled();
  await noun.getByLabel('Noun 中文翻譯 1', { exact: true }).fill('新意');
  await page.reload();
  await row.getByRole('button', { name: '編輯「novelty」' }).click();
  await expect(noun.getByLabel('Noun 中文翻譯 1', { exact: true })).toHaveValue('新意');
  await page.setViewportSize({ width: 320, height: 812 });
  expect(await row.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  const stored = await page.evaluate(() => ['2026-10-23', '2026-10-24'].map(date => JSON.parse(localStorage.getItem('study-v11:guest:' + date)!).items[0]));
  for (const item of stored) {
    expect(item.minutes).toBe('15');
    expect(item.f.words[0]).toEqual(expect.objectContaining({ gsatLevel: 3, showGsatLevel: false,
      translationsByPartOfSpeech: { noun: ['新意'], verb: ['創新'] } }));
  }
});

test('legacy translations stay recoverable, separate masks work in both sorts and combinations/sentences keep their editor', async ({ page }) => {
  await page.goto('/vocabulary.review.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-10-24', JSON.stringify({ date: '2026-10-24', items: [{
      id: 'legacy', type: 'englishVocabInteractive', done: false, minutes: '', required: false, f: { words: [
        { text: 'leverage', noun: true, verb: true, translation: 'Noun：影響力、槓桿；Verb：運用' },
        { text: 'novelty', noun: true, adjective: true, translation: '新奇；獨創性' },
        { text: 'pay a premium', fixedCombination: true, translation: '支付保費', gsatLevel: 5, showGsatLevel: true },
        { text: 'Practice makes perfect.', beautifulSentences: true, translation: '熟能生巧' },
      ] },
    }] }));
  });
  await page.reload();
  const row = page.locator('.vocabulary-row[data-entry-key="leverage"]');
  await page.getByRole('button', { name: '隱藏中文', exact: true }).click();
  await expect(row.locator('.vocabulary-meaning-mask')).toHaveText(['－', '－', '－']);
  await expect(row.locator('.vocabulary-meaning-answer').first()).toHaveCSS('visibility', 'hidden');
  const ambiguous = page.locator('.vocabulary-row[data-entry-key="novelty"]');
  await expect(ambiguous.locator('.vocabulary-readonly-translations strong')).toHaveText(['Noun', 'Adjective', '未分詞性']);
  await ambiguous.getByRole('button', { name: '編輯「novelty」' }).click();
  expect(await ambiguous.locator('[data-translation-group="unclassified"] input').evaluateAll(nodes => nodes.map(node => (node as HTMLInputElement).value))).toEqual(['新奇', '獨創性']);
  await ambiguous.getByRole('button', { name: '完成「novelty」' }).click();
  await page.getByRole('button', { name: '詞性', exact: true }).click();
  await expect(page.locator('#vocabulary-group-noun .vocabulary-row[data-entry-key="leverage"] .vocabulary-meaning-mask')).toHaveText(['－', '－', '－']);
  await page.getByRole('button', { name: '組合', exact: true }).click();
  const phrase = page.locator('.vocabulary-row[data-entry-key="pay a premium"]');
  await expect(phrase.locator('.vocabulary-meaning-answer')).toHaveCSS('visibility', 'hidden');
  await expect(phrase.locator('.vocabulary-gsat-level')).toHaveCount(0);
  await phrase.getByRole('button', { name: '編輯「pay a premium」' }).click();
  await expect(phrase.locator('[data-vocabulary-pos], [data-vocabulary-level]')).toHaveCount(0);
  await expect(phrase.getByLabel('中文翻譯', { exact: true })).toHaveValue('支付保費');
  await phrase.getByLabel('中文翻譯', { exact: true }).fill('付保費');
  await phrase.getByRole('button', { name: '完成「pay a premium」' }).click();
  await page.getByRole('button', { name: '句子', exact: true }).click();
  const sentence = page.locator('.vocabulary-row').filter({ hasText: 'Practice makes perfect.' });
  await expect(sentence.locator('.vocabulary-meaning-answer')).toHaveCSS('visibility', 'hidden');
  await sentence.getByRole('button', { name: '編輯「Practice makes perfect.」' }).click();
  await expect(sentence.getByLabel('中文翻譯', { exact: true })).toHaveValue('熟能生巧');
});

test('GSAT Level sorting uses the third slider position and excludes unchecked words rather than creating an unmarked group', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto('/vocabulary.review.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-10-24', JSON.stringify({ date: '2026-10-24', items: [{
      id: 'levels', type: 'englishVocabInteractive', done: false, minutes: '', required: false, f: { words: [
        { text: 'Zebra', gsatLevel: 1, showGsatLevel: true },
        { text: 'Alpha', gsatLevel: 1, showGsatLevel: true },
        { text: 'Beta', gsatLevel: 2, showGsatLevel: true },
        { text: 'Delta', gsatLevel: 3, showGsatLevel: true },
        { text: 'Echo', gsatLevel: 4, showGsatLevel: true },
        { text: 'Foxtrot', gsatLevel: 5, showGsatLevel: true },
        { text: 'Golf', gsatLevel: 6, showGsatLevel: true },
        { text: 'Hidden', gsatLevel: 3, showGsatLevel: false },
        { text: 'Unknown' },
      ].map(word => ({ ...word, noun: true, translation: '秘密翻譯' })) },
    }] }));
  });
  await page.reload();
  const mode = page.getByRole('button', { name: 'Level', exact: true });
  await page.getByRole('button', { name: '隱藏中文', exact: true }).click();
  await mode.click();
  await expect(mode).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#vocabularyGrouping')).toHaveAttribute('data-active', '2');
  await expect(page.locator('.vocabulary-letter-group > h2')).toHaveText(['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6']);
  await expect(page.locator('#vocabulary-group-level-1 .vocabulary-word-link')).toHaveText(['Alpha', 'Zebra']);
  await expect(page.locator('#visibleVocabularyCount')).toHaveText('7 個');
  await expect(page.locator('#vocabularyList')).not.toContainText('Hidden');
  await expect(page.locator('#vocabularyList')).not.toContainText('Unknown');
  await expect(page.locator('#vocabularyList')).not.toContainText('未標註');
  await expect(page.locator('.vocabulary-meaning-answer').first()).toHaveCSS('visibility', 'hidden');
  await expect(page.getByLabel('按詞性篩選單字')).toBeHidden();
  expect(await page.locator('#vocabularyGrouping').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.locator('#vocabularySearch').fill('Hidden');
  await expect(page.locator('.vocabulary-row')).toHaveCount(0);
  await page.locator('#vocabularySearch').fill('');
  const alpha = page.locator('.vocabulary-row[data-entry-key="alpha"]');
  await alpha.getByRole('button', { name: '編輯「Alpha」' }).click();
  await alpha.getByRole('combobox', { name: '學測單字級數', exact: true }).selectOption('4');
  await alpha.getByRole('button', { name: '完成「Alpha」' }).click();
  await expect(page.locator('#vocabulary-group-level-1 .vocabulary-word-link')).toHaveText(['Zebra']);
  await expect(page.locator('#vocabulary-group-level-4 .vocabulary-word-link')).toHaveText(['Alpha', 'Echo']);
  await alpha.getByRole('button', { name: '編輯「Alpha」' }).click();
  await alpha.getByLabel('顯示學測單字級數', { exact: true }).uncheck();
  await alpha.getByRole('button', { name: '完成「Alpha」' }).click();
  await expect(alpha).toHaveCount(0);
  await expect(page.locator('#visibleVocabularyCount')).toHaveText('6 個');
  await page.getByRole('button', { name: '字母排序', exact: true }).click();
  await expect(alpha).toBeVisible();
  await expect(alpha.locator('.vocabulary-gsat-level')).toHaveCount(0);
  await expect(page.locator('.vocabulary-row')).toHaveCount(9);
  await page.getByRole('button', { name: '詞性', exact: true }).click();
  await expect(page.getByLabel('按詞性篩選單字')).toBeVisible();
  await expect(page.locator('#vocabulary-group-noun .vocabulary-word-link')).toHaveCount(9);
  await page.evaluate(() => {
    const key = 'study-v11:guest:2026-10-24';
    const source = JSON.parse(localStorage.getItem(key)!);
    source.items[0].f.words.forEach((word: { showGsatLevel?: boolean }) => { word.showGsatLevel = false; });
    localStorage.setItem(key, JSON.stringify(source));
  });
  await page.reload();
  await mode.click();
  await expect(page.locator('#vocabularyEmpty')).toHaveText('目前沒有勾選顯示學測級數的單字。');
  await expect(page.locator('.vocabulary-letter-group')).toHaveCount(0);
});

test('English stays above translations in readonly and edit mode on desktop and mobile', async ({ page }) => {
  await page.goto('/vocabulary.review.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-10-24', JSON.stringify({ date: '2026-10-24', items: [{
      id: 'layout', type: 'englishVocabInteractive', done: false, minutes: '', required: false,
      f: { words: [{ text: 'novelty', noun: true, translation: '新奇；獨創性' }, { text: 'pay a premium', fixedCombination: true, translation: '支付保費' }] },
    }] }));
  });
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.reload();
    const word = page.locator('.vocabulary-row[data-entry-key="novelty"]');
    const english = await word.getByRole('link').boundingBox();
    const counts = await word.locator('.vocabulary-readonly-translations').boundingBox();
    expect(counts!.y).toBeGreaterThanOrEqual(english!.y + english!.height);
    await word.getByRole('button', { name: '編輯「novelty」' }).click();
    const englishInput = await word.getByLabel('英文內容').boundingBox();
    const chineseInput = await word.getByLabel('Noun 中文翻譯 1', { exact: true }).boundingBox();
    expect(chineseInput!.y).toBeGreaterThanOrEqual(englishInput!.y + englishInput!.height);
    expect(await word.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.getByRole('button', { name: '組合', exact: true }).click();
    const phrase = page.locator('.vocabulary-row[data-entry-key="pay a premium"]');
    const phraseEnglish = await phrase.getByRole('link').boundingBox();
    const phraseCounts = await phrase.locator('.vocabulary-readonly-translations').boundingBox();
    expect(phraseCounts!.y).toBeGreaterThanOrEqual(phraseEnglish!.y + phraseEnglish!.height);
    await phrase.getByRole('button', { name: '編輯「pay a premium」' }).click();
    const phraseEnglishInput = await phrase.getByLabel('英文內容').boundingBox();
    const phraseChineseInput = await phrase.getByLabel('中文翻譯', { exact: true }).boundingBox();
    expect(phraseChineseInput!.y).toBeGreaterThanOrEqual(phraseEnglishInput!.y + phraseEnglishInput!.height);
  }
});

test('Chinese is shown by default and one page toggle controls every view without replacing active editors', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/vocabulary.review.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-10-24', JSON.stringify({ date: '2026-10-24', items: [{
      id: 'visibility', type: 'englishVocabInteractive', done: false, minutes: '15', required: false,
      f: { words: [
        { text: 'novelty', noun: true, translation: '新奇；獨創性', gsatLevel: 3, showGsatLevel: true },
        { text: 'pay a premium', fixedCombination: true, translation: '支付保費' },
        { text: 'Practice makes perfect.', beautifulSentences: true, translation: '熟能生巧' },
      ] },
    }] }));
  });
  await page.reload();
  const word = page.locator('.vocabulary-row[data-entry-key="novelty"]');
  await expect(word.locator('.vocabulary-meaning-answer')).toHaveText(['新奇', '獨創性']);
  const container = await word.locator('.vocabulary-readonly-translations').elementHandle();
  const before = await word.boundingBox();
  await expect(page.locator('#toggleVocabularyTranslations')).toHaveText('隱藏中文');
  await page.getByRole('button', { name: '隱藏中文', exact: true }).click();
  await expect(word.locator('.vocabulary-readonly-translations')).toHaveCount(1);
  await expect(word.locator('.vocabulary-meaning-mask')).toHaveText(['－', '－']);
  await expect(word.locator('.vocabulary-meaning-answer').first()).toHaveCSS('visibility', 'hidden');
  await expect(word.locator('.vocabulary-meaning-answer').first()).toHaveAttribute('aria-hidden', 'true');
  await expect(word.locator('.vocabulary-translation-counts')).toHaveCount(0);
  expect((await word.boundingBox())!.height).toBe(before!.height);
  expect(await container!.evaluate(node => node.isConnected)).toBe(true);
  await page.getByRole('button', { name: '詞性', exact: true }).click();
  await expect(word.locator('.vocabulary-readonly-translations')).toHaveClass(/is-masked/);
  await page.getByRole('button', { name: 'Level', exact: true }).click();
  await expect(word.locator('.vocabulary-readonly-translations')).toHaveClass(/is-masked/);
  await page.getByRole('button', { name: '顯示中文', exact: true }).click();
  await expect(word.locator('.vocabulary-meaning-answer')).toHaveText(['新奇', '獨創性']);
  await expect(word.locator('.vocabulary-meaning-answer').first()).toHaveCSS('visibility', 'visible');
  await word.getByRole('button', { name: '編輯「novelty」' }).click();
  const input = word.getByLabel('Noun 中文翻譯 1', { exact: true });
  const handle = await input.elementHandle();
  await input.fill('新意');
  await page.getByRole('button', { name: '隱藏中文', exact: true }).click();
  await expect(input).toHaveValue('新意');
  expect(await handle!.evaluate(node => node.isConnected)).toBe(true);
  await word.getByRole('button', { name: '完成「novelty」' }).click();
  await expect(word.locator('.vocabulary-readonly-translations')).toHaveClass(/is-masked/);
  await page.getByRole('button', { name: '組合', exact: true }).click();
  const phrase = page.locator('.vocabulary-row[data-entry-key="pay a premium"]');
  await expect(phrase.locator('.vocabulary-readonly-translations')).toHaveClass(/is-masked/);
  await page.getByRole('button', { name: '顯示中文', exact: true }).click();
  await expect(phrase.locator('.vocabulary-meaning-answer')).toHaveText('支付保費');
  await page.getByRole('button', { name: '句子', exact: true }).click();
  await expect(page.locator('.vocabulary-meaning-answer')).toHaveText('熟能生巧');
  await page.reload();
  await expect(word.locator('.vocabulary-meaning-answer')).toHaveText(['新意', '獨創性']);
  await expect(page.locator('#toggleVocabularyTranslations')).toHaveText('隱藏中文');
});
