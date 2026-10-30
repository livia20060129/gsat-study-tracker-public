import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Taipei' });
const prefix = 'study-v11:guest:';

async function seedPeriods(page: Page): Promise<void> {
  await page.evaluate(prefix => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const entries = [
      ['2026-09-30', 'old-english', 'extra', '英文舊排程'],
      ['2026-10-01', 'month-math', 'mathLecture', '數學月初排程'],
      ['2026-10-18', 'previous-science', 'scienceReview', '物理上週排程'],
      ['2026-10-19', 'week-english', 'extra', '英文本週排程'],
      ['2026-10-24', 'week-science', 'scienceReview', '物理本週排程'],
      ['2026-10-25', 'today', 'scienceReview', '今天尚未逾期'],
      ['2026-10-26', 'future', 'scienceReview', '未來排程'],
    ];
    for (const [date, id, type, title] of entries) {
      const f = type === 'extra' ? { title: 'ACE Reading', round: '3' }
        : { subject: type === 'mathLecture' ? '數學A' : '物理', material: '新關鍵', start: '10', end: '12' };
      localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, notes: '保留原筆記',
        items: [{ id, type, title, source: 'preset', required: true, done: false, minutes: '', f }] }));
    }
    const old = JSON.parse(localStorage.getItem(prefix + '2026-09-30')!);
    old.items.push({ id: 'handled-old', type: 'scienceReview', title: '舊排程最近處理', source: 'preset', required: true,
      done: true, minutes: '10', checkedOn: '2026-10-25',
      f: { overdueTodoAction: { kind: 'complete', handledAt: '2026-10-25T04:00:00Z' } } });
    localStorage.setItem(prefix + old.date, JSON.stringify(old));
    const week = JSON.parse(localStorage.getItem(prefix + '2026-10-24')!);
    week.items.push({ id: 'interactive', type: 'interactiveDaily', title: '互動題', source: 'preset', required: true, done: false, minutes: '', f: {} });
    localStorage.setItem(prefix + week.date, JSON.stringify(week));
  }, prefix);
}

async function recordsSnapshot(page: Page): Promise<string[]> {
  return page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}$/.test(key.slice(prefix.length)))
    .sort().map(key => localStorage.getItem(key)!), prefix);
}

test('period slider combines with subjects, keeps URL state, supports keyboard navigation and does not write records', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-25T12:00:00+08:00') });
  await page.goto('/todo.html');
  await seedPeriods(page);
  await page.reload();
  const original = await recordsSnapshot(page);
  const periods = page.getByRole('group', { name: '依期間篩選待辦事項' });
  const indicator = await periods.locator('.period-switch-indicator').elementHandle();
  await expect(periods.getByRole('button', { name: '全部', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.todo-card')).toHaveCount(5);
  await periods.getByRole('button', { name: '本月' }).click();
  await expect(page.locator('.todo-card')).toHaveCount(4);
  await expect(page.locator('#todoPeriodRange')).toHaveText('原排程：2026/10/01～2026/10/31');
  await page.getByRole('tab', { name: '英文', exact: true }).click();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await expect(page.locator('.todo-card')).toContainText('英文本週排程');
  await periods.getByRole('button', { name: '本週' }).click();
  await expect(page.locator('#todoPeriodRange')).toHaveText('原排程：2026/10/19～2026/10/25');
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await expect(page.locator('.todo-history-item')).toHaveCount(1);
  await expect(page.locator('#todoSummary')).toHaveText('本週目前科目 1 項｜本期 2 項｜全部 5 項');
  await expect(page).toHaveURL(/period=week#english$/);
  expect(await indicator!.evaluate(node => node.isConnected)).toBe(true);
  await page.reload();
  await expect(periods.getByRole('button', { name: '本週' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('tab', { name: '英文', exact: true })).toHaveAttribute('aria-selected', 'true');
  const reloadedIndicator = await periods.locator('.period-switch-indicator').elementHandle();
  await periods.getByRole('button', { name: '本週' }).press('ArrowLeft');
  await expect(periods).toHaveAttribute('data-active', '1');
  await periods.getByRole('button', { name: '本月' }).press('Home');
  await expect(periods).toHaveAttribute('data-active', '0');
  await periods.getByRole('button', { name: '全部', exact: true }).press('End');
  await expect(periods).toHaveAttribute('data-active', '2');
  expect(await reloadedIndicator!.evaluate(node => node.isConnected)).toBe(true);
  await page.getByRole('tab', { name: '全部', exact: true }).click();
  await expect(page.locator('.todo-card')).toHaveCount(2);
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await periods.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(periods.locator('.period-switch-indicator')).toHaveCSS('transition-duration', '0s');
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('todo-period-mobile.png') });
  expect(await recordsSnapshot(page)).toEqual(original);
  expect(errors).toEqual([]);
});

test('hiding a running timer does not pause it and period switches preserve completion-date and minute edits', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-25T12:00:00+08:00') });
  await page.goto('/todo.html');
  await seedPeriods(page);
  await page.reload();
  await page.clock.pauseAt(new Date('2026-10-25T12:01:00+08:00'));
  const periods = page.locator('#periodSwitch');
  const old = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="old-english"]') });
  await old.locator('[data-todo-completion-date]').fill('2026-10-22');
  await old.getByRole('button', { name: '計時', exact: true }).click();
  await old.getByRole('button', { name: '開始', exact: true }).click();
  await page.clock.runFor(65_000);
  await expect(old.locator('[data-todo-timer-display]')).toHaveText('01:05');
  const timerBefore = await page.evaluate(prefix => JSON.parse(localStorage.getItem(prefix + '2026-09-30')!).items[0].f.timeTracking, prefix);
  await periods.getByRole('button', { name: '本週' }).click();
  await expect(old).toHaveCount(0);
  expect(await page.evaluate(prefix => JSON.parse(localStorage.getItem(prefix + '2026-09-30')!).items[0].f.timeTracking, prefix)).toEqual(timerBefore);
  await page.clock.runFor(35_000);
  await periods.getByRole('button', { name: '全部', exact: true }).click();
  await expect(old.locator('[data-todo-timer-display]')).toHaveText('01:40');
  await expect(old.locator('[data-todo-completion-date]')).toHaveValue('2026-10-22');
  await old.getByRole('button', { name: '完成計時', exact: true }).click();
  await old.getByRole('button', { name: '手動', exact: true }).click();
  await old.locator('[data-todo-minutes]').fill('23.5');
  await periods.getByRole('button', { name: '本月' }).click();
  await expect(old).toHaveCount(0);
  await periods.getByRole('button', { name: '全部', exact: true }).click();
  await expect(old.locator('[data-todo-minutes]')).toHaveValue('23.5');
  await expect(old.locator('[data-todo-completion-date]')).toHaveValue('2026-10-22');
  const stored = await page.evaluate(prefix => JSON.parse(localStorage.getItem(prefix + '2026-09-30')!), prefix);
  expect(stored.items[0].minutes).toBe('23.5');
  expect(stored.items[0].done).toBe(false);
  expect(stored.notes).toBe('保留原筆記');
});

test('current month and week update across midnight, month boundaries and Monday without adding today or future tasks early', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-31T23:59:30+08:00') });
  await page.goto('/todo.html?period=month');
  await page.evaluate(prefix => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    for (const date of ['2026-10-30', '2026-10-31', '2026-11-01']) localStorage.setItem(prefix + date, JSON.stringify({ date,
      items: [{ id: date, type: 'scienceReview', title: date, source: 'preset', required: true, done: false, minutes: '', f: { subject: '物理' } }] }));
  }, prefix);
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await page.clock.runFor(61_000);
  await expect(page.locator('#todoPeriodRange')).toHaveText('原排程：2026/11/01～2026/11/30');
  await expect(page.locator('.todo-card')).toHaveCount(0);
  await expect(page.locator('#todoEmpty')).toHaveText('本月沒有符合條件的逾期未完成項目。');
  await page.locator('#periodSwitch').getByRole('button', { name: '本週' }).click();
  await expect(page.locator('#todoPeriodRange')).toHaveText('原排程：2026/10/26～2026/11/01');
  await expect(page.locator('.todo-card')).toHaveCount(2);
  await page.clock.fastForward(24 * 60 * 60 * 1000);
  await expect(page.locator('#todoPeriodRange')).toHaveText('原排程：2026/11/02～2026/11/08');
  await expect(page.locator('.todo-card')).toHaveCount(0);
  await page.locator('#periodSwitch').getByRole('button', { name: '全部', exact: true }).click();
  await expect(page.locator('.todo-card')).toHaveCount(3);
});

test('period and subject restore together on history navigation, while an invalid period falls back to all', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-25T12:00:00+08:00') });
  await page.goto('/todo.html?period=week#natural');
  await seedPeriods(page);
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await expect(page.locator('.todo-card')).toContainText('物理本週排程');
  await page.goto('/todo.html?period=month#english');
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await expect(page.locator('.todo-card')).toContainText('英文本週排程');
  await page.goBack();
  await expect(page.locator('#periodSwitch')).toHaveAttribute('data-active', '2');
  await expect(page.getByRole('tab', { name: '自然', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.todo-card')).toContainText('物理本週排程');
  await page.goForward();
  await expect(page.locator('#periodSwitch')).toHaveAttribute('data-active', '1');
  await expect(page.getByRole('tab', { name: '英文', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.goto('/todo.html?period=invalid#math');
  await expect(page.locator('#periodSwitch')).toHaveAttribute('data-active', '0');
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await expect(page.locator('.todo-card')).toContainText('數學月初排程');
});
