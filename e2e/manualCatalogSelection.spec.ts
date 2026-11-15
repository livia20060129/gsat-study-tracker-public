import { expect, test, type Locator, type Page } from '@playwright/test';
import { enableMaterialEditing } from './helpers/materialEditing.ts';
import { CATALOG_SUBJECTS, type CatalogMaterial } from '../src/study/materialCatalog.ts';
import { builtInMaterialCatalog } from '../src/study/materialProgress.ts';

const date = '2026-11-15';
const prefix = 'study-v11:guest:';
test.use({ timezoneId: 'Asia/Taipei' });

async function prepare(page: Page): Promise<void> {
  await page.route('https://xcpnxkkixsxzgbqsiuud.supabase.co/**', route => route.fulfill({ json: [] }));
  await page.clock.setFixedTime(new Date('2026-11-15T12:00:00+08:00'));
  await page.goto('/material.progress.html');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:'); });
  await page.reload();
}

function family(subject: CatalogMaterial['subject']): string {
  if (subject === '國文') return 'chinese';
  if (subject === '英文') return 'english';
  if (subject === '數學') return 'math';
  return ['公民', '歷史', '地理'].includes(subject) ? 'social' : 'natural';
}

async function createMaterial(page: Page, subject: CatalogMaterial['subject'], mode: CatalogMaterial['mode'], title = `${subject}自編講義 <重點> & 第一冊 📘`): Promise<{ id: string; title: string }> {
  await enableMaterialEditing(page);
  await page.getByRole('button', { name: '新增教材', exact: true }).click();
  await page.getByLabel('科目', { exact: true }).selectOption(subject);
  if (subject === '數學') await page.getByLabel('分類', { exact: true }).selectOption('分冊講義');
  await page.getByLabel('書名', { exact: true }).fill(title);
  await page.getByLabel('範圍模板', { exact: true }).selectOption(mode);
  await page.locator('#catalogTotal').fill('20');
  await page.getByRole('button', { name: '新增章節', exact: true }).click();
  const section = page.locator('.catalog-section').last();
  await section.getByLabel('大單元', { exact: true }).fill('第一章');
  await section.getByLabel('小主題（可不填）', { exact: true }).fill('自編小節');
  await section.getByLabel('起始', { exact: true }).fill('1');
  await section.getByLabel('結束', { exact: true }).fill('20');
  await page.getByRole('button', { name: '儲存教材', exact: true }).click();
  await expect(page.locator('#catalogEditor')).toBeHidden();
  await expect(page.locator('#catalogStatus')).toContainText('教材已儲存');
  const id = await page.evaluate(({ prefix, title }) => Object.keys(localStorage).filter(key => key.startsWith(prefix))
    .flatMap(key => { try { return JSON.parse(localStorage.getItem(key)!).materialCatalog || []; } catch { return []; } })
    .find((entry: { title: string }) => entry.title === title).id as string, { prefix, title });
  return { id, title };
}

async function addManual(page: Page, subject: CatalogMaterial['subject'], title: string): Promise<Locator> {
  await page.goto('/?date=' + date);
  const group = family(subject);
  const type = { chinese: 'chineseReading', english: 'extra', math: 'mathLecture', natural: 'scienceReview', social: 'socialStudy' }[group]!;
  await page.locator('#itemType').selectOption(type);
  await page.locator('#addItemBtn').click();
  const card = page.locator('#itemList > [data-item]').last();
  if (group === 'natural' || group === 'social') await card.locator('[data-field="subject"]').selectOption(subject);
  let selector = card.locator('[data-field="title"]');
  if (group === 'chinese') selector = card.locator('[data-chinese-kind]');
  if (group === 'math' || group === 'natural') selector = card.locator('[data-field="material"]');
  if (group === 'social') selector = card.locator('[data-field="book"]');
  if (group === 'math') await expect(selector.locator('optgroup[label="分冊講義"] option').filter({ hasText: title })).toHaveCount(1);
  await selector.selectOption({ label: title });
  await expect(card.locator('[data-catalog-auto]')).toBeVisible();
  await expect(card.locator('.fixed-book-value')).toContainText(title);
  return card;
}

for (const [index, subject] of CATALOG_SUBJECTS.entries()) {
  test(`${subject}: custom material names, typed scopes and page maps survive manual addition and reload`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: index % 2 ? 1280 : 375, height: 900 });
    await prepare(page);
    const mode = (['pages', 'unit', 'round'] as const)[index % 3];
    const entry = await createMaterial(page, subject, mode);
    const card = await addManual(page, subject, entry.title);
    const id = await card.getAttribute('data-item');
    const start = mode === 'unit' ? 'unitStart' : mode === 'round' ? 'round' : 'start';
    const end = mode === 'unit' ? 'unitEnd' : mode === 'round' ? 'roundEnd' : 'end';
    await card.locator(`[data-field="${start}"]`).fill('1');
    await card.locator(`[data-field="${end}"]`).fill('10');
    await card.locator(`[data-field="${end}"]`).blur();
    await card.locator('[data-minutes]').fill('17');
    await card.locator('[data-minutes]').blur();
    await card.locator('[data-check="progress"]').check();
    await expect(card.locator('[data-catalog-auto]')).toHaveText('第一章｜自編小節');
    await expect(card).not.toContainText(entry.id.slice('custom:'.length));
    await page.reload();
    const saved = page.locator(`[data-item="${id}"]`);
    await expect(saved.locator('.fixed-book-value')).toContainText(entry.title);
    await expect(saved.locator(`[data-field="${start}"]`)).toHaveValue('1');
    await expect(saved.locator(`[data-field="${end}"]`)).toHaveValue('10');
    await expect(saved.locator('[data-minutes]')).toHaveValue('17');
    await expect(saved.locator('[data-check="progress"]')).toBeChecked();
    expect(await page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key)!).items.find((item: { id: string }) => item.id === id).f.catalogMaterialId, { key: prefix + date, id })).toBe(entry.id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (subject === '數學') await saved.screenshot({ path: testInfo.outputPath('manual-math-mobile.png') });
    await page.goto('/material.progress.html#' + family(subject));
    await expect(page.locator('.material-row').filter({ hasText: entry.title })).toContainText('完成 50%');
  });
}

test('an old UUID math card displays the real name and map while preserving every saved study field', async ({ page }) => {
  await prepare(page);
  const uuid = '12345678-1234-4234-8234-123456789012';
  await page.evaluate(({ prefix, date, uuid }) => {
    localStorage.setItem(prefix + 'material-selection', JSON.stringify(['custom:' + uuid]));
    localStorage.setItem(prefix + date, JSON.stringify({ date, notes: '當日筆記', materialCatalog: [{
      id: 'custom:' + uuid, title: '我的數學補充講義', subject: '數學', group: '複習講義', mode: 'pages', total: 20,
      sections: [{ id: 'chapter', start: 1, end: 20, topic: '保留的章節', detail: '' }], revision: 1, updatedAt: '2026-11-15T01:00:00Z',
    }], items: [{ id: 'old-uuid', type: 'mathLecture', source: 'custom', done: true, checkedOn: date, minutes: '17', required: false,
      f: { material: uuid, start: '1', end: '10', progress: true, corrected: true, reason: '原本的訂正內容' } }] }));
  }, { prefix, date, uuid });
  await page.goto('/?date=' + date);
  const card = page.locator('[data-item="old-uuid"]');
  await expect(card).toContainText('我的數學補充講義');
  await expect(card).not.toContainText(uuid);
  await expect(card.locator('[data-catalog-auto]')).toHaveText('保留的章節');
  await expect(card.locator('[data-field="reason"]')).toHaveValue('原本的訂正內容');
  await expect(card.locator('[data-done]')).toBeChecked();
  await page.reload();
  await expect(card.locator('[data-field="start"]')).toHaveValue('1');
  await expect(card.locator('[data-field="end"]')).toHaveValue('10');
  await expect(card.locator('[data-minutes]')).toHaveValue('17');
  await page.goto('/material.progress.html#math');
  await expect(page.locator('.material-row').filter({ hasText: '我的數學補充講義' })).toContainText('完成 50%');
});

test('a renamed built-in math volume uses its edited name and retains its original volume when selected', async ({ page }) => {
  await prepare(page);
  const original = builtInMaterialCatalog().find(entry => entry.id === 'math:對話式:1')!;
  const entry = { ...original, title: '我的數學上冊', revision: 1 };
  await page.evaluate(({ prefix, date, entry }) => {
    localStorage.setItem(prefix + date, JSON.stringify({ date, items: [], materialCatalog: [entry] }));
    localStorage.setItem(prefix + 'material-selection', JSON.stringify([entry.id]));
  }, { prefix, date, entry });
  await page.goto('/?date=' + date);
  await page.locator('#itemType').selectOption('mathLecture');
  await page.locator('#addItemBtn').click();
  const card = page.locator('#itemList > [data-item]').last();
  await card.locator('[data-field="material"]').selectOption({ label: entry.title });
  await card.locator('[data-field="book"]').selectOption('1');
  await expect(card.locator('.fixed-book-value')).toContainText(entry.title);
  await card.locator('[data-field="start"]').fill('1');
  await card.locator('[data-field="end"]').fill('10');
  await card.locator('[data-field="end"]').blur();
  await page.reload();
  await expect(card.locator('[data-field="start"]')).toHaveValue('1');
  await expect(card.locator('[data-field="end"]')).toHaveValue('10');
  const fields = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).items.at(-1).f, prefix + date);
  expect(fields.catalogMaterialId).toBe(entry.id);
  expect(fields.book).toBe('1');
});

test('a custom natural material can use a name reserved for another built-in subject', async ({ page }) => {
  await prepare(page);
  const entry = await createMaterial(page, '物理', 'pages', '領航');
  const card = await addManual(page, '物理', entry.title);
  await card.locator('[data-field="start"]').fill('1');
  await card.locator('[data-field="end"]').fill('10');
  await card.locator('[data-field="end"]').blur();
  await expect(card.locator('[data-catalog-auto]')).toHaveText('第一章｜自編小節');
  await page.reload();
  await expect(card.locator('.fixed-book-value')).toHaveText('物理｜領航');
  await expect(card.locator('[data-field="start"]')).toHaveValue('1');
  await expect(card.locator('[data-field="end"]')).toHaveValue('10');
});
