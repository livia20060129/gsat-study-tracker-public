import { expect, test } from '@playwright/test';

test('week and month trends distinguish original and old-progress minutes without changing their total', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-10-02T12:00:00+08:00') });
  await page.goto('/summary.html');
  await page.evaluate(() => {
    localStorage.clear();
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const item = (id: string, minutes: string, checkedOn?: string) => ({
      id, type: 'general', done: true, required: true, minutes, checkedOn, f: { subject: '英文' },
    });
    const records = [
      { date: '2026-09-30', items: [item('old', '75', '2026-10-02'), item('older', '45', '2026-10-01')] },
      { date: '2026-10-02', items: [item('today', '30')] },
      { date: '2026-10-03', items: [item('regular', '60')] },
      { date: '2026-10-05', items: [item('early', '15', '2026-10-02')] },
    ];
    for (const record of records) localStorage.setItem(prefix + record.date, JSON.stringify(record));
  });
  await page.reload();
  const chart = page.locator('#summaryTrend');
  for (const mode of ['週', '月']) {
    await page.getByRole('tab', { name: mode, exact: true }).click();
    await expect(chart.locator('g[data-trend-date]')).toHaveCount(mode === '週' ? 7 : 31);
    const mixed = chart.locator('[data-trend-date="2026-10-02"]');
    await expect(mixed.locator('[data-time-kind="regular"]')).toHaveAttribute('data-minutes', '45');
    await expect(mixed.locator('[data-time-kind="makeup"]')).toHaveAttribute('data-minutes', '75');
    await expect(mixed.locator('title').first()).toContainText('2 小時');
    await expect(mixed.locator('[data-time-kind="regular"]')).toHaveCSS('fill', 'rgb(184, 202, 224)');
    await expect(mixed.locator('[data-time-kind="makeup"]')).toHaveCSS('fill', 'rgb(157, 214, 255)');
    await expect(chart.locator('[data-trend-date="2026-10-01"] rect')).toHaveCount(1);
    await expect(chart.locator('[data-trend-date="2026-10-01"] rect')).toHaveAttribute('data-time-kind', 'makeup');
    await expect(chart.locator('[data-trend-date="2026-10-03"] rect')).toHaveAttribute('data-time-kind', 'regular');
  }
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.summary-trend-card').screenshot({ path: testInfo.outputPath('trend-' + width + '.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
