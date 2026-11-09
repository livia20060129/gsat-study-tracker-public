import { expect, test } from '@playwright/test';
import { showMobileSection } from './helpers/siteNavigation.ts';

test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2.75 });

for (const width of [360, 436]) test(`Android-sized section slides keep the viewport and header fixed at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 740 });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  await page.locator('#notes').fill('Android 切換仍保留草稿');
  const original = await page.locator('#notes').elementHandle();
  for (const section of ['tools', 'content', 'date', 'tools', 'content'] as const) {
    const frames = await page.evaluate(async section => {
      const bar = document.getElementById('siteMobileBar')!;
      bar.querySelector<HTMLButtonElement>(`[data-mobile-section="${section}"]`)!.click();
      const samples: { x: number; overflow: number; left: number; right: number; controls: number }[] = [];
      return new Promise<typeof samples>(resolve => {
        function frame(): void {
          const rect = bar.getBoundingClientRect();
          samples.push({ x: scrollX, overflow: document.documentElement.scrollWidth - innerWidth,
            left: rect.left, right: rect.right - innerWidth, controls: document.querySelectorAll('#saveBtn').length });
          if (!document.documentElement.dataset.mobileSlideDirection && samples.length > 2) resolve(samples);
          else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
    }, section);
    expect(frames.length).toBeGreaterThan(2);
    expect(frames.every(frame => frame.x === 0 && frame.overflow <= 1
      && Math.abs(frame.left) <= 1 && Math.abs(frame.right) <= 1 && frame.controls === 1), JSON.stringify(frames)).toBe(true);
    await expect(page.locator('.site-mobile-motion-layer')).toHaveCount(0);
  }
  expect(await original!.evaluate(node => node === document.getElementById('notes'))).toBe(true);
  await expect(page.locator('#notes')).toHaveValue('Android 切換仍保留草稿');
  await showMobileSection(page, 'tools');
  await page.locator('#siteRightRail a[href="./gpt.prompt.html"]').click();
  await expect(page).toHaveURL(/gpt.prompt/);
  await expect(page.locator('html')).not.toHaveAttribute('data-menu-page-entry');
  expect(await page.evaluate(() => scrollX)).toBe(0);
  await showMobileSection(page, 'tools');
  await expect(page.locator('#siteMobileBar')).toBeInViewport();
});

test('rapid reversals during viewport resizing restore each original root exactly once', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 520 });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  await page.evaluate(() => {
    const bar = document.getElementById('siteMobileBar')!;
    for (const section of ['tools', 'date', 'content', 'tools']) {
      bar.querySelector<HTMLButtonElement>(`[data-mobile-section="${section}"]`)!.click();
    }
  });
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  await showMobileSection(page, 'content');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  await expect(page.locator('main')).toBeVisible();
  expect(await page.evaluate(() => document.querySelectorAll('body > main').length)).toBe(1);
  expect(await page.evaluate(() => document.querySelectorAll('body > #siteLeftRail,body > #siteRightRail').length)).toBe(2);
  expect(await page.evaluate(() => scrollX)).toBe(0);
});
