import { expect, test, type Page } from '@playwright/test';

const DAYS = 32;
const PREFIX = 'study-v11:guest:';

declare global {
  interface Window {
    runtimeWork: { dateReads: number; serializedRecords: number; cardInsertions: number };
  }
}

async function seedHistory(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+08:00'));
  await page.addInitScript(() => {
    window.runtimeWork = { dateReads: 0, serializedRecords: 0, cardInsertions: 0 };
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function countDateReads(key: string): string | null {
      if (this === localStorage && /^study-v11:guest:\d{4}-\d{2}-\d{2}$/.test(key)) window.runtimeWork.dateReads += 1;
      return getItem.call(this, key);
    };
    const stringify = JSON.stringify;
    JSON.stringify = function countRecordCopies(value, replacer, space): string {
      if (value?.date && Array.isArray(value.items)) window.runtimeWork.serializedRecords += 1;
      if (typeof replacer === 'function') return stringify(value, replacer, space);
      return stringify(value, replacer, space);
    };
    new MutationObserver(function countCardInsertions(mutations): void {
      for (const mutation of mutations) {
        if (mutation.target instanceof HTMLElement && ['todoRecentList', 'todoLongTermList'].includes(mutation.target.id)
          && [...mutation.addedNodes].some(node => node instanceof HTMLElement && node.matches('.todo-card'))) {
          window.runtimeWork.cardInsertions += 1;
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/privacy.html');
  await page.evaluate(({ days, prefix }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    for (let index = 0; index < days; index += 1) {
      const date = new Date(Date.UTC(2026, 10, 4 - index)).toISOString().slice(0, 10);
      const words = index < 2 ? [{ text: 'cell', noun: true, translation: '細胞' }] : [{ text: `unrelated ${index}`, noun: true }];
      localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, notes: '保留原始筆記'.repeat(30), items: [
        ...[1, 2, 3, 4].map(number => ({ id: `science-${number}`, type: 'scienceReview', title: `物理｜新關鍵 ${number}`,
          source: 'preset', required: true, done: false, minutes: '20',
          f: { subject: '物理', material: '新關鍵', start: String(number), end: String(number + 1), progress: false } })),
        { id: 'words', type: 'englishVocabInteractive', done: true, source: 'custom', required: false, f: { words } },
      ] }));
    }
  }, { days: DAYS, prefix: PREFIX });
}

test('batch skipping reads only each affected day and mounts new lists in batches', async ({ page }, testInfo) => {
  await seedHistory(page);
  await page.goto('/todo.html#natural');
  await expect(page.locator('.todo-card')).toHaveCount(30 * 4);
  await expect(page.locator('#todoLongTermCount')).toHaveText(`${(DAYS - 30) * 4} 項`);
  const initial = await page.evaluate(() => window.runtimeWork);
  await page.evaluate(() => { window.runtimeWork.dateReads = 0; });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#todoBatchSkip').click();
  await expect(page.locator('.todo-card')).toHaveCount(0);
  await expect(page.locator('#todoFeedback')).toContainText(`已跳過自然 ${DAYS * 4} 項`);
  const after = await page.evaluate(() => window.runtimeWork);
  console.log('BATCH_RUNTIME_WORK', JSON.stringify({ initial, after }));
  await testInfo.attach('batch-runtime-work', { body: JSON.stringify({ initial, after }), contentType: 'application/json' });
  expect(initial.cardInsertions).toBeLessThanOrEqual(2);
  expect(after.dateReads).toBeLessThanOrEqual(DAYS * 4 + 14);
  const saved = await page.evaluate(({ prefix }) => JSON.parse(localStorage.getItem(prefix + '2026-11-04')!), { prefix: PREFIX });
  expect(saved.notes).toBe('保留原始筆記'.repeat(30));
  expect(saved.items.slice(0, 4).every((item: { f: { overdueSkippedOn: string }; done: boolean }) => item.f.overdueSkippedOn === '2026-11-05' && !item.done)).toBe(true);
});

test('vocabulary marks copy only the dates containing that entry and retain duplicate updates', async ({ page }, testInfo) => {
  await seedHistory(page);
  await page.goto('/vocabulary.review.html');
  const row = page.locator('.vocabulary-row[data-entry-key="cell"]');
  await expect(row).toBeVisible();
  await page.evaluate(() => { window.runtimeWork.serializedRecords = 0; });
  await row.getByRole('button', { name: '標註整張卡片「cell」', exact: true }).click();
  await expect(row.locator('[data-star-key="card"]')).toHaveAttribute('aria-pressed', 'true');
  const work = await page.evaluate(() => window.runtimeWork);
  console.log('VOCABULARY_RUNTIME_WORK', JSON.stringify(work));
  await testInfo.attach('vocabulary-runtime-work', { body: JSON.stringify(work), contentType: 'application/json' });
  expect(work.serializedRecords).toBeLessThan(20);
  const saved = await page.evaluate(({ prefix }) => ['2026-11-04', '2026-11-03', '2026-11-02']
    .map(date => JSON.parse(localStorage.getItem(prefix + date)!)), { prefix: PREFIX });
  for (const record of saved.slice(0, 2)) expect(record.items[4].f.words[0].vocabularyStars.card).toBe(true);
  expect(saved[2].items[4].f.words[0].vocabularyStars).toBeUndefined();
});
