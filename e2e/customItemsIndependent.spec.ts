import { expect, test } from '@playwright/test';

const prefix = 'study-v11:guest:';
const date = '2026-10-18';

test('manually adding the same book and round twice keeps both editable cards and their own completion', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-19T12:00:00+08:00') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:guest:material-selection', JSON.stringify(['english:ace']));
  });
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  const ids: string[] = [];
  for (const minutes of ['11', '22']) {
    await page.locator('#itemType').selectOption('extra');
    await page.locator('#addItemBtn').click();
    const card = page.locator('#itemList > [data-item]').last();
    ids.push((await card.getAttribute('data-item'))!);
    await card.locator('[data-field="title"]').selectOption('ACE Reading');
    await card.locator('[data-field="round"]').fill('2');
    await card.locator('[data-field="round"]').blur();
    await card.locator('[data-minutes]').fill(minutes);
    await card.locator('[data-minutes]').blur();
  }
  await expect(page.locator('#itemList > [data-item]')).toHaveCount(2);
  await expect(page.locator('#itemList')).not.toContainText('已合併');
  await page.locator(`#itemList [data-item="${ids[0]}"] [data-done]`).check();
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  for (let index = 0; index < ids.length; index++) {
    const card = page.locator(`#itemList [data-item="${ids[index]}"]`);
    await expect(card.locator('[data-field="title"]')).toHaveValue('ACE Reading');
    await expect(card.locator('[data-field="round"]')).toHaveValue('2');
    await expect(card.locator('[data-minutes]')).toHaveValue(index === 0 ? '11' : '22');
    await expect(card.locator('[data-done]')).toBeChecked({ checked: index === 0 });
  }
  await expect(page.locator('#itemCountBadge')).toHaveText('2 項');
});

test('old mixed aggregates restore manual page cards separately from scheduled work without losing source data', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-19T12:00:00+08:00') });
  await page.goto('/');
  await page.evaluate(({ prefix, date }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const scheduled = { id: 'scheduled-source', type: 'mathLecture', title: '範圍獨立驗證', source: 'preset',
      done: false, minutes: '10', required: true, f: { material: '教學講義', book: '1', start: '1', end: '5' } };
    const first = { ...structuredClone(scheduled), id: 'manual-first', source: 'custom', required: false,
      minutes: '15', f: { ...scheduled.f, start: '6', end: '10', reason: '第一張筆記' } };
    const second = { ...structuredClone(first), id: 'manual-second', minutes: '25', done: true, checkedOn: '2026-10-18',
      f: { ...first.f, start: '11', end: '15', corrected: true, reason: '第二張筆記' } };
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, items: [{
      ...scheduled, id: 'old-combined', f: { ...scheduled.f, start: '1', end: '15', dailyWorkGroup: true,
        dailyWorkSourceItems: [scheduled, first, second] },
    }] }));
  }, { prefix, date });
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(page.locator('#itemList > [data-item]')).toHaveCount(2);
  await expect(page.locator('#dailyItemList [data-item="scheduled-source"]')).toHaveCount(1);
  const first = page.locator('#itemList [data-item="manual-first"]');
  const second = page.locator('#itemList [data-item="manual-second"]');
  await expect(first.locator('[data-field="start"]')).toHaveValue('6');
  await expect(second.locator('[data-field="start"]')).toHaveValue('11');
  await expect(second.locator('[data-done]')).toBeChecked();
  await expect(second.locator('[data-completion-date]')).toHaveValue('2026-10-18');
  await expect(second.locator('[data-field="reason"]')).toHaveValue('第二張筆記');
  await first.locator('[data-field="end"]').fill('12');
  await first.locator('[data-field="end"]').blur();
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(page.locator('#itemList > [data-item]')).toHaveCount(2);
  await expect(first.locator('[data-field="end"]')).toHaveValue('12');
  await expect(second.locator('[data-field="start"]')).toHaveValue('11');
  await expect(second.locator('[data-minutes]')).toHaveValue('25');
  await page.goto('/todo.html');
  await expect(page.locator('[data-item-id="manual-first"],[data-item-id="manual-second"]')).toHaveCount(0);
  await expect(page.locator('.todo-card').filter({ has: page.locator('[data-item-id="scheduled-source"]') })).toHaveCount(1);
});
