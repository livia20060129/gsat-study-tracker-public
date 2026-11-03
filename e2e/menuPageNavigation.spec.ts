import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cleanUrlServer } from './helpers/cleanUrlServer.ts';
import { showMobileSection } from './helpers/siteNavigation.ts';
import { dispatchSectionSwipe } from './helpers/sectionSwipe.ts';

interface MenuMotionEntry { id: string; from: number; to: number; duration: number; opacity: boolean; includesShell: boolean }
declare global { interface Window { menuPageMotionProbe: { entries: MenuMotionEntry[]; animations: Animation[]; legacyEntries: number } } }

async function installMenuProbe(page: Page, pause: boolean): Promise<void> {
  await page.addInitScript(hold => {
    window.menuPageMotionProbe = { entries: [], animations: [], legacyEntries: 0 };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function observeMenuNavigation(keyframes, options): Animation {
      const animation = animate.call(this, keyframes, options);
      if (animation.id === 'study-page-entry') window.menuPageMotionProbe.legacyEntries++;
      if (animation.id === 'study-menu-page-in' || animation.id === 'study-menu-page-out') {
        const frames = (animation.effect as KeyframeEffect).getKeyframes();
        window.menuPageMotionProbe.entries.push({
          id: animation.id, from: parseFloat(String(frames[0].left)), to: parseFloat(String(frames.at(-1)!.left)),
          duration: Number(animation.effect!.getComputedTiming().duration), opacity: frames.some(frame => 'opacity' in frame),
          includesShell: this.matches('.site-mobile-bar') || this.querySelector('.site-mobile-bar') !== null,
        });
        window.menuPageMotionProbe.animations.push(animation);
        if (hold) { animation.pause(); animation.currentTime = 120; }
      }
      return animation;
    };
  }, pause);
}

for (const destination of ['todo.html', 'material.progress.html', 'vocabulary.review.html', 'gpt.prompt.html']) {
  test(`mobile menu moves right and ${destination} enters from the left without moving navigation or losing saved notes`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await installMenuProbe(page, true);
    await page.goto('/');
    const date = await page.locator('#studyDate').inputValue();
    await page.locator('#notes').fill('功能選單跨頁前的筆記');
    await showMobileSection(page, 'tools');
    await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
    const header = await page.locator('#siteMobileBar').boundingBox();
    const width = await page.locator('body').evaluate(node => node.getBoundingClientRect().width);
    await page.locator(`.site-tools a[href="./${destination}"]`).click();
    await expect.poll(() => page.evaluate(() => window.menuPageMotionProbe.entries.some(entry => entry.id === 'study-menu-page-out'))).toBe(true);
    const outgoing = await page.evaluate(() => window.menuPageMotionProbe.entries.find(entry => entry.id === 'study-menu-page-out')!);
    expect(outgoing).toEqual({ id: 'study-menu-page-out', from: 0, to: width, duration: 240, opacity: false, includesShell: false });
    expect((await page.locator('#siteRightRail').boundingBox())!.x).toBeGreaterThan(0);
    expect(await page.locator('#siteMobileBar').boundingBox()).toEqual(header);
    await page.evaluate(() => { for (const animation of window.menuPageMotionProbe.animations) animation.finish(); });
    await expect(page).toHaveURL(new RegExp('/' + destination.replaceAll('.', '\\.') + '$'));
    await expect.poll(() => page.evaluate(() => window.menuPageMotionProbe.entries.some(entry => entry.id === 'study-menu-page-in'))).toBe(true);
    const incoming = await page.evaluate(() => window.menuPageMotionProbe.entries.filter(entry => entry.id === 'study-menu-page-in'));
    expect(incoming.length).toBeGreaterThan(0);
    expect(incoming.every(entry => entry.from === -width && entry.to === 0 && entry.duration === 240 && !entry.opacity && !entry.includesShell)).toBe(true);
    expect(await page.evaluate(() => window.menuPageMotionProbe.legacyEntries)).toBe(0);
    expect(await page.locator('#siteMobileBar').boundingBox()).toEqual(header);
    expect(await page.evaluate(() => sessionStorage.getItem('study-v11:ui:menu-page-entry'))).toBeNull();
    await page.screenshot({ path: testInfo.outputPath('incoming-menu-page-midpoint.png') });
    await page.evaluate(() => { for (const animation of window.menuPageMotionProbe.animations) animation.finish(); });
    await expect(page.locator('html')).not.toHaveAttribute('data-menu-page-entry');
    await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
    expect(await page.evaluate(value => JSON.parse(localStorage.getItem(`study-v11:guest:${value}`)!).notes, date)).toBe('功能選單跨頁前的筆記');
  });
}

test('clean URL redirects still consume the one-time menu entry and use the same tab', async ({ page, context }) => {
  const server = await cleanUrlServer();
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await installMenuProbe(page, false);
    await page.goto(server.origin + '/');
    const pageCount = context.pages().length;
    await showMobileSection(page, 'tools');
    await page.locator('.site-tools a[href="./gpt.prompt.html"]').click();
    await expect(page).toHaveURL(/\/gpt\.prompt$/);
    await expect.poll(() => page.evaluate(() => window.menuPageMotionProbe.entries.some(entry => entry.id === 'study-menu-page-in'))).toBe(true);
    await expect(page.locator('html')).not.toHaveAttribute('data-menu-page-entry');
    expect(context.pages()).toHaveLength(pageCount);
    expect(await page.evaluate(() => sessionStorage.getItem('study-v11:ui:menu-page-entry'))).toBeNull();
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.menuPageMotionProbe.legacyEntries)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.menuPageMotionProbe.entries.length)).toBe(0);
  } finally { await server.close(); }
});

test('Escape cancels departure without leaving a shifted or disabled menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installMenuProbe(page, true);
  await page.goto('/');
  await showMobileSection(page, 'tools');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  await page.locator('.site-tools a[href="./todo.html"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-menu-page-departure', 'animating');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).not.toHaveAttribute('data-menu-page-departure');
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  await expect(page).toHaveURL(/\/$/);
  await showMobileSection(page, 'tools');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  await expect(page.locator('#siteRightRail')).toHaveCSS('pointer-events', 'auto');
  expect((await page.locator('#siteRightRail').boundingBox())!.x).toBe(0);
});

for (const method of ['button', 'swipe']) {
test(`switching sections by ${method} during arrival clears page motion before the section motion starts`, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installMenuProbe(page, true);
  await page.goto('/');
  await showMobileSection(page, 'tools');
  await page.locator('.site-tools a[href="./todo.html"]').click();
  await page.evaluate(() => { for (const animation of window.menuPageMotionProbe.animations) animation.finish(); });
  await expect(page).toHaveURL(/\/todo\.html$/);
  await expect(page.locator('html')).toHaveAttribute('data-menu-page-entry', 'animating');
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'content');
  if (method === 'swipe') await dispatchSectionSwipe(page, 'main', { x: 280, y: 300 }, { x: 90, y: 302 });
  else await showMobileSection(page, 'tools');
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'tools');
  await expect(page.locator('html')).not.toHaveAttribute('data-menu-page-entry');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  expect(await page.locator('main').evaluate(node => node.style.position)).toBe('');
  await showMobileSection(page, 'content');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  await expect(page.locator('main')).toHaveCSS('position', 'static');
  expect((await page.locator('main').boundingBox())!.x).toBe(0);
});
}

test('reduced motion and unavailable session storage keep menu navigation usable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installMenuProbe(page, false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await showMobileSection(page, 'tools');
  await page.locator('.site-tools a[href="./todo.html"]').click();
  await expect(page).toHaveURL(/\/todo\.html$/);
  await expect(page.locator('main')).toBeVisible();
  expect(await page.evaluate(() => window.menuPageMotionProbe.entries.length)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function read(key): string | null {
      if (this === sessionStorage && key === 'study-v11:ui:menu-page-entry') throw new Error('Session storage blocked');
      return get.call(this, key);
    };
    Storage.prototype.setItem = function write(key, value): void {
      if (this === sessionStorage && key === 'study-v11:ui:menu-page-entry') throw new Error('Session storage blocked');
      set.call(this, key, value);
    };
  });
  await page.goto('/');
  await showMobileSection(page, 'tools');
  await page.locator('.site-tools a[href="./todo.html"]').click();
  await expect(page).toHaveURL(/\/todo\.html$/);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-menu-page-entry');
});
