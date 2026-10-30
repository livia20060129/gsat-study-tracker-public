import { expect, test } from '@playwright/test';

test('TOEFL supplemental book uses live page lookup, persists, and charts only five large RANK/index segments', async ({ page }) => {
  const book = 'TOEFL托福決戰字彙3800';
  const date = '2026-10-22';
  const errors: string[] = [];
  page.on('pageerror', error => { errors.push(error.message); });
  await page.clock.install({ time: new Date('2026-10-23T12:00:00+08:00') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.evaluate(book => {
    localStorage.clear();
    localStorage.setItem('study-v11:guest:material-selection', JSON.stringify([`book:${book}`]));
  }, book);
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await page.locator('#itemType').selectOption('extra');
  await page.locator('#addItemBtn').click();
  const newCard = page.locator('#itemList > [data-item]').last();
  const id = await newCard.getAttribute('data-item');
  const card = page.locator(`#itemList > [data-item="${id}"]`);
  const title = card.locator('[data-field="title"]');
  await expect(title.locator(`optgroup[label="課外補充"] option[value="${book}"]`)).toHaveCount(1);
  await title.selectOption(book);
  await expect(card.locator('[data-check="progress"]')).toHaveCount(1);
  await expect(card.locator('[data-check="graded"],[data-check="corrected"],[data-field="reason"]')).toHaveCount(0);
  await expect(card.locator('[data-field="unitStart"],[data-field="round"]')).toHaveCount(0);
  await card.locator('[data-field="start"]').fill('44');
  await card.locator('[data-field="end"]').fill('45');
  await card.locator('[data-field="end"]').blur();
  await expect(card.locator('[data-book-topic-auto]')).toHaveText('RANK 1、RANK 2');
  await expect(card.locator('[data-book-detail-auto]')).toHaveText('Vocabulary Building：聯想法、字彙');
  await card.locator('[data-field="start"]').fill('1');
  await card.locator('[data-field="end"]').fill('114');
  await card.locator('[data-field="end"]').blur();
  await card.locator('[data-minutes]').fill('30');
  await card.locator('[data-minutes]').blur();
  await card.locator('[data-check="progress"]').check();
  await card.locator('[data-done]').check();
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(title).toHaveValue(book);
  await expect(card.locator('[data-field="start"]')).toHaveValue('1');
  await expect(card.locator('[data-field="end"]')).toHaveValue('114');
  await expect(card.locator('[data-done]')).toBeChecked();
  await expect(card.locator('[data-minutes]')).toHaveValue('30');
  await expect(card.locator('[data-check="progress"]')).toBeChecked();
  await expect(card.locator('[data-check="graded"],[data-check="corrected"],[data-field="reason"]')).toHaveCount(0);
  await page.goto('/material.progress.html#english');
  const row = page.locator('.material-row').filter({ has: page.getByRole('heading', { name: book, exact: true }) });
  await expect(row.locator('.material-row-head strong')).toHaveText('完成 38%｜2／5 大單元已有紀錄');
  await expect(row.locator('.material-segment')).toHaveCount(5);
  await expect(row.locator('.material-segment.is-recorded')).toHaveCount(2);
  expect(await row.locator('.material-segment').evaluateAll(nodes => nodes.map(node => node.getAttribute('title')))).toEqual([
    'RANK 1（p.1–44）：完成 100%', 'RANK 2（p.45–114）：完成 100%',
    'RANK 3（p.115–196）：完成 0%', 'RANK 4（p.197–270）：完成 0%', '索引（p.271–298）：完成 0%',
  ]);
  await expect(row.locator('xpath=ancestor::section[contains(@class,"material-group")]').locator('.material-group-title')).toHaveText('補充');
  expect(errors).toEqual([]);
});

test('TOEFL original and todo cards expose only progress, retain hidden legacy data and leave other books unchanged', async ({ page }) => {
  const book = 'TOEFL托福決戰字彙3800';
  const unlock = 'Unlock 3 (Listening, Speaking, Critical Thinking)';
  const date = '2026-10-22';
  await page.clock.install({ time: new Date('2026-10-24T12:00:00+08:00') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.evaluate(({ date, book, unlock }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:' + date, JSON.stringify({ schemaVersion: 2, date, items: [
      { id: 'toefl-progress', type: 'extra', source: 'preset', required: true, done: false, minutes: '12',
        title: book, f: { title: book, book, start: '1', end: '8', progress: false, graded: true, corrected: true, reason: '保留既有備註' } },
      { id: 'unlock-controls', type: 'extra', source: 'custom', required: false, done: false, minutes: '5',
        title: unlock, f: { title: unlock, book: unlock, unitStart: '1', unitEnd: '1', progress: false, graded: true, corrected: true, reason: '其他教材保持原樣' } },
    ] }));
  }, { date, book, unlock });
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  const original = page.locator('[data-item="toefl-progress"]');
  const other = page.locator('[data-item="unlock-controls"]');
  await expect(original.locator('[data-check]')).toHaveCount(1);
  await expect(original.locator('[data-check="progress"]')).toBeVisible();
  await expect(original.locator('[data-check="graded"],[data-check="corrected"],[data-field="reason"]')).toHaveCount(0);
  await expect(other.locator('[data-check="graded"],[data-check="corrected"]')).toHaveCount(2);
  await expect(other.locator('[data-field="reason"]')).toHaveValue('其他教材保持原樣');
  await original.locator('[data-check="progress"]').check();
  await page.getByRole('link', { name: '待辦事項', exact: true }).click();
  const todo = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="toefl-progress"]') });
  await expect(todo.locator('[data-todo-progress]')).toHaveCount(1);
  await expect(todo.locator('[data-todo-progress="progress"]')).toBeChecked();
  await expect(todo.locator('[data-todo-progress="graded"],[data-todo-progress="corrected"]')).toHaveCount(0);
  await todo.locator('[data-todo-progress="progress"]').uncheck();
  await page.goto('/');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(original.locator('[data-check="progress"]')).not.toBeChecked();
  await expect(original.locator('[data-check]')).toHaveCount(1);
  await expect(original.locator('[data-field="reason"]')).toHaveCount(0);
  const stored = await page.evaluate(date => JSON.parse(localStorage.getItem('study-v11:guest:' + date)!).items.find((item: { id: string }) => item.id === 'toefl-progress'), date);
  expect(stored.minutes).toBe('12');
  expect(stored.f).toEqual(expect.objectContaining({ progress: false, graded: true, corrected: true, reason: '保留既有備註', start: '1', end: '8' }));
});
