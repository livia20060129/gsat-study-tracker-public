import { expect, test } from '@playwright/test';
import { dispatchSectionSwipe, swipeSection } from './helpers/sectionSwipe.ts';
import { showMobileSection } from './helpers/siteNavigation.ts';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
});

test('horizontal touch gestures reach both side sections, keep the header, and stop at the edges', async ({ page }) => {
  const header = await page.locator('#siteMobileBar').boundingBox();
  for (const [direction, section] of [['right', 'date'], ['right', 'date'], ['left', 'content'],
    ['left', 'tools'], ['left', 'tools'], ['right', 'content']] as const) {
    await swipeSection(page, direction);
    await expect(page.locator('body')).toHaveAttribute('data-mobile-section', section);
    await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
    expect(await page.locator('#siteMobileBar').boundingBox()).toEqual(header);
    await expect(page.locator(`#siteMobileBar [data-mobile-section="${section}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('swiping page content retains draft nodes, original values and each section scroll position', async ({ page }) => {
  await page.locator('#notes').fill('左右手勢前的草稿');
  const notes = await page.locator('#notes').elementHandle();
  const position = await page.evaluate(() => scrollY);
  await dispatchSectionSwipe(page, 'main', { x: 280, y: 300 }, { x: 90, y: 303 });
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'tools');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  await dispatchSectionSwipe(page, '#siteRightRail', { x: 90, y: 300 }, { x: 280, y: 303 });
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  await expect(page.locator('#notes')).toHaveValue('左右手勢前的草稿');
  expect(await notes!.evaluate(node => node === document.getElementById('notes'))).toBe(true);
  expect(await page.evaluate(() => scrollY)).toBe(position);
});

test('vertical scrolling, short swipes, browser edges, cancellation, editing and horizontal scrollers do not switch sections', async ({ page }) => {
  for (const [from, to, end] of [
    [{ x: 200, y: 400 }, { x: 210, y: 180 }, 'touchend'],
    [{ x: 200, y: 300 }, { x: 160, y: 302 }, 'touchend'],
    [{ x: 8, y: 300 }, { x: 200, y: 302 }, 'touchend'],
    [{ x: 280, y: 300 }, { x: 90, y: 302 }, 'touchcancel'],
  ] as const) {
    await dispatchSectionSwipe(page, 'main', from, to, end);
    await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  }
  await page.locator('#notes').fill('保持可選字編輯');
  await dispatchSectionSwipe(page, '#notes', { x: 280, y: 300 }, { x: 90, y: 302 });
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  await expect(page.locator('#notes')).toHaveValue('保持可選字編輯');
  await page.locator('main').evaluate(node => {
    const scroller = document.createElement('div');
    scroller.id = 'swipeTestScroller';
    scroller.style.cssText = 'width:160px;overflow-x:auto';
    scroller.innerHTML = '<div style="width:640px;height:40px">可水平捲動</div>';
    node.append(scroller);
  });
  await dispatchSectionSwipe(page, '#swipeTestScroller', { x: 280, y: 300 }, { x: 90, y: 302 });
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  await page.locator('main').dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 280, clientY: 300 }] });
  await page.locator('main').dispatchEvent('touchmove', { touches: [
    { identifier: 1, clientX: 90, clientY: 302 }, { identifier: 2, clientX: 180, clientY: 302 },
  ] });
  await page.locator('main').dispatchEvent('touchend', { touches: [], changedTouches: [{ identifier: 1, clientX: 90, clientY: 302 }] });
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
});

test('a swipe on a menu link changes section without activating the link', async ({ page }) => {
  await showMobileSection(page, 'tools');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  const url = page.url();
  await dispatchSectionSwipe(page, '.site-tools a[href="./todo.html"]', { x: 90, y: 300 }, { x: 280, y: 302 });
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  await expect(page).toHaveURL(url);
  await expect(page.locator('html')).not.toHaveAttribute('data-menu-page-departure');
});

test('reduced motion switches immediately and desktop keeps both rails without touch switching', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await dispatchSectionSwipe(page, 'main', { x: 280, y: 300 }, { x: 90, y: 302 });
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'tools');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  await page.setViewportSize({ width: 1440, height: 900 });
  await dispatchSectionSwipe(page, 'main', { x: 280, y: 300 }, { x: 90, y: 302 });
  await expect(page.locator('body')).not.toHaveAttribute('data-mobile-section');
  await expect(page.locator('#siteLeftRail')).toBeVisible();
  await expect(page.locator('#siteRightRail')).toBeVisible();
});
