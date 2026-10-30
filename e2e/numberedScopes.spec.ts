import { expect, test } from '@playwright/test';

const prefix = 'study-v11:guest:';
const date = '2026-10-15';

test('old cards use Unit and round templates across books and subjects, with saved page data kept separate', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-18T12:00:00+08:00') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.evaluate(({ prefix, date }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const cases = [
      ['prism', 'extra', '英文｜Prism Reading 3｜Unit 4', 'Prism Reading'],
      ['unknown', 'extra', '英文｜Another Course｜Units 2–3', 'Another Course'],
      ['physics', 'scienceReview', '物理｜自訂講義｜第3回', '物理自訂講義'],
      ['math', 'mathStudy', '數學｜自訂講義｜Unit 7', '數學自訂講義'],
    ];
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, items: cases.map(([id, type, title, book]) => ({
      id, type, title, source: 'custom', done: true, checkedOn: '2026-10-16', minutes: '35', required: false,
      description: `Google Calendar API：${title}`,
      f: { title: book, book, subject: id === 'physics' ? '物理' : '', start: '10', end: '20', progress: true, graded: true },
    })) }));
  }, { prefix, date });
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  for (const [id, field, value] of [['prism', 'unitStart', '4'], ['unknown', 'unitStart', '2'], ['physics', 'round', '3'], ['math', 'unitStart', '7']]) {
    const card = page.locator(`[data-item="${id}"]`);
    await expect(card.locator('[data-field="start"],[data-field="end"]')).toHaveCount(0);
    await expect(card.locator(`[data-field="${field}"]`)).toHaveValue(value);
    await expect(card).not.toContainText('頁碼不在');
    await card.locator(`[data-field="${field}"]`).fill('5');
    const end = card.locator(`[data-field="${field === 'round' ? 'roundEnd' : 'unitEnd'}"]`);
    await end.fill('6');
    await end.blur();
  }
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  for (const id of ['prism', 'unknown', 'physics', 'math']) {
    const card = page.locator(`[data-item="${id}"]`);
    await expect(card.locator('[data-field="unitStart"],[data-field="round"]')).toHaveValue('5');
    await expect(card.locator('[data-field="unitEnd"],[data-field="roundEnd"]')).toHaveValue('6');
    await expect(card.locator('[data-done]')).toBeChecked();
    await expect(card.locator('[data-minutes]')).toHaveValue('35');
  }
  const fields = await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!).items
    .filter((item: { id: string }) => ['prism', 'unknown', 'physics', 'math'].includes(item.id))
    .map((item: { f: Record<string, unknown> }) => [item.f.start, item.f.end, item.f.progress, item.f.graded]), { prefix, date });
  expect(fields).toEqual(Array(4).fill(['10', '20', true, true]));
});

test('todo round ranges edit and complete the original card without becoming page numbers', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-18T12:00:00+08:00') });
  await page.goto('/todo.html');
  await page.evaluate(({ prefix, date }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, items: [{
      id: 'round-task', type: 'extra', title: '英文｜新教材回次練習', source: 'preset', done: false, minutes: '20', required: true,
      f: { title: 'New Practice', scopeKind: 'round', round: '2', roundEnd: '3', start: '10', end: '20', progress: true },
    }] }));
  }, { prefix, date });
  await page.reload();
  const todo = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="round-task"]') });
  await expect(todo.getByLabel('英文｜新教材回次練習的起始 回次')).toHaveValue('2');
  await expect(todo).not.toContainText('起始頁');
  await todo.locator('[data-todo-range="start"]').fill('4');
  await todo.locator('[data-todo-range="start"]').blur();
  await todo.locator('[data-todo-range="end"]').fill('5');
  await todo.locator('[data-todo-range="end"]').blur();
  await page.goto('/');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  const card = page.locator('[data-item="round-task"]');
  await expect(card.locator('[data-field="round"]')).toHaveValue('4');
  await expect(card.locator('[data-field="roundEnd"]')).toHaveValue('5');
  await card.locator('[data-field="round"]').fill('6');
  await card.locator('[data-field="roundEnd"]').fill('7');
  await card.locator('[data-field="roundEnd"]').blur();
  await page.getByRole('link', { name: '待辦事項', exact: true }).click();
  await expect(todo.locator('[data-todo-range="start"]')).toHaveValue('6');
  await expect(todo.locator('[data-todo-range="end"]')).toHaveValue('7');
  await todo.locator('.todo-complete').click();
  await page.goto('/');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(card.locator('[data-done]')).toBeChecked();
  await expect(card.locator('[data-field="roundEnd"]')).toHaveValue('7');
  const stored = await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!).items.find((item: { id: string }) => item.id === 'round-task'), { prefix, date });
  expect([stored.f.start, stored.f.end, stored.f.progress, stored.minutes]).toEqual(['10', '20', true, '20']);
});
