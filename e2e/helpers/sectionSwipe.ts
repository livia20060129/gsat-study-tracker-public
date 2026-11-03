import type { Page } from '@playwright/test';

export interface SwipePoint { x: number; y: number }

export async function dispatchSectionSwipe(page: Page, selector: string, from: SwipePoint, to: SwipePoint,
  end: 'touchend' | 'touchcancel' = 'touchend'): Promise<void> {
  await page.locator(selector).dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: from.x, clientY: from.y }] });
  await page.locator(selector).dispatchEvent('touchmove', { touches: [{ identifier: 1, clientX: to.x, clientY: to.y }] });
  await page.locator(selector).dispatchEvent(end, { touches: [], changedTouches: [{ identifier: 1, clientX: to.x, clientY: to.y }] });
}

export async function swipeSection(page: Page, direction: 'left' | 'right'): Promise<void> {
  const from = { x: direction === 'left' ? 280 : 90, y: 28 };
  const to = { x: direction === 'left' ? 90 : 280, y: 30 };
  if (page.context().browser()?.browserType().name() !== 'chromium') {
    await dispatchSectionSwipe(page, '#siteMobileBar', from, to);
    return;
  }
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let step = 1; step <= 6; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
        x: from.x + (to.x - from.x) * step / 6, y: from.y + (to.y - from.y) * step / 6,
      }] });
      await page.waitForTimeout(16);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
}
