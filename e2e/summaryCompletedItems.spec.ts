import { expect, test } from '@playwright/test';

test('summary footer lists actual completions and follows the global period controls on mobile', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-17T12:00:00+08:00') });
  await page.goto('/summary.html');
  await page.evaluate(() => {
    localStorage.clear();
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const late = { id: 'late', type: 'englishPractice', title: '英文 <閱讀> & "練習"',
      done: true, minutes: '', required: true, source: 'preset', checkedOn: '2026-10-16',
      f: { book: 'ACE Reading', start: '18', end: '21' } };
    const records = [
      { date: '2026-09-30', items: [late] },
      { date: '2026-10-02', items: [{ ...late, id: 'month-only', title: '月初完成項目', checkedOn: '2026-10-02' }] },
      { date: '2026-10-17', mood: '身體不適', items: [
        { id: 'physics', type: 'scienceReview', title: '物理｜能量', done: true, minutes: '',
          required: true, source: 'preset', f: { subject: '物理', material: '新關鍵', start: '163', end: '180' } },
        { ...late, id: 'carry', deferredCarry: true, deferredOriginId: 'late', deferredOriginDate: '2026-09-30' },
        { ...late, id: 'pending', title: '尚未完成項目', done: false },
        { ...late, id: 'outside-week', title: '週外完成項目', checkedOn: '2026-10-21' },
      ] },
    ];
    for (const record of records) localStorage.setItem(`${prefix}${record.date}`, JSON.stringify(record));
  });
  await page.reload();
  const section = page.getByRole('region', { name: '本週完成項目' });
  await expect(section.locator('li')).toHaveCount(2);
  await expect(section).toContainText('英文 <閱讀> & "練習"');
  await expect(section).toContainText('ACE Reading｜p.18–21');
  await expect(section).toContainText('新關鍵｜p.163–180');
  await expect(section).toContainText('原排程 2026-09-30');
  await expect(section.locator('time')).toHaveText(['2026 年 10 月 17 日', '2026 年 10 月 16 日']);
  expect(await section.evaluate(node => node.parentElement?.querySelector(':scope > section:last-of-type') === node)).toBe(true);
  await page.locator('#includeStatusDaysCompletion').check();
  await expect(section.locator('li')).toHaveCount(2);
  await expect(page.getByRole('tablist', { name: '總結尺度' })).toHaveCount(1);

  await page.setViewportSize({ width: 320, height: 740 });
  await section.scrollIntoViewIfNeeded();
  const bounds = await section.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, scrollWidth: node.scrollWidth, width: node.clientWidth };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(320);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width + 1);
  await page.screenshot({ path: testInfo.outputPath('completed-items-mobile.png') });

  await page.getByRole('tab', { name: '月', exact: true }).click();
  const monthly = page.getByRole('region', { name: '本月完成項目' });
  await expect(monthly.locator('li')).toHaveCount(4);
  await expect(page.locator('#completedItemsCount')).toHaveText('共 4 項');
  await page.reload();
  await expect(monthly.locator('li')).toHaveCount(4);
  await page.getByRole('button', { name: '上一月', exact: true }).click();
  await expect(monthly).toContainText('本月尚無完成項目。');
  await expect(page.locator('#completedItemsCount')).toHaveText('共 0 項');
  await page.getByRole('button', { name: '下一月', exact: true }).click();
  await expect(monthly.locator('li')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('completed list refreshes after another tab saves, without modifying the saved record', async ({ page, context }) => {
  await page.clock.install({ time: new Date('2026-10-17T12:00:00+08:00') });
  await page.goto('/summary.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
  });
  await page.reload();
  await expect(page.locator('#summaryCompletedItems')).toContainText('本週尚無完成項目。');
  const writer = await context.newPage();
  await writer.goto('/summary.html');
  const stored = await writer.evaluate(() => {
    const json = JSON.stringify({ date: '2026-10-01', items: [
      { id: 'finished', type: 'mathLecture', title: '數學講義', done: true, checkedOn: '2026-10-17',
        minutes: '', required: true, source: 'preset', f: { material: '新大滿貫', start: '6', end: '19' } },
    ] });
    localStorage.setItem('study-v11:guest:2026-10-01', json);
    return json;
  });
  await expect(page.locator('#summaryCompletedItems li')).toHaveCount(1);
  await expect(page.locator('#summaryCompletedItems')).toContainText('數學講義');
  expect(await page.evaluate(() => localStorage.getItem('study-v11:guest:2026-10-01'))).toBe(stored);
  await writer.close();
});

test('todo completions appear in the selected summary period, with skip excluded and undo respected', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-17T12:00:00+08:00') });
  await page.goto('/todo.html');
  await page.evaluate(() => {
    localStorage.clear();
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const english = { id: 'todo-summary-english', type: 'extra', title: '待辦英文閱讀',
      source: 'preset', required: true, done: false, minutes: '',
      f: { book: 'ACE Reading', start: '18', end: '21' } };
    localStorage.setItem(`${prefix}2026-09-30`, JSON.stringify({ date: '2026-09-30', items: [
      { ...english, id: 'merged-parent', f: { dailyWorkGroup: true,
        dailyWorkSourceItems: [english], groupedWorkEntries: [
          { ...english, id: 'visible-child', calendarGroupedChild: true,
            f: { ...english.f, dailyWorkSourceItems: [structuredClone(english)] } },
        ] } },
      { id: 'todo-summary-math', type: 'mathLecture', title: '待辦數學講義',
        source: 'preset', required: true, done: false, minutes: '',
        f: { material: '新大滿貫', start: '6', end: '19' } },
      { id: 'todo-summary-skip', type: 'general', title: '只跳過的項目',
        source: 'preset', required: true, done: false, minutes: '', f: {} },
    ] }));
  });
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(3);
  await page.getByLabel('待辦英文閱讀的完成日期', { exact: true }).fill('2026-10-16');
  await page.getByRole('button', { name: '標記完成 待辦英文閱讀', exact: true }).click();
  await expect(page.locator('.todo-card')).toHaveCount(2);
  await page.getByLabel('待辦數學講義的完成日期', { exact: true }).fill('2026-10-02');
  await page.getByRole('button', { name: '標記完成 待辦數學講義', exact: true }).click();
  await page.getByRole('button', { name: '跳過 只跳過的項目', exact: true }).click();
  await expect(page.locator('.todo-card')).toHaveCount(0);
  await expect(page.locator('.todo-history-item')).toHaveCount(3);

  await page.goto('/summary.html#week');
  const list = page.locator('#summaryCompletedItems');
  await expect(list.locator('li')).toHaveCount(1);
  await expect(list).toContainText('待辦英文閱讀');
  await expect(list).toContainText('ACE Reading｜p.18–21');
  await expect(list).toContainText('原排程 2026-09-30');
  await expect(list.locator('time')).toHaveAttribute('datetime', '2026-10-16');
  await expect(list).not.toContainText('只跳過的項目');
  await page.getByRole('tab', { name: '月', exact: true }).click();
  await expect(list.locator('li')).toHaveCount(2);
  await expect(list).toContainText('待辦數學講義');
  expect(await list.locator('time').evaluateAll(nodes => nodes.map(node => node.getAttribute('datetime'))))
    .toEqual(['2026-10-16', '2026-10-02']);
  await page.reload();
  await expect(list.locator('li')).toHaveCount(2);

  await page.goto('/todo.html');
  await page.getByRole('button', { name: '復原 待辦英文閱讀', exact: true }).click();
  await expect(page.getByRole('button', { name: '標記完成 待辦英文閱讀', exact: true })).toBeVisible();
  await page.goto('/summary.html#week');
  await expect(list).toContainText('本週尚無完成項目。');
  await page.getByRole('tab', { name: '月', exact: true }).click();
  await expect(list.locator('li')).toHaveCount(1);
  await expect(list).toContainText('待辦數學講義');
  await expect(list).not.toContainText('待辦英文閱讀');
  await expect(list).not.toContainText('只跳過的項目');
  expect(errors).toEqual([]);
});

test('completed items keep subject colors and follow donut selection, period changes and both reset controls', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-17T12:00:00+08:00') });
  await page.goto('/summary.html');
  await page.evaluate(() => {
    localStorage.clear();
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    const subjects = ['數學', '國文', '英文', '物理', '化學', '生物', '地科', '自然', '社會', '其他'];
    localStorage.setItem(`${prefix}2026-10-17`, JSON.stringify({ date: '2026-10-17',
      items: subjects.map(subject => ({ id: `color-${subject}`, type: 'general', title: `${subject}完成項目`,
        done: true, minutes: '10', source: 'preset', required: true, f: { subject } })),
    }));
    localStorage.setItem(`${prefix}2026-09-30`, JSON.stringify({ date: '2026-09-30', items: [
      { id: 'zero-minute-todo', type: 'englishPractice', title: '英文待辦完成但未填分鐘',
        done: true, minutes: '', checkedOn: '2026-10-17', source: 'preset', required: true,
        f: { overdueTodoAction: { kind: 'complete', handledAt: '2026-10-17T04:00:00Z' } } },
    ] }));
    localStorage.setItem(`${prefix}2026-10-02`, JSON.stringify({ date: '2026-10-02', items: [
      { id: 'monthly-english', type: 'englishPractice', title: '月初英文完成項目',
        done: true, minutes: '5', source: 'preset', required: true, f: {} },
    ] }));
  });
  await page.reload();
  const list = page.locator('#summaryCompletedItems');
  await expect(list.locator('li')).toHaveCount(11);
  await expect(page.locator('#clearCompletedSubjectFilter')).toBeHidden();
  const palette: Record<string, string> = {
    數學: '#cfb273', 國文: '#b9958b', 英文: '#a898bd', 物理: '#8faec5',
    化學: '#91b6a2', 生物: '#a8b78e', 地科: '#b8a58d', 自然: '#8eaea1',
    社會: '#b69b74', 其他: '#aab3bd',
  };
  const colors = await list.locator('li').evaluateAll(nodes => nodes.map(node => ({
    subject: (node as HTMLElement).dataset.completedSubject!,
    accent: (node as HTMLElement).style.getPropertyValue('--completed-accent'),
    border: getComputedStyle(node).borderLeftColor,
    badge: getComputedStyle(node.querySelector('.summary-completed-subject')!).backgroundColor,
  })));
  for (const color of colors) expect(color.accent).toBe(palette[color.subject]);
  expect(new Set(colors.map(color => color.border)).size).toBe(10);
  expect(new Set(colors.map(color => color.badge)).size).toBe(10);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.summary-completed-card').screenshot({ path: testInfo.outputPath('completed-subject-colors-mobile.png') });
  const expectedSubjects: Record<string, string[]> = {
    國文: ['國文'], 英文: ['英文', '英文'], 數學: ['數學'],
    自然: ['物理', '化學', '生物', '地科', '自然'], 社會: ['社會'], 其他: ['其他'],
  };
  for (const [subject, expected] of Object.entries(expectedSubjects)) {
    await page.getByRole('button', { name: `查看${subject}項目`, exact: true }).click();
    await expect(page.locator('#completedItemsTitle')).toHaveText(`本週完成項目｜${subject}`);
    await expect(list.locator('li')).toHaveCount(expected.length);
    const visibleSubjects = await list.locator('li').evaluateAll(nodes => nodes.map(node => (
      (node as HTMLElement).dataset.completedSubject!
    )));
    expect(visibleSubjects.sort()).toEqual([...expected].sort());
    await expect(page.locator('#completedItemsCount')).toHaveText(`共 ${expected.length} 項`);
    if (subject === '英文') await expect(list).toContainText('英文待辦完成但未填分鐘');
    await page.locator('#summarySubjectDistribution [data-summary-back]').press('Enter');
    await expect(list.locator('li')).toHaveCount(11);
    await expect(page.locator('#completedItemsTitle')).toHaveText('本週完成項目');
  }

  await page.getByRole('button', { name: '查看英文項目', exact: true }).click();
  await page.getByRole('tab', { name: '月', exact: true }).click();
  await expect(page.locator('#completedItemsTitle')).toHaveText('本月完成項目｜英文');
  await expect(list.locator('li')).toHaveCount(3);
  await page.getByRole('button', { name: '上一月', exact: true }).click();
  await expect(list).toContainText('本月尚無英文的完成項目。');
  await expect(page.locator('#completedItemsCount')).toHaveText('共 0 項');
  await page.getByRole('button', { name: '顯示全部科目', exact: true }).click();
  await expect(page.locator('#completedItemsTitle')).toHaveText('本月完成項目');
  await expect(page.locator('#clearCompletedSubjectFilter')).toBeHidden();
  await page.getByRole('button', { name: '下一月', exact: true }).click();
  await expect(list.locator('li')).toHaveCount(12);
  expect(errors).toEqual([]);
});
