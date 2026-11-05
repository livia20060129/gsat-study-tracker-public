import { expect, test, type Page } from '@playwright/test';
import { selectStudyDate } from './helpers/siteNavigation.ts';
import { expandTodoCard } from './helpers/todoCard.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function task(id: string, start: string, end: string): StudyItem {
  return { id, type: 'mathLecture', required: true, source: 'custom', title: `數學｜教學講義 ${id}`, done: false, minutes: '',
    f: { material: '教學講義', book: '3A', start, end, progress: false, graded: false, corrected: false } };
}
async function seed(page: Page, records: StudyRecord[]): Promise<void> {
  await page.clock.install({ time: new Date('2026-11-05T12:00:00+08:00') });
  await page.goto('/vocabulary.review.html');
  await page.evaluate(records => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    for (const row of records) localStorage.setItem(`study-v11:guest:${row.date}`, JSON.stringify(row));
  }, records);
}
async function stored(page: Page, date: string, id: string): Promise<StudyItem> {
  return page.evaluate(({ date, id }) => JSON.parse(localStorage.getItem(`study-v11:guest:${date}`)!).items.find((item: StudyItem) => item.id === id), { date, id });
}

test('checking recorded pages checks covered overdue and future plans, preserves time and skips partial or other editions', async ({ page }) => {
  const source = task('range-source', '1', '10'); source.minutes = '45';
  const other = task('other-edition', '1', '10'); other.f.material = '新關鍵';
  await seed(page, [
    { date: '2026-11-05', items: [source] },
    { date: '2026-11-01', items: [task('old-covered', '1', '5'), task('partial', '1', '11'), other].map(item => ({ ...item, source: 'groupedWork' })) },
    { date: '2026-11-08', items: [task('future-covered', '4', '8')] },
  ]);
  await page.goto('/'); await selectStudyDate(page, '2026-11-05');
  await page.locator('[data-item="range-source"] [data-done]').check();
  await expect.poll(async () => (await stored(page, '2026-11-01', 'old-covered')).done).toBe(true);
  expect(await stored(page, '2026-11-08', 'future-covered')).toMatchObject({ done: true, checkedOn: '2026-11-05', minutes: '', f: { graded: false, corrected: false } });
  expect((await stored(page, '2026-11-01', 'partial')).done).toBe(false);
  expect((await stored(page, '2026-11-01', 'other-edition')).done).toBe(false);
  await page.goto('/todo.html');
  await expect(page.locator('[data-item-id="old-covered"]')).toHaveCount(0);
  await expect(page.locator('[data-item-id="partial"]').first()).toBeVisible();
  await page.goto('/'); await selectStudyDate(page, '2026-11-08');
  await expect(page.locator('[data-item="future-covered"] [data-done]')).toBeChecked();
  await page.reload(); await selectStudyDate(page, '2026-11-08');
  await expect(page.locator('[data-item="future-covered"] [data-done]')).toBeChecked();
  expect((await stored(page, '2026-11-05', 'range-source')).minutes).toBe('45');
});

test('removing source completion retracts only automatic checks, while a manually unchecked plan stays unchecked', async ({ page }) => {
  await seed(page, [{ date: '2026-11-05', items: [task('source', '1', '10')] },
    { date: '2026-11-08', items: [task('plan', '1', '10')] }]);
  await page.goto('/'); await selectStudyDate(page, '2026-11-05');
  await page.locator('[data-item="source"] [data-done]').check();
  await selectStudyDate(page, '2026-11-08');
  await page.locator('[data-item="plan"] [data-done]').uncheck();
  await page.reload(); await selectStudyDate(page, '2026-11-08'); await expect(page.locator('[data-item="plan"] [data-done]')).not.toBeChecked();
  await selectStudyDate(page, '2026-11-05');
  await page.locator('[data-item="source"] [data-done]').uncheck();
  await page.locator('[data-item="source"] [data-done]').check();
  expect((await stored(page, '2026-11-08', 'plan')).done).toBe(false);
});

test('completing a Unit from todo checks covered scheduled Units with their own saved inputs', async ({ page }) => {
  const source: StudyItem = { ...task('unit-source', '', ''), type: 'extra', source: 'preset', title: '英文｜測試 Unit 教材', presetKey: 'cal_scope_unit_source',
    f: { title: '測試 Unit 教材', scopeKind: 'unit', unitStart: '3', unitEnd: '5' } };
  const target = { ...source, source: 'custom', id: 'unit-plan', f: { ...source.f, unitStart: '4', unitEnd: '4' } };
  await seed(page, [{ date: '2026-11-01', items: [source] }, { date: '2026-11-08', items: [target] }]);
  await page.goto('/todo.html');
  const card = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="unit-source"]') });
  await expandTodoCard(card);
  await card.getByRole('button', { name: /^標記完成/ }).click();
  await expect.poll(async () => (await stored(page, '2026-11-08', 'unit-plan')).done).toBe(true);
  await page.goto('/'); await selectStudyDate(page, '2026-11-08');
  await expect(page.locator('[data-item="unit-plan"] [data-done]')).toBeChecked();
  expect((await stored(page, '2026-11-08', 'unit-plan')).f.unitStart).toBe('4');
});
