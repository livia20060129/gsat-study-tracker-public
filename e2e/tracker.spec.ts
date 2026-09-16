import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '每日讀書完成度紀錄卡' })).toBeVisible();
});

test('whole-card deletion requires confirmation and small-row deletion can be undone', async ({ page }) => {
  await page.selectOption('#itemType', 'extra');
  await page.click('#addItemBtn');
  const customDelete = page.locator('#itemList [data-action="delete-item"]');
  await expect(customDelete).toHaveCount(1);

  page.once('dialog', dialog => dialog.dismiss());
  await customDelete.click();
  await expect(customDelete).toHaveCount(1);

  page.once('dialog', dialog => dialog.accept());
  await customDelete.click();
  await expect(customDelete).toHaveCount(0);

  await page.click('#addEnglishReviewBtn');
  await page.click('[data-action="word-add"]');
  const wordInput = page.locator('[data-word-text]');
  await wordInput.fill('regression');
  await page.click('[data-action="word-delete"]');
  await expect(page.locator('#deleteUndoToast')).toBeVisible();
  await page.click('#deleteUndoBtn');
  await expect(wordInput).toHaveValue('regression');
});

test('account recovery controls are readable without changing data', async ({ page }) => {
  await page.locator('#connectionSettings > summary').click();
  await expect(page.getByRole('button', { name: '忘記密碼' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重寄驗證信' })).toBeVisible();
  await page.getByRole('button', { name: '忘記密碼' }).click();
  await expect(page.locator('#cloudMessage')).toContainText('請先輸入');
});

test('expanded connection settings become a mobile bottom sheet', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  await page.goto('/');
  await page.locator('#connectionSettings > summary').click();
  await expect(page.locator('#connectionSettings')).toHaveAttribute('open', '');
  expect(await page.locator('#connectionSettings').evaluate(node => getComputedStyle(node).position)).toBe('fixed');
  await expect(page.locator('body')).toHaveClass(/connection-sheet-open/);
  await page.locator('#connectionSettings > summary').click();
  await expect(page.locator('#connectionSettings')).toHaveClass(/is-closing/);
  await expect(page.locator('#connectionSettings')).not.toHaveAttribute('open', '');
  await expect(page.locator('body')).not.toHaveClass(/connection-sheet-open/);
  await context.close();
});

test('connection settings visibly retract before the details element closes', async ({ page }) => {
  const settings = page.locator('#connectionSettings');
  const collapsedHeight = await settings.evaluate(node => node.getBoundingClientRect().height);
  await settings.locator(':scope > summary').click();
  await expect(settings).toHaveAttribute('open', '');
  await expect(settings).toHaveClass(/is-opening/);
  await page.waitForTimeout(120);
  const openingHeight = await settings.evaluate(node => node.getBoundingClientRect().height);
  expect(openingHeight).toBeGreaterThan(collapsedHeight + 8);
  await expect(settings).not.toHaveClass(/is-opening/);
  const expandedHeight = await settings.evaluate(node => node.getBoundingClientRect().height);

  await settings.locator(':scope > summary').click();
  await expect(settings).toHaveClass(/is-closing/);
  await page.waitForTimeout(120);
  const retractingHeight = await settings.evaluate(node => node.getBoundingClientRect().height);
  expect(retractingHeight).toBeLessThan(expandedHeight - 8);
  await expect(settings).not.toHaveAttribute('open', '');
});

test('typed record fields write to storage only after leaving the field', async ({ page }) => {
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as any).__trackerStorageWrites = 0;
    Storage.prototype.setItem = function (key: string, value: string) {
      (window as any).__trackerStorageWrites += 1;
      return original.call(this, key, value);
    };
  });

  const notes = page.locator('#notes');
  await notes.fill('離開欄位後才儲存');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__trackerStorageWrites)).toBe(0);

  await notes.blur();
  await expect.poll(() => page.evaluate(() => (window as any).__trackerStorageWrites)).toBeGreaterThan(0);

  await page.click('#addEnglishReviewBtn');
  await page.click('[data-action="word-add"]');
  await page.evaluate(() => { (window as any).__trackerStorageWrites = 0; });
  const wordInput = page.locator('[data-word-text]').last();
  await wordInput.fill('save on blur');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__trackerStorageWrites)).toBe(0);

  await wordInput.blur();
  await expect.poll(() => page.evaluate(() => (window as any).__trackerStorageWrites)).toBeGreaterThan(0);
});

test('timer starts from the closest second represented by manual minutes', async ({ page }) => {
  await page.selectOption('#itemType', 'extra');
  await page.click('#addItemBtn');
  const card = page.locator('#itemList [data-item]').filter({ has: page.locator('[data-action="delete-item"]') }).last();
  const minutes = card.locator('[data-minutes]');
  await minutes.fill('12.5');
  await minutes.blur();
  await card.locator('[data-action="time-mode-select"][data-time-mode="timer"]').click();
  await expect(card.locator('[data-timer-display]')).toHaveText('12:30');
});

test('completing deferred work records its date and checks the original day', async ({ page }) => {
  await page.goto('about:blank');
  await page.clock.install({ time: new Date('2026-09-17T12:00:00+08:00') });
  await page.goto('/');
  await page.evaluate(() => {
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}2026-09-16`, JSON.stringify({
      schemaVersion: 1,
      date: '2026-09-16',
      items: [{
        id: 'deferred-origin',
        type: 'general',
        title: '延期同步測試',
        done: false,
        minutes: '',
        required: true,
        source: 'preset',
        presetKey: 'e2e_deferred_source',
        deferred: true,
        deferredTargetDay: 4,
        f: {},
      }],
    }));
  });
  await page.reload();

  const deferredCard = page.locator('#dailyItemList [data-item]').filter({ hasText: '延期同步測試' });
  await expect(deferredCard).toHaveCount(1);
  const checkbox = deferredCard.locator('[data-done]').first();
  await checkbox.check();
  await expect(deferredCard.locator('.completion-checked-on')).toHaveText('延期完成：2026-09-17');

  const completedOrigin = await page.evaluate(() => JSON.parse(localStorage.getItem('study-v11:guest:2026-09-16') || '{}').items.find((item: { id: string }) => item.id === 'deferred-origin'));
  expect(completedOrigin.done).toBe(true);
  expect(completedOrigin.checkedOn).toBe('2026-09-17');
  expect(completedOrigin.deferredCompletedOn).toBe('2026-09-17');

  await checkbox.uncheck();
  const restoredOrigin = await page.evaluate(() => JSON.parse(localStorage.getItem('study-v11:guest:2026-09-16') || '{}').items.find((item: { id: string }) => item.id === 'deferred-origin'));
  expect(restoredOrigin.done).toBe(false);
  expect(restoredOrigin.checkedOn).toBeUndefined();
  expect(restoredOrigin.deferredCompletedOn).toBeUndefined();
});

test('learning summary uses one week/month control for the complete page', async ({ page }) => {
  // Leave the record editor first: its pagehide handler deliberately persists
  // the current form and would otherwise overwrite this isolated fixture.
  await page.goto('/summary.html');
  await page.evaluate(() => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}${date}`, JSON.stringify({
      schemaVersion: 1,
      date,
      wakeTime: '06:30',
      items: [
        { id: 'summary-math', type: 'mathStudy', done: true, minutes: '45', required: true, source: 'preset', f: { subject: '數學' } },
        { id: 'summary-english', type: 'englishPractice', title: '英文閱讀', done: true, minutes: '15', required: true, source: 'preset', f: { subject: '英文' } },
        { id: 'summary-english-listening', type: 'englishPractice', title: '英文聽力', done: true, minutes: '15', required: true, source: 'preset', f: { subject: '英文' } },
        { id: 'summary-english-writing', type: 'englishPractice', title: '英文寫作', done: true, minutes: '15', required: true, source: 'preset', f: { subject: '英文' } },
        { id: 'summary-english-grammar', type: 'englishPractice', title: '英文文法', done: true, minutes: '15', required: true, source: 'preset', f: { subject: '英文' } },
        { id: 'summary-english-vocabulary', type: 'englishPractice', title: '英文單字', done: true, minutes: '15', required: true, source: 'preset', f: { subject: '英文' } },
      ],
    }));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: '學習總結' })).toBeVisible();
  await expect(page.locator('#summaryModeSwitch')).toHaveCount(1);
  await expect(page.locator('#summaryCalendar .summary-day')).toHaveCount(7);
  await expect(page.locator('#calendarTitle')).toHaveText('週曆');
  await expect(page.locator('#wakePeriodLabel')).toHaveText('本週平均');
  await expect(page.locator('#summarySubjectDistribution .summary-donut-center strong')).toHaveText('2.0');
  await expect(page.locator('#summarySubjectDistribution .summary-donut-center span')).toHaveText('hr');
  await page.locator('#summaryCalendar .summary-day.has-record [data-summary-day]').click();
  await expect(page.locator('#summaryCalendar .summary-day.is-tooltip-open .summary-day-tooltip')).toContainText('學習時間');
  await expect(page.locator('#summaryCalendar .summary-day.is-tooltip-open .summary-day-tooltip')).toContainText('完成率');
  await expect.poll(() => page.locator('#summaryCalendar .summary-day.is-tooltip-open .summary-day-tooltip').evaluate(node => getComputedStyle(node).opacity)).toBe('1');
  await page.locator('[data-summary-subject="英文"]').click();
  await expect(page.locator('#subjectTitle')).toHaveText('科目分配｜英文');
  await expect(page.locator('#summarySubjectDistribution .summary-subject-detail-name')).toHaveCount(5);
  const detailPositions = await page.locator('#summarySubjectDistribution .summary-subject-detail-name').evaluateAll(nodes => nodes.map(node => {
    const rect = node.closest('li')?.getBoundingClientRect();
    return { left: rect?.left ?? 0, top: rect?.top ?? 0 };
  }));
  for (let index = 1; index < 4; index += 1) {
    expect(Math.abs(detailPositions[index].left - detailPositions[0].left)).toBeLessThan(3);
    expect(detailPositions[index].top).toBeGreaterThan(detailPositions[index - 1].top + 8);
  }
  expect(detailPositions[4].left).toBeGreaterThan(detailPositions[0].left + 8);
  await page.locator('#summarySubjectDistribution [data-summary-back]').first().click();
  await expect(page.locator('#subjectTitle')).toHaveText('科目分配');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileHeader = await page.locator('.summary-header').evaluate(node => {
    const heading = node.querySelector('h1')!.getBoundingClientRect();
    const back = node.querySelector('.summary-back')!.getBoundingClientRect();
    const header = node.getBoundingClientRect();
    return {
      headingBottom: heading.bottom,
      headingFontSize: getComputedStyle(node.querySelector('h1')!).fontSize,
      backTop: back.top,
      backWidth: back.width,
      headerWidth: header.width,
    };
  });
  expect(mobileHeader.headingFontSize).toBe('28px');
  expect(mobileHeader.backTop).toBeGreaterThan(mobileHeader.headingBottom);
  expect(Math.abs(mobileHeader.backWidth - mobileHeader.headerWidth)).toBeLessThan(3);
  await page.locator('[data-summary-subject="英文"]').click();
  await expect(page.locator('#summarySubjectDistribution')).toHaveClass(/animate-detail-entry/);
  await page.waitForTimeout(420);
  const mobileDetailLayout = await page.locator('#summarySubjectDistribution').evaluate(node => {
    const donut = node.querySelector('.summary-donut-shell.is-detail')?.getBoundingClientRect();
    const items = Array.from(node.querySelectorAll('.summary-subject-detail-list li')).map(item => {
      const rect = item.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    });
    return { donutRight: donut?.right ?? 0, items };
  });
  expect(mobileDetailLayout.donutRight).toBeLessThan(mobileDetailLayout.items[0].left);
  for (let index = 1; index < 4; index += 1) {
    expect(Math.abs(mobileDetailLayout.items[index].left - mobileDetailLayout.items[0].left)).toBeLessThan(3);
    expect(mobileDetailLayout.items[index].top).toBeGreaterThan(mobileDetailLayout.items[index - 1].top + 8);
  }
  expect(mobileDetailLayout.items[4].left).toBeGreaterThan(mobileDetailLayout.items[0].left + 8);
  await page.locator('#summarySubjectDistribution [data-summary-back]').first().click();
  await expect(page.locator('#subjectTitle')).toHaveText('科目分配');
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.locator('[data-summary-subject="數學"]').click();
  await expect(page.locator('#subjectTitle')).toHaveText('科目分配｜數學');
  await expect(page.locator('#summarySubjectDistribution .summary-subject-detail-name')).toHaveText('講義進度');
  await expect(page.locator('#summaryTrend')).toContainText('hr');

  await page.getByRole('tab', { name: '月' }).click();
  await expect(page.locator('#calendarTitle')).toHaveText('月曆');
  await expect(page.locator('#wakePeriodLabel')).toHaveText('本月平均');
  await expect(page.locator('#conclusionTitle')).toHaveText('本月小結');
  await expect(page.locator('#summaryContent')).not.toHaveClass(/is-mode-transitioning/);
  await expect.poll(() => page.locator('#summaryContent').evaluate(node => getComputedStyle(node).opacity)).toBe('1');
  await expect(page.locator('.summary-calendar-weekdays')).toBeVisible();
  await expect(page.locator('#summaryCalendar .summary-day')).toHaveCount(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate());
  await expect(page.locator('#periodLabel')).toContainText('月');
});
