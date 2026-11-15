import { expect, test, type Page } from '@playwright/test';
import { showMobileSection } from './helpers/siteNavigation.ts';

const weekdays = '.site-week-ticks a[data-week-date]';
const dayLink = (date: string): string => `.site-week-ticks a[data-week-date="${date}"]`;

async function seed(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-11-14T12:00:00+08:00'));
  await page.goto('/todo.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    for (const date of ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-14']) {
      localStorage.setItem(`study-v11:guest:${date}`, JSON.stringify({ schemaVersion: 2, date, items: [], notes: `${date} 的紀錄` }));
    }
  });
  await page.goto('/');
}

for (const width of [1440, 375]) test(`all weekday links open their date, retain drafts and progress, and can open an unfilled Sunday (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await seed(page);
  await showMobileSection(page, 'date');
  await expect(page.locator(weekdays)).toHaveCount(7);
  expect(await page.locator(weekdays).allTextContents()).toEqual(['一', '二', '三', '四', '五', '六', '日']);
  await expect(page.locator('[data-rail-days]')).toHaveText('5');
  await expect(page.locator('.site-week-ticks .has-record')).toHaveCount(5);
  await expect(page.locator(dayLink('2026-11-14'))).toHaveAttribute('aria-current', 'date');
  await expect(page.locator(dayLink('2026-11-15'))).toHaveAttribute('href', './index.html?date=2026-11-15');
  await showMobileSection(page, 'content');
  await page.locator('#notes').fill('星期六尚未離開欄位的草稿');
  await page.locator('#studyDate').evaluate(node => { (window as unknown as { originalWeekdayInput: Element }).originalWeekdayInput = node; });
  await showMobileSection(page, 'date');
  const wednesday = page.locator(dayLink('2026-11-11'));
  if (width === 1440) { await wednesday.focus(); await wednesday.press('Enter'); }
  else await wednesday.click();
  await expect(page.locator('#studyDate')).toHaveValue('2026-11-11');
  await expect(page.locator('#notes')).toHaveValue('2026-11-11 的紀錄');
  await expect(page).toHaveURL(/\?date=2026-11-11$/);
  if (width < 1200) await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  expect(await page.locator('#studyDate').evaluate(node => node === (window as unknown as { originalWeekdayInput: Element }).originalWeekdayInput)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('study-v11:guest:2026-11-14')!).notes)).toBe('星期六尚未離開欄位的草稿');
  await page.reload();
  await expect(page.locator('#studyDate')).toHaveValue('2026-11-11');
  await showMobileSection(page, 'date');
  await expect(page.locator(dayLink('2026-11-11'))).toHaveAttribute('aria-current', 'date');
  await expect(page.locator('[data-rail-days]')).toHaveText('5');
  expect(await page.locator('.site-week-ticks').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  const bounds = await page.locator(weekdays).evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(bounds.every(height => height >= 44)).toBe(true);
  await page.locator(dayLink('2026-11-15')).click();
  await expect(page.locator('#studyDate')).toHaveValue('2026-11-15');
  await expect(page.locator('#notes')).toHaveValue('');
  await expect(page).toHaveURL(/\?date=2026-11-15$/);
});

for (const width of [1440, 375]) test(`standalone pages link to the correct day across a year boundary (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date('2027-01-01T12:00:00+08:00'));
  await page.goto('/todo.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-12-31', JSON.stringify({ schemaVersion: 2, date: '2026-12-31', items: [], notes: '跨年紀錄' }));
  });
  for (const path of ['/todo.html', '/summary.html', '/gpt.prompt.html']) {
    await page.goto(path);
    await showMobileSection(page, 'date');
    expect(await page.locator(weekdays).evaluateAll(nodes => nodes.map(node => (node as HTMLAnchorElement).dataset.weekDate))).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ]);
    await page.locator(dayLink('2026-12-31')).click();
    await expect(page).toHaveURL(/index\.html\?date=2026-12-31$/);
    await expect(page.locator('#studyDate')).toHaveValue('2026-12-31');
    await expect(page.locator('#notes')).toHaveValue('跨年紀錄');
    if (width < 1200) await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  }
});

test('a failed save cancels weekday switching and retains the original date, URL and draft', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.locator('#notes').fill('不可遺失的草稿');
  const url = page.url();
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value): void {
      if (key === 'study-v11:guest:2026-11-14') throw new DOMException('storage unavailable', 'QuotaExceededError');
      setItem.call(this, key, value);
    };
  });
  await page.locator(dayLink('2026-11-11')).click();
  await expect(page.locator('#studyDate')).toHaveValue('2026-11-14');
  await expect(page.locator('#notes')).toHaveValue('不可遺失的草稿');
  await expect(page.locator('#status')).toContainText('已取消日期切換');
  expect(page.url()).toBe(url);
});

test.describe('touch weekdays', () => {
  test.use({ viewport: { width: 320, height: 812 }, isMobile: true, hasTouch: true });
  test('tapping the progress bar opens the date and returns to content without horizontal overflow', async ({ page }) => {
    await seed(page);
    await showMobileSection(page, 'date');
    await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
    const link = page.locator(dayLink('2026-11-10'));
    await link.tap({ position: { x: 5, y: 3 } });
    await expect(page.locator('#studyDate')).toHaveValue('2026-11-10');
    await expect(page.locator('#notes')).toHaveValue('2026-11-10 的紀錄');
    await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
