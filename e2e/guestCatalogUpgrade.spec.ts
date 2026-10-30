import { expect, test, type Page } from '@playwright/test';
import { enableMaterialEditing } from './helpers/materialEditing.ts';

const date = '2026-10-29';
const userId = '00000000-0000-0000-0000-000000000091';
const prefix = `study-v11:user:${userId}:`;
test.use({ timezoneId: 'Asia/Taipei' });

async function isolatedGuest(page: Page): Promise<void> {
  await page.route('https://xcpnxkkixsxzgbqsiuud.supabase.co/**', route => route.fulfill({ json: [] }));
  await page.clock.install({ time: new Date('2026-10-29T12:00:00+08:00') });
  await page.goto('/material.progress.html#english');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:'); });
}
async function addBook(page: Page, mode: 'pages' | 'unit' | 'round' = 'pages'): Promise<void> {
  await page.goto('/material.progress.html#english');
  await enableMaterialEditing(page);
  await page.getByRole('button', { name: '新增教材', exact: true }).click();
  await page.getByLabel('書名', { exact: true }).fill('My English Book');
  await page.getByLabel('範圍模板').selectOption(mode);
  await page.locator('#catalogTotal').fill('20');
  for (const [start, end, detail] of [['1', '10', '小主題 A'], ['11', '20', '小主題 B']]) {
    await page.getByRole('button', { name: '新增章節', exact: true }).click();
    const row = page.locator('.catalog-section').last();
    await row.getByLabel('大單元', { exact: true }).fill('Unit 1');
    await row.getByLabel('小主題（可不填）').fill(detail);
    await row.getByLabel('起始', { exact: true }).fill(start);
    await row.getByLabel('結束', { exact: true }).fill(end);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '儲存教材', exact: true }).click();
  await expect(page.locator('#catalogEditor')).toBeHidden();
  await expect(page.locator('#catalogStatus')).toContainText('教材已儲存');
}
async function signIn(page: Page): Promise<void> {
  await page.locator('#connectionSettings summary').click();
  await page.locator('#cloudEmail').fill('test@example.com');
  await page.locator('#cloudPassword').fill('dummy-password');
  await page.locator('#cloudSignInBtn').click();
}

async function addSelectedCatalogItem(page: Page): Promise<ReturnType<Page['locator']>> {
  await page.locator('#itemType').selectOption('extra');
  await page.locator('#addItemBtn').click();
  const card = page.locator('#itemList > [data-item]').last();
  await card.locator('[data-field="title"]').selectOption('My English Book');
  return card;
}

test('guest login merges same-date additions and catalogs into cloud, captures current notes and stays idempotent', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await isolatedGuest(page);
  await page.evaluate(date => {
    localStorage.setItem('study-v11:guest:' + date, JSON.stringify({ schemaVersion: 2, date, notes: 'saved guest note', items: [
      { id: 'same', type: 'general', title: '訪客新增', source: 'custom', done: false, minutes: '12', required: false, f: { words: [{ id: 'word', text: 'alternate', noun: true }] } },
    ], materialCatalog: [{ id: 'custom:guest-book', title: 'Guest Book', subject: '英文', group: '補充', mode: 'pages', total: 20, sections: [], revision: 1, updatedAt: '2026-10-29T01:00:00Z' }] }));
  }, date);
  const cloud = new Map<string, { study_date: string; payload: Record<string, unknown>; revision: number; updated_at: string }>();
  cloud.set(date, { study_date: date, payload: { date, notes: 'existing account note', items: [{ id: 'same', type: 'general', title: '帳號原有', source: 'custom', done: true, minutes: '30', required: false, f: {} }] }, revision: 3, updated_at: '2026-10-29T03:00:00Z' });
  const user = { id: userId, email: 'test@example.com', aud: 'authenticated', role: 'authenticated' };
  await page.route('https://xcpnxkkixsxzgbqsiuud.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.endsWith('/auth/v1/token')) return route.fulfill({ json: { access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.signature', token_type: 'bearer', refresh_token: 'test-refresh', expires_in: 3600, user } });
    if (url.pathname.endsWith('/auth/v1/user')) return route.fulfill({ json: user });
    if (url.pathname.endsWith('/functions/v1/google-calendar')) return route.fulfill({ json: { connected: false } });
    if (url.pathname.endsWith('/rest/v1/rpc/upsert_study_record')) {
      const body = request.postDataJSON(); const previous = cloud.get(body.p_study_date);
      if (previous && body.p_base_revision !== previous.revision) return route.fulfill({ json: { ...previous, applied: false } });
      const row = { study_date: body.p_study_date, payload: body.p_payload, revision: (previous?.revision ?? 0) + 1, updated_at: '2026-10-29T04:00:00Z' }; cloud.set(body.p_study_date, row);
      return route.fulfill({ json: { ...row, applied: true } });
    }
    if (url.pathname.endsWith('/rest/v1/study_records')) {
      const wanted = url.searchParams.get('study_date')?.replace(/^eq\./, '');
      return route.fulfill({ json: [...cloud.values()].filter(row => !wanted || row.study_date === wanted) });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/');
  await page.locator('#notes').fill('saved guest note plus current typing');
  await signIn(page);
  await expect.poll(() => cloud.get(date)?.payload.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ title: '帳號原有', done: true, minutes: '30' }),
    expect.objectContaining({ title: '訪客新增', minutes: '12' }),
  ]));
  expect(cloud.get(date)?.payload.notes).toContain('current typing');
  expect(cloud.get(date)?.payload.notes).toContain('existing account note');
  expect(cloud.get(date)?.payload.materialCatalog).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Guest Book' })]));
  const count = (cloud.get(date)?.payload.items as unknown[]).length;
  await page.reload();
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
  await expect.poll(() => (cloud.get(date)?.payload.items as unknown[]).length).toBe(count);
  expect(await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!).items.filter((item: { title: string }) => item.title === '訪客新增').length, { prefix, date })).toBe(1);
  expect(errors).toEqual([]);
});

test('failed login keeps guest additions and never starts an account import', async ({ page }) => {
  await isolatedGuest(page);
  await page.evaluate(date => localStorage.setItem('study-v11:guest:' + date, JSON.stringify({ date, items: [{ id: 'guest', type: 'general', source: 'custom', title: 'guest', f: {} }] })), date);
  await page.route('**/auth/v1/token?grant_type=password', route => route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } }));
  await page.goto('/'); await signIn(page);
  await expect(page.locator('#cloudMessage')).toContainText('Invalid login credentials');
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('study-v11:user:')))).toBe(false);
  expect(await page.evaluate(date => JSON.parse(localStorage.getItem('study-v11:guest:' + date)!).items.some((item: { id: string }) => item.id === 'guest'), date)).toBe(true);
});

test('mobile catalog creates a page map, feeds Tracker and groups its progress by large unit', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 812 }); await isolatedGuest(page); await addBook(page);
  await page.reload(); await page.locator('#catalogSearch').fill('My English Book');
  await expect(page.locator('.material-row')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('catalog-mobile.png'), fullPage: true });
  await enableMaterialEditing(page);
  await page.locator('.material-row').getByRole('button', { name: '編輯', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('catalog-editor-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '取消編輯', exact: true }).click();
  await page.getByRole('link', { name: '回到 Tracker', exact: true }).click();
  const card = await addSelectedCatalogItem(page);
  await card.locator('[data-field="start"]').fill('1'); await card.locator('[data-field="end"]').fill('10'); await card.locator('[data-field="end"]').blur();
  await expect(card.locator('[data-catalog-auto]')).toHaveText('Unit 1｜小主題 A');
  await card.locator('[data-check="progress"]').check();
  await page.goto('/material.progress.html#english');
  const row = page.locator('.material-row').filter({ hasText: 'My English Book' });
  await expect(row).toContainText('完成 50%');
  await expect(row.locator('.material-segment')).toHaveCount(1);
  await page.goto('/material.progress.html#english'); await page.locator('#catalogSearch').fill('My English Book');
  await enableMaterialEditing(page);
  await page.locator('.material-row').getByRole('button', { name: '編輯', exact: true }).click();
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '刪除目錄', exact: true }).click();
  await expect(page.locator('#catalogStatus')).toContainText('教材已儲存');
  await page.goto('/');
  await expect(page.locator('[data-field="title"] option').filter({ hasText: 'My English Book' })).toHaveCount(0);
  await expect(card.locator('[data-field="start"]')).toHaveValue('1'); await expect(card.locator('[data-field="end"]')).toHaveValue('10');
  await expect(card).toContainText('目錄已停用');
  expect(errors).toEqual([]);
});

test('catalog edits built-ins, rejects overlapping sections, restores defaults and retains original cards', async ({ page }) => {
  await isolatedGuest(page);
  await page.evaluate(date => {
    localStorage.setItem('study-v11:guest:material-selection', JSON.stringify(['book:TOEFL托福決戰字彙3800']));
    localStorage.setItem('study-v11:guest:' + date, JSON.stringify({ date, notes: 'keep this card', items: [{ id: 'existing-toefl', type: 'extra', source: 'custom', title: 'existing', done: false, minutes: '12', required: false, f: { title: 'TOEFL托福決戰字彙3800', start: '1', end: '8', progress: true } }] }));
  }, date);
  await page.reload(); await page.locator('#catalogSearch').fill('TOEFL');
  await enableMaterialEditing(page);
  await page.locator('.material-row').getByRole('button', { name: '編輯', exact: true }).click();
  await page.getByLabel('書名', { exact: true }).fill('TOEFL My Edition');
  await page.getByRole('button', { name: '儲存教材', exact: true }).click();
  await expect(page.locator('.material-row h3')).toHaveText('英文｜TOEFL My Edition');
  await page.goto('/');
  const oldCard = page.locator('[data-item="existing-toefl"]');
  await expect(oldCard).toContainText('TOEFL My Edition');
  await expect(oldCard.locator('[data-field="start"]')).toHaveValue('1');
  await expect(oldCard.locator('[data-field="end"]')).toHaveValue('8');
  await page.goto('/material.progress.html#english'); await page.locator('#catalogSearch').fill('TOEFL');
  await enableMaterialEditing(page);
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '還原內建' }).click();
  await expect(page.locator('.material-row h3')).toHaveText('TOEFL托福決戰字彙3800');
  await page.getByRole('button', { name: '新增教材', exact: true }).click();
  await page.getByLabel('書名', { exact: true }).fill('Invalid overlap'); await page.locator('#catalogTotal').fill('10');
  for (let index = 0; index < 2; index++) { await page.getByRole('button', { name: '新增章節', exact: true }).click(); await page.locator('.catalog-section').last().getByLabel('大單元', { exact: true }).fill('Same'); }
  await page.getByRole('button', { name: '儲存教材', exact: true }).click();
  await expect(page.locator('#catalogError')).toContainText('重疊'); await expect(page.locator('#catalogEditor')).toBeVisible();
});

for (const mode of ['unit', 'round'] as const) test(`catalog ${mode} selection uses numeric template and retains input after reload`, async ({ page }) => {
  await isolatedGuest(page); await addBook(page, mode); await page.goto('/');
  const card = await addSelectedCatalogItem(page);
  const startKey = mode === 'unit' ? 'unitStart' : 'round', endKey = mode === 'unit' ? 'unitEnd' : 'roundEnd';
  await expect(card.locator('[data-field="start"]')).toHaveCount(0);
  await card.locator(`[data-field="${startKey}"]`).fill('3'); await card.locator(`[data-field="${endKey}"]`).fill('2'); await card.locator(`[data-field="${endKey}"]`).blur();
  await expect(card.locator(`[data-field="${endKey}"]`)).toHaveValue('3');
  await page.reload(); await expect(card.locator(`[data-field="${startKey}"]`)).toHaveValue('3');
  await expect(card.locator(`[data-field="${endKey}"]`)).toHaveValue('3');
});

test('vocabulary badge counts distinct dates and speech switches accents without editing words or Oxford links', async ({ page }) => {
  await isolatedGuest(page);
  await page.addInitScript(() => {
    const state = { spoken: [] as Array<{ text: string; lang: string; voice: string }>, cancels: 0 };
    Object.defineProperty(window, '__speech', { value: state });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { lang = ''; rate = 1; voice?: { name: string }; onend?: () => void; onerror?: () => void; constructor(public text: string) {} } });
    Object.defineProperty(window, 'speechSynthesis', { value: { cancel: () => { state.cancels++; }, getVoices: () => [{ name: 'US', lang: 'en-US', localService: true }, { name: 'UK', lang: 'en-GB', localService: true }], speak: (utterance: { text: string; lang: string; voice?: { name: string } }) => { state.spoken.push({ text: utterance.text, lang: utterance.lang, voice: utterance.voice?.name ?? '' }); } } });
  });
  await page.evaluate(() => {
    for (const date of ['2026-10-28', '2026-10-29']) localStorage.setItem('study-v11:guest:' + date, JSON.stringify({ date, items: [{ id: 'words', type: 'general', f: { words: [{ text: 'alternate', noun: true }, { text: 'alternate', noun: true }] } }] }));
  });
  await page.goto('/vocabulary.review.html');
  await expect(page.locator('.vocabulary-frequency-badge')).toHaveText('🔥 記錄 2 次');
  await expect(page.locator('.vocabulary-word-link')).toHaveAttribute('href', /oxford.*q=alternate/);
  const speaker = page.getByRole('button', { name: '朗讀「alternate」' });
  await expect(speaker.locator('svg')).toHaveCount(1);
  await expect(speaker).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await speaker.click();
  await expect(speaker).toHaveCSS('color', 'rgb(102, 102, 102)');
  await expect(speaker).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.locator('#vocabularyAccent').selectOption('en-GB');
  // A second click on the current speaker stops it; the following click starts the new accent.
  await page.getByRole('button', { name: '朗讀「alternate」' }).click(); await page.getByRole('button', { name: '朗讀「alternate」' }).click();
  expect(await page.evaluate(() => (window as unknown as { __speech: { spoken: unknown[] } }).__speech.spoken)).toEqual([
    { text: 'alternate', lang: 'en-US', voice: 'US' }, { text: 'alternate', lang: 'en-GB', voice: 'UK' },
  ]);
  const stored = await page.evaluate(() => localStorage.getItem('study-v11:guest:2026-10-29'));
  await page.getByRole('button', { name: '隱藏中文', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('study-v11:guest:2026-10-29'))).toBe(stored);
});

test('unsupported speech gives an actionable message and leaves vocabulary editing usable', async ({ page }) => {
  await isolatedGuest(page); await page.addInitScript(() => Object.defineProperty(window, 'speechSynthesis', { value: undefined }));
  await page.evaluate(date => localStorage.setItem('study-v11:guest:' + date, JSON.stringify({ date, items: [{ id: 'words', type: 'general', f: { words: [{ text: 'novelty', noun: true }] } }] })), date);
  await page.goto('/vocabulary.review.html'); await page.getByRole('button', { name: '朗讀「novelty」' }).click();
  await expect(page.locator('#vocabularySpeechStatus')).toContainText('不支援發音');
  await page.getByRole('button', { name: '編輯「novelty」' }).click(); await expect(page.locator('[data-vocabulary-text]')).toBeVisible();
});
