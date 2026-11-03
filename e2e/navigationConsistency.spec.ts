import { cleanUrlServer } from './helpers/cleanUrlServer.ts';
import { expect, test } from '@playwright/test';
import { navigateSite, selectStudyDate, showMobileSection } from './helpers/siteNavigation.ts';

test('all pages share desktop rails and three full-width mobile sections without duplicate navigation', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 1024, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/todo.html', '/summary.html', '/material.progress.html', '/vocabulary.review.html', '/privacy.html', '/terms.html', '/support.html', '/gpt.prompt.html', '/vocabulary.sources.html']) {
      await page.goto(path);
      await expect(page.locator('body')).toHaveClass(/has-site-shell/);
      if (width >= 1200) await expect(page.locator('[data-rail-date]')).toHaveCSS('color', 'rgb(237, 243, 252)');
      await expect(page.locator('#siteMobileBar [data-mobile-section]')).toHaveCount(3);
      const home = page.locator('.site-workspace-home');
      const title = page.locator('h1:not(.site-mobile-section-heading):visible').first();
      await expect(title).toBeVisible();
      await expect(title).toHaveCSS('font-size', '28px');
      await expect(width >= 1200 ? home : page.locator('.site-mobile-home')).toHaveCSS('color', path === '/' ? 'rgb(57, 103, 233)' : 'rgb(23, 42, 57)');
      const selectedTool = page.locator(`.site-tools a[href=".${path}"]`);
      if (width >= 1200 && await selectedTool.count()) {
        await expect(selectedTool).toHaveAttribute('aria-current', 'page');
        await expect(selectedTool).toHaveCSS('color', 'rgb(57, 103, 233)');
      }
      if (path === '/summary.html') {
        await expect(page.locator('.site-summary-link')).toHaveAttribute('aria-current', 'page');
        if (width >= 1200) await expect(page.locator('.site-summary-link')).toHaveCSS('color', 'rgb(165, 199, 255)');
      }
      await expect(page.locator('.site-rail .site-connection')).toHaveCount(0);
      await expect(page.locator('.site-rail a[href="./summary.html"]')).toHaveCount(1);
      if (width >= 1200) {
        await expect(page.locator('.site-rail-left')).toBeVisible();
        await expect(page.locator('.site-rail-right')).toBeVisible();
        expect((await title.boundingBox())!.x).toBeGreaterThanOrEqual(200);
        await expect(page.locator('.site-mobile-bar')).toBeHidden();
      } else {
        await expect(page.locator('.site-rail-left')).toBeHidden();
        await expect(page.locator('.site-rail-right')).toBeHidden();
        await showMobileSection(page, 'tools');
        await expect(page.locator('.site-rail-right')).toBeVisible();
        await expect(title).toBeHidden();
        expect(Math.abs((await page.locator('.site-rail-right').boundingBox())!.width - width)).toBeLessThanOrEqual(16);
        await expect(page.locator('.site-rail-backdrop')).toHaveCount(0);
        await expect(page.locator('.site-tools a')).toHaveCount(4);
        if (await selectedTool.count()) await expect(selectedTool).toHaveCSS('color', 'rgb(57, 103, 233)');
        await page.keyboard.press('Escape');
        await expect(page.locator('.site-rail-right')).toBeHidden();
        await expect(page.locator('button[data-mobile-section="content"]')).toBeFocused();
        await showMobileSection(page, 'date');
        await expect(page.locator('.site-summary-link')).toBeVisible();
        await expect(page.locator('[data-rail-date]')).toHaveCSS('color', 'rgb(57, 103, 233)');
        await showMobileSection(page, 'content');
        await expect(page.locator('.site-rail-left')).toBeHidden();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path + ' fits viewport').toBe(true);
      if (path === '/' && [1440, 375].includes(width)) await page.screenshot({ path: testInfo.outputPath(`site-shell-${width}.png`), fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});

test('real navigation stays highlighted when deployment redirects HTML links to clean URLs', async ({ page, context }) => {
  test.setTimeout(60_000);
  const server = await cleanUrlServer();
  try {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(server.origin + '/');
    for (const name of ['todo', 'summary', 'material.progress', 'vocabulary.review', 'index']) {
      await navigateSite(page, `${name}.html`);
      await expect(page).toHaveURL(new RegExp(`/${name.replaceAll('.', '\\.')}$`));
      const selected = page.locator('.site-rail [aria-current="page"]');
      await expect(selected).toHaveCount(1);
      await expect(selected).toHaveAttribute('href', `./${name}.html`);
      if (width < 1200) await showMobileSection(page, name === 'summary' ? 'date' : 'tools');
      await expect(selected).toHaveCSS('color', name === 'summary' && width >= 1200 ? 'rgb(165, 199, 255)' : 'rgb(57, 103, 233)');
      if (name !== 'index') await expect(page.locator(width >= 1200 ? '.site-workspace-home' : '.site-mobile-home')).toHaveCSS('color', 'rgb(23, 42, 57)');
      await page.reload();
      await expect(page.locator('.site-rail [aria-current="page"]')).toHaveAttribute('href', `./${name}.html`);
    }
    const pageCount = context.pages().length;
    await navigateSite(page, 'gpt.prompt.html');
    await expect(page).toHaveURL(/\/gpt\.prompt$/);
    await expect(page.locator('.site-tools [aria-current="page"]')).toHaveAttribute('href', './gpt.prompt.html');
    if (width < 1200) await showMobileSection(page, 'tools');
    await expect(page.locator('.site-tools [aria-current="page"]')).toHaveCSS('color', 'rgb(57, 103, 233)');
    expect(context.pages()).toHaveLength(pageCount);
  }
  } finally { await server.close(); }
});

test('sidebar uses saved records and current-week overdue tasks without mixing account scopes', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+08:00'));
  await page.goto('/todo.html');
  await page.evaluate(() => {
    localStorage.clear(); localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    const record = { date: '2026-11-03', mood: '普通', items: [{ id: 'task', type: 'mathStudy', source: 'preset', required: true, done: false, minutes: '10', title: '數學 三角比', f: { material: '教學講義', book: '2', start: '10', end: '12' } }] };
    localStorage.setItem('study-v11:guest:2026-11-03', JSON.stringify(record));
    localStorage.setItem('study-v11:user:other:2026-11-04', JSON.stringify({ ...record, date: '2026-11-04' }));
  });
  await page.reload();
  await expect(page.locator('[data-rail-days]')).toHaveText('1');
  await expect(page.locator('[data-rail-overdue-count]')).toHaveText('1 項');
  await expect(page.locator('[data-rail-overdue-list]')).toContainText('三角比');
});

test('mood slider preserves date-specific values and updates the weekly rail after saving', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+08:00'));
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/todo.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    for (const date of ['2026-11-04', '2026-11-05']) {
      localStorage.setItem(`study-v11:guest:${date}`, JSON.stringify({ date, items: [] }));
    }
  });
  await page.goto('/');
  await expect(page.locator('[data-rail-days]')).toHaveText('0');
  await expect(page.locator('#routineDisclosure')).not.toHaveAttribute('open');
  await page.getByRole('button', { name: '較疲累', exact: true }).click();
  await expect(page.locator('#mood')).toHaveValue('較疲累');
  await expect(page.locator('[data-rail-days]')).toHaveText('1');
  await selectStudyDate(page, '2026-11-04');
  await expect(page.getByRole('button', { name: '未填寫', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '普通', exact: true }).click();
  await expect(page.locator('[data-rail-days]')).toHaveText('2');
  await selectStudyDate(page, '2026-11-05');
  await expect(page.getByRole('button', { name: '較疲累', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: '較疲累', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-rail-days]')).toHaveText('2');
  await expect(page.locator('.connection-dock')).toBeVisible();
  await expect(page.locator('.site-rail-right .connection-dock')).toHaveCount(0);
});

test('sidebar date editing preserves drafts and routine replaces the upper date field', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+08:00'));
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/todo.html');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
      for (const date of ['2026-11-04', '2026-11-05']) localStorage.setItem(`study-v11:guest:${date}`, JSON.stringify({ date, items: [] }));
    });
    await page.goto('/');
    await expect(page.locator('.site-rail-left #studyDate')).toHaveCount(1);
    await expect(page.locator('.today-info-grid #studyDate')).toHaveCount(0);
    await expect(page.locator('.today-info-grid > :first-child')).toHaveAttribute('id', 'routineDisclosure');
    await expect(page.locator('#routineDisclosure')).not.toHaveAttribute('open');
    await page.locator('#notes').fill('切換前尚未離開欄位的筆記');
    await selectStudyDate(page, '2026-11-04');
    await expect(page.locator('[data-rail-date]')).toHaveText('11.04');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('study-v11:guest:2026-11-05')!).notes)).toBe('切換前尚未離開欄位的筆記');
    await selectStudyDate(page, '2026-11-05');
    await expect(page.locator('#notes')).toHaveValue('切換前尚未離開欄位的筆記');
    await navigateSite(page, 'todo.html');
    if (width < 1200) await showMobileSection(page, 'date');
    await page.locator('#siteRecordDate').evaluate((node: HTMLInputElement) => {
      node.value = '2026-11-04';
      node.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page).toHaveURL(/index\.html\?date=2026-11-04$/);
    await expect(page.locator('#studyDate')).toHaveValue('2026-11-04');
    await expect(page.locator('[data-rail-date]')).toHaveText('11.04');
  }
});
