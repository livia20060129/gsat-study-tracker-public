import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Taipei' });
const userId = '00000000-0000-0000-0000-000000000001';
const prefix = `study-v11:user:${userId}:`;
const dates = ['2026-11-03', '2026-11-04'];
const endpoint = '**/functions/v1/cloud-translate';

async function seed(page: Page, authenticated = true): Promise<void> {
  await page.route('https://xcpnxkkixsxzgbqsiuud.supabase.co/**', route => route.fulfill({ json: [] }));
  await page.goto('/vocabulary.review.html');
  await page.evaluate(({ userId, dates, authenticated }) => {
    localStorage.clear();
    const active = authenticated ? `study-v11:user:${userId}:` : 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', active);
    for (const date of dates) localStorage.setItem(active + date, JSON.stringify({ schemaVersion: 2, date, notes: '私人筆記不可傳送', items: [
      { id: 'review', type: 'englishVocabInteractive', source: 'custom', done: true, required: false, minutes: '25', f: { words: [
        { id: 'cell', text: 'cell', noun: true, translation: '人工原意', gsatLevel: 3, showGsatLevel: false, vocabularyStars: { card: true } },
        { id: 'phrase', text: 'look after', fixedCombination: true, translation: '人工組合' },
        { id: 'sentence', text: 'Hello world!', beautifulSentences: true, translation: '人工句子' },
      ] } },
    ] }));
    if (authenticated) localStorage.setItem('sb-xcpnxkkixsxzgbqsiuud-auth-token', JSON.stringify({
      access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.signature', refresh_token: 'test-refresh',
      token_type: 'bearer', expires_at: 4_102_444_800, expires_in: 3600, user: { id: userId, aud: 'authenticated', role: 'authenticated' },
    }));
  }, { userId, dates, authenticated });
  await page.reload();
}

async function records(page: Page, active = prefix) {
  return page.evaluate(({ active, dates }) => dates.map(date => JSON.parse(localStorage.getItem(active + date)!)), { active, dates });
}

async function selectEntry(page: Page, text = 'cell', kind = '單字') {
  const panel = page.locator('#cloudTranslationSupport');
  await panel.getByRole('combobox', { name: 'Google 翻譯項目', exact: true }).selectOption({ label: `${text}（${kind}）` });
  return panel;
}

async function editor(page: Page, text = 'cell') {
  const row = page.locator('.vocabulary-row').filter({ has: page.getByRole('button', { name: `編輯「${text}」`, exact: true }) });
  await row.getByRole('button', { name: `編輯「${text}」`, exact: true }).click();
  const editing = page.locator('.vocabulary-row').filter({ has: page.getByRole('button', { name: `完成「${text}」`, exact: true }) });
  await expect(editing).not.toHaveAttribute('data-disclosure-motion');
  return editing;
}

function translation(text: string, translatedText = 'Google 候選翻譯') {
  return { ok: true, result: { provider: 'google-cloud-translation', text, translatedText, sourceLanguage: 'en', targetLanguage: 'zh-TW' } };
}

test('one Google support panel sits above the list, shows the monthly character cap and requires login while ECDICT remains offline', async ({ page }) => {
  await seed(page, false);
  let calls = 0;
  await page.route(endpoint, route => { calls += 1; return route.fulfill({ json: translation('cell') }); });
  const before = await records(page, 'study-v11:guest:');
  const panel = await selectEntry(page);
  await expect(panel).toContainText('5,000 字元');
  await expect(panel.locator('[data-cloud-translation-query]')).toBeDisabled();
  await expect(panel.locator('.cloud-translation-status').last()).toContainText('請先登入');
  expect((await panel.boundingBox())!.y).toBeLessThan((await page.locator('#vocabularyTitle').boundingBox())!.y);
  const row = await editor(page);
  await expect(page.locator('.vocabulary-row [data-cloud-translation-query]')).toHaveCount(0);
  await row.locator('[data-dictionary-lookup]').click();
  await expect(row.locator('[data-dictionary-meaning]').first()).toBeVisible();
  expect(calls).toBe(0);
  expect(await records(page, 'study-v11:guest:')).toEqual(before);
});

test('the top preview sends only selected English and appends to its single checked POS across all source dates', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await seed(page);
  let calls = 0;
  await page.route(endpoint, async route => {
    calls += 1;
    expect(route.request().postDataJSON()).toEqual({ text: 'cell' });
    expect(route.request().headers().authorization).toMatch(/^Bearer ey/);
    await route.fulfill({ json: translation('cell', '細胞') });
  });
  const before = await records(page);
  const panel = await selectEntry(page);
  await expect(panel.getByRole('combobox', { name: 'Google 翻譯填入詞性' })).toHaveValue('noun');
  expect(calls).toBe(0);
  await panel.locator('[data-cloud-translation-query]').click();
  await expect(panel.locator('.cloud-translation-result')).toHaveText('細胞');
  await expect(panel.locator('.google-translation-attribution img')).toBeVisible();
  expect(await records(page)).toEqual(before);
  await panel.locator('[data-cloud-translation-apply]').click();
  const saved = await records(page);
  for (const record of saved) {
    const word = record.items[0].f.words[0];
    expect(word.translationsByPartOfSpeech.noun).toEqual(['人工原意', '細胞']);
    expect(word.translationsByPartOfSpeech.unclassified).toBeUndefined();
    expect(word.noun).toBe(true);
    expect(word.gsatLevel).toBe(3);
    expect(word.showGsatLevel).toBe(false);
    expect(word.vocabularyStars.card).toBe(true);
    expect(word.cloudTranslationSources).toEqual([translation('cell', '細胞').result]);
    expect(record.notes).toBe('私人筆記不可傳送');
    expect(record.items[0].minutes).toBe('25');
  }
  await panel.locator('[data-cloud-translation-apply]').click();
  expect(await records(page)).toEqual(saved);
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await panel.screenshot({ path: testInfo.outputPath('google-translation-top-mobile.png') });
  await page.reload();
  await expect(page.locator('.vocabulary-row[data-entry-key="cell"] .google-translation-attribution')).toBeVisible();
  expect(calls).toBe(1);
});

for (const [kind, text] of [['組合', 'look after'], ['句子', 'Hello world!']] as const) {
  test(`the top Google panel supports ${kind} and renders provider text literally`, async ({ page }) => {
    await seed(page);
    await page.route(endpoint, route => route.fulfill({ json: translation(text, '<img src=x onerror=alert(1)>中文') }));
    const panel = await selectEntry(page, text, kind);
    await expect(panel.getByRole('combobox', { name: 'Google 翻譯填入詞性' })).toHaveCount(0);
    await panel.locator('[data-cloud-translation-query]').click();
    await expect(panel.locator('.cloud-translation-result')).toHaveText('<img src=x onerror=alert(1)>中文');
    await expect(panel.locator('.cloud-translation-result img')).toHaveCount(0);
    await panel.locator('[data-cloud-translation-apply]').click();
    const word = (await records(page))[0].items[0].f.words.find((candidate: { text: string }) => candidate.text === text);
    expect(word.translation).toContain(kind === '組合' ? '人工組合' : '人工句子');
    expect(word.translation).toContain('<img src=x onerror=alert(1)>中文');
  });
}

test('quota or missing configuration preserves meanings and allows manual editing', async ({ page }) => {
  await seed(page);
  await page.route(endpoint, route => route.fulfill({ status: 429, json: { ok: false, message: 'secret from upstream' } }));
  const before = await records(page);
  const panel = await selectEntry(page);
  await panel.locator('[data-cloud-translation-query]').click();
  await expect(panel.locator('.cloud-translation-status').last()).toContainText('每月最多 5,000 字元');
  await expect(panel.locator('.cloud-translation-status').last()).not.toContainText('secret');
  expect(await records(page)).toEqual(before);
  await page.route(endpoint, route => route.fulfill({ status: 503, json: { ok: false, code: 'translation_not_configured' } }));
  await panel.locator('[data-cloud-translation-query]').click();
  await expect(panel.locator('.cloud-translation-status').last()).toContainText('尚未啟用');
  const row = await editor(page);
  await row.locator('[data-vocabulary-pos-translation="noun"]').first().fill('仍可手動修改');
  expect((await records(page))[0].items[0].f.words[0].translationsByPartOfSpeech.noun).toEqual(['仍可手動修改']);
});

test('a delayed Google result cannot fill another account', async ({ page }) => {
  await seed(page);
  let release!: () => void, started!: () => void;
  const received = new Promise<void>(resolve => { started = resolve; });
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route(endpoint, async route => { started(); await ready; await route.fulfill({ json: translation('cell') }); });
  const before = await records(page);
  const panel = await selectEntry(page);
  await panel.locator('[data-cloud-translation-query]').click();
  await received;
  await page.evaluate(() => localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:'));
  release();
  await expect(panel.locator('[data-cloud-translation-apply]')).toHaveCount(0);
  await expect(panel.locator('.cloud-translation-status').last()).toContainText('已改變');
  expect(await records(page)).toEqual(before);
});

test('confirmation refuses concurrent translation changes without overwriting unrelated record fields', async ({ page }) => {
  await seed(page);
  await page.route(endpoint, route => route.fulfill({ json: translation('cell') }));
  const panel = await selectEntry(page);
  await panel.locator('[data-cloud-translation-query]').click();
  await expect(panel.locator('[data-cloud-translation-apply]')).toBeVisible();
  await page.evaluate(({ prefix, date }) => {
    const record = JSON.parse(localStorage.getItem(prefix + date)!);
    record.notes = '另一分頁筆記';
    record.items[0].f.words[0].translation = '另一分頁翻譯';
    record.items[0].f.words[0].translationsByPartOfSpeech = { noun: ['另一分頁翻譯'] };
    localStorage.setItem(prefix + date, JSON.stringify(record));
  }, { prefix, date: dates[0] });
  await panel.locator('[data-cloud-translation-apply]').click();
  await expect(page.locator('#vocabularyError')).toContainText('同一欄位');
  expect((await records(page))[0].notes).toBe('另一分頁筆記');
  expect((await records(page))[0].items[0].f.words[0].translation).toBe('另一分頁翻譯');
});

test('a completed preview cannot save after the account changes before confirmation', async ({ page }) => {
  await seed(page);
  await page.route(endpoint, route => route.fulfill({ json: translation('cell') }));
  const before = await records(page);
  const panel = await selectEntry(page);
  await panel.locator('[data-cloud-translation-query]').click();
  await expect(panel.locator('[data-cloud-translation-apply]')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:'));
  await panel.locator('[data-cloud-translation-apply]').click();
  await expect(panel.locator('.cloud-translation-status').last()).toContainText('尚未填入');
  expect(await records(page)).toEqual(before);
});

test('multiple POS require a choice; card rerenders and dictionary switching preserve the one top preview', async ({ page }) => {
  await seed(page);
  await page.evaluate(({ prefix, dates }) => {
    for (const date of dates) {
      const record = JSON.parse(localStorage.getItem(prefix + date)!);
      record.items[0].f.words[0].verb = true;
      record.items[0].f.words[0].translationsByPartOfSpeech = { noun: ['人工原意'] };
      localStorage.setItem(prefix + date, JSON.stringify(record));
    }
  }, { prefix, dates });
  await page.reload();
  let calls = 0;
  await page.route(endpoint, route => { calls += 1; return route.fulfill({ json: translation('cell') }); });
  const panel = await selectEntry(page);
  await panel.locator('[data-cloud-translation-query]').click();
  await expect(panel.locator('[data-cloud-translation-apply]')).toBeDisabled();
  await panel.getByRole('combobox', { name: 'Google 翻譯填入詞性' }).selectOption('adjective');
  await page.getByRole('button', { name: '詞性', exact: true }).click();
  await page.locator('.vocabulary-row[data-entry-key="cell"]').first().getByRole('button', { name: '編輯「cell」', exact: true }).click();
  await page.getByRole('combobox', { name: '查詢辭典', exact: true }).selectOption('cambridge');
  await expect(panel.locator('.cloud-translation-result')).toHaveText('Google 候選翻譯');
  await expect(page.locator('[data-cloud-translation-query]')).toHaveCount(1);
  await expect(page.locator('.vocabulary-row [data-cloud-translation-query]')).toHaveCount(0);
  await panel.locator('[data-cloud-translation-apply]').click();
  const word = (await records(page))[0].items[0].f.words[0];
  expect(word.adjective).toBe(true);
  expect(word.translationsByPartOfSpeech.adjective).toEqual(['Google 候選翻譯']);
  expect(word.translationsByPartOfSpeech.noun).toContain('人工原意');
  expect(calls).toBe(1);
});

test('the last unclassified translation can be deleted across dates without returning after reload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await seed(page);
  await page.evaluate(({ prefix, dates }) => {
    for (const date of dates) {
      const record = JSON.parse(localStorage.getItem(prefix + date)!);
      record.items[0].f.words[0].translation = 'Noun：人工原意；未分類舊翻譯';
      record.items[0].f.words[0].translationsByPartOfSpeech = { noun: ['人工原意'], unclassified: ['未分類舊翻譯'] };
      localStorage.setItem(prefix + date, JSON.stringify(record));
    }
  }, { prefix, dates });
  await page.reload();
  const row = await editor(page);
  const remove = row.locator('[data-translation-group="unclassified"] [data-delete-translation]');
  await expect(remove).toBeEnabled();
  await remove.click();
  await expect(row.locator('[data-translation-group="unclassified"]')).toHaveCount(0);
  await expect(row.locator('[data-vocabulary-pos-translation="noun"]')).toHaveValue('人工原意');
  for (const record of await records(page)) {
    expect(record.items[0].f.words[0].translationsByPartOfSpeech.unclassified).toBeUndefined();
    expect(record.items[0].f.words[0].translation).not.toContain('未分類舊翻譯');
  }
  await page.reload();
  await editor(page);
  await expect(row.locator('[data-translation-group="unclassified"]')).toHaveCount(0);
  await row.screenshot({ path: testInfo.outputPath('deleted-unclassified-mobile.png') });
});

test('dictionary switching updates all word links, persists and does not modify study records or fetch a dictionary automatically', async ({ page }) => {
  await seed(page);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('dictionary.cambridge.org') || request.url().includes('oxfordlearnersdictionaries.com')) requests.push(request.url()); });
  const before = await records(page);
  const link = page.locator('.vocabulary-row[data-entry-key="cell"] .vocabulary-word-link');
  await expect(link).toHaveAttribute('href', 'https://www.oxfordlearnersdictionaries.com/search/english/?q=cell');
  await page.getByRole('combobox', { name: '查詢辭典', exact: true }).selectOption('cambridge');
  await expect(link).toHaveAttribute('href', 'https://dictionary.cambridge.org/dictionary/english-chinese-traditional/cell');
  await page.reload();
  await expect(page.getByRole('combobox', { name: '查詢辭典', exact: true })).toHaveValue('cambridge');
  await expect(link).toHaveAttribute('href', 'https://dictionary.cambridge.org/dictionary/english-chinese-traditional/cell');
  await page.getByRole('combobox', { name: '查詢辭典', exact: true }).selectOption('oxford');
  await expect(link).toHaveAttribute('href', 'https://www.oxfordlearnersdictionaries.com/search/english/?q=cell');
  expect(await records(page)).toEqual(before);
  expect(requests).toEqual([]);
});
