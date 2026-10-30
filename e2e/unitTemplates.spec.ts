import { expect, test } from '@playwright/test';

const prefix = 'study-v11:guest:';
const date = '2026-10-15';
const book = 'Unlock 3 (Listening, Speaking, Critical Thinking)';

test('legacy Calendar Unlock with a fraction shows editable pages without losing saved state on mobile', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-18T12:00:00+08:00') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.evaluate(({ prefix, date, book }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, items: [{
      id: 'legacy-unlock-unit', type: 'extra', title: `英文｜${book}`, source: 'custom',
      done: true, checkedOn: '2026-10-16', minutes: '40', required: false,
      description: 'Google Calendar API：Unlock 3｜Unit 1 Animals（1/2）',
      f: { title: book, book, unitStart: '1', unitEnd: '1', start: '', end: '', calendarBookRangeLocked: true, progress: true, graded: true, corrected: false },
    }] }));
  }, { prefix, date, book });
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  const card = page.locator('[data-item="legacy-unlock-unit"]');
  await expect(card.locator('[data-field="unitStart"],[data-field="unitEnd"]')).toHaveCount(0);
  await expect(card.locator('[data-field="start"]')).toHaveValue('');
  await expect(card.locator('[data-field="end"]')).toHaveValue('');
  await expect(card).toContainText('請填寫本次頁碼');
  await card.locator('[data-field="start"]').fill('14');
  await card.locator('[data-field="end"]').fill('24');
  await card.locator('[data-field="end"]').blur();
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(card.locator('[data-field="start"]')).toHaveValue('14');
  await expect(card.locator('[data-field="end"]')).toHaveValue('24');
  await expect(card).toContainText('Animals');
  await expect(card.locator('[data-done]')).toBeChecked();
  await expect(card.locator('[data-completion-date]')).toHaveValue('2026-10-16');
  await expect(card.locator('[data-minutes]')).toHaveValue('40');
  await expect(card.locator('[data-check="progress"]')).toBeChecked();
  await expect(card.locator('[data-check="graded"]')).toBeChecked();
  await expect(card.locator('[data-check="corrected"]')).not.toBeChecked();
  const fields = await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!).items
    .find((item: { id: string }) => item.id === 'legacy-unlock-unit').f, { prefix, date });
  expect([fields.unitStart, fields.unitEnd]).toEqual(['1', '1']);
});

test('todo Unit edits round-trip through the original card and completion without changing actual pages', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-18T12:00:00+08:00') });
  await page.goto('/todo.html');
  await page.evaluate(({ prefix, date, book }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, items: [{
      id: 'todo-unlock-unit', type: 'extra', title: 'Unlock Unit 待辦', source: 'preset',
      done: false, minutes: '25', required: true,
      f: { title: book, book, unitStart: '', unitEnd: '', start: '14', end: '24', progress: true },
    }] }));
  }, { prefix, date, book });
  await page.reload();
  const todo = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="todo-unlock-unit"]') });
  await expect(todo.getByLabel('Unlock Unit 待辦的起始 Unit')).toHaveValue('');
  await todo.locator('[data-todo-range="start"]').fill('3');
  await todo.locator('[data-todo-range="start"]').blur();
  await todo.locator('[data-todo-range="end"]').fill('4');
  await todo.locator('[data-todo-range="end"]').blur();
  await page.goto('/');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  const card = page.locator('[data-item="todo-unlock-unit"]');
  await expect(card.locator('[data-field="unitStart"]')).toHaveValue('3');
  await expect(card.locator('[data-field="unitEnd"]')).toHaveValue('4');
  await card.locator('[data-field="unitStart"]').fill('2');
  await card.locator('[data-field="unitEnd"]').fill('2');
  await card.locator('[data-field="unitEnd"]').blur();
  await page.getByRole('link', { name: '待辦事項', exact: true }).click();
  await expect(todo.locator('[data-todo-range="start"]')).toHaveValue('2');
  await expect(todo.locator('[data-todo-range="end"]')).toHaveValue('2');
  await todo.locator('.todo-complete').click();
  await page.goto('/');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(card.locator('[data-done]')).toBeChecked();
  await expect(card.locator('[data-field="unitStart"]')).toHaveValue('2');
  const stored = await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!).items.find((item: { id: string }) => item.id === 'todo-unlock-unit'), { prefix, date });
  expect(stored.f.start).toBe('14');
  expect(stored.f.end).toBe('24');
  expect(stored.minutes).toBe('25');
});
