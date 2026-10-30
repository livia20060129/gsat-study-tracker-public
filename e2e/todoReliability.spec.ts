import { expect, test, type Page } from '@playwright/test';

const prefix = 'study-v11:guest:';
const date = '2026-10-15';

async function seedTodo(page: Page, merged = false): Promise<void> {
  await page.clock.install({ time: new Date('2026-10-17T12:00:00+08:00') });
  await page.goto('/todo.html');
  await page.evaluate(({ prefix, date, merged }) => {
    const source = {
      id: 'reliability-source', type: 'scienceReview', title: '物理計時驗證',
      source: 'preset', required: true, done: false, minutes: '',
      f: { subject: '物理', material: '新關鍵', start: '10', end: '12', progress: false },
    };
    const items = merged ? [{
      ...source, id: 'reliability-parent',
      f: { ...source.f, dailyWorkGroup: true, dailyWorkSourceItems: [source], groupedWorkEntries: [{
        ...source, id: 'reliability-child', calendarGroupedChild: true,
        f: { ...source.f, dailyWorkSourceItems: [structuredClone(source)] },
      }] },
    }] : [source];
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}${date}`, JSON.stringify({ schemaVersion: 2, date, notes: '', items }));
  }, { prefix, date, merged });
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(1);
}

test('todo keeps completion-date choices and exact elapsed time through mode switches and filtering', async ({ page }) => {
  await seedTodo(page);
  const completionDate = page.locator('[data-todo-completion-date]');
  await completionDate.fill('2026-10-16');
  await page.locator('[data-todo-time-mode="timer"]').click();
  await expect(completionDate).toHaveValue('2026-10-16');
  await page.locator('[data-todo-timer-action="toggle"]').click();
  await page.clock.runFor(65_000);
  await page.locator('[data-todo-timer-action="toggle"]').click();
  const elapsed = await page.locator('[data-todo-timer-display]').textContent();
  await expect(page.locator('[data-todo-timer-action="toggle"]')).toHaveText('繼續');
  await page.locator('[data-todo-time-mode="manual"]').click();
  await expect(page.locator('[data-todo-minutes]')).not.toHaveValue('');
  await page.locator('[data-todo-time-mode="timer"]').click();
  await expect(page.locator('[data-todo-timer-display]')).toHaveText(elapsed!);
  await page.getByRole('tab', { name: '英文', exact: true }).click();
  await page.getByRole('tab', { name: '自然', exact: true }).click();
  await expect(completionDate).toHaveValue('2026-10-16');
  await page.locator('[data-todo-timer-action="finish"]').click();
  await page.getByRole('button', { name: '標記完成 物理計時驗證' }).click();
  const stored = await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!), { prefix, date });
  expect(stored.items[0].checkedOn).toBe('2026-10-16');
  expect(Number(stored.items[0].minutes)).toBeGreaterThan(1);
});

test('background record updates preserve focused drafts and save them without replacing other-tab changes', async ({ page, context }) => {
  await seedTodo(page);
  const minutes = page.locator('[data-todo-minutes]');
  await minutes.fill('27.5');
  const other = await context.newPage();
  await other.goto('/summary.html');
  await other.evaluate(() => localStorage.setItem('unrelated-setting', 'updated'));
  await expect(minutes).toHaveValue('27.5');
  await other.evaluate(({ prefix, date }) => {
    const record = JSON.parse(localStorage.getItem(prefix + date)!);
    record.notes = '另一頁籤的筆記';
    record.items[0].f.progress = true;
    localStorage.setItem(prefix + date, JSON.stringify(record));
  }, { prefix, date });
  await expect(page.locator('[data-todo-progress="progress"]')).toBeChecked();
  await expect(minutes).toHaveValue('27.5');
  await expect(minutes).toBeFocused();
  await minutes.blur();
  const stored = await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!), { prefix, date });
  expect(stored.notes).toBe('另一頁籤的筆記');
  expect(stored.items[0].minutes).toBe('27.5');
  expect(stored.items[0].f.progress).toBe(true);
});

test('failed timer storage shows an error and allows retry without a running orphan', async ({ page }) => {
  await seedTodo(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('[data-todo-time-mode="timer"]').click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as any).__restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key: string, value: string): void {
      if (/\d{4}-\d{2}-\d{2}$/.test(key)) throw new DOMException('瀏覽器儲存空間不足', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.locator('[data-todo-timer-action="toggle"]').click();
  await expect(page.locator('#todoError')).toBeVisible();
  await expect(page.locator('#todoError')).toContainText('無法儲存');
  await expect(page.locator('[data-todo-timer-action="toggle"]')).toHaveText('開始');
  const stored = await page.evaluate(({ prefix, date }) => ({
    record: JSON.parse(localStorage.getItem(prefix + date)!),
    pointer: localStorage.getItem(prefix + 'active-timer'),
  }), { prefix, date });
  expect(stored.record.items[0].f.timeTracking.startedAt).toBeNull();
  expect(stored.pointer).toBeNull();
  expect(errors).toEqual([]);
  await page.evaluate(() => (window as any).__restoreStorage());
  await page.locator('[data-todo-timer-action="toggle"]').click();
  await expect(page.locator('[data-todo-timer-action="toggle"]')).toHaveText('暫停');
});

test('merged todo history remains unique after storage reload and can be restored', async ({ page }) => {
  await seedTodo(page, true);
  await page.locator('.todo-skip').click();
  await expect(page.locator('.todo-history-item')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.todo-history-item')).toHaveCount(1);
  await page.locator('.todo-history-undo').click();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.todo-history-item')).toHaveCount(0);
});

test('a hidden-source timer survives navigation to Tracker and can be paused there', async ({ page }) => {
  await seedTodo(page, true);
  await page.locator('[data-todo-time-mode="timer"]').click();
  await page.locator('[data-todo-timer-action="toggle"]').click();
  await page.clock.runFor(10_000);
  await page.goto('/');
  await expect(page.locator('#activeTimerSummary')).toBeVisible();
  await page.locator('#activeTimerSummary [data-action="timer-pause-active"]').click();
  await expect(page.locator('#activeTimerSummary')).toBeHidden();
  await page.goto('/todo.html');
  const card = page.locator('.todo-card').filter({ hasText: '物理計時驗證' });
  await expect(card.locator('[data-todo-timer-action="toggle"]')).toHaveText('繼續');
  const elapsed = await card.locator('[data-todo-timer-display]').textContent();
  await page.clock.runFor(5_000);
  await expect(card.locator('[data-todo-timer-display]')).toHaveText(elapsed!);
});

test('Tracker shares the exact-second timer/manual switch and retains the animation nodes', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-17T12:00:00+08:00') });
  await page.goto('/');
  await page.selectOption('#itemType', 'extra');
  await page.locator('#addItemBtn').click();
  const card = page.locator('#itemList [data-item]').filter({ has: page.locator('[data-action="delete-item"]') }).last();
  await card.locator('[data-time-mode="timer"]').click();
  await page.clock.runFor(300);
  await card.locator('[data-action="timer-toggle"]').click();
  await page.clock.runFor(65_000);
  await card.locator('[data-action="timer-toggle"]').click();
  const elapsed = await card.locator('[data-timer-display]').textContent();
  await card.locator('[data-time-mode="manual"]').click();
  await page.clock.runFor(300);
  await expect(card.locator('[data-minutes]')).not.toHaveValue('');
  await card.locator('[data-time-mode="timer"]').click();
  await page.clock.runFor(300);
  await expect(card.locator('[data-timer-display]')).toHaveText(elapsed!);
});

test('a same-field update in another tab preserves both the latest value and the unsaved draft', async ({ page, context }) => {
  await seedTodo(page);
  const minutes = page.locator('[data-todo-minutes]');
  await minutes.fill('27.5');
  const other = await context.newPage();
  await other.goto('/summary.html');
  await other.evaluate(({ prefix, date }) => {
    const record = JSON.parse(localStorage.getItem(prefix + date)!);
    record.items[0].minutes = '15';
    localStorage.setItem(prefix + date, JSON.stringify(record));
  }, { prefix, date });
  await expect(minutes).toHaveValue('27.5');
  await expect(minutes).toBeFocused();
  await minutes.blur();
  await expect(page.locator('#todoError')).toContainText('同一欄位');
  await expect(page.locator('#todoError')).toContainText('讀書時間（分鐘）');
  await expect(minutes).toHaveValue('27.5');
  const stored = await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!), { prefix, date });
  expect(stored.items[0].minutes).toBe('15');
  await page.locator('#refreshTodo').click();
  await minutes.focus();
  await minutes.blur();
  const confirmed = await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!), { prefix, date });
  expect(confirmed.items[0].minutes).toBe('27.5');
});

test('marking a running todo complete commits its elapsed minutes before completion', async ({ page }) => {
  await seedTodo(page);
  await page.locator('[data-todo-time-mode="timer"]').click();
  await page.locator('[data-todo-timer-action="toggle"]').click();
  await page.clock.runFor(65_000);
  await page.locator('.todo-complete').click();
  const stored = await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!), { prefix, date });
  expect(stored.items[0].done).toBe(true);
  expect(stored.items[0].minutes).toBe('1.1');
  expect(stored.items[0].f.timeTracking.startedAt).toBeNull();
});

test('Tracker rolls back a failed timer start and supports retry', async ({ page }) => {
  await page.goto('/');
  await page.selectOption('#itemType', 'extra');
  await page.locator('#addItemBtn').click();
  const card = page.locator('#itemList [data-item]').filter({ has: page.locator('[data-action="delete-item"]') }).last();
  await card.locator('[data-time-mode="timer"]').click();
  await expect(card.locator('[data-timer-display]')).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as any).__restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key: string, value: string): void {
      if (/\d{4}-\d{2}-\d{2}$/.test(key)) throw new DOMException('儲存空間不足', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await card.locator('[data-action="timer-toggle"]').click();
  await expect(page.locator('#status')).toContainText('計時尚未儲存');
  await expect(card.locator('[data-action="timer-toggle"]')).toHaveText('開始');
  await expect(page.locator('#activeTimerSummary')).toBeHidden();
  await page.evaluate(() => (window as any).__restoreStorage());
  await card.locator('[data-action="timer-toggle"]').click();
  await expect(card.locator('[data-action="timer-toggle"]')).toHaveText('暫停');
});

test('the visible grouped card and its todo source control the same timer in both directions', async ({ page }) => {
  await seedTodo(page, true);
  await page.evaluate(({ prefix, date }) => {
    const record = JSON.parse(localStorage.getItem(prefix + date)!);
    const second = structuredClone(record.items[0].f.dailyWorkSourceItems[0]);
    second.id = 'reliability-second-source';
    second.f.start = '20';
    second.f.end = '22';
    record.items[0].f.dailyWorkSourceItems.push(second);
    localStorage.setItem(prefix + date, JSON.stringify(record));
  }, { prefix, date });
  await page.reload();
  const source = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="reliability-source"]') });
  await source.locator('[data-todo-time-mode="timer"]').click();
  await source.locator('[data-todo-timer-action="toggle"]').click();
  await page.clock.runFor(5_000);
  await page.goto('/');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  const visible = page.locator('#dailyItemList [data-item]').filter({
    has: page.locator('input[data-field="start"][value="10"]'),
  }).last();
  await expect(visible.locator('[data-action="timer-toggle"]')).toHaveText('暫停');
  await visible.locator('[data-action="timer-toggle"]').click();
  await expect(page.locator('#activeTimerSummary')).toBeHidden();
  await visible.locator('[data-action="timer-toggle"]').click();
  await page.goto('/todo.html');
  await expect(source.locator('[data-todo-timer-action="toggle"]')).toHaveText('暫停');
  await source.locator('[data-todo-timer-action="toggle"]').click();
  expect(await page.evaluate(prefix => localStorage.getItem(prefix + 'active-timer'), prefix)).toBeNull();
});

test('todo completion and undo check the original grouped scope after navigation and reload', async ({ page }) => {
  await seedTodo(page, true);
  await page.evaluate(({ prefix, date }) => {
    const record = JSON.parse(localStorage.getItem(prefix + date)!);
    const second = structuredClone(record.items[0].f.dailyWorkSourceItems[0]);
    second.id = 'reliability-second-source';
    second.f.start = '20';
    second.f.end = '22';
    record.items[0].f.dailyWorkSourceItems.push(second);
    localStorage.setItem(prefix + date, JSON.stringify(record));
  }, { prefix, date });
  await page.reload();
  const todo = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="reliability-source"]') });
  await todo.locator('[data-todo-completion-date]').fill('2026-10-16');
  await todo.locator('.todo-complete').click();
  await expect(page.locator('.todo-card')).toHaveCount(1);

  await page.goto('/');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  const original = page.locator('#dailyItemList [data-item]').filter({
    has: page.locator('input[data-field="start"][value="10"]'),
  }).last();
  const sibling = page.locator('#dailyItemList [data-item]').filter({
    has: page.locator('input[data-field="start"][value="20"]'),
  }).last();
  await expect(original.locator('[data-done]')).toBeChecked();
  await expect(original.locator('[data-completion-date]')).toHaveValue('2026-10-16');
  await expect(sibling.locator('[data-done]')).not.toBeChecked();
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(original.locator('[data-done]')).toBeChecked();
  await page.locator('#studyDate').fill('2026-10-16');
  await page.locator('#studyDate').dispatchEvent('change');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(original.locator('[data-done]')).toBeChecked();

  await page.getByRole('link', { name: '待辦事項', exact: true }).click();
  await expect(page.locator('.todo-history-item')).toHaveCount(1);
  await page.locator('.todo-history-undo').click();
  await page.goBack();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(original.locator('[data-done]')).not.toBeChecked();
  await expect(sibling.locator('[data-done]')).not.toBeChecked();
});

test('todo completion refreshes an open original card without discarding its note draft', async ({ page, context }) => {
  await seedTodo(page);
  const originalPage = await context.newPage();
  await originalPage.goto('/');
  await originalPage.locator('#studyDate').fill(date);
  await originalPage.locator('#studyDate').dispatchEvent('change');
  const original = originalPage.locator('[data-item="reliability-source"]');
  await expect(original.locator('[data-done]')).not.toBeChecked();
  await originalPage.locator('#notes').fill('原卡尚在編輯的筆記');
  await page.locator('.todo-complete[data-item-id="reliability-source"]').click();
  await expect(page.locator('.todo-history-item')).toHaveCount(1);
  await originalPage.locator('#notes').blur();
  await expect(original.locator('[data-done]')).toBeChecked();
  await expect(original.locator('[data-completion-date]')).toHaveValue('2026-10-17');
  await expect(originalPage.locator('#notes')).toHaveValue('原卡尚在編輯的筆記');
  const stored = await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!), { prefix, date });
  expect(stored.notes).toBe('原卡尚在編輯的筆記');
  expect(stored.items.find((item: { id: string }) => item.id === 'reliability-source').done).toBe(true);
});

test('returning from todo completion restores the original checkbox and completion date', async ({ page }) => {
  await seedTodo(page);
  await page.goto('/');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await page.getByRole('link', { name: '待辦事項', exact: true }).click();
  const todo = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="reliability-source"]') });
  await todo.locator('[data-todo-completion-date]').fill('2026-10-16');
  await todo.locator('.todo-complete').click();
  await page.goBack();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  const original = page.locator('[data-item="reliability-source"]');
  await expect(original.locator('[data-done]')).toBeChecked();
  await expect(original.locator('[data-completion-date]')).toHaveValue('2026-10-16');
});
