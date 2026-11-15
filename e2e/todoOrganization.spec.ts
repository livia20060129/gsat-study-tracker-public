import { expect, test, type Page } from '@playwright/test';

const prefix = 'study-v11:guest:';
async function seed(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-11-05T12:00:00+08:00') });
  await page.goto('/todo.html');
  await page.evaluate(({ prefix }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    for (const [index, date] of ['2026-09-01', '2026-10-05', '2026-10-06', '2026-11-01', '2026-11-02', '2026-11-04'].entries()) {
      // Organization tests need distinct work; identical completed ranges now intentionally check other dates.
      const unit = date === '2026-11-02' ? 1 : 10 + index * 2;
      const start = date === '2026-11-02' ? 10 : 30 + index * 20;
      const round = date === '2026-11-02' ? 5 : 10 + index;
      localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, notes: '保留筆記', items: [
        { id: 'grammar', type: 'extra', title: '英文｜Essential Grammar in Use', source: 'preset', required: true, done: false, minutes: '15',
          f: { title: 'Essential Grammar in Use', scopeKind: 'unit', unitStart: String(unit), unitEnd: String(unit + 1) } },
        { id: 'ace', type: 'extra', title: '英文｜ACE Reading', source: 'preset', required: true, done: false, minutes: '20', f: { title: 'ACE Reading', round: String(round) } },
        { id: 'science', type: 'scienceReview', title: '物理讀書', source: 'preset', required: true, done: false, minutes: '25',
          f: { subject: '物理', material: '新關鍵', start: String(start), end: String(start + 2), progress: true, graded: false, corrected: false } },
      ] }));
    }
  }, { prefix });
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(12);
}

test('30-day tasks stay visible, older tasks collapse by default and both groups support persistent date sorting', async ({ page }) => {
  await seed(page);
  await expect(page.locator('#todoRecentList .todo-card')).toHaveCount(12);
  await expect(page.locator('#todoLongTermList .todo-card')).toHaveCount(0);
  await expect(page.locator('#todoLongTermCount')).toHaveText('6 項');
  await expect(page.locator('#todoLongTerm')).not.toHaveAttribute('open', '');
  await expect(page.locator('#todoRecentList .todo-card').first().locator('.todo-overdue')).toHaveText('逾期 30 天');
  await page.locator('#todoSort').selectOption('newest');
  await expect(page.locator('#todoRecentList .todo-card').first().locator('.todo-overdue')).toHaveText('逾期 1 天');
  await page.locator('#todoLongTerm > summary').click();
  await expect(page.locator('#todoLongTermList .todo-card')).toHaveCount(6);
  await expect(page.locator('#todoLongTermList .todo-card').first().locator('.todo-overdue')).toHaveText('逾期 31 天');
  await page.reload();
  await expect(page.locator('#todoSort')).toHaveValue('newest');
  await expect(page.locator('#todoLongTerm')).not.toHaveAttribute('open', '');
});

test('batch skip honors subject, period and book filters, confirms the count and permits individual undo', async ({ page }) => {
  await seed(page);
  await expect(page.locator('#todoBatchSkip')).toBeDisabled();
  await page.getByRole('tab', { name: '英文', exact: true }).click();
  await page.locator('[data-period="week"]').click();
  await page.locator('#todoItemFilter').selectOption('english:Essential Grammar in Use');
  await expect(page.locator('.todo-card')).toHaveCount(2);
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('將跳過 2 項'); await dialog.dismiss(); });
  await page.locator('#todoBatchSkip').click();
  await expect(page.locator('.todo-card')).toHaveCount(2);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#todoBatchSkip').click();
  await expect(page.locator('.todo-card')).toHaveCount(0);
  await expect(page.locator('#todoFeedback')).toContainText('已跳過英文 2 項');
  const rows = await page.evaluate(({ prefix }) => ['2026-11-01', '2026-11-02', '2026-11-04'].map(date => JSON.parse(localStorage.getItem(prefix + date)!)), { prefix });
  expect(rows[0].items[0].f.overdueSkippedOn).toBeUndefined();
  for (const row of rows.slice(1)) {
    expect(row.items[0].f.overdueSkippedOn).toBe('2026-11-05');
    expect(row.items[1].f.overdueSkippedOn).toBeUndefined();
    expect(row.items[2].f.overdueSkippedOn).toBeUndefined();
    expect(row.notes).toBe('保留筆記');
    expect(row.items.every((item: { done: boolean }) => !item.done)).toBe(true);
    expect(row.items.map((item: { minutes: string }) => item.minutes)).toEqual(['15', '20', '25']);
  }
  await page.locator('.todo-history-undo').first().click();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(1);
});

test('batch failures report partial success and leave unprocessed dates intact', async ({ page }) => {
  await seed(page);
  await page.getByRole('tab', { name: '自然', exact: true }).click();
  await page.locator('[data-period="week"]').click();
  await page.evaluate(({ prefix }) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function failSecondDay(key, value): void {
      if (key === prefix + '2026-11-04') throw new DOMException('write blocked', 'QuotaExceededError');
      original.call(this, key, value);
    };
  }, { prefix });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#todoBatchSkip').click();
  await expect(page.locator('#todoError')).toContainText('已成功跳過 1 項，剩餘項目未處理');
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await expect(page.locator('.todo-overdue')).toHaveText('逾期 1 天');
});

test('batch skip includes collapsed matching long-term tasks and leaves another subject timer running', async ({ page }) => {
  await seed(page);
  const science = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="science"][data-record-date="2026-11-04"]') });
  await science.locator('h3').click();
  await science.locator('[data-todo-time-mode="timer"]').click();
  await science.locator('[data-todo-timer-action="toggle"]').click();
  await page.getByRole('tab', { name: '英文', exact: true }).click();
  await page.locator('#todoItemFilter').selectOption('english:Essential Grammar in Use');
  await expect(page.locator('#todoLongTermList .todo-card')).toHaveCount(0);
  await expect(page.locator('#todoLongTermCount')).toHaveText('2 項');
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('將跳過 6 項，其中長期逾期 2 項'); await dialog.accept(); });
  await page.locator('#todoBatchSkip').click();
  await expect(page.locator('.todo-card')).toHaveCount(0);
  await expect(page.locator('.todo-history-item')).toHaveCount(6);
  await page.getByRole('tab', { name: '自然', exact: true }).click();
  await expect(science.locator('[data-todo-timer-action="toggle"]')).toHaveText('暫停');
  const pointer = await page.evaluate(({ prefix }) => JSON.parse(localStorage.getItem(prefix + 'active-timer')!), { prefix });
  expect(pointer.itemId).toBe('science');
  expect(pointer.date).toBe('2026-11-04');
});

test('all cards start compact with a scope summary and whole-card editing without a view selector', async ({ page }, testInfo) => {
  await seed(page);
  await page.clock.pauseAt(new Date('2026-11-05T12:01:00+08:00'));
  await page.getByRole('tab', { name: '自然', exact: true }).click();
  await page.locator('[data-period="week"]').click();
  await expect(page.locator('#todoView')).toHaveCount(0);
  const card = page.locator('#todoRecentList .todo-card').first();
  await expect(card.locator('h3')).toContainText('物理');
  await expect(card.locator('.todo-overdue')).toBeVisible();
  for (const selector of ['.todo-description', '.todo-record-grid', '.todo-progress-editor', '.todo-time-editor', '.todo-control-field', '.todo-subject']) {
    for (const node of await card.locator(selector).all()) await expect(node).toBeHidden();
  }
  await expect(card.locator('.todo-complete')).toBeVisible();
  await expect(card.locator('.todo-skip')).toBeVisible();
  await expect(card.locator('.todo-range-summary')).toHaveText('新關鍵｜p.10–12');
  await expect(card.locator('.todo-expand')).toHaveCSS('border-top-width', '0px');
  await expect(card.locator('.todo-expand')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const headingBounds = await card.evaluate(node => {
    const checkbox = node.querySelector('.todo-complete')!.getBoundingClientRect(), title = node.querySelector('h3')!.getBoundingClientRect();
    return { checkboxRight: checkbox.right, titleLeft: title.left };
  });
  expect(headingBounds.checkboxRight).toBeLessThan(headingBounds.titleLeft);
  await card.locator('.todo-range-summary').click();
  await expect(card.locator('[data-todo-range="end"]')).toBeEditable();
  await card.locator('[data-todo-range="end"]').fill('18');
  await card.locator('[data-todo-range="end"]').blur();
  await card.locator('[data-todo-progress="graded"]').check();
  await card.locator('[data-todo-time-mode="timer"]').click();
  await card.locator('[data-todo-timer-action="reset"]').click();
  await card.locator('[data-todo-timer-action="toggle"]').click();
  await page.clock.runFor(60_000);
  await card.locator('h3').click();
  await expect(card.locator('.todo-range-summary')).toHaveText('新關鍵｜p.10–18');
  await page.clock.runFor(60_000);
  await card.click({ position: { x: 8, y: 8 } });
  await expect(card.locator('[data-todo-timer-display]')).toHaveText('02:00');
  await card.locator('[data-todo-timer-action="finish"]').click();
  await card.locator('.todo-expand').focus();
  await card.locator('.todo-expand').press('Enter');
  await card.locator('.todo-expand').blur();
  await page.clock.resume();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.clock.runFor(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.screenshot({ path: testInfo.outputPath('compact-todo-mobile.png') });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.clock.runFor(250);
  await page.screenshot({ path: testInfo.outputPath('todo-organization-mobile.png'), fullPage: true });
  await card.locator('.todo-complete').click();
  await expect(page.locator('#todoRecentList .todo-card')).toHaveCount(1);
  const stored = await page.evaluate(({ prefix }) => JSON.parse(localStorage.getItem(prefix + '2026-11-02')!), { prefix });
  expect(stored.items[2].done).toBe(true);
  expect(stored.items[2].f.end).toBe('18');
  expect(stored.items[2].f.graded).toBe(true);
  expect(Number(stored.items[2].minutes)).toBe(2);
  await page.reload();
  await expect(page.locator('#todoView')).toHaveCount(0);
  await expect(page.locator('#todoRecentList .todo-record-grid')).toBeHidden();
});

test('old full-view links still start compact and completing or skipping does not toggle another card', async ({ page }) => {
  await seed(page);
  await page.goto('/todo.html?view=full&period=week#english');
  const cards = page.locator('#todoRecentList .todo-card');
  await expect(cards).toHaveCount(4);
  for (const card of await cards.all()) await expect(card).toHaveAttribute('data-expanded', 'false');
  await cards.first().locator('.todo-complete').click();
  await expect(cards).toHaveCount(3);
  await cards.first().locator('.todo-skip').click();
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) await expect(card).toHaveAttribute('data-expanded', 'false');
});

test('editors load only on first expansion and both unopened completion and retained date drafts save correctly', async ({ page }) => {
  await seed(page);
  await expect(page.locator('[data-todo-range]')).toHaveCount(0);
  await page.getByRole('tab', { name: '自然', exact: true }).click();
  await page.locator('[data-period="week"]').click();
  const cards = page.locator('#todoRecentList .todo-card');
  await cards.first().locator('.todo-complete').click();
  const first = await page.evaluate(({ prefix }) => JSON.parse(localStorage.getItem(prefix + '2026-11-02')!), { prefix });
  expect(first.items[2].done).toBe(true);
  expect(first.items[2].checkedOn).toBe('2026-11-05');
  expect(first.items[2].f.start).toBe('10');
  await expect(cards).toHaveCount(1); // The saved checkbox finishes its brief confirmation first.
  await cards.locator('h3').click();
  await expect(page.locator('[data-todo-range]')).toHaveCount(2);
  const minutes = cards.locator('[data-todo-minutes]');
  await minutes.fill('28.5');
  await minutes.blur();
  await minutes.evaluate(node => node.setAttribute('data-lazy-probe', 'retained'));
  await cards.locator('[data-todo-completion-date]').fill('2026-11-03');
  await cards.locator('h3').click();
  await cards.locator('h3').click();
  await expect(minutes).toHaveAttribute('data-lazy-probe', 'retained');
  await expect(minutes).toHaveValue('28.5');
  await expect(cards.locator('[data-todo-completion-date]')).toHaveValue('2026-11-03');
  await cards.locator('h3').click();
  await cards.locator('.todo-complete').click();
  const second = await page.evaluate(({ prefix }) => JSON.parse(localStorage.getItem(prefix + '2026-11-04')!), { prefix });
  expect(second.items[2].done).toBe(true);
  expect(second.items[2].checkedOn).toBe('2026-11-03');
  expect(second.items[2].minutes).toBe('28.5');
});

test('normal pageshow preserves existing editors while cached-page restoration reloads changed records', async ({ page }) => {
  await seed(page);
  await page.getByRole('tab', { name: '自然', exact: true }).click();
  await page.locator('[data-period="week"]').click();
  const card = page.locator('#todoRecentList .todo-card').first();
  await card.locator('h3').click();
  const start = card.locator('[data-todo-range="start"]');
  await start.evaluate(node => node.setAttribute('data-page-probe', 'retained'));
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));
  await expect(start).toHaveAttribute('data-page-probe', 'retained');
  await page.evaluate(({ prefix }) => {
    const key = prefix + '2026-11-02';
    const record = JSON.parse(localStorage.getItem(key)!);
    record.items[2].f.start = '30';
    record.items[2].f.end = '40';
    record.items[2].minutes = '45';
    localStorage.setItem(key, JSON.stringify(record));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  }, { prefix });
  await expect(start).toHaveValue('30');
  await expect(card.locator('[data-todo-range="end"]')).toHaveValue('40');
  await expect(card.locator('[data-todo-minutes]')).toHaveValue('45');
});
