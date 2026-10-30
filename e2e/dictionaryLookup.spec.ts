import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Taipei' });
const date = '2026-10-26';
const userId = '00000000-0000-0000-0000-000000000001';

async function seed(page: Page, authenticated = false): Promise<void> {
  await page.route('https://xcpnxkkixsxzgbqsiuud.supabase.co/**', route => route.fulfill({ json: [] }));
  await page.goto('/vocabulary.review.html');
  await page.evaluate(({ date, userId, authenticated }) => {
    localStorage.clear();
    const prefix = authenticated ? `study-v11:user:${userId}:` : 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const words = [
      { id: 'cell', text: 'cell', noun: true, translation: '原有意思', gsatLevel: 4, showGsatLevel: false },
      { id: 'phrase', text: 'look after', fixedCombination: true, translation: '照顧' },
    ];
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, notes: '不要清除筆記', items: [
      { id: 'review', type: 'englishVocabInteractive', source: 'custom', done: true, required: false,
        minutes: '25', checkedOn: date, f: { words } },
    ] }));
    if (authenticated) localStorage.setItem('sb-xcpnxkkixsxzgbqsiuud-auth-token', JSON.stringify({
      access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.signature', refresh_token: 'test-refresh',
      token_type: 'bearer', expires_at: 1_893_456_000, expires_in: 3600, user: { id: userId, aud: 'authenticated', role: 'authenticated' },
    }));
  }, { date, userId, authenticated });
  await page.reload();
}

async function record(page: Page) {
  return page.evaluate(date => {
    const prefix = localStorage.getItem('study-v11:meta:active-record-prefix')!;
    return JSON.parse(localStorage.getItem(prefix + date)!);
  }, date);
}

async function editCell(page: Page) {
  const row = page.locator('.vocabulary-row[data-entry-key="cell"]');
  await row.getByRole('button', { name: '編輯「cell」', exact: true }).click();
  return row;
}

test('local preview is edit-only, sends no dictionary requests and saves only after selecting meanings and confirming', async ({ page }, testInfo) => {
  const external: string[] = [];
  page.on('request', request => {
    if (/dictionary\.cambridge\.org|functions\/v1\/dictionary-lookup/.test(request.url())) external.push(request.url());
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await seed(page);
  await expect(page.locator('[data-dictionary-lookup]')).toHaveCount(0);
  const row = await editCell(page);
  await expect(row.locator('.dictionary-preview-source')).toHaveText('ECDICT（本機）');
  await expect(row.locator('[data-dictionary-provider], a[href*="cambridge"]')).toHaveCount(0);
  const before = await record(page);
  await row.getByRole('button', { name: '取得翻譯', exact: true }).click();
  await expect(row.locator('[data-dictionary-meaning]')).not.toHaveCount(0);
  await expect(row.locator('[data-dictionary-apply]')).toBeDisabled();
  expect(await record(page)).toEqual(before);
  await row.locator('[data-dictionary-meaning]').first().check();
  expect(await record(page)).toEqual(before);
  await row.locator('[data-dictionary-apply]').click();
  const saved = await record(page);
  expect(saved.items[0].f.words[0].translationsByPartOfSpeech.noun).toContain('原有意思');
  expect(saved.items[0].f.words[0].translationsByPartOfSpeech.noun.length).toBeGreaterThan(1);
  expect(saved.items[0].f.words[0].gsatLevel).toBe(4);
  expect(saved.items[0].f.words[0].showGsatLevel).toBe(false);
  expect(saved.items[0].minutes).toBe('25');
  expect(saved.notes).toBe('不要清除筆記');
  await row.getByRole('button', { name: '完成「cell」', exact: true }).click();
  await page.reload();
  await expect(page.locator('#vocabularyReferences')).toContainText('ECDICT（中文翻譯）');
  await page.getByRole('button', { name: '隱藏中文', exact: true }).click();
  await expect(row.locator('.vocabulary-meaning-answer').first()).toHaveCSS('visibility', 'hidden');
  await page.getByRole('button', { name: '組合', exact: true }).click();
  await page.locator('[data-entry-key="look after"]').getByRole('button', { name: '編輯「look after」', exact: true }).click();
  await expect(page.locator('[data-dictionary-lookup]')).toHaveCount(0);
  await page.getByRole('button', { name: '單字', exact: true }).click();
  await row.getByRole('button', { name: '編輯「cell」', exact: true }).click();
  await row.getByRole('button', { name: '取得翻譯', exact: true }).click();
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await row.screenshot({ path: testInfo.outputPath('dictionary-preview-mobile.png') });
  expect(external).toEqual([]);
});


for (const authenticated of [false, true]) test(authenticated ? 'signed-in users can confirm ECDICT meanings offline without a dictionary API' : 'guests can confirm ECDICT meanings offline without sign-in or dictionary keys', async ({ page, context }) => {
  const remote: string[] = [];
  page.on('request', request => {
    if (/supabase\.co|dictionary\.cambridge\.org/.test(request.url())) remote.push(request.url());
  });
  await seed(page, authenticated);
  const row = await editCell(page);
  await context.setOffline(true);
  await row.getByRole('button', { name: '取得翻譯', exact: true }).click();
  await expect(row.locator('[data-dictionary-meaning]')).not.toHaveCount(0);
  await row.locator('[data-dictionary-meaning]').first().check();
  await row.locator('[data-dictionary-apply]').click();
  const saved = await record(page);
  expect(saved.items[0].f.words[0].dictionarySources).toEqual([expect.objectContaining({ provider: 'ecdict', word: 'cell' })]);
  expect(saved.items[0].f.words[0].translationsByPartOfSpeech.noun).toContain('原有意思');
  expect(saved.items[0].f.words[0].showGsatLevel).toBe(false);
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('#vocabularyReferences')).toContainText('ECDICT（中文翻譯）');
  expect(remote).toEqual([]);
});

test('unlisted ECDICT words keep manual translation available and do not trigger a remote fallback', async ({ page }) => {
  const remote: string[] = [];
  page.on('request', request => { if (/dictionary\.cambridge\.org|functions\/v1\/dictionary-lookup/.test(request.url())) remote.push(request.url()); });
  await seed(page);
  const old = await editCell(page);
  await old.locator('[data-vocabulary-text]').fill('zzzzunlistedwordzzzz');
  await old.locator('[data-vocabulary-text]').press('Tab');
  const row = page.locator('[data-entry-key="zzzzunlistedwordzzzz"]');
  const before = await record(page);
  await row.getByRole('button', { name: '取得翻譯', exact: true }).click();
  await expect(row.locator('.dictionary-preview-status')).toContainText('ECDICT 未收錄');
  expect(await record(page)).toEqual(before);
  await row.locator('[data-vocabulary-pos-translation="noun"]').first().fill('手動中文');
  expect((await record(page)).items[0].f.words[0].translationsByPartOfSpeech.noun).toEqual(['手動中文']);
  expect(remote).toEqual([]);
});

test('saved legacy meanings keep their attribution without restoring a retired provider or external lookup link', async ({ page }) => {
  await seed(page);
  await page.evaluate(date => {
    const key = 'study-v11:guest:' + date;
    const value = JSON.parse(localStorage.getItem(key)!);
    const word = value.items[0].f.words[0];
    word.translation = '歷史保存的意思';
    word.dictionarySources = [{ provider: 'cambridge', word: 'cell', sourceUrl: 'https://dictionary.cambridge.org/dictionary/english-chinese-traditional/cell' }];
    localStorage.setItem(key, JSON.stringify(value));
  }, date);
  await page.reload();
  const before = await record(page);
  await expect(page.locator('#vocabularyLegacySources')).toContainText('Cambridge Dictionary 的歷史出處');
  await expect(page.locator('a[href*="cambridge"]')).toHaveCount(0);
  const row = await editCell(page);
  await expect(row.locator('[data-dictionary-provider]')).toHaveCount(0);
  expect(await record(page)).toEqual(before);
  await row.locator('[data-dictionary-lookup]').click();
  await row.locator('[data-dictionary-meaning]').first().check();
  await row.locator('[data-dictionary-apply]').click();
  const word = (await record(page)).items[0].f.words[0];
  expect(word.translationsByPartOfSpeech.noun).toContain('歷史保存的意思');
  expect(word.dictionarySources.map((source: { provider: string }) => source.provider)).toEqual(['cambridge', 'ecdict']);
});

test('ECDICT confirmation merges unrelated edits and refuses a concurrent translation overwrite', async ({ page }) => {
  await seed(page);
  const row = await editCell(page);
  await row.locator('[data-dictionary-lookup]').click();
  await row.locator('[data-dictionary-meaning]').first().check();
  await page.evaluate(date => {
    const key = 'study-v11:guest:' + date;
    const value = JSON.parse(localStorage.getItem(key)!);
    value.notes = '其他頁籤筆記'; value.items[0].minutes = '40';
    localStorage.setItem(key, JSON.stringify(value));
  }, date);
  await row.locator('[data-dictionary-apply]').click();
  expect((await record(page)).notes).toBe('其他頁籤筆記');
  expect((await record(page)).items[0].minutes).toBe('40');
  await row.locator('[data-dictionary-lookup]').click();
  expect(await row.locator('[data-dictionary-meaning]').count()).toBeGreaterThan(1);
  await row.locator('[data-dictionary-meaning]').nth(1).check();
  await page.evaluate(date => {
    const key = 'study-v11:guest:' + date;
    const value = JSON.parse(localStorage.getItem(key)!);
    value.items[0].f.words[0].translation = '其他頁籤的中文';
    value.items[0].f.words[0].translationsByPartOfSpeech = { noun: ['其他頁籤的中文'] };
    localStorage.setItem(key, JSON.stringify(value));
  }, date);
  await row.locator('[data-dictionary-apply]').click();
  await expect(page.locator('#vocabularyError')).toContainText('同一欄位');
  expect((await record(page)).items[0].f.words[0].translation).toBe('其他頁籤的中文');
  expect((await record(page)).notes).toBe('其他頁籤筆記');
});
