import { expect, test, type Page } from '@playwright/test';
import { expandTodoCard } from './helpers/todoCard.ts';
import { selectStudyDate, showMobileSection } from './helpers/siteNavigation.ts';

const date = '2026-11-09';
const key = `study-v11:guest:${date}`;

async function seed(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-11-10T12:00:00+08:00') });
  await page.goto('/todo.html');
  await page.evaluate(({ date, key }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 2, date, notes: '保留原本紀錄', items: [
      { id: 'flat-grammar', type: 'extra', title: '英文｜Essential Grammar in Use', source: 'preset', required: true, done: false, minutes: '15', f: { title: 'Essential Grammar in Use', scopeKind: 'unit', unitStart: '18', unitEnd: '20' } },
      { id: 'flat-ace', type: 'extra', title: '英文｜ACE Reading', source: 'preset', required: true, done: false, minutes: '', f: { title: 'ACE Reading', round: '14' } },
      { id: 'flat-review', type: 'englishVocabInteractive', done: true, minutes: '10', required: false, f: { words: [{ id: 'alternate', text: 'alternate', noun: true, verb: true, translationsByPartOfSpeech: { noun: ['代替者', '候補者'], verb: ['輪流'] } }] } },
    ] }));
  }, { date, key });
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(2);
}

for (const width of [1280, 375]) test(`native todo completion stays left of the title and saves time before its pulse finishes (${width}px)`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 812 });
  await seed(page);
  const card = page.locator('.todo-card[data-todo-key$=flat-grammar]');
  await expect(card.getByRole('checkbox', { name: /^標記完成/ })).toBeVisible();
  await expect(card).toHaveAttribute('data-expanded', 'false');
  const compact = await card.evaluate(node => {
    const box = node.querySelector('.todo-complete')!.getBoundingClientRect(), title = node.querySelector('h3')!.getBoundingClientRect(), card = node.getBoundingClientRect();
    return { x: box.left + box.width / 2 - card.left, y: box.top + box.height / 2 - card.top, right: box.right, titleLeft: title.left };
  });
  expect(compact.right).toBeLessThan(compact.titleLeft);
  await card.screenshot({ path: testInfo.outputPath(`todo-title-checkbox-${width}-compact.png`) });
  await expandTodoCard(card);
  const expanded = await card.evaluate(node => {
    const box = node.querySelector('.todo-complete')!.getBoundingClientRect(), card = node.getBoundingClientRect();
    return { x: box.left + box.width / 2 - card.left, y: box.top + box.height / 2 - card.top };
  });
  expect(Math.abs(expanded.x - compact.x)).toBeLessThan(1);
  expect(Math.abs(expanded.y - compact.y)).toBeLessThan(1);
  await card.screenshot({ path: testInfo.outputPath(`todo-title-checkbox-${width}-expanded.png`) });
  await card.locator('[data-todo-minutes]').fill('25');
  await card.getByRole('button', { name: '計時', exact: true }).click();
  await expect(card.locator('.todo-timer-display')).toContainText('25:00');
  await card.getByRole('button', { name: '手動', exact: true }).click();
  await expect(card.locator('[data-todo-minutes]')).toHaveValue('25.0');
  // Freeze only this confirmation effect so the test can inspect the persisted
  // record while the checked native input is still visible.
  const result = await card.locator('.todo-complete').evaluate((input, key) => {
    const before = input.getBoundingClientRect();
    (input as HTMLInputElement).click();
    const animation = input.getAnimations().find(animation => animation.id === 'study-completion-checkbox')!;
    animation.pause();
    animation.currentTime = 115;
    const after = input.getBoundingClientRect();
    const record = JSON.parse(localStorage.getItem(key)!);
    return { dx: after.left + after.width / 2 - before.left - before.width / 2, dy: after.top + after.height / 2 - before.top - before.height / 2, checked: (input as HTMLInputElement).checked, frames: (animation.effect as KeyframeEffect).getKeyframes(), saved: record.items.find((item: { id: string }) => item.id === 'flat-grammar'), notes: record.notes, sibling: record.items.find((item: { id: string }) => item.id === 'flat-ace').done };
  }, key);
  expect(result.checked).toBe(true);
  expect(result.saved.done).toBe(true);
  expect(Number(result.saved.minutes)).toBe(25);
  expect(result.notes).toBe('保留原本紀錄');
  expect(result.sibling).toBe(false);
  expect(result.frames.some(frame => frame.transform === 'scale(1.18)')).toBe(true);
  expect(Math.abs(result.dx)).toBeLessThan(1);
  expect(Math.abs(result.dy)).toBeLessThan(1);
  await expect(card).toBeVisible();
  await card.locator('.todo-complete').evaluate(input => input.getAnimations().forEach(animation => animation.finish()));
  await expect(card).toHaveCount(0);
  await expect(page.locator('#todoHistoryList')).toContainText('Essential Grammar in Use');
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(1);
});

test('a failed checkbox save is unchecked, remains actionable and does not play a success pulse', async ({ page }) => {
  await seed(page);
  const box = page.locator('.todo-card[data-todo-key$=flat-ace] .todo-complete');
  await page.evaluate(key => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value): void {
      if (name === key) throw new DOMException('storage unavailable', 'QuotaExceededError');
      set.call(this, name, value);
    };
  }, key);
  await box.click();
  await expect(box).not.toBeChecked();
  await expect(box).toBeEnabled();
  await expect(page.locator('#todoError')).toBeVisible();
  expect(await box.evaluate(input => input.getAnimations().length)).toBe(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).items.find((item: { id: string }) => item.id === 'flat-ace').done, key)).toBe(false);
});

for (const width of [1280, 375]) for (const activation of ['pointer', 'keyboard'] as const) test(`Tracker preserves a stationary visible pulse after real ${activation} completion (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 812 });
  await seed(page);
  await page.goto('/');
  await selectStudyDate(page, date);
  const card = page.locator('[data-item="flat-grammar"]').first();
  await expect(card.locator('[data-done]')).toBeVisible();
  await expect(card.locator('[data-field="unitStart"]')).toBeVisible();
  const checkbox = card.locator('[data-done]');
  const before = await checkbox.evaluate(input => {
    const box = input.getBoundingClientRect(), card = input.closest('[data-item]')!.getBoundingClientRect();
    return { x: box.left + box.width / 2 - card.left, y: box.top + box.height / 2 - card.top };
  });
  if (activation === 'pointer') await checkbox.check();
  else { await checkbox.focus(); await checkbox.press('Space'); }
  await expect(card.locator('[data-done]')).toBeChecked();
  const current = await card.locator('[data-done]').evaluate(input => new Promise<{ ids: string[]; width: number; originalWidth: number; x: number; y: number }>(resolve => requestAnimationFrame(() => {
    const animations = input.getAnimations();
    const pulse = animations.find(animation => animation.id === 'study-completion-checkbox');
    if (pulse) { pulse.pause(); pulse.currentTime = 40; }
    const box = input.getBoundingClientRect(), card = input.closest('[data-item]')!.getBoundingClientRect();
    resolve({ ids: animations.map(animation => animation.id), width: box.width, originalWidth: Number.parseFloat(getComputedStyle(input).width), x: box.left + box.width / 2 - card.left, y: box.top + box.height / 2 - card.top });
  })));
  expect(current.ids).toContain('study-completion-checkbox');
  expect(current.width).toBeGreaterThan(current.originalWidth * 1.1);
  expect(Math.abs(current.x - before.x)).toBeLessThan(1);
  expect(Math.abs(current.y - before.y)).toBeLessThan(1);
  // WebKit does not focus native checkboxes for pointer input. Preserve the
  // platform's pointer behavior and require focus retention for keyboard input.
  if (activation === 'keyboard') await expect(card.locator('[data-done]')).toBeFocused();
  expect(await card.evaluate(node => node.getAnimations().length)).toBe(0);
  await card.locator('[data-done]').evaluate(input => input.getAnimations().forEach(animation => animation.finish()));
  await card.locator('[data-done]').uncheck();
  const unchecked = await card.locator('[data-done]').evaluate(input => {
    const box = input.getBoundingClientRect(), card = input.closest('[data-item]')!.getBoundingClientRect();
    return { x: box.left + box.width / 2 - card.left, y: box.top + box.height / 2 - card.top };
  });
  expect(Math.abs(unchecked.x - before.x)).toBeLessThan(1);
  expect(Math.abs(unchecked.y - before.y)).toBeLessThan(1);
});

test.describe('touch completion', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  test('real taps preserve the Tracker pulse and save compact todo completion', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await selectStudyDate(page, date);
    const checkbox = page.locator('[data-item="flat-grammar"] [data-done]').first();
    await checkbox.tap();
    await expect(checkbox).toBeChecked();
    const pulsing = await checkbox.evaluate(input => new Promise<boolean>(resolve => requestAnimationFrame(() => resolve(input.getAnimations().some(animation => animation.id === 'study-completion-checkbox')))));
    expect(pulsing).toBe(true);
    await page.goto('/todo.html');
    const todo = page.locator('.todo-card[data-todo-key$=flat-ace]');
    await todo.locator('.todo-complete').tap();
    expect(await page.evaluate(key => {
      const queue = [...JSON.parse(localStorage.getItem(key)!).items];
      while (queue.length) {
        const item = queue.shift();
        if (item.id === 'flat-ace') return item.done;
        for (const value of Object.values(item.f ?? {})) if (Array.isArray(value)) queue.push(...value);
      }
      return undefined;
    }, key)).toBe(true);
    await expect(todo).toHaveCount(0);
  });
});

test('desktop menu selection slides from its painted position and rapid selection navigates only to the last page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await expect(page.locator('#siteRightRail')).toHaveAttribute('data-selection-motion', 'ready');
  const result = await page.evaluate(() => {
    document.querySelector<HTMLAnchorElement>('.site-tools a[href="./material.progress.html"]')!.click();
    const marker = document.querySelector<HTMLElement>('.site-navigation-selection')!;
    const first = marker.getAnimations()[0];
    first.pause();first.currentTime = 100;
    const before = marker.getBoundingClientRect().top;
    document.querySelector<HTMLAnchorElement>('.site-tools a[href="./vocabulary.review.html"]')!.click();
    const second = marker.getAnimations()[0];
    second.pause();
    return { before, after: marker.getBoundingClientRect().top, frames: (second.effect as KeyframeEffect).getKeyframes() };
  });
  expect(Math.abs(result.after - result.before)).toBeLessThan(1);
  expect(result.frames[0].top).not.toBe(result.frames.at(-1)!.top);
  await page.locator('.site-navigation-selection').evaluate(marker => marker.getAnimations().forEach(animation => animation.finish()));
  await page.waitForURL('**/vocabulary.review.html');
  await expect(page.locator('.site-tools a[aria-current=page]')).toHaveAttribute('href', './vocabulary.review.html');
  await page.goBack();
  await expect(page.locator('.site-tools a[aria-current=page]')).toHaveAttribute('href', './todo.html');
  await expect.poll(() => page.locator('#siteRightRail').evaluate(rail => Math.abs(rail.querySelector('.site-navigation-selection')!.getBoundingClientRect().top - rail.querySelector('[aria-current=page]')!.getBoundingClientRect().top))).toBeLessThan(1);
});

test('flat mobile sections and vocabulary dividers fit 320px, keep native actions and honor reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await seed(page);
  const card = page.locator('.todo-card').first();
  await expect(card).toHaveAttribute('data-expanded', 'false');
  const bounds = await card.boundingBox();
  expect(bounds!.height).toBeLessThan(150);
  expect(await card.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe('rgb(255, 255, 255)');
  await showMobileSection(page, 'tools');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  await page.locator('.site-tools a[href="./vocabulary.review.html"]').click();
  await page.waitForURL('**/vocabulary.review.html');
  const word = page.locator('.vocabulary-row[data-entry-key=alternate]');
  await expect(word).toBeVisible();
  await expect(word.locator('.vocabulary-identity')).toHaveCSS('border-bottom-width', '3px');
  await expect(word.locator('.vocabulary-pos-group')).toHaveCount(2);
  await expect(word.locator('.vocabulary-pos-group').nth(1)).toHaveCSS('border-top-width', '1px');
  await expect(word.locator('.vocabulary-meaning').first()).toHaveCSS('border-top-width', '0px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await showMobileSection(page, 'date');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-slide-direction');
  const animationCount = await page.locator('#siteMobileBar').evaluate(node => node.getAnimations({ subtree: true }).length);
  expect(animationCount).toBe(0);
});
