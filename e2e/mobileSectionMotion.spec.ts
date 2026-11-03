import { expect, test } from '@playwright/test';
import { showMobileSection } from './helpers/siteNavigation.ts';

interface SlideObservation { id: string; from: number; to: number; duration: number; hasOpacity: boolean }
declare global {
  interface Window { mobileSlideProbe: { animations: Animation[]; observations: SlideObservation[] } }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.mobileSlideProbe = { animations: [], observations: [] };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function observeSectionSlide(keyframes, options): Animation {
      const animation = animate.call(this, keyframes, options);
      if (animation.id.startsWith('study-mobile-section-')) {
        animation.pause();
        animation.currentTime = 120;
        const frames = (animation.effect as KeyframeEffect).getKeyframes();
        window.mobileSlideProbe.animations.push(animation);
        window.mobileSlideProbe.observations.push({
          id: animation.id, from: parseFloat(String(frames[0].left)), to: parseFloat(String(frames.at(-1)!.left)),
          duration: Number(animation.effect!.getComputedTiming().duration), hasOpacity: frames.some(frame => 'opacity' in frame),
        });
      }
      return animation;
    };
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.locator('main').evaluate(async node => { await Promise.all(node.getAnimations().map(animation => animation.finished)); });
});

test('both pages slide left or right without fading and the full menu icon and navigation stay fixed', async ({ page }, testInfo) => {
  await expect(page.locator('button[data-mobile-section="tools"] [aria-hidden]')).toHaveText('☰');
  const header = await page.locator('#siteMobileBar').boundingBox();
  const travel = await page.locator('body').evaluate(node => node.getBoundingClientRect().width);
  for (const section of ['tools', 'date', 'content'] as const) {
    await page.evaluate(() => { window.mobileSlideProbe = { animations: [], observations: [] }; });
    await showMobileSection(page, section);
    await expect(page.locator('body')).toHaveAttribute('data-mobile-section', section);
    const observations = await page.evaluate(() => window.mobileSlideProbe.observations);
    const incoming = observations.find(value => value.id === 'study-mobile-section-in')!;
    const outgoing = observations.find(value => value.id === 'study-mobile-section-out')!;
    const direction = section === 'date' ? -1 : 1;
    expect(incoming.from).toBe(direction * travel);
    expect(incoming.to).toBe(0);
    expect(outgoing.to - outgoing.from).toBe(-direction * travel);
    expect(observations.every(value => value.duration === 240 && !value.hasOpacity)).toBe(true);
    let selector = 'main';
    if (section === 'tools') selector = '#siteRightRail';
    else if (section === 'date') selector = '#siteLeftRail';
    const incomingNode = page.locator(selector);
    const midpoint = (await incomingNode.boundingBox())!.x;
    expect(direction * midpoint).toBeGreaterThan(0);
    expect(Math.abs(midpoint)).toBeLessThan(travel);
    expect(await incomingNode.evaluate(node => getComputedStyle(node).opacity)).toBe('1');
    expect(await page.locator('#siteMobileBar').boundingBox()).toEqual(header);
    await page.screenshot({ path: testInfo.outputPath(`slide-${section}-midpoint.png`) });
    await page.evaluate(() => { for (const animation of window.mobileSlideProbe.animations) animation.finish(); });
    await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
    expect((await incomingNode.boundingBox())!.x).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('a deep-page slide keeps the outgoing connection position, original inputs and restored scroll', async ({ page }) => {
  await page.locator('#notes').fill('左右滑動仍保留原本輸入');
  const notes = await page.locator('#notes').elementHandle();
  const originalScroll = await page.evaluate(() => scrollY);
  // Focusing the fixed navigation reveals it before measuring the sticky connection.
  await page.locator('button[data-mobile-section="tools"]').focus();
  const originalDock = (await page.locator('.connection-dock').boundingBox())!;
  await showMobileSection(page, 'tools');
  const slidingDock = (await page.locator('.connection-dock').boundingBox())!;
  expect(Math.abs(slidingDock.y - originalDock.y)).toBeLessThan(1);
  await page.evaluate(() => { for (const animation of window.mobileSlideProbe.animations) animation.finish(); });
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  await page.evaluate(() => { window.mobileSlideProbe = { animations: [], observations: [] }; });
  await showMobileSection(page, 'content');
  await page.evaluate(() => { for (const animation of window.mobileSlideProbe.animations) animation.finish(); });
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  expect(await notes!.evaluate(node => node === document.getElementById('notes'))).toBe(true);
  await expect(page.locator('#notes')).toHaveValue('左右滑動仍保留原本輸入');
  expect(await page.evaluate(() => scrollY)).toBe(originalScroll);
  await expect(page.locator('.connection-dock')).toHaveCSS('position', 'sticky');
});

test('rapid reversals, resizing and reduced motion remove temporary positions and keep the latest page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    for (const section of ['tools', 'date', 'content', 'tools']) {
      document.querySelector<HTMLButtonElement>(`button[data-mobile-section="${section}"]`)!.click();
    }
  });
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'tools');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('#siteLeftRail')).toBeVisible();
  await expect(page.locator('#siteRightRail')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  await expect(page.locator('main')).toHaveCSS('position', 'static');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => { window.mobileSlideProbe = { animations: [], observations: [] }; });
  await showMobileSection(page, 'tools');
  await expect(page.locator('body')).toHaveAttribute('data-mobile-section', 'tools');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  expect(await page.evaluate(() => window.mobileSlideProbe.animations.length)).toBe(0);
  expect(errors).toEqual([]);
});
