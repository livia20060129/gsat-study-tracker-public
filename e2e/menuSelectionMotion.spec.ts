import { expect, test, type Page } from '@playwright/test';
import { showMobileSection } from './helpers/siteNavigation.ts';

const rail = '#siteRightRail';
const marker = `${rail} .site-navigation-selection`;
const menu = (name: string): string => `${rail} a[href="./${name}.html"]`;

async function openMenu(page: Page, path = '/todo.html'): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(path);
  await expect(page.locator(rail)).toHaveAttribute('data-selection-motion', 'ready');
  await page.locator(rail).evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function finishMarker(page: Page): Promise<void> {
  await page.locator(marker).evaluate(node => node.getAnimations().forEach(animation => animation.finish()));
}

async function markerMatches(page: Page, link: string): Promise<void> {
  await expect.poll(async () => {
    const [a, b] = await Promise.all([page.locator(marker).boundingBox(), page.locator(link).boundingBox()]);
    return a && b ? Math.max(Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) : Infinity;
  }).toBeLessThan(1);
}

test('mouse hover slides one selection surface, rapid reversal is continuous, and leaving returns to the current page', async ({ page }) => {
  await openMenu(page);
  const originalUrl = page.url();
  await page.locator(menu('material.progress')).hover();
  const traveling = await page.locator(marker).evaluate(async node => {
    const animation = node.getAnimations().find(animation => animation.id === 'study-navigation-selection')!;
    animation.pause(); animation.currentTime = 100;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    return { top: node.getBoundingClientRect().top, frames: (animation.effect as KeyframeEffect).getKeyframes() };
  });
  expect(traveling.frames[0].top).not.toBe(traveling.frames.at(-1)!.top);
  await page.locator(menu('vocabulary.review')).hover();
  const reversed = await page.locator(marker).evaluate(node => {
    // WebKit can paint the next frame before hover() returns. Compare the
    // replacement's starting frame, rather than its later paused position.
    const animation = node.getAnimations()[0]; animation.pause(); animation.currentTime = 0;
    return node.getBoundingClientRect().top;
  });
  expect(Math.abs(reversed - traveling.top)).toBeLessThan(1);
  await finishMarker(page);
  await markerMatches(page, menu('vocabulary.review'));
  await expect(page.locator(`${rail} [aria-current=page]`)).toHaveAttribute('href', './todo.html');
  expect(page.url()).toBe(originalUrl);
  await page.locator(`${rail} .site-overdue h2`).hover();
  expect(await page.locator(marker).evaluate(node => node.getAnimations().some(animation => animation.id === 'study-navigation-selection'))).toBe(true);
  await finishMarker(page);
  await markerMatches(page, menu('todo'));
  await page.locator(menu('index')).hover();
  await finishMarker(page);
  await markerMatches(page, menu('index'));
  await page.mouse.move(700, 160);
  await finishMarker(page);
  await markerMatches(page, menu('todo'));
});

test('clicking the current page pulses the row and background without moving layout or reloading, even after a hover interruption', async ({ page }) => {
  await openMenu(page, '/');
  const home = page.locator(menu('index'));
  await home.evaluate(node => { (window as unknown as { originalMenuNode: Element }).originalMenuNode = node; });
  const before = await home.boundingBox();
  await home.click();
  const pulse = await home.evaluate(node => {
    const animation = node.getAnimations().find(animation => animation.id === 'study-menu-click-bounce')!;
    animation.pause(); animation.currentTime = 40;
    const rect = node.getBoundingClientRect();
    return { scale: new DOMMatrix(getComputedStyle(node).transform).a, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  expect(pulse.scale).toBeGreaterThan(1.02);
  expect(Math.abs(pulse.x - before!.x - before!.width / 2)).toBeLessThan(1);
  expect(Math.abs(pulse.y - before!.y - before!.height / 2)).toBeLessThan(1);
  expect(await page.locator(`${marker}>span`).evaluate(node => node.getAnimations().some(animation => animation.id === 'study-menu-click-bounce'))).toBe(true);
  await page.locator(menu('material.progress')).hover();
  await page.mouse.move(700, 160);
  await home.evaluate(node => node.getAnimations().forEach(animation => animation.finish()));
  await page.locator(`${marker}>span`).evaluate(node => node.getAnimations().forEach(animation => animation.finish()));
  await finishMarker(page);
  await markerMatches(page, menu('index'));
  expect(await home.evaluate(node => node === (window as unknown as { originalMenuNode: Element }).originalMenuNode)).toBe(true);
  expect(page.url()).toMatch(/\/$/);
});

test('hovering away during a clicked pulse cannot cancel the requested navigation', async ({ page }) => {
  await openMenu(page);
  await page.locator(menu('material.progress')).hover();
  await finishMarker(page);
  await page.locator(menu('material.progress')).click();
  await page.mouse.move(700, 160);
  await page.waitForURL('**/material.progress.html');
  await expect(page.locator(`${rail} [aria-current=page]`)).toHaveAttribute('href', './material.progress.html');
});

test('keyboard focus previews the menu and a page without a right-side entry restores no false selection', async ({ page }) => {
  await openMenu(page, '/summary.html');
  await expect(page.locator(marker)).toBeHidden();
  await page.locator(menu('material.progress')).focus();
  await finishMarker(page);
  await markerMatches(page, menu('material.progress'));
  await page.locator('.site-summary-link').focus();
  await expect(page.locator(marker)).toBeHidden();
  await page.locator(menu('index')).hover();
  await expect(page.locator(marker)).toBeVisible();
  await page.mouse.move(700, 160);
  await expect(page.locator(marker)).toBeHidden();
});

test('reduced motion preserves hover and navigation without slide or pulse animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page);
  await page.locator(menu('material.progress')).hover();
  await markerMatches(page, menu('material.progress'));
  expect(await page.locator(rail).evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
  await page.mouse.move(700, 160);
  await markerMatches(page, menu('todo'));
  await page.locator(menu('material.progress')).click();
  await page.waitForURL('**/material.progress.html');
});

test.describe('touch menu selection', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  test('a real tap pulses the row while preserving the menu rightward departure and same-tab destination', async ({ page, context }) => {
    await page.goto('/todo.html');
    await showMobileSection(page, 'tools');
    await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
    await page.evaluate(() => {
      document.addEventListener('click', event => {
        if (!(event.target instanceof Element) || !event.target.closest('.site-tools a')) return;
        document.querySelector('#siteRightRail')!.getAnimations().filter(animation => animation.id === 'study-menu-page-out').forEach(animation => animation.pause());
      }, { once: true });
    });
    await page.locator(menu('material.progress')).tap();
    expect(await page.locator(menu('material.progress')).evaluate(node => node.getAnimations().some(animation => animation.id === 'study-menu-click-bounce'))).toBe(true);
    const frames = await page.locator(rail).evaluate(node => {
      const animation = node.getAnimations().find(animation => animation.id === 'study-menu-page-out')!;
      return (animation.effect as KeyframeEffect).getKeyframes();
    });
    expect(Number.parseFloat(String(frames.at(-1)!.left))).toBeGreaterThan(300);
    await page.locator(rail).evaluate(node => node.getAnimations().filter(animation => animation.id === 'study-menu-page-out').forEach(animation => animation.finish()));
    await page.waitForURL('**/material.progress.html');
    expect(context.pages()).toHaveLength(1);
  });
});
