import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Taipei' });
test.skip(true, '公開版不建立內建每日互動或星期單字行程。');
const prefix = 'study-v11:guest:';
const date = '2026-10-26';

async function completionText(page: Page): Promise<string[]> {
  return page.locator('#completionText, #workloadCompletionText').allTextContents();
}

test('daily interactive card and Monday vocabulary are optional, with completed practice saved across reload and date switches', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(`${date}T12:00:00+08:00`) });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/summary.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  const card = page.locator(`[data-item="preset-${date}-daily_interactive"]`);
  await expect(card.locator('.item-top').first()).toContainText('每日選做');
  const monday = card.locator(`[data-item="monday-vocab-${date}"]`);
  await expect(monday).toHaveCount(1);
  const before = await completionText(page);
  await card.getByRole('button', { name: '新增互動題', exact: true }).click();
  const typeSelect = card.locator('[data-interactive-type]').last();
  const childId = await typeSelect.evaluate(node => node.closest('[data-item]')!.getAttribute('data-item'));
  await typeSelect.selectOption('mathOral');
  const child = card.locator(`[data-item="${childId}"]`);
  await child.locator('[data-field="topic"]').fill('函數觀念');
  await child.locator('[data-minutes]').fill('25');
  await child.locator('[data-done]').check();
  await expect(child.locator('[data-completion-date]')).toHaveValue(date);
  expect(await completionText(page)).toEqual(before);
  const stored = await page.evaluate(({ prefix, date }) => {
    const record = JSON.parse(localStorage.getItem(prefix + date)!);
    return record.items.find((entry: { presetKey: string }) => entry.presetKey === 'daily_interactive');
  }, { prefix, date });
  expect(stored.required).toBe(false);
  expect(stored.f.interactiveEntries.every((entry: { required: boolean }) => entry.required === false)).toBe(true);
  const savedChild = stored.f.interactiveEntries.find((entry: { id: string }) => entry.id === childId);
  expect(savedChild.done).toBe(true);
  expect(savedChild.minutes).toBe('25');
  expect(savedChild.f.topic).toBe('函數觀念');
  await page.reload();
  await expect(child.locator('[data-done]')).toBeChecked();
  await expect(child.locator('[data-minutes]')).toHaveValue('25');
  expect(await completionText(page)).toEqual(before);
  await page.locator('#studyDate').fill('2026-10-27');
  await page.locator('#studyDate').dispatchEvent('change');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(child.locator('[data-done]')).toBeChecked();
  expect(await completionText(page)).toEqual(before);
  await card.screenshot({ path: testInfo.outputPath('interactive-optional-mobile.png') });
  expect(errors).toEqual([]);
});

test('unopened old required practice does not lower period completion and retains its minutes, words and completed-list entries', async ({ page }) => {
  await page.clock.install({ time: new Date(`${date}T12:00:00+08:00`) });
  await page.goto('/summary.html#month');
  await page.evaluate(prefix => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(prefix + '2026-10-25', JSON.stringify({ schemaVersion: 2, date: '2026-10-25', notes: '保留筆記', items: [
      { id: 'required-done', type: 'scienceReview', title: '已完成物理', done: true, required: true, source: 'preset', minutes: '10', f: { subject: '物理' } },
      { id: 'old-interactive', presetKey: 'daily_interactive', type: 'interactiveDaily', title: '互動題', done: false, required: true, source: 'preset', minutes: '', f: { interactiveEntries: [
        { id: 'saved-vocab', type: 'englishVocabInteractive', title: '完成的互動單字', done: true, checkedOn: '2026-10-25', required: true, source: 'dailyInteractive', minutes: '25', f: { words: [{ id: 'word', text: 'cell', noun: true }] } },
        { id: 'pending-biology', type: 'biologyInteractive', title: '未完成生物互動題', done: false, required: true, source: 'dailyInteractive', minutes: '80', f: { topic: '細胞' } },
      ] } },
    ] }));
  }, prefix);
  const original = await page.evaluate(prefix => localStorage.getItem(prefix + '2026-10-25'), prefix);
  await page.reload();
  await expect(page.locator('#summaryTotalCompletion')).toHaveText('100%');
  await expect(page.locator('#summaryCompletedItems')).toContainText('完成的互動單字');
  await expect(page.locator('#summaryCompletedItems')).not.toContainText('未完成生物互動題');
  expect(await page.evaluate(prefix => localStorage.getItem(prefix + '2026-10-25'), prefix)).toBe(original);
  await page.goto('/');
  await page.locator('#studyDate').fill('2026-10-25');
  await page.locator('#studyDate').dispatchEvent('change');
  const saved = page.locator('[data-item="saved-vocab"]');
  await expect(saved.locator('[data-done]')).toBeChecked();
  await expect(saved.locator('[data-minutes]')).toHaveValue('25');
  await expect(saved.locator('[data-word-text]')).toHaveValue('cell');
  await expect(page.locator('#notes')).toHaveValue('保留筆記');
  const before = await completionText(page);
  await page.locator('[data-item="pending-biology"] [data-done]').check();
  expect(await completionText(page)).toEqual(before);
  await page.goto('/todo.html');
  await expect(page.locator('[data-item-id="old-interactive"], [data-item-id="pending-biology"]')).toHaveCount(0);
  await page.goto('/summary.html#month');
  await expect(page.locator('#summaryCompletedItems')).toContainText('未完成生物互動題');
});
