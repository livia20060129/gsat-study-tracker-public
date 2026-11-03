import { expect, test } from '@playwright/test';
import { showMobileSection } from './helpers/siteNavigation.ts';

test('weekly sidebar groups overdue Units and links to the same book filter without combining their saved progress', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+08:00'));
  await page.goto('/todo.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-11-02', JSON.stringify({ schemaVersion: 2, date: '2026-11-02', items: [16, 18, 19, 20].map(unit => ({
      id: `grammar-${unit}`, type: 'extra', source: 'preset', presetKey: `cal_essential_${unit}`,
      title: `英文｜Essential Grammar in Use｜Unit ${unit}`, required: true, done: false, minutes: String(unit),
      f: { title: 'Essential Grammar in Use', scopeKind: 'unit', unitStart: String(unit), unitEnd: String(unit) },
    })) }));
  });
  await page.reload();
  await showMobileSection(page, 'tools');
  const preview = page.locator('[data-rail-overdue-list] a');
  await expect(preview).toHaveCount(1);
  await expect(preview).toContainText('Essential Grammar in Use：4 項逾期');
  await expect(page.locator('[data-rail-overdue-count]')).toHaveText('4 項');
  await preview.click();
  await expect(page).toHaveURL(/period=week&item=english%3AEssential\+Grammar\+in\+Use#english|period=week&item=english%3AEssential%20Grammar%20in%20Use#english/);
  await expect(page.locator('.todo-card')).toHaveCount(4);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('study-v11:guest:2026-11-02')!).items);
  expect(saved.map((item: { done: boolean }) => item.done)).toEqual([false, false, false, false]);
  expect(saved.map((item: { minutes: string }) => item.minutes)).toEqual(['16', '18', '19', '20']);
});
