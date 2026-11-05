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

test('Google is explicit and login-only while local ECDICT remains usable for guests', async ({ page }) => {
  await seed(page, false);
  let calls = 0;
  await page.route(endpoint, route => { calls += 1; return route.fulfill({ json: translation('cell') }); });
  const before = await records(page, 'study-v11:guest:');
  const row = await editor(page);
  expect(calls).toBe(0);
  await row.locator('[data-cloud-translation-query]').click();
  await expect(row.locator('.cloud-translation-status')).toContainText('請先登入 Tracker');
  expect(calls).toBe(0);
  await row.locator('[data-dictionary-lookup]').click();
  await expect(row.locator('[data-dictionary-meaning]').first()).toBeVisible();
  expect(await records(page, 'study-v11:guest:')).toEqual(before);
});

test('preview sends only selected English, survives rerender, and confirmation preserves both source dates and manual fields', async ({ page }, testInfo) => {
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
  const row = await editor(page);
  expect(calls).toBe(0);
  await row.locator('[data-cloud-translation-query]').click();
  await expect(row.locator('.cloud-translation-result')).toHaveText('細胞');
  await expect(row.locator('.google-translation-attribution img')).toBeVisible();
  expect(await records(page)).toEqual(before);
  await row.getByRole('button', { name: '標註整張卡片「cell」', exact: true }).click();
  await expect(row.locator('.cloud-translation-result')).toHaveText('細胞');
  await row.locator('[data-cloud-translation-apply]').click();
  const saved = await records(page);
  for (const record of saved) {
    const word = record.items[0].f.words[0];
    expect(word.translationsByPartOfSpeech.noun).toContain('人工原意');
    expect(word.translationsByPartOfSpeech.unclassified).toEqual(['細胞']);
    expect(word.noun).toBe(true);
    expect(word.gsatLevel).toBe(3);
    expect(word.showGsatLevel).toBe(false);
    expect(word.cloudTranslationSources).toEqual([translation('cell', '細胞').result]);
    expect(record.notes).toBe('私人筆記不可傳送');
    expect(record.items[0].minutes).toBe('25');
  }
  await row.locator('[data-cloud-translation-apply]').click();
  expect(await records(page)).toEqual(saved);
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await row.screenshot({ path: testInfo.outputPath('google-translation-mobile.png') });
  await page.reload();
  await expect(page.locator('[data-entry-key="cell"] .google-translation-attribution')).toBeVisible();
  expect(calls).toBe(1);
});

for (const [kind, text] of [['組合', 'look after'], ['句子', 'Hello world!']] as const) {
  test(`Google supports ${kind} and displays provider text literally`, async ({ page }) => {
    await seed(page);
    await page.route(endpoint, route => route.fulfill({ json: translation(text, '<img src=x onerror=alert(1)>中文') }));
    await page.getByRole('button', { name: kind, exact: true }).click();
    const row = await editor(page, text);
    await row.locator('[data-cloud-translation-query]').click();
    await expect(row.locator('.cloud-translation-result')).toHaveText('<img src=x onerror=alert(1)>中文');
    await expect(row.locator('.cloud-translation-result img')).toHaveCount(0);
    await row.locator('[data-cloud-translation-apply]').click();
    const words = (await records(page))[0].items[0].f.words;
    const word = words.find((candidate: { text: string }) => candidate.text === text);
    expect(word.translation).toContain(kind === '組合' ? '人工組合' : '人工句子');
    expect(word.translation).toContain('<img src=x onerror=alert(1)>中文');
  });
}

test('quota or missing configuration never overwrites meanings and manual editing remains usable', async ({ page }) => {
  await seed(page);
  await page.route(endpoint, route => route.fulfill({ status: 429, json: { ok: false, message: 'secret from upstream' } }));
  const before = await records(page);
  const row = await editor(page);
  await row.locator('[data-cloud-translation-query]').click();
  await expect(row.locator('.cloud-translation-status')).toContainText('08:00');
  await expect(row.locator('.cloud-translation-status')).not.toContainText('secret');
  expect(await records(page)).toEqual(before);
  await page.route(endpoint, route => route.fulfill({ status: 503, json: { ok: false, code: 'translation_not_configured' } }));
  await row.locator('[data-cloud-translation-query]').click();
  await expect(row.locator('.cloud-translation-status')).toContainText('尚未啟用');
  await row.locator('[data-vocabulary-pos-translation="noun"]').first().fill('仍可手動修改');
  expect((await records(page))[0].items[0].f.words[0].translationsByPartOfSpeech.noun).toEqual(['仍可手動修改']);
});

test('a delayed Google result cannot fill another account or overwrite concurrent edits', async ({ page }) => {
  await seed(page);
  let release!: () => void;
  let started!: () => void;
  const received = new Promise<void>(resolve => { started = resolve; });
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route(endpoint, async route => { started(); await ready; await route.fulfill({ json: translation('cell') }); });
  const before = await records(page);
  const row = await editor(page);
  await row.locator('[data-cloud-translation-query]').click();
  await received;
  await page.evaluate(() => localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:'));
  release();
  await expect(row.locator('[data-cloud-translation-apply]')).toHaveCount(0);
  await expect(row.locator('.cloud-translation-status')).toContainText('已改變');
  expect(await records(page)).toEqual(before);
});

test('confirmation merges unrelated record fields and refuses concurrent translation changes', async ({ page }) => {
  await seed(page);
  await page.route(endpoint, route => route.fulfill({ json: translation('cell') }));
  const row = await editor(page);
  await row.locator('[data-cloud-translation-query]').click();
  await expect(row.locator('[data-cloud-translation-apply]')).toBeVisible();
  await page.evaluate(({ prefix, date }) => {
    const record = JSON.parse(localStorage.getItem(prefix + date)!);
    record.notes = '另一分頁筆記';
    record.items[0].f.words[0].translation = '另一分頁翻譯';
    record.items[0].f.words[0].translationsByPartOfSpeech = { noun: ['另一分頁翻譯'] };
    localStorage.setItem(prefix + date, JSON.stringify(record));
  }, { prefix, date: dates[0] });
  await row.locator('[data-cloud-translation-apply]').click();
  await expect(page.locator('#vocabularyError')).toContainText('同一欄位');
  const saved = (await records(page))[0];
  expect(saved.items[0].f.words[0].translation).toBe('另一分頁翻譯');
  expect(saved.notes).toBe('另一分頁筆記');
});

test('a completed preview cannot save after the active account changes before confirmation', async ({ page }) => {
  await seed(page);
  await page.route(endpoint, route => route.fulfill({ json: translation('cell') }));
  const before = await records(page);
  const row = await editor(page);
  await row.locator('[data-cloud-translation-query]').click();
  await expect(row.locator('[data-cloud-translation-apply]')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:'));
  await row.locator('[data-cloud-translation-apply]').click();
  await expect(row.locator('.cloud-translation-status')).toContainText('尚未填入');
  expect(await records(page)).toEqual(before);
});

test('each POS copy has its own Google preview and a normal editor rerender preserves a completed preview', async ({ page }) => {
  await seed(page);
  await page.evaluate(({ prefix, dates }) => {
    for (const date of dates) {
      const record = JSON.parse(localStorage.getItem(prefix + date)!);
      record.items[0].f.words[0].verb = true;
      localStorage.setItem(prefix + date, JSON.stringify(record));
    }
  }, { prefix, dates });
  await page.reload();
  await page.route(endpoint, route => route.fulfill({ json: translation('cell') }));
  await page.getByRole('button', { name: '詞性', exact: true }).click();
  const rows = page.locator('.vocabulary-row[data-entry-key="cell"]');
  await expect(rows).toHaveCount(2);
  await rows.first().getByRole('button', { name: '編輯「cell」', exact: true }).click();
  await expect(rows.locator('[data-cloud-translation-query]')).toHaveCount(2);
  await expect(rows.first()).not.toHaveAttribute('data-disclosure-motion');
  await rows.first().locator('[data-cloud-translation-query]').click();
  await expect(rows.first().locator('.cloud-translation-result')).toBeVisible();
  await expect(rows.last().locator('.cloud-translation-result')).toHaveCount(0);
  await rows.first().getByLabel('Adjective', { exact: true }).check();
  await expect(rows).toHaveCount(3);
  await expect(rows.first().locator('.cloud-translation-result')).toHaveText('Google 候選翻譯');
  await expect(rows.locator('[data-cloud-translation-query]')).toHaveCount(3);
});
