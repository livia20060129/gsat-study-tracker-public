import { navigateSite } from './helpers/siteNavigation.ts';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface MotionEntry {
  generation: number;
  name: string;
  duration: string;
  state: 'running' | 'finished' | 'cancelled';
  includesShell: boolean;
}
interface MotionProbe { id: string; generation: number; entries: MotionEntry[] }
declare global { interface Window { pageMotionProbe: MotionProbe } }

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const probe: MotionProbe = { id: crypto.randomUUID(), generation: 0, entries: [] };
    window.pageMotionProbe = probe;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function observeEntry(keyframes, options): Animation {
      const animation = animate.call(this, keyframes, options);
      if (animation.id === 'study-page-entry') {
        const entry: MotionEntry = { generation: probe.generation, name: animation.id,
          duration: String(animation.effect!.getComputedTiming().duration), state: 'running',
          includesShell: this === document.body || this === document.documentElement
            || this.matches('.site-rail,.site-mobile-bar,.site-rail-backdrop')
            || this.querySelector('.site-rail,.site-mobile-bar,.site-rail-backdrop') !== null };
        probe.entries.push(entry);
        animation.addEventListener('finish', () => { entry.state = 'finished'; });
        animation.addEventListener('cancel', () => { entry.state = 'cancelled'; });
      }
      return animation;
    };
    const revealEvent = 'onpagereveal' in window ? 'pagereveal' : 'pageshow';
    window.addEventListener(revealEvent, () => {
      probe.generation++;
    });
  });
});

async function motion(page: Page): Promise<MotionProbe> {
  return page.evaluate(() => window.pageMotionProbe);
}

async function expectEntry(page: Page, previous?: MotionProbe): Promise<void> {
  await expect.poll(async () => {
    const probe = await motion(page);
    if (previous?.id === probe.id && probe.generation <= previous.generation) return false;
    return probe.entries.some(entry => entry.generation === probe.generation && entry.state === 'finished');
  }).toBe(true);
  const probe = await motion(page);
  const entry = probe.entries.filter(entry => entry.generation === probe.generation && entry.state === 'finished').at(-1)!;
  expect(entry.name).toBe('study-page-entry');
  expect(entry.duration).toBe('200');
  expect(probe.entries.every(value => !value.includesShell), 'Sidebars and mobile controls stay outside page animations').toBe(true);
  expect(await page.locator('body').evaluate(node => getComputedStyle(node).opacity)).toBe('1');
  expect(await page.locator('body').evaluate(node => getComputedStyle(node).transform)).toBe('none');
}

test('all ten pages animate direct entry on desktop and mobile without changing page geometry', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/todo.html', '/summary.html', '/material.progress.html', '/vocabulary.review.html',
      '/privacy.html', '/terms.html', '/support.html', '/gpt.prompt.html', '/vocabulary.sources.html']) {
      await page.goto(path);
      await expectEntry(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test('real navigation links use the shared transition across app, legal and source pages', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/');
  await expectEntry(page);
  for (const path of ['todo.html', 'summary.html', 'material.progress.html', 'vocabulary.review.html']) {
    await navigateSite(page, path);
    await expect(page).toHaveURL(new RegExp('/' + path.replaceAll('.', '\\.') + '$'));
    await expectEntry(page);
    if (path === 'vocabulary.review.html') {
      await page.locator('#vocabularyReferences a[href="./vocabulary.sources.html"]').click();
      await expect(page).toHaveURL(/\/vocabulary\.sources\.html$/);
      await expectEntry(page);
    }
    await navigateSite(page, 'index.html');
    await expect(page).toHaveURL(/\/index\.html$/);
    await expectEntry(page);
  }
  // Vite preview does not run the production /privacy redirect.
  await page.goto('/privacy.html');
  await expectEntry(page);
  await page.locator('header a[href="./terms.html"]').click();
  await expectEntry(page);
  await page.locator('header a[href="./support.html"]').click();
  await expectEntry(page);
  await navigateSite(page, 'index.html');
  await expectEntry(page);
});

test('back and forward animate while preserving pending notes, completion and minutes', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-29T12:00:00+08:00'));
  await page.goto('/summary.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-10-29', JSON.stringify({ schemaVersion: 2, date: '2026-10-29',
      notes: '', items: [{ id: 'transition-record', type: 'general', title: '轉場保存測試', source: 'custom',
        done: false, required: true, minutes: '', f: { subject: '英文' } }] }));
  });
  await page.goto('/');
  await expectEntry(page);
  const card = page.locator('#itemList [data-item="transition-record"]');
  await card.locator('[data-minutes]').fill('17.5');
  await card.locator('[data-done]').check();
  await page.locator('#notes').fill('跳頁前尚在輸入的筆記');
  const before = await motion(page);
  await navigateSite(page, 'todo.html');
  await expectEntry(page);
  await page.goBack();
  await expectEntry(page, before);
  await expect(page.locator('#notes')).toHaveValue('跳頁前尚在輸入的筆記');
  await expect(card.locator('[data-minutes]')).toHaveValue('17.5');
  await expect(card.locator('[data-done]')).toBeChecked();
  await page.goForward();
  await expect(page).toHaveURL(/\/todo\.html$/);
  await expectEntry(page);
});

test('reduced motion keeps direct entry, links and history usable without page effects', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of ['/', '/privacy.html', '/terms.html', '/support.html', '/gpt.prompt.html', '/vocabulary.sources.html']) {
    await page.goto(path);
    await expect(page.locator('h1:visible')).toBeVisible();
    expect((await motion(page)).entries).toEqual([]);
  }
  await navigateSite(page, 'vocabulary.review.html');
  await expect(page).toHaveURL(/\/vocabulary\.review\.html$/);
  await expect(page.locator('h1:visible')).toHaveText('英文單字複習');
  expect((await motion(page)).entries).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/\/vocabulary\.sources\.html$/);
  expect((await motion(page)).entries).toEqual([]);
});

test('schedule prompt uses the same tab and same-page anchors keep their normal behavior', async ({ page, context }) => {
  await page.goto('/');
  const pageCount = context.pages().length;
  await navigateSite(page, 'gpt.prompt.html');
  await expect(page).toHaveURL(/\/gpt\.prompt\.html$/);
  await expectEntry(page);
  expect(context.pages()).toHaveLength(pageCount);
  const before = await motion(page);
  await page.locator('nav a[href="#role"]').click();
  await expect(page).toHaveURL(/#role$/);
  expect((await motion(page)).generation).toBe(before.generation);
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expectEntry(page);
});

test('rails render before async shell data, retain geometry through hydration, and preserve their own scroll positions', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ['/todo.html', '/privacy.html', '/vocabulary.sources.html']) {
    let release: () => void = () => {};
    let hydrationVersion: string | null = null;
    const hydration = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/site-shell.js*', async route => {
      hydrationVersion = new URL(route.request().url()).searchParams.get('v');
      await hydration;
      await route.continue();
    });
    try {
      await page.goto(path, { waitUntil: 'commit' });
      const anchors = page.locator('.site-rail-left,.site-rail-right,.site-brand,.site-summary-link,.site-tools');
      await expect(page.locator('.site-rail-left')).toBeVisible();
      await expect(page.locator('.site-rail-right')).toBeVisible();
      await expect(page.locator('#siteRecordDate')).toHaveCount(0);
      const before = await anchors.evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, opacity: getComputedStyle(node).opacity };
      }));
      release();
      await expect(page.locator('#siteRecordDate')).toHaveCount(1);
      const bootstrapVersion = await page.locator('script[src*="page-transitions.js"]').evaluate(node => new URL((node as HTMLScriptElement).src).searchParams.get('v'));
      expect(bootstrapVersion).toBeTruthy();
      expect(hydrationVersion).toBe(bootstrapVersion);
      await expectEntry(page);
      const after = await anchors.evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, opacity: getComputedStyle(node).opacity };
      }));
      expect(after).toHaveLength(before.length);
      for (let index = 0; index < before.length; index += 1) {
        for (const property of ['x', 'y', 'width'] as const) {
          expect(Math.abs(after[index][property] - before[index][property]), `${path} anchor ${index} ${property}`).toBeLessThan(1);
        }
        expect(after[index].opacity).toBe('1');
      }
    } finally {
      release();
      await page.unroute('**/site-shell.js*');
    }
  }
  await page.setViewportSize({ width: 1440, height: 420 });
  const saved = await page.locator('.site-rail').evaluateAll(rails => rails.map(rail => {
    rail.scrollTop = 80;
    return rail.scrollTop;
  }));
  expect(saved.every(value => value > 0)).toBe(true);
  await page.goto('/todo.html');
  await expect(page.locator('#siteRecordDate')).toHaveCount(1);
  await expect.poll(async () => page.locator('.site-rail').evaluateAll(rails => rails.map(rail => rail.scrollTop))).toEqual(saved);
});
