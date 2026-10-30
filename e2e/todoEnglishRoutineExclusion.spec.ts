import { expect, test } from '@playwright/test';

const prefix = 'study-v11:guest:';
const date = '2026-10-24';

test('excluded English routines and listening material are absent from todo but their original cards remain editable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-25T12:00:00+08:00') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/todo.html');
  await page.evaluate(({ prefix, date }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, englishTaskChoice: 'mock', notes: '保留原筆記', items: [
      { id: 'excluded-timed', type: 'mock', title: '英文歷屆／模考：限時作答', source: 'preset', required: true,
        done: false, minutes: '35', f: { subject: '英文', year: '115', exam: '學測' } },
      { id: 'excluded-magazine', type: 'magazine', title: '學測英文訓練：英文雜誌', source: 'preset', required: true,
        done: false, minutes: '15', f: { entries: [{ name: '常春藤', month: '10', unit: '2', minutes: '15' }] } },
      { id: 'excluded-calendar-timed', type: 'general', title: '舊模考排程', source: 'preset', required: true,
        done: false, minutes: '20', f: { calendarFixedTemplate: 'englishMockTimed' } },
      { id: 'excluded-calendar-magazine', type: 'general', title: '舊雜誌排程', presetKey: 'cal_fixed_fixedMagazine_old',
        source: 'preset', required: true, done: false, minutes: '10', f: {} },
      { id: 'excluded-correction', type: 'mock', title: '英文歷屆／模考：批改與訂正', source: 'preset', required: true,
        done: false, minutes: '10', f: { subject: '英文' } },
      { id: 'excluded-mixed', type: 'englishMixedWriting', title: '英文：混合題與作文練習', source: 'preset', required: true,
        done: false, minutes: '12', f: { essayScore: '10', mixedScore: '8' } },
      { id: 'excluded-listening', type: 'extra', title: '英文｜大考英聽A攻略 Test 2', source: 'preset', required: true,
        done: false, minutes: '18', f: { title: '大考英聽A攻略', round: '2' } },
      { id: 'retained-magazine', type: 'magazine', title: '雜誌補充閱讀', source: 'preset', required: true,
        done: false, minutes: '', f: { name: 'CNN互動英語', month: '10', unit: '1' } },
      { id: 'retained-math', type: 'mock', title: '數學歷屆／模考：限時作答', source: 'preset', required: true,
        done: false, minutes: '', f: { subject: '數學A' } },
    ] }));
  }, { prefix, date });
  const original = await page.evaluate(({ prefix, date }) => localStorage.getItem(prefix + date), { prefix, date });
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(2);
  await expect(page.locator('[data-item-id^="excluded-"]')).toHaveCount(0);
  await expect(page.locator('#todoSummary')).toHaveText('共有 2 項待辦');
  await page.getByRole('tab', { name: '英文', exact: true }).click();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await expect(page.locator('#todoItemFilter option')).toHaveCount(2);
  await expect(page.locator('#todoItemFilter')).not.toContainText('批改與訂正');
  await expect(page.locator('#todoItemFilter')).not.toContainText('混合題與作文');
  await expect(page.locator('#todoItemFilter')).not.toContainText('大考英聽A攻略');
  await expect(page.locator('.todo-card').filter({ hasText: '雜誌補充閱讀' })).toHaveCount(1);
  expect(await page.evaluate(({ prefix, date }) => localStorage.getItem(prefix + date), { prefix, date })).toBe(original);
  await page.goto('/');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(page.getByText('英文歷屆／模考：批改與訂正', { exact: true })).toBeVisible();
  await expect(page.locator('[data-item="excluded-mixed"]')).toBeVisible();
  await expect(page.locator('[data-item="excluded-listening"]')).toBeVisible();
  const timed = page.locator('[data-item="excluded-timed"]');
  await expect(timed.locator('[data-minutes]')).toHaveValue('35');
  await timed.locator('[data-minutes]').fill('40');
  await timed.locator('[data-minutes]').blur();
  const magazine = page.locator('[data-item="excluded-magazine"]');
  await expect(magazine.locator('[data-mag-field="name"]')).toHaveValue('常春藤');
  await expect(magazine.locator('[data-mag-field="unit"]')).toHaveValue('2');
  await magazine.locator('[data-mag-field="unit"]').fill('3');
  await magazine.locator('[data-mag-field="unit"]').blur();
  await page.getByRole('link', { name: '待辦事項', exact: true }).click();
  await expect(page.locator('[data-item-id^="excluded-"]')).toHaveCount(0);
  const stored = await page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!), { prefix, date });
  expect(stored.items.find((item: { id: string }) => item.id === 'excluded-timed').minutes).toBe('40');
  expect(stored.items.find((item: { id: string }) => item.id === 'excluded-magazine').f.entries[0].unit).toBe('3');
  expect(stored.items.find((item: { id: string }) => item.id === 'excluded-listening').f.round).toBe('2');
  expect(stored.items.find((item: { id: string }) => item.id === 'excluded-mixed').f.essayScore).toBe('10');
  expect(stored.notes).toBe('保留原筆記');
  expect(errors).toEqual([]);
});

test('handled English routines are hidden from todo history but retained in the weekly completion list', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-25T12:00:00+08:00') });
  await page.goto('/todo.html');
  await page.evaluate(({ prefix, date }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const action = { overdueTodoAction: { kind: 'complete', handledAt: '2026-10-25T04:00:00Z' } };
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, englishTaskChoice: 'mock', items: [
      { id: 'timed', type: 'mock', title: '英文歷屆／模考：限時作答', presetKey: 'fri_mock_timed', source: 'preset', required: true,
        done: true, checkedOn: '2026-10-25', minutes: '35', f: { ...action, subject: '英文' } },
      { id: 'magazine', type: 'magazine', title: '學測英文訓練：英文雜誌', presetKey: 'weekday_magazine', source: 'preset', required: true,
        done: true, checkedOn: '2026-10-25', minutes: '15', f: { ...action, entries: [{ name: '常春藤', month: '10', unit: '2', minutes: '15' }] } },
      { id: 'correction', type: 'mock', title: '英文歷屆／模考：批改與訂正', presetKey: 'sat_mock_correction', source: 'preset', required: true,
        done: true, checkedOn: '2026-10-25', minutes: '10', f: { ...action, subject: '英文' } },
      { id: 'mixed', type: 'englishMixedWriting', title: '英文：混合題與作文練習', source: 'preset', required: true,
        done: true, checkedOn: '2026-10-25', minutes: '12', f: { ...action, essayScore: '10' } },
      { id: 'listening', type: 'extra', title: '英文｜大考英聽A攻略 Test 2', source: 'preset', required: true,
        done: true, checkedOn: '2026-10-25', minutes: '18', f: { ...action, title: '大考英聽A攻略', round: '2' } },
    ] }));
  }, { prefix, date });
  const original = await page.evaluate(({ prefix, date }) => localStorage.getItem(prefix + date), { prefix, date });
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(0);
  await expect(page.locator('.todo-history-item')).toHaveCount(0);
  expect(await page.evaluate(({ prefix, date }) => localStorage.getItem(prefix + date), { prefix, date })).toBe(original);
  await page.goto('/summary.html#week');
  await expect(page.locator('#summaryCompletedItems')).toContainText('英文歷屆／模考：限時作答');
  await expect(page.locator('#summaryCompletedItems')).toContainText('學測英文訓練：英文雜誌');
  await expect(page.locator('#summaryCompletedItems')).toContainText('英文歷屆／模考：批改與訂正');
  await expect(page.locator('#summaryCompletedItems')).toContainText('英文：混合題與作文練習');
  await expect(page.locator('#summaryCompletedItems')).toContainText('大考英聽A攻略');
});
