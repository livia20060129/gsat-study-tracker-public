import { expect, test, type Page } from '@playwright/test';
import { expandTodoCard, showLongTermTodoCards } from './helpers/todoCard.ts';

const prefix = 'study-v11:guest:';
declare global { interface Window { optimizationReads: number; optimizationMetadataSeen: boolean } }

async function seed(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+08:00'));
  await page.addInitScript(() => {
    window.optimizationReads = 0;
    window.optimizationMetadataSeen = false;
    window.addEventListener('storage', event => {
      if (event.key === 'study-v11:meta:unrelated-review-test') window.optimizationMetadataSeen = true;
    });
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function count(key: string): string | null {
      if (/^study-v11:guest:\d{4}-\d{2}-\d{2}$/.test(key)) window.optimizationReads++;
      return original.call(this, key);
    };
  });
  await page.goto('/privacy.html');
  await page.evaluate(prefix => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    for (let offset = 1; offset <= 60; offset++) {
      const date = new Date(Date.UTC(2026, 10, 5 - offset)).toISOString().slice(0, 10);
      localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, notes: '保留筆記', items: [
        { id: 'science', type: 'scienceReview', title: '物理｜新關鍵', source: 'preset', required: true, done: false, minutes: '20',
          f: { subject: '物理', material: '新關鍵', start: '10', end: '12', progress: false } },
        { id: 'words', type: 'englishVocabInteractive', source: 'custom', required: false, done: true,
          f: { words: [{ text: 'cell', noun: true, translationsByPartOfSpeech: { noun: ['細胞'] } }, { text: 'celebrate', verb: true, translation: '慶祝' }] } },
      ] }));
    }
  }, prefix);
}

test('long-term cards mount on first opening and retain their editor and draft through closing and reopening', async ({ page }) => {
  await seed(page);
  await page.goto('/todo.html#natural');
  await expect(page.locator('#todoRecentList .todo-card')).toHaveCount(30);
  await expect(page.locator('#todoLongTermCount')).toHaveText('30 項');
  await expect(page.locator('#todoLongTermList .todo-card')).toHaveCount(0);
  await showLongTermTodoCards(page);
  const card = page.locator('#todoLongTermList .todo-card').first();
  await expandTodoCard(card);
  const input = card.locator('[data-todo-range="end"]');
  const handle = await input.elementHandle();
  await input.fill('17');
  await input.blur();
  const summary = page.locator('#todoLongTerm > summary');
  await summary.click();
  await expect(page.locator('#todoLongTerm')).not.toHaveAttribute('data-disclosure-motion');
  await summary.click();
  await expect(page.locator('#todoLongTerm')).not.toHaveAttribute('data-disclosure-motion');
  await expect(input).toHaveValue('17');
  expect(await handle!.evaluate(node => node.isConnected)).toBe(true);
});

test('another tab changes one history date without rereading every day or replacing an unrelated card', async ({ page, context }) => {
  await seed(page);
  await page.goto('/todo.html#natural');
  const unchanged = page.locator('#todoRecentList .todo-card').first();
  const handle = await unchanged.elementHandle();
  const second = await context.newPage();
  await second.goto('/privacy.html');
  await page.evaluate(() => { window.optimizationReads = 0; });
  await second.evaluate(prefix => {
    const key = prefix + '2026-11-03';
    const record = JSON.parse(localStorage.getItem(key)!);
    record.items[0].f.end = '19';
    localStorage.setItem(key, JSON.stringify(record));
  }, prefix);
  const changed = page.locator('.todo-card').filter({ has: page.locator('[data-record-date="2026-11-03"]') });
  await expect(changed.locator('.todo-range-summary')).toContainText('p.10–19');
  expect(await page.evaluate(() => window.optimizationReads)).toBeLessThan(20);
  expect(await handle!.evaluate(node => node.isConnected)).toBe(true);
  await second.close();
});

test('search reuses matching vocabulary cards and unrelated edits retain an open editor and dictionary candidates', async ({ page }) => {
  await seed(page);
  await page.goto('/vocabulary.review.html');
  const row = page.locator('.vocabulary-row[data-entry-key="cell"]');
  const node = await row.elementHandle();
  await page.locator('#vocabularySearch').fill('ce');
  await expect(page.locator('#visibleVocabularyCount')).toHaveText('2 個');
  await page.locator('#vocabularySearch').fill('cell');
  await expect(page.locator('#visibleVocabularyCount')).toHaveText('1 個');
  expect(await node!.evaluate(element => element.isConnected)).toBe(true);
  await row.getByRole('button', { name: '編輯「cell」', exact: true }).click();
  await expect(row).not.toHaveAttribute('data-disclosure-motion');
  await row.locator('[data-dictionary-lookup]').click();
  await expect(row.locator('[data-dictionary-meaning]')).not.toHaveCount(0);
  const meaning = await row.locator('[data-dictionary-meaning]').first().elementHandle();
  await page.locator('#vocabularySearch').fill('cel');
  await expect(page.locator('#visibleVocabularyCount')).toHaveText('2 個');
  expect(await meaning!.evaluate(element => element.isConnected)).toBe(true);
  await row.locator('[data-dictionary-meaning]').first().check();
  await expect(row.locator('[data-dictionary-apply]')).toBeEnabled();
});

test('summary ignores unrelated storage metadata and updates a changed original date completion', async ({ page, context }) => {
  await seed(page);
  await page.goto('/summary.html');
  const second = await context.newPage();
  await second.goto('/privacy.html');
  await page.evaluate(() => { window.optimizationReads = 0; });
  await second.evaluate(() => localStorage.setItem('study-v11:meta:unrelated-review-test', '1'));
  await expect.poll(() => page.evaluate(() => window.optimizationMetadataSeen)).toBe(true);
  expect(await page.evaluate(() => window.optimizationReads)).toBeLessThan(15);
  await second.evaluate(prefix => {
    const key = prefix + '2026-11-03';
    const record = JSON.parse(localStorage.getItem(key)!);
    record.items[0].done = true;
    record.items[0].checkedOn = '2026-11-04';
    localStorage.setItem(key, JSON.stringify(record));
  }, prefix);
  await expect(page.locator('#summaryCompletedItems')).toContainText('物理');
  expect(await page.evaluate(() => window.optimizationReads)).toBeLessThan(20);
  await second.close();
});
