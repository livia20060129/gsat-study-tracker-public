import { expect, test } from '@playwright/test';
import { navigateSite, showMobileSection } from './helpers/siteNavigation.ts';

declare global {
  interface Window {
    mobileScrollFrameGate: { release(): void; scrollEvents(): number };
  }
}

test('a scroll before the first initialization frames is processed after rendering resumes', async ({ page }) => {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const pending = new Map<number, FrameRequestCallback>();
    let frozen = true;
    let nextId = -1;
    let scrolls = 0;
    window.requestAnimationFrame = function holdInitialFrames(callback): number {
      if (!frozen) return request(callback);
      const id = nextId--;
      pending.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = function cancelHeldFrame(id): void {
      if (id < 0) pending.delete(id);
      else cancel(id);
    };
    window.addEventListener('scroll', () => { scrolls += 1; }, { passive: true });
    window.mobileScrollFrameGate = {
      release(): void {
        frozen = false;
        for (const callback of pending.values()) request(callback);
        pending.clear();
      },
      scrollEvents(): number { return scrolls; },
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  await page.evaluate(() => scrollTo({ top: 350, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.mobileScrollFrameGate.scrollEvents())).toBeGreaterThan(0);
  await page.evaluate(() => window.mobileScrollFrameGate.release());
  await expect(page.locator('body')).toHaveAttribute('data-mobile-nav-hidden', 'true');
  expect(await page.evaluate(() => scrollY)).toBe(350);
});

test('mobile sections fill the page and preserve the original draft nodes and scroll positions', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  await page.locator('#notes').fill('三區切換前尚未離開欄位的草稿');
  const notes = await page.locator('#notes').elementHandle();
  const contentScroll = await page.evaluate(() => scrollY);
  await showMobileSection(page, 'date');
  await expect(page.locator('main')).toBeHidden();
  await expect(page.locator('#siteLeftRail')).toBeVisible();
  await expect(page.locator('#siteRightRail')).toBeHidden();
  await expect(page.locator('#studyDate')).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('inert', '');
  await showMobileSection(page, 'tools');
  await expect(page.locator('#siteLeftRail')).toBeHidden();
  await expect(page.locator('#siteRightRail')).toBeVisible();
  await expect(page.locator('#siteRailBackdrop,[data-close-rail]')).toHaveCount(0);
  const bounds = await page.locator('#siteRightRail').boundingBox();
  const viewport = await page.locator('body').evaluate(node => node.getBoundingClientRect().width);
  expect(bounds!.x).toBe(0);
  expect(bounds!.width).toBe(viewport);
  await showMobileSection(page, 'content');
  await expect(page.locator('#notes')).toHaveValue('三區切換前尚未離開欄位的草稿');
  expect(await notes!.evaluate(node => node === document.getElementById('notes'))).toBe(true);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(contentScroll, 0);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator('body')).toHaveAttribute('data-mobile-nav-hidden', 'false');
  await expect(page.locator('main')).not.toHaveAttribute('inert');
  await page.screenshot({ path: testInfo.outputPath('mobile-content.png') });
  await showMobileSection(page, 'tools');
  await page.screenshot({ path: testInfo.outputPath('mobile-tools.png') });
});

test('scroll down hides the navigation, reverse scroll reveals it without resizing or shifting document content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  const before = await page.locator('main').evaluate(node => ({ top: node.getBoundingClientRect().top + scrollY, height: node.getBoundingClientRect().height }));
  await page.evaluate(() => scrollTo({ top: 350, behavior: 'instant' }));
  await expect(page.locator('body')).toHaveAttribute('data-mobile-nav-hidden', 'true');
  await expect.poll(() => page.locator('#siteMobileBar').evaluate(node => node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(1);
  const after = await page.locator('main').evaluate(node => ({ top: node.getBoundingClientRect().top + scrollY, height: node.getBoundingClientRect().height }));
  expect(after).toEqual(before);
  await page.evaluate(() => scrollBy({ top: -60, behavior: 'instant' }));
  await expect(page.locator('body')).toHaveAttribute('data-mobile-nav-hidden', 'false');
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page.locator('body')).toHaveAttribute('data-mobile-nav-hidden', 'false');
});

test('full-page tools cap the preview at ten grouped books, retain total count, and link to all matching Units', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+08:00'));
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto('/todo.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    const items = Array.from({ length: 12 }, (_, book) => [1, 2].map(unit => ({
      id: `book-${book}-${unit}`, type: 'extra', source: 'preset', required: true, done: false, minutes: '',
      title: `英文｜教材 ${String(book + 1).padStart(2, '0')}｜Unit ${unit}`,
      f: { title: `教材 ${String(book + 1).padStart(2, '0')}`, scopeKind: 'unit', unitStart: String(unit), unitEnd: String(unit) },
    }))).flat();
    localStorage.setItem('study-v11:guest:2026-11-03', JSON.stringify({ date: '2026-11-03', items }));
  });
  await page.reload();
  await showMobileSection(page, 'tools');
  await expect(page.locator('[data-rail-overdue-list] a')).toHaveCount(10);
  await expect(page.locator('[data-rail-overdue-count]')).toHaveText('24 項');
  await expect(page.locator('[data-rail-overdue-list] a').first()).toContainText('2 項逾期');
  await page.locator('[data-rail-overdue-list] a').last().scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-ten-overdue-groups.png') });
  await page.locator('[data-rail-overdue-list] a').first().click();
  await expect(page.locator('#todoList .todo-card')).toHaveCount(2);
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  await showMobileSection(page, 'tools');
  await page.locator('.site-overdue-all').click();
  await expect(page.locator('#todoList .todo-card')).toHaveCount(24);
});

test('mobile switching supports keyboard focus, reduced motion and desktop resizing without trapping content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/todo.html');
  await showMobileSection(page, 'date');
  expect(await page.locator('#siteLeftRail').evaluate(node => node.getAnimations().length)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('button[data-mobile-section="content"]')).toBeFocused();
  await showMobileSection(page, 'tools');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('main')).not.toHaveAttribute('inert');
  await expect(page.locator('#siteLeftRail')).toBeVisible();
  await expect(page.locator('#siteRightRail')).toBeVisible();
  await expect(page.locator('#siteMobileBar')).toBeHidden();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  await navigateSite(page, 'summary.html');
  await expect(page.locator('#siteMobileBar [data-mobile-section="content"]')).toContainText('週／月總結');
});

test('a running original-card timer continues across both full-page sections and pauses on return', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-05T12:00:00+08:00') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.selectOption('#itemType', 'extra');
  await page.locator('#addItemBtn').click();
  const card = page.locator('#itemList [data-item]').filter({ has: page.locator('[data-action="delete-item"]') }).last();
  await card.locator('[data-time-mode="timer"]').click();
  await page.clock.runFor(300);
  await card.locator('[data-action="timer-toggle"]').click();
  const startedAt = await page.evaluate(() => Date.now());
  const timer = await card.locator('[data-timer-display]').elementHandle();
  await showMobileSection(page, 'date');
  await page.clock.runFor(30_000);
  await showMobileSection(page, 'tools');
  await page.clock.runFor(35_000);
  await showMobileSection(page, 'content');
  expect(await timer!.evaluate(node => node.isConnected)).toBe(true);
  const elapsedParts = (await card.locator('[data-timer-display]').textContent())!.split(':').map(Number);
  const elapsedSeconds = elapsedParts[0] * 60 + elapsedParts[1];
  const observedAt = await page.evaluate(() => Date.now());
  expect(elapsedSeconds).toBeGreaterThanOrEqual(65);
  expect(Math.abs(elapsedSeconds - (observedAt - startedAt) / 1000)).toBeLessThan(2);
  await card.locator('[data-action="timer-toggle"]').click();
  await expect(card.locator('[data-action="timer-toggle"]')).toHaveText('繼續');
  const elapsed = await card.locator('[data-timer-display]').textContent();
  await page.clock.runFor(5000);
  await expect(card.locator('[data-timer-display]')).toHaveText(elapsed!);
});
