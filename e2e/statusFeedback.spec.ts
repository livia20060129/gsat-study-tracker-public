import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

for (const width of [375, 1440]) test(`notices fold into settings after five seconds and acknowledgement stays independent at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#cloudMessage')).toHaveText('目前未登入；使用獨立訪客本機資料。');
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000);
  const row = page.locator('#statusFeedback'), summary = page.locator('.connection-status-bar');
  const content = page.locator('.connection-settings-content'), settings = page.locator('#connectionSettings');
  const message = '本機對照仍有 30 天未更新，原因見詳細。';
  await page.locator('#status').evaluate((node, text) => { node.textContent = text; }, message);
  await expect(summary.locator('#statusFeedback')).toBeVisible();
  await page.clock.runFor(4999);
  await expect(row).toHaveAttribute('data-placement', 'summary');
  await page.clock.runFor(1);
  await expect(summary.locator('#statusFeedback')).toHaveCount(0);
  await expect(content.locator('#statusFeedback')).toHaveCount(1);
  await expect(row).toBeHidden();
  await page.locator('.connection-settings-toggle').click();
  await expect(settings).toHaveAttribute('open', '');
  await expect(row).toBeVisible();
  await expect(page.locator('#status')).toHaveText(message);
  await page.getByRole('button', { name: '了解', exact: true }).click();
  await expect(row).toBeHidden();
  await expect(settings).toHaveAttribute('open', '');
  await page.locator('.connection-settings-toggle').click();

  // Repeated status refreshes do not extend the five-second display.
  await page.locator('#status').evaluate(node => { node.textContent = '新的說明'; });
  await expect(summary.locator('#statusFeedback')).toBeVisible();
  await page.clock.runFor(4000);
  await page.locator('#status').evaluate(node => { node.textContent = '新的說明'; });
  await page.clock.runFor(1000);
  await expect(row).toHaveAttribute('data-placement', 'details');

  // A genuinely new message receives its own deadline; the old timer cannot fold it early.
  await page.locator('#status').evaluate(node => { node.textContent = '準備同步'; });
  await page.clock.runFor(4000);
  await page.locator('#status').evaluate(node => { node.textContent = '新問題，原因見詳細。'; });
  await page.clock.runFor(1000);
  await expect(row).toHaveAttribute('data-placement', 'summary');
  await page.clock.runFor(4000);
  await expect(row).toHaveAttribute('data-placement', 'details');
  await expect(settings).not.toHaveAttribute('open', '');
});
