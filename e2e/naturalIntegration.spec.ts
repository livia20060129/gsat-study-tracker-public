import { expect, test, type Locator } from '@playwright/test';

test.skip(true, '公開版只顯示已從 Google Calendar 讀取的自然整合項目。');

test('grouped natural integration updates the selected visible subject rather than a hidden source copy', async ({ page }) => {
  const date = '2026-10-24';
  await page.clock.install({ time: new Date('2026-10-24T12:00:00+08:00') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.evaluate(date => {
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:' + date, JSON.stringify({ date, items: [
      { id: 'integration', type: 'scienceReview', source: 'preset', presetKey: 'cal_natural_20261024',
        title: '自然', required: true, done: false, minutes: '',
        f: { subject: '混合', calendarNaturalIntegration: true } },
      { id: 'physics-makeup', type: 'scienceReview', source: 'calendar',
        title: '自然', required: true, done: false, minutes: '18',
        f: { subject: '物理', material: '123日的淬鍊', start: '114', end: '127', calendarMakeup: true } },
    ] }));
  }, date);
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  const card = page.locator(`[data-item="natural-integration-${date}-生物"]`);
  const checked = card.locator(':scope > .item-top > [data-done]');
  await expect(card.locator('xpath=ancestor::*[contains(@class,"grouped-work-entry")]')).toHaveCount(1);
  await checked.check();
  await expect(checked).toBeChecked();
  await card.locator('[data-minutes]').fill('12.5');
  await card.locator('[data-minutes]').blur();
  await card.locator('[data-completion-date]').fill('2026-10-23');
  await card.locator('[data-completion-date]').blur();
  for (const subject of ['化學', '物理', '地科']) {
    await expect(page.locator(`[data-item="natural-integration-${date}-${subject}"] > .item-top > [data-done]`)).not.toBeChecked();
  }
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(checked).toBeChecked();
  await expect(card.locator('[data-minutes]')).toHaveValue('12.5');
  await expect(card.locator('[data-completion-date]')).toHaveValue('2026-10-23');
  for (const subject of ['化學', '物理', '地科']) {
    await page.locator(`[data-item="natural-integration-${date}-${subject}"] > .item-top > [data-done]`).check();
  }
  const aggregate = card.locator('xpath=ancestor::*[contains(@class,"grouped-work-entry")]');
  await expect(aggregate.locator(':scope > .item-top > [data-done]')).toBeChecked();
  await checked.uncheck();
  await expect(aggregate.locator(':scope > .item-top > [data-done]')).not.toBeChecked();
  for (const subject of ['化學', '物理', '地科']) {
    await expect(page.locator(`[data-item="natural-integration-${date}-${subject}"] > .item-top > [data-done]`)).toBeChecked();
  }
});

test('natural integration subjects can be completed independently and survive date changes and reload', async ({ page }) => {
  const date = '2026-10-24';
  const subjects = ['生物', '化學', '物理', '地科'];
  const errors: string[] = [];
  page.on('pageerror', error => { errors.push(error.message); });
  await page.goto('/');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');

  function completion(subject: string): Locator {
    return page.locator(`[data-item="natural-integration-${date}-${subject}"] > .item-top > [data-done]`);
  }

  for (const subject of subjects) await expect(completion(subject)).not.toBeChecked();
  await completion('生物').check();
  await expect(completion('生物')).toBeChecked();
  for (const subject of subjects.slice(1)) await expect(completion(subject)).not.toBeChecked();
  await expect(page.locator(`[data-item="natural-integration-${date}-生物"] [data-completion-date]`)).toBeVisible();

  await page.locator('#studyDate').fill('2026-10-25');
  await page.locator('#studyDate').dispatchEvent('change');
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(completion('生物')).toBeChecked();
  for (const subject of subjects.slice(1)) await expect(completion(subject)).not.toBeChecked();

  for (const subject of subjects.slice(1)) await completion(subject).check();
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  for (const subject of subjects) await expect(completion(subject)).toBeChecked();

  await completion('物理').uncheck();
  for (const subject of subjects.filter(subject => subject !== '物理')) await expect(completion(subject)).toBeChecked();
  await page.reload();
  await page.locator('#studyDate').fill(date);
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(completion('物理')).not.toBeChecked();
  for (const subject of subjects.filter(subject => subject !== '物理')) await expect(completion(subject)).toBeChecked();
  expect(errors).toEqual([]);
});
