import { expect, test } from '@playwright/test';

const prefix = 'study-v11:guest:';
const date = '2026-10-24';

test('split Unit and round cards use pages across books and subjects while unsplit cards keep numbered inputs', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-10-25T12:00:00+08:00') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.evaluate(({ prefix, date }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const cases = [
      ['unlock', 'extra', '英文｜Unlock 3｜Unit 1', 'Unlock 3 (Listening, Speaking, Critical Thinking)', 'unitStart'],
      ['ace', 'extra', '英文｜ACE Reading 第 3 回', 'ACE Reading', 'round'],
      ['physics', 'scienceReview', '物理｜自訂講義｜第 3 回', '物理講義', 'round'],
      ['math', 'mathStudy', '數學｜自訂講義｜Unit 2', '數學講義', 'unitStart'],
    ];
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, items: cases.flatMap(([id, type, title, book, field]) => (
      [false, true].map(split => ({ id: `${id}-${split}`, type, title: title + (split ? '（1/2）' : ''),
        source: 'custom', required: false, done: false, minutes: '20', description: split ? '進度：1/2' : '日期：2026/10/24',
        f: { title: book, book, [field]: '2', ...(field === 'unitStart' ? { unitEnd: '2' } : {}), start: '14', end: '24', progress: true,
          calendarBookRangeLocked: id === 'unlock' } }))
    )) }));
  }, { prefix, date });
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  for (const [id, field] of [['unlock', 'unitStart'], ['ace', 'round'], ['physics', 'round'], ['math', 'unitStart']]) {
    const whole = page.locator(`[data-item="${id}-false"]`);
    const split = page.locator(`[data-item="${id}-true"]`);
    await expect(whole.locator(`[data-field="${field}"]`)).toHaveValue('2');
    await expect(whole.locator('[data-field="start"],[data-field="end"]')).toHaveCount(0);
    await expect(split.locator('[data-field="unitStart"],[data-field="round"]')).toHaveCount(0);
    await expect(split.locator('[data-field="start"]')).toHaveValue('14');
    await expect(split.locator('[data-field="end"]')).toHaveValue('24');
    await split.locator('[data-field="start"]').fill('15');
    await split.locator('[data-field="end"]').fill('25');
    await split.locator('[data-field="end"]').blur();
    expect(await split.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  for (const id of ['unlock', 'ace', 'physics', 'math']) {
    const split = page.locator(`[data-item="${id}-true"]`);
    await expect(split.locator('[data-field="start"]')).toHaveValue('15');
    await expect(split.locator('[data-field="end"]')).toHaveValue('25');
    await expect(split.locator('[data-minutes]')).toHaveValue('20');
    await expect(split.locator('[data-check="progress"]')).toBeChecked();
  }
  await page.locator('[data-item="unlock-true"]').screenshot({ path: testInfo.outputPath('split-unit-pages-mobile.png') });
});

test('split todo pages round-trip with original cards, preserve Unit metadata, and produce actual-page progress only', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-25T12:00:00+08:00') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/todo.html');
  await page.evaluate(({ prefix, date }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const book = 'Unlock 3 (Listening, Speaking, Critical Thinking)';
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, items: [{ id: 'split-todo', type: 'extra',
      title: '英文｜Unlock 3｜Unit 1（1/2）', source: 'preset', required: true, done: false, minutes: '25',
      f: { title: book, book, scopeKind: 'unit', unitStart: '1', unitEnd: '1', start: '14', end: '24',
        calendarBookRangeLocked: true, progress: true, graded: false, corrected: false } }] }));
  }, { prefix, date });
  await page.reload();
  const todo = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="split-todo"]') });
  await expect(todo.locator('[data-todo-range="start"]')).toHaveValue('14');
  await expect(todo).toContainText('起始頁');
  await expect(todo).not.toContainText('起始 Unit');
  await todo.locator('[data-todo-range="start"]').fill('15');
  await todo.locator('[data-todo-range="start"]').blur();
  await todo.locator('[data-todo-range="end"]').fill('25');
  await todo.locator('[data-todo-range="end"]').blur();
  await page.goto('/');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  const card = page.locator('[data-item="split-todo"]');
  await expect(card.locator('[data-field="start"]')).toHaveValue('15');
  await expect(card.locator('[data-field="end"]')).toHaveValue('25');
  await card.locator('[data-field="end"]').fill('24');
  await card.locator('[data-field="end"]').blur();
  await page.getByRole('link', { name: '待辦事項', exact: true }).click();
  await expect(todo.locator('[data-todo-range="end"]')).toHaveValue('24');
  await todo.locator('.todo-complete').click();
  await page.goto('/');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(card.locator('[data-done]')).toBeChecked();
  await expect(card.locator('[data-field="start"]')).toHaveValue('15');
  await expect(card.locator('[data-field="end"]')).toHaveValue('24');
  const saved = await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!).items
    .find((item: { id: string }) => item.id === 'split-todo'), { prefix, date });
  expect([saved.f.scopeKind, saved.f.unitStart, saved.f.unitEnd, saved.minutes, saved.f.progress]).toEqual(['unit', '1', '1', '25', true]);
  await page.evaluate(({ prefix, book }) => {
    localStorage.setItem(prefix + 'material-selection', JSON.stringify([`book:${book}`]));
  }, { prefix, book: 'Unlock 3 (Listening, Speaking, Critical Thinking)' });
  await page.goto('/material.progress.html#english');
  const progress = page.locator('.material-row').filter({ has: page.getByRole('heading', { name: 'Unlock 3 (Listening, Speaking, Critical Thinking)', exact: true }) });
  await expect(progress.locator('.material-segment.is-recorded')).toHaveCount(1);
  await expect(progress.locator('.material-segment.is-recorded')).toHaveAttribute('title', /Unit 1.*完成 45%/);
});
