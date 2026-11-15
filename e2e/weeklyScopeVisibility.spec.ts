import { expect, test } from '@playwright/test';

const prefix = 'study-v11:guest:';
const date = '2026-11-09';
const units = [18, 20, 22, 24, 26];

test('weekly rows show current Units and ranges on mobile without duplicate titles or completing a same-book sibling', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00+08:00'));
  await page.goto('/');
  await page.evaluate(({ prefix, date, units }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const items = units.map(unit => ({
      id: `weekly-unit-${unit}`, type: 'extra', title: '英文｜Essential Grammar in Use' + (unit === 20 ? '｜Unit 2' : ''),
      source: 'preset', required: false, done: false, minutes: String(unit),
      f: { title: 'Essential Grammar in Use', calendarRoute: 'week', scopeKind: 'unit', unitStart: String(unit), unitEnd: String(unit) },
    }));
    const other = [
      { id: 'weekly-round', type: 'extra', title: '英文｜ACE Reading 第 1 回', source: 'preset', required: false, done: false, minutes: '',
        f: { title: 'ACE Reading', calendarRoute: 'week', scopeKind: 'round', round: '14', roundEnd: '15' } },
      { id: 'weekly-pages', type: 'extra', title: '英文｜閱讀練習｜p.7–8', source: 'preset', required: false, done: false, minutes: '',
        f: { title: '閱讀練習', calendarRoute: 'week', scopeKind: 'pages', start: '36', end: '46' } },
    ];
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, items: [...items, ...other] }));
  }, { prefix, date, units });
  await page.reload();
  await page.locator('[data-study-items-view="week"]').click();
  const rows = page.locator('.weekly-item-row');
  await expect(rows).toHaveCount(7);
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const unit of units) {
      const row = rows.filter({ has: page.locator(`[data-week-item="weekly-unit-${unit}"]`) });
      // The old view returned early once the book appeared in the title,
      // omitting Unit fields and retaining a stale Unit from the title.
      await expect(row).toContainText(`Unit ${unit}`);
      await expect(row.locator('.weekly-item-range')).toHaveText(`Unit ${unit}`);
      expect((await row.innerText()).match(/Essential Grammar in Use/g)).toHaveLength(1);
      expect((await row.innerText()).match(/Unit \d+/g)).toEqual([`Unit ${unit}`]);
    }
    await expect(rows.filter({ has: page.locator('[data-week-item="weekly-round"]') }).locator('.weekly-item-range')).toHaveText('第 14–15 回');
    await expect(rows.filter({ has: page.locator('[data-week-item="weekly-pages"]') }).locator('.weekly-item-range')).toHaveText('p.36–46');
    const rangesFit = await rows.locator('.weekly-item-range').evaluateAll(nodes => nodes.every(node => {
      const rect = node.getBoundingClientRect(), row = node.closest('.weekly-item-row')!.getBoundingClientRect();
      return rect.left >= row.left && rect.right <= row.right && node.scrollWidth <= node.clientWidth;
    }));
    expect(rangesFit).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 375) await page.locator('#weeklyItemList').screenshot({ path: testInfo.outputPath('mobile-weekly-scopes.png') });
  }
  await page.locator('[data-week-done][data-week-item="weekly-unit-18"]').check();
  await expect.poll(async () => page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!).items.find((item: { id: string }) => item.id === 'weekly-unit-18').done, { prefix, date })).toBe(true);
  const saved = await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!).items, { prefix, date });
  for (const unit of units) {
    const item = saved.find((item: { id: string }) => item.id === `weekly-unit-${unit}`);
    expect(item.done).toBe(unit === 18);
    expect(item.f.unitStart).toBe(String(unit));
    expect(item.minutes).toBe(String(unit));
  }
  await page.reload();
  await page.locator('[data-study-items-view="week"]').click();
  await expect(page.locator('[data-week-done][data-week-item="weekly-unit-18"]')).toBeChecked();
  await expect(rows.first().locator('.weekly-item-range')).toHaveText('Unit 18');
});
