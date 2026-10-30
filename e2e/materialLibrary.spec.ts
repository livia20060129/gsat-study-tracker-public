import { expect, test, type Page } from '@playwright/test';
import { enableMaterialEditing } from './helpers/materialEditing.ts';

test.use({ timezoneId: 'Asia/Taipei' });
const date = '2026-10-29';

async function openLibrary(page: Page, subject = 'english'): Promise<void> {
  await page.route('https://xcpnxkkixsxzgbqsiuud.supabase.co/**', route => route.fulfill({ json: [] }));
  await page.clock.install({ time: new Date('2026-10-29T12:00:00+08:00') });
  await page.goto('/material.progress.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
  });
  await page.goto(`/material.progress.html#${subject}`);
  const materialsPanel = page.locator('#materialsPanel');
  await materialsPanel.locator('summary').click();
  const firstMaterial = page.locator('#materialSelectionList input[type="checkbox"]').first();
  if (await firstMaterial.count()) await firstMaterial.check();
}

async function fillBook(page: Page, title: string, mode = 'pages'): Promise<void> {
  await enableMaterialEditing(page);
  await page.getByRole('button', { name: '新增教材', exact: true }).click();
  await page.getByLabel('書名', { exact: true }).fill(title);
  await page.getByLabel('範圍模板', { exact: true }).selectOption(mode);
  await page.locator('#catalogTotal').fill('20');
}

test('toolbar edit reveals material creation and finishing edit preserves a draft without saving it', async ({ page }) => {
  await openLibrary(page);
  const toggle = page.locator('#toggleMaterialEditing');
  const create = page.locator('#newMaterial');
  const before = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
  await expect(toggle).toHaveText('編輯');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(create).toBeHidden();
  await expect(page.locator('.material-row').getByRole('button', { name: '編輯', exact: true })).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveText('完成');
  await expect(create).toBeVisible();
  await expect(page.locator('.material-row').getByRole('button', { name: '編輯', exact: true }).first()).toBeVisible();
  await create.click();
  await page.getByLabel('書名', { exact: true }).fill('Preserved Draft');
  await page.locator('#catalogTotal').fill('20');
  await toggle.click();
  await expect(create).toBeHidden();
  await expect(page.locator('#catalogEditor')).toBeHidden();
  await page.getByRole('tab', { name: '數學', exact: true }).click();
  await page.getByRole('button', { name: '重新讀取', exact: true }).click();
  await expect(page.locator('.material-row').getByRole('button', { name: '編輯', exact: true })).toHaveCount(0);
  await toggle.click();
  await expect(page.locator('#catalogEditor')).toBeVisible();
  await expect(page.getByLabel('書名', { exact: true })).toHaveValue('Preserved Draft');
  expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))).toBe(before);
  await page.getByRole('button', { name: '儲存教材', exact: true }).click();
  await expect(page.locator('#catalogEditor')).toBeHidden();
  await page.reload();
  await expect(toggle).toHaveText('編輯');
  await expect(create).toBeHidden();
  await page.getByLabel('搜尋教材', { exact: true }).fill('Preserved Draft');
  await expect(page.locator('.material-row')).toHaveCount(1);
});

test('one material row owns its progress and management actions, updates immediately and preserves study data', async ({ page }) => {
  await openLibrary(page);
  await fillBook(page, 'Unified Book');
  await page.getByRole('button', { name: '儲存教材', exact: true }).click();
  await expect(page).toHaveURL(/material\.progress\.html#english$/);
  await page.getByLabel('搜尋教材', { exact: true }).fill('Unified Book');
  const row = page.locator('.material-row');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.material-bar')).toHaveCount(1);
  await expect(row.getByRole('button', { name: '編輯', exact: true })).toBeVisible();
  await expect(page.locator('.progress-panel')).toHaveCount(2);
  await expect(page.locator('#subjectSwitch')).toHaveCount(1);
  await expect(page.locator('#catalogList, #catalogFilter, .catalog-page')).toHaveCount(0);
  await page.evaluate(date => {
    const key = 'study-v11:guest:' + date;
    const record = JSON.parse(localStorage.getItem(key)!);
    const material = record.materialCatalog[0];
    record.notes = 'preserve my daily notes';
    record.items.push({ id: 'original', type: 'extra', source: 'custom', title: 'Original card', minutes: '15', done: true, required: false,
      f: { catalogMaterialId: material.id, title: material.title, scopeKind: 'pages', start: '1', end: '10' } });
    localStorage.setItem(key, JSON.stringify(record));
  }, date);
  await page.getByRole('button', { name: '重新讀取', exact: true }).click();
  await expect(row).toContainText('完成 50%');
  await row.getByRole('button', { name: '編輯', exact: true }).click();
  await page.getByLabel('書名', { exact: true }).fill('Renamed Book');
  await page.getByRole('button', { name: '儲存教材', exact: true }).click();
  await expect(row).toHaveCount(1); await expect(row).toContainText('Renamed Book'); await expect(row).toContainText('完成 50%');
  page.on('dialog', dialog => dialog.accept());
  await expect(row.getByRole('button', { name: '刪除目錄', exact: true })).toHaveCount(0);
  await row.getByRole('button', { name: '編輯', exact: true }).click();
  await page.getByLabel('書名', { exact: true }).fill('');
  await page.getByRole('button', { name: '刪除目錄', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByLabel('顯示已停用教材', { exact: true }).check();
  await expect(row).toContainText('目錄已停用');
  await row.getByRole('button', { name: '恢復教材', exact: true }).click();
  await expect(row).toContainText('完成 50%');
  const saved = await page.evaluate(date => JSON.parse(localStorage.getItem('study-v11:guest:' + date)!), date);
  expect(saved.notes).toBe('preserve my daily notes');
  expect(saved.items).toHaveLength(1); expect(saved.items[0]).toMatchObject({ done: true, minutes: '15', f: { start: '1', end: '10' } });
});

test('catalog delete appears only for an existing editor and cancelling confirmation preserves the draft', async ({ page }) => {
  await openLibrary(page);
  const remove = page.locator('#deleteCatalogMaterial');
  await expect(remove).toBeHidden();
  await expect(page.locator('.material-row').getByRole('button', { name: '刪除目錄', exact: true })).toHaveCount(0);
  await enableMaterialEditing(page);
  await page.getByRole('button', { name: '新增教材', exact: true }).click();
  await expect(remove).toBeHidden();
  await page.getByRole('button', { name: '取消編輯', exact: true }).click();
  const original = page.locator('[data-material-id="english:ace"]');
  await original.getByRole('button', { name: '編輯', exact: true }).click();
  await expect(remove).toBeVisible();
  await page.getByLabel('書名', { exact: true }).fill('Unsaved title');
  page.once('dialog', dialog => dialog.dismiss());
  await remove.click();
  await expect(page.locator('#catalogEditor')).toBeVisible();
  await expect(page.getByLabel('書名', { exact: true })).toHaveValue('Unsaved title');
  await expect(original).toBeVisible();
  expect(await page.evaluate(date => localStorage.getItem('study-v11:guest:' + date), date)).toBeNull();
  await page.getByRole('button', { name: '取消編輯', exact: true }).click();
  await expect(remove).toBeHidden();
});

test('global subject changes filter the library and retain the open editor draft', async ({ page }) => {
  await openLibrary(page, 'natural');
  await expect(page.locator('.material-row')).not.toHaveCount(0);
  await fillBook(page, 'My Biology Book');
  await page.getByLabel('科目', { exact: true }).selectOption('生物');
  await page.getByRole('tab', { name: '英文', exact: true }).click();
  await expect(page.getByLabel('書名', { exact: true })).toHaveValue('My Biology Book');
  await expect(page.getByLabel('科目', { exact: true })).toHaveValue('生物');
  await page.getByRole('button', { name: '重新讀取', exact: true }).click();
  await expect(page.getByLabel('書名', { exact: true })).toHaveValue('My Biology Book');
  await page.getByRole('button', { name: '儲存教材', exact: true }).click();
  await expect(page.getByRole('tab', { name: '自然', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('搜尋教材', { exact: true }).fill('My Biology Book');
  await expect(page.locator('.material-row')).toHaveCount(1);
  await expect(page.locator('.material-group-title')).toHaveText('生物');
  await page.getByRole('tab', { name: '國文', exact: true }).click();
  await expect(page.locator('.material-row')).toHaveCount(0);
  await expect(page.locator('#materialEmpty')).toBeVisible();
});

test('old catalog bookmarks redirect to the shared page and Tracker has only one material navigation entry', async ({ page }) => {
  await openLibrary(page);
  await page.goto('/material.catalog.html?from=bookmark#english');
  await expect(page).toHaveURL(/material\.progress\.html\?from=bookmark#english$/);
  await expect(page.getByRole('heading', { name: '教材進度圖', exact: true })).toBeVisible();
  await page.locator('#materialsPanel summary').click();
  await expect(page.getByRole('tab', { name: '英文', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('link', { name: '回到 Tracker', exact: true }).click();
  await expect(page.locator('.header-actions a[href="./material.progress.html"]')).toHaveCount(1);
  await expect(page.locator('.header-actions a[href="./material.catalog.html"]')).toHaveCount(0);
});

test('mobile progress and editor use the same panel without horizontal overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await openLibrary(page);
  await page.getByLabel('搜尋教材', { exact: true }).fill('Mobile Book');
  await fillBook(page, 'Mobile Book');
  await page.getByRole('button', { name: '新增章節', exact: true }).click();
  await page.locator('.catalog-section').getByLabel('大單元', { exact: true }).fill('Chapter One');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('shared-material-editor-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '儲存教材', exact: true }).click();
  await expect(page.locator('.material-row')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('shared-material-row-mobile.png'), fullPage: true });
});

for (const mode of ['unit', 'round']) test(`offline ${mode} material saves locally and remains available after reconnect`, async ({ page, context }) => {
  await openLibrary(page);
  await context.setOffline(true);
  await fillBook(page, `Offline ${mode}`, mode);
  await page.getByRole('button', { name: '儲存教材', exact: true }).click();
  await expect(page.locator('#catalogStatus')).toContainText('教材已儲存');
  expect(await page.evaluate(date => {
    const record = JSON.parse(localStorage.getItem('study-v11:guest:' + date)!);
    return { dirty: record.localDirty, mode: record.materialCatalog[0].mode };
  }, date)).toEqual({ dirty: true, mode });
  await context.setOffline(false);
  await page.reload();
  await page.getByLabel('搜尋教材', { exact: true }).fill(`Offline ${mode}`);
  await expect(page.locator('.material-row')).toHaveCount(1);
  await enableMaterialEditing(page);
  await page.locator('.material-row').getByRole('button', { name: '編輯', exact: true }).click();
  await expect(page.getByLabel('範圍模板', { exact: true })).toHaveValue(mode);
});
