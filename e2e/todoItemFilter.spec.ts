import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Taipei' });
const prefix = 'study-v11:guest:';

async function seedItems(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-10-25T12:00:00+08:00') });
  await page.goto('/todo.html');
  await page.evaluate(prefix => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    for (const [date, id, type, title, f] of [
      ['2026-09-30', 'ace-old', 'extra', 'ACE Reading', { title: 'ACE Reading', round: '1' }],
      ['2026-10-19', 'ace-week', 'extra', 'ACE Reading', { title: 'ACE Reading', round: '2' }],
      ['2026-10-20', 'math', 'mathLecture', '數學講義：進度', { book: '第一冊', start: '10', end: '12' }],
      ['2026-10-23', 'physics', 'scienceReview', '物理', { subject: '物理', material: '新關鍵', start: '10', end: '12' }],
      ['2026-10-24', 'chemistry', 'scienceReview', '化學', { subject: '化學', material: '新關鍵', start: '10', end: '12' }],
      ['2026-10-25', 'today', 'scienceReview', '今天排程', { subject: '物理' }],
      ['2026-10-26', 'future', 'scienceReview', '未來排程', { subject: '物理' }],
    ]) {
      localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, notes: '保留原筆記',
        items: [{ id, type, title, source: 'preset', required: true, done: false, minutes: '', f }] }));
    }
    const record = JSON.parse(localStorage.getItem(prefix + '2026-10-24')!);
    record.items.push({ id: 'interactive', type: 'interactiveDaily', title: '互動題', required: true, done: false, minutes: '', f: {} });
    localStorage.setItem(prefix + record.date, JSON.stringify(record));
  }, prefix);
  await page.reload();
}

async function snapshot(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage).sort().map(key => `${key}=${localStorage.getItem(key)}`));
}

async function seedScopedItems(page: Page): Promise<void> {
  await seedItems(page);
  await page.evaluate(prefix => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const items = [];
    for (let index = 0; index < 2; index += 1) {
      items.push({ id: `gujin-${index}`, type: 'chineseReading', title: `國文｜古今悅讀一百 第 ${45 + index} 回`,
        f: { kind: 'reading', round: String(45 + index) } });
      items.push({ id: `listening-${index}`, type: 'extra', title: `英文｜大考英聽A攻略 Test ${9 + index}`,
        f: { title: '大考英聽A攻略', round: String(9 + index) } });
      items.push({ id: `grammar-${index}`, type: 'extra', title: `英文｜英文文法總複習｜Ch.${index + 1} ${index ? '動詞時態' : '英文基本句型'}`,
        f: { title: '英文文法總複習講義', start: String(10 + index * 10), end: String(15 + index * 10) } });
      items.push({ id: `unlock-${index}`, type: 'extra', title: `英文｜Unlock 3｜Unit ${index + 1} ${index ? 'The environment' : 'Animals'}`,
        f: { title: 'Unlock 3', unitStart: String(index + 1), unitEnd: String(index + 1) } });
    }
    localStorage.setItem(prefix + '2026-10-20', JSON.stringify({ schemaVersion: 2, date: '2026-10-20', notes: '保留筆記',
      items: items.map(item => ({ ...item, source: 'preset', required: true, done: false, minutes: '15' })) }));
  }, prefix);
  await page.reload();
}

test('scope options remove repeated subjects and group rounds while completion and undo still affect one card', async ({ page }, testInfo) => {
  await seedScopedItems(page);
  const before = await snapshot(page);
  const select = page.getByRole('combobox', { name: '查看項目', exact: true });
  const labels = await select.locator('option').allTextContents();
  expect(labels).toHaveLength(4);
  expect(new Set(labels)).toEqual(new Set(['全部項目', '國文｜古今悅讀一百', '英文｜英文文法總複習', '英文｜Unlock 3']));
  await select.selectOption({ label: '國文｜古今悅讀一百' });
  await expect(page.locator('.todo-card')).toHaveCount(2);
  await expect(page.locator('.todo-card h3')).toHaveText(['國文｜古今悅讀一百 第 45 回', '國文｜古今悅讀一百 第 46 回']);
  await expect(page.locator('.todo-card').first().locator('[data-todo-range="start"]')).toHaveValue('45');
  await expect(page.locator('.todo-card').last().locator('[data-todo-range="start"]')).toHaveValue('46');
  expect(await snapshot(page)).toEqual(before);
  await page.locator('.todo-card').first().locator('.todo-complete').click();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await expect(page.locator('.todo-card h3')).toHaveText('國文｜古今悅讀一百 第 46 回');
  const items = await page.evaluate(prefix => JSON.parse(localStorage.getItem(prefix + '2026-10-20')!).items, prefix);
  expect(items.find((item: { id: string }) => item.id === 'gujin-0').done).toBe(true);
  expect(items.find((item: { id: string }) => item.id === 'gujin-1').done).toBe(false);
  await page.locator('.todo-history-undo').click();
  await expect(page.locator('.todo-card')).toHaveCount(2);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('todo-grouped-rounds-mobile.png') });
  await expect(page.locator('#todoError')).toBeHidden();
});

test('older scoped URLs restore the grouped chapter selection and Units retain their individual inputs', async ({ page }) => {
  await seedScopedItems(page);
  const before = await snapshot(page);
  const url = new URL(page.url());
  url.searchParams.set('item', 'english:英文｜英文文法總複習｜Ch.1 英文基本句型');
  await page.goto(url.href);
  const select = page.getByRole('combobox', { name: '查看項目', exact: true });
  await expect(select).toHaveValue('english:英文文法總複習');
  await expect(page.locator('.todo-card')).toHaveCount(2);
  await expect(select.locator('option:checked')).toHaveText('英文｜英文文法總複習');
  await select.selectOption({ label: '英文｜Unlock 3' });
  await expect(page.locator('.todo-card')).toHaveCount(2);
  await expect(page.locator('.todo-card').first().locator('[data-range-unit="Unit"][data-todo-range="start"]')).toHaveValue('1');
  await expect(page.locator('.todo-card').last().locator('[data-range-unit="Unit"][data-todo-range="start"]')).toHaveValue('2');
  await page.reload();
  await expect(select).toHaveValue('english:Unlock 3');
  await expect(page.locator('.todo-card')).toHaveCount(2);
  await expect(select).not.toContainText('大考英聽A攻略');
  expect(await snapshot(page)).toEqual(before);
  await expect(page.locator('#todoError')).toBeHidden();
});

test('item dropdown groups dates, combines with period and subject filters and restores the URL without writing records', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await seedItems(page);
  const before = await snapshot(page);
  const select = page.getByRole('combobox', { name: '查看項目', exact: true });
  await expect(select).toHaveValue('');
  await expect(select.locator('option')).toHaveCount(5);
  await select.selectOption({ label: '英文｜ACE Reading' });
  await expect(page.locator('.todo-card')).toHaveCount(2);
  await expect(page.locator('#todoSummary')).toHaveText('目前篩選 2 項｜全部 5 項待辦');
  await page.locator('#periodSwitch').getByRole('button', { name: '本週' }).click();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await page.getByRole('tab', { name: '英文', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('item')).toBe('english:ACE Reading');
  await page.reload();
  await expect(select).toHaveValue('english:ACE Reading');
  await expect(page.locator('.todo-card')).toHaveCount(1);
  const savedUrl = page.url();
  await page.getByRole('tab', { name: '自然', exact: true }).click();
  await expect(select).toHaveValue('');
  await expect(select.locator('option')).toHaveCount(3);
  await expect(select).not.toContainText('ACE Reading');
  await expect(page.locator('.todo-card')).toHaveCount(2);
  await page.goto(savedUrl);
  await page.goto('/todo.html?item=unknown%3Aitem');
  await expect(select).toHaveValue('');
  await page.goBack();
  await expect(select).toHaveValue('english:ACE Reading');
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await page.getByRole('tab', { name: '全部', exact: true }).click();
  await select.selectOption('natural:物理');
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await select.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= innerWidth && node.scrollWidth <= node.clientWidth;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await select.focus();
  await select.press('Home');
  await select.press('Enter');
  await expect(select).toHaveValue('');
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('todo-item-dropdown-mobile.png') });
  expect(await snapshot(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('item options follow the selected subject and incompatible URL selections reset without writing records', async ({ page }, testInfo) => {
  await seedScopedItems(page);
  const before = await snapshot(page);
  const select = page.getByRole('combobox', { name: '查看項目', exact: true });
  await page.getByRole('tab', { name: '國文', exact: true }).click();
  await expect(select.locator('option')).toHaveText(['全部項目', '國文｜古今悅讀一百']);
  await select.selectOption('chinese:古今悅讀一百');
  await page.getByRole('tab', { name: '英文', exact: true }).click();
  await expect(select).toHaveValue('');
  await expect(page.locator('.todo-card')).toHaveCount(4);
  await expect(select.locator('option')).toHaveCount(3);
  await expect(select).not.toContainText('國文');
  await expect(select).not.toContainText('大考英聽A攻略');
  expect(new URL(page.url()).searchParams.has('item')).toBe(false);
  await page.getByRole('tab', { name: '數學', exact: true }).click();
  await expect(select.locator('option')).toHaveText(['全部項目']);
  await expect(page.locator('.todo-card')).toHaveCount(0);
  const url = new URL(page.url());
  url.hash = 'chinese';
  url.searchParams.set('item', 'english:Unlock 3');
  await page.goto(url.href);
  await expect(select).toHaveValue('');
  await expect(select.locator('option')).toHaveText(['全部項目', '國文｜古今悅讀一百']);
  await expect(page.locator('.todo-card')).toHaveCount(2);
  expect(new URL(page.url()).searchParams.has('item')).toBe(false);
  url.hash = 'all';
  url.searchParams.set('item', 'english:大考英聽A攻略');
  await page.goto(url.href);
  await expect(select).toHaveValue('');
  await expect(select).not.toContainText('大考英聽A攻略');
  await expect(page.locator('.todo-card')).toHaveCount(6);
  await page.getByRole('tab', { name: '國文', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('todo-subject-items-mobile.png') });
  expect(await snapshot(page)).toEqual(before);
});

test('item switching preserves running timers, completion dates and pending manual fields', async ({ page }) => {
  await seedItems(page);
  await page.clock.pauseAt(new Date('2026-10-25T12:01:00+08:00'));
  const select = page.getByRole('combobox', { name: '查看項目', exact: true });
  await select.selectOption('english:ACE Reading');
  const old = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="ace-old"]') });
  await old.locator('[data-todo-completion-date]').fill('2026-10-22');
  await old.getByRole('button', { name: '計時', exact: true }).click();
  await old.getByRole('button', { name: '開始', exact: true }).click();
  await page.clock.runFor(65_000);
  const before = await snapshot(page);
  await select.selectOption('natural:物理');
  await expect(old).toHaveCount(0);
  await page.clock.runFor(35_000);
  await select.selectOption('english:ACE Reading');
  await expect(old.locator('[data-todo-timer-display]')).toHaveText('01:40');
  await expect(old.locator('[data-todo-completion-date]')).toHaveValue('2026-10-22');
  expect(await snapshot(page)).toEqual(before);
  await old.getByRole('button', { name: '完成計時', exact: true }).click();
  await old.getByRole('button', { name: '手動', exact: true }).click();
  await old.locator('[data-todo-minutes]').fill('23.5');
  await select.selectOption('natural:物理');
  await select.selectOption('english:ACE Reading');
  await expect(old.locator('[data-todo-minutes]')).toHaveValue('23.5');
  await expect(old.locator('[data-todo-completion-date]')).toHaveValue('2026-10-22');
  await expect(page.locator('#todoError')).toBeHidden();
});

test('completing and skipping the last selected items keeps the filter empty until undo or clearing it', async ({ page }) => {
  await seedItems(page);
  const select = page.getByRole('combobox', { name: '查看項目', exact: true });
  await select.selectOption('english:ACE Reading');
  await page.locator('.todo-card').first().getByRole('button', { name: '標記完成 ACE Reading', exact: true }).click();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await page.locator('.todo-card').getByRole('button', { name: '跳過 ACE Reading', exact: true }).click();
  await expect(page.locator('.todo-card')).toHaveCount(0);
  await expect(select).toHaveValue('english:ACE Reading');
  await expect(select.locator('option:checked')).toContainText('目前無待辦');
  await expect(page.locator('.todo-history-item')).toHaveCount(2);
  await expect(page.locator('#todoSummary')).toHaveText('目前篩選 0 項｜全部 3 項待辦');
  await page.reload();
  await expect(select).toHaveValue('english:ACE Reading');
  await expect(page.locator('.todo-card')).toHaveCount(0);
  await page.locator('.todo-history-item').first().getByRole('button', { name: '復原 ACE Reading', exact: true }).click();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await expect(select.locator('option:checked')).toHaveText('英文｜ACE Reading');
  await select.selectOption('');
  await expect(page.locator('.todo-card')).toHaveCount(4);
  await expect(page.locator('.todo-history-item')).toHaveCount(1);
  await expect(page.locator('#todoError')).toBeHidden();
});
