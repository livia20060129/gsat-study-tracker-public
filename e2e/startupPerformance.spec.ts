import { expect, test } from '@playwright/test';

declare global {
  interface Window { startupReads: { count: number; chars: number; dates: Set<string> } }
}

test('measure page startup with a realistic multi-month local history', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+08:00'));
  await page.addInitScript(() => {
    window.startupReads = { count: 0, chars: 0, dates: new Set() };
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function measureRecordRead(key: string): string | null {
      const value = get.call(this, key);
      if (this === localStorage && /^study-v11:guest:\d{4}-\d{2}-\d{2}$/.test(key)) {
        window.startupReads.count += 1;
        window.startupReads.chars += value?.length ?? 0;
        if (value) window.startupReads.dates.add(key.slice(-10));
      }
      return value;
    };
  });
  await page.goto('/privacy.html');
  const fixture = await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    let chars = 0;
    for (let offset = 0; offset < 156; offset += 1) {
      const day = new Date(Date.UTC(2026, 10, 5 - offset)).toISOString().slice(0, 10);
      const items = Array.from({ length: 12 }, (_, index) => ({
        id: `source-${index}`, type: index === 11 ? 'englishVocabInteractive' : 'scienceReview',
        title: index === 11 ? '英文單字' : `物理｜讀書項目 ${index + 1}`, source: 'preset', required: true,
        done: index % 3 === 0, minutes: '25', checkedOn: index % 3 === 0 ? day : '',
        f: { subject: '物理', material: '新關鍵', start: String(index * 3 + 1), end: String(index * 3 + 3),
          progress: false, graded: false, corrected: false, calendarFocus: '保留章節與頁碼對照；驗證已存的內容。'.repeat(3),
          ...(index === 11 ? { words: ['ability', 'apple', 'cell', 'dog'].map(text => ({ id: text, text, noun: true, translationsByPartOfSpeech: { noun: ['中文翻譯'] } })) } : {}),
        },
      }));
      const payload = { schemaVersion: 2, date: day, mood: '普通', wakeHour: '7', wakeMinute: '20', notes: '歷史讀書紀錄'.repeat(50), items };
      const raw = JSON.stringify({ ...payload, serverRevision: 2, localDirty: false, syncConflict: false, syncBase: payload });
      chars += raw.length;
      localStorage.setItem('study-v11:guest:' + day, raw);
    }
    return { days: 156, chars };
  });
  const metrics = [];
  for (const url of ['/privacy.html', '/todo.html', '/summary.html', '/material.progress.html', '/vocabulary.review.html', '/']) {
    const started = performance.now();
    await page.goto(url);
    await expect(page.locator('[data-rail-days]')).toHaveText('4');
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const readyMs = Math.round(performance.now() - started);
    metrics.push(await page.evaluate(({ url, readyMs }) => ({
      page: url, readyMs, nodes: document.querySelectorAll('*').length,
      readCount: window.startupReads.count, charsRead: window.startupReads.chars, datesRead: window.startupReads.dates.size,
      editors: document.querySelectorAll('[data-todo-range]').length,
    }), { url, readyMs }));
  }
  console.log('STARTUP_MEASUREMENTS', JSON.stringify({ fixture, metrics }));
  await testInfo.attach('startup-measurements', { body: JSON.stringify({ fixture, metrics }, null, 2), contentType: 'application/json' });
  expect(metrics.find(row => row.page === '/privacy.html')!.datesRead).toBeLessThanOrEqual(7);
  const todo = metrics.find(row => row.page === '/todo.html')!;
  expect(todo.editors).toBe(0);
  expect(todo.nodes).toBeLessThan(5_000);
  expect(todo.readCount).toBeLessThan(200);
  expect(metrics.find(row => row.page === '/')!.readCount).toBeLessThan(220);
  await page.goto('/privacy.html?date=2026-08-05');
  await expect(page.locator('[data-rail-date]')).toHaveText('08.05');
  await expect(page.locator('[data-rail-days]')).toHaveText('7');
  await expect(page.locator('[data-rail-overdue-count]')).toHaveText('21 項');
  expect(await page.evaluate(() => window.startupReads.dates.size)).toBeLessThanOrEqual(14);
});
