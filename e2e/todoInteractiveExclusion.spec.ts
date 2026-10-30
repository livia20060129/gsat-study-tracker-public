import { expect, test } from '@playwright/test';

const prefix = 'study-v11:guest:';
const date = '2026-10-24';

test('interactive items stay out of todo subject counts while original cards remain editable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-25T12:00:00+08:00') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/todo.html');
  await page.evaluate(({ prefix, date }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const types = ['interactive', 'interactiveDaily', 'mathOral', 'englishPractice', 'biologyInteractive', 'englishVocabInteractive'];
    const items = types.map(type => ({ id: `excluded-${type}`, type, title: `互動題測試-${type}`,
      source: 'preset', required: true, done: false, minutes: '25', f: {} }));
    const legacy = ['daily_interactive', 'cal_interactive_old', 'weekday_math_oral'].map(presetKey => ({
      id: `excluded-${presetKey}`, type: 'general', title: `舊項目-${presetKey}`, presetKey,
      source: 'preset', required: true, done: false, minutes: '15', f: {},
    }));
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, notes: '不要清除', items: [
      ...items, ...legacy,
      { id: 'regular-science', type: 'scienceReview', title: '物理教材進度', source: 'preset', required: true, done: false,
        minutes: '10', f: { subject: '物理', material: '新關鍵', start: '10', end: '12' } },
    ] }));
  }, { prefix, date });
  const original = await page.evaluate(({ prefix, date }) => localStorage.getItem(prefix + date), { prefix, date });
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await expect(page.locator('#todoSummary')).toHaveText('共有 1 項待辦');
  await expect(page.locator('.todo-card')).toContainText('物理教材進度');
  await expect(page.locator('[data-item-id^="excluded-"]')).toHaveCount(0);
  await page.getByRole('tab', { name: '英文', exact: true }).click();
  await expect(page.locator('.todo-card')).toHaveCount(0);
  await page.getByRole('tab', { name: '數學', exact: true }).click();
  await expect(page.locator('.todo-card')).toHaveCount(0);
  await page.getByRole('tab', { name: '自然', exact: true }).click();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  expect(await page.evaluate(({ prefix, date }) => localStorage.getItem(prefix + date), { prefix, date })).toBe(original);
  await page.goto('/');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  const interactive = page.locator('[data-item="excluded-englishPractice"]');
  await expect(interactive.locator('[data-minutes]')).toHaveValue('25');
  await interactive.locator('[data-check="listening"]').check();
  await expect(page.locator('#notes')).toHaveValue('不要清除');
  await page.getByRole('link', { name: '待辦事項', exact: true }).click();
  await expect(page.locator('[data-item-id^="excluded-"]')).toHaveCount(0);
  const saved = await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!).items
    .find((item: { id: string }) => item.id === 'excluded-englishPractice'), { prefix, date });
  expect(saved.minutes).toBe('25');
  expect(saved.f.listening).toBe(true);
  expect(saved.done).toBe(false);
  expect(saved.f.overdueSkippedOn).toBeUndefined();
  expect(errors).toEqual([]);
});

test('interactive handled history is hidden but previous completions remain in the summary', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-25T12:00:00+08:00') });
  await page.goto('/todo.html');
  await page.evaluate(({ prefix, date }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const action = { overdueTodoAction: { kind: 'complete', handledAt: '2026-10-25T04:00:00Z' } };
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, items: [
      { id: 'interactive-history', type: 'englishPractice', title: '已完成英文互動題', source: 'preset', required: true,
        done: true, checkedOn: '2026-10-25', minutes: '25', f: action },
      { id: 'regular-history', type: 'scienceReview', title: '已完成物理講義', source: 'preset', required: true,
        done: true, checkedOn: '2026-10-25', minutes: '10', f: { ...action, subject: '物理', material: '新關鍵' } },
    ] }));
  }, { prefix, date });
  const original = await page.evaluate(({ prefix, date }) => localStorage.getItem(prefix + date), { prefix, date });
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(0);
  await expect(page.locator('.todo-history-item')).toHaveCount(1);
  await expect(page.locator('.todo-history-item')).toContainText('已完成物理講義');
  expect(await page.evaluate(({ prefix, date }) => localStorage.getItem(prefix + date), { prefix, date })).toBe(original);
  await page.goto('/summary.html#week');
  await expect(page.locator('#summaryCompletedItems')).toContainText('已完成英文互動題');
  await expect(page.locator('#summaryCompletedItems')).toContainText('已完成物理講義');
});
