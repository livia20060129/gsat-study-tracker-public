import { expect, test } from '@playwright/test';

const prefix = 'study-v11:guest:';
const date = '2026-10-15';

function expectedProgressKeys(id: string): string[] {
  if (id.startsWith('no-progress')) return [];
  if (id === 'progress-practice') return ['listening', 'vocab', 'translation', 'gsatPart1'];
  return ['progress', 'graded', 'corrected'];
}

test('todo shows the same progress checkboxes as sparse original templates on mobile', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-18T12:00:00+08:00') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/todo.html');
  const templates = [
    { id: 'progress-science', type: 'scienceReview', f: { subject: '物理', material: '新關鍵', start: '10', end: '12' } },
    { id: 'progress-math', type: 'mathLecture', f: { material: '教學講義', book: '1', start: '10', end: '12' } },
    { id: 'progress-chinese', type: 'chineseReading', f: { kind: 'reading', round: '1' } },
    { id: 'progress-ace', type: 'extra', f: { title: 'ACE Reading', round: '1' } },
    { id: 'progress-unlock', type: 'extra', f: { title: 'Unlock 3 (Listening, Speaking, Critical Thinking)', start: '14', end: '16' } },
    { id: 'progress-grammar', type: 'extra', f: { title: '英文文法總複習講義', start: '1', end: '3' } },
    { id: 'progress-azar', type: 'extra', f: { title: 'Azar英文文法（中階）', start: '18', end: '21' } },
    { id: 'progress-practice', type: 'englishPractice', f: {} },
    { id: 'no-progress-math', type: 'mathStudy', f: { material: '教學講義', book: '1', start: '20', end: '22' } },
    { id: 'no-progress-essential', type: 'extra', f: { title: 'Essential Grammar in Use', unitStart: '1', unitEnd: '2' } },
  ];
  await page.evaluate(({ prefix, date, templates }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, items: templates.map(template => ({
      ...template, title: template.id, source: 'preset', required: true, done: false, minutes: '',
    })) }));
  }, { prefix, date, templates });
  await page.reload();
  for (const template of templates) {
    const todo = page.locator('.todo-card').filter({ has: page.locator(`[data-item-id="${template.id}"]`) });
    if (template.type === 'englishPractice') {
      await expect(todo).toHaveCount(0);
      continue;
    }
    const actual = await todo.locator('[data-todo-progress]').evaluateAll(inputs => inputs.map(input => (input as HTMLElement).dataset.todoProgress));
    expect(actual).toEqual(expectedProgressKeys(template.id));
    for (const input of await todo.locator('[data-todo-progress]').all()) await expect(input).not.toBeChecked();
  }
  expect(await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!).items.every(
    (item: { f: Record<string, unknown> }) => !('graded' in item.f) && !('corrected' in item.f)
  ), { prefix, date })).toBe(true);

  await page.goto('/');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  for (const template of templates) {
    const original = page.locator(`#dailyItemList [data-item="${template.id}"]`);
    const keys = await original.locator('[data-check]').evaluateAll(inputs => inputs.map(input => (input as HTMLElement).dataset.check));
    expect(keys).toEqual(expectedProgressKeys(template.id));
  }
});

test('progress grading and correction sync both ways for a merged source without completing other scopes', async ({ page, context }) => {
  await page.clock.install({ time: new Date('2026-10-18T12:00:00+08:00') });
  await page.goto('/todo.html');
  await page.evaluate(({ prefix, date }) => {
    const sources = [10, 20].map(start => ({
      id: `progress-source-${start}`, type: 'scienceReview', title: '物理勾選同步',
      source: 'preset', required: true, done: false, minutes: '25',
      f: { subject: '物理', material: '新關鍵', start: String(start), end: String(start + 2) },
    }));
    const parent = { ...sources[0], id: 'progress-parent', f: {
      ...sources[0].f, dailyWorkGroup: true, dailyWorkSourceItems: sources,
      groupedWorkEntries: sources.map(source => ({ ...source, id: `visible-${source.id}`, calendarGroupedChild: true,
        f: { ...source.f, dailyWorkSourceItems: [structuredClone(source)] },
      })),
    } };
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, notes: '保留筆記', items: [parent] }));
  }, { prefix, date });
  await page.reload();
  const originalPage = await context.newPage();
  await originalPage.goto('/');
  await originalPage.locator('#studyDate').fill(date);
  await originalPage.locator('#studyDate').dispatchEvent('change');
  const original = originalPage.locator('#dailyItemList [data-item]').filter({
    has: originalPage.locator('input[data-field="start"][value="10"]'),
  }).last();
  const sibling = originalPage.locator('#dailyItemList [data-item]').filter({
    has: originalPage.locator('input[data-field="start"][value="20"]'),
  }).last();
  const todo = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="progress-source-10"]') });
  for (const key of ['progress', 'graded', 'corrected']) {
    await todo.locator(`[data-todo-progress="${key}"]`).check();
    await expect(original.locator(`[data-check="${key}"]`)).toBeChecked();
    await expect(sibling.locator(`[data-check="${key}"]`)).not.toBeChecked();
  }
  await expect(original.locator('[data-done]')).not.toBeChecked();
  await expect(todo.locator('[data-todo-minutes]')).toHaveValue('25');
  await expect(originalPage.locator('#notes')).toHaveValue('保留筆記');
  await original.locator('[data-check="graded"]').uncheck();
  await expect(todo.locator('[data-todo-progress="graded"]')).not.toBeChecked();
  await page.reload();
  await expect(todo.locator('[data-todo-progress="progress"]')).toBeChecked();
  await expect(todo.locator('[data-todo-progress="graded"]')).not.toBeChecked();
  await expect(todo.locator('[data-todo-progress="corrected"]')).toBeChecked();
});
