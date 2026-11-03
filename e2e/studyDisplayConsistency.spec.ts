import { selectStudyDate } from './helpers/siteNavigation.ts';
import { expectCardHierarchy } from './helpers/studyCardHierarchy.ts';
import { expandTodoCard } from './helpers/todoCard.ts';
import { expect, test, type Page } from '@playwright/test';
import { UNLOCK_3_BOOK } from '../src/data/bookPageMaps.ts';
import type { StudyItem } from '../src/types.ts';

const date = '2026-08-09';
const prefix = 'study-v11:guest:';

function preset(id: string, type: string, title: string, key: string, f: StudyItem['f']): StudyItem {
  return { id, type, title, presetKey: key, f, source: 'preset', required: true, done: false, minutes: '' };
}

function fixtures(): StudyItem[] {
  return [
    preset('display-unlock', 'extra', 'Unlock 3｜Unit 2 The environment（1/2）', 'cal_book_unlock_display',
      { title: UNLOCK_3_BOOK, book: UNLOCK_3_BOOK, scopeKind: 'pages', start: '36', end: '46' }),
    preset('display-azar', 'extra', 'Azar英文文法（中階）｜Ch.6 名詞與代名詞', 'cal_azar_display',
      { title: 'Azar英文文法（中階）', start: '160', end: '164' }),
    preset('display-grammar', 'extra', '英文｜英文文法總複習｜Ch.6 假設語氣', 'cal_grammar_display',
      { title: '英文文法總複習講義', start: '84', end: '91', calendarGrammarTitle: 'Ch.6 假設語氣', calendarFocus: 'if only、as if', calendarRangeText: 'p.84–91' }),
    preset('display-ace', 'extra', '英文｜ACE Reading 第 46 回', 'cal_ace_display', { title: 'ACE Reading', round: '46' }),
    preset('display-gujin', 'chineseReading', '國文｜古今悅讀一百 第 76 回', 'cal_gujin_display', { kind: 'reading', round: '76' }),
    preset('display-listening', 'extra', '英文｜大考英聽A攻略 Test 10', 'cal_listening_a_display', { title: '大考英聽A攻略', round: '10' }),
    preset('display-writing', 'extra', '英文｜英文寫作測驗 第 20 回', 'cal_writing_display', { title: '英文寫作測驗', round: '20' }),
    preset('display-unit', 'extra', '英文｜自訂單元教材｜Unit 2–3', 'cal_scope_unit_display', { title: '自訂單元教材', scopeKind: 'unit', unitStart: '2', unitEnd: '3', calendarEventId: 'unit-display' }),
    preset('display-round', 'extra', '英文｜自訂回次教材 第 4–5 回', 'cal_scope_round_display', { title: '自訂回次教材', scopeKind: 'round', round: '4', roundEnd: '5', calendarEventId: 'round-display' }),
    preset('display-math', 'mathStudy', '數學｜新關鍵｜p.101–103', 'cal_math_display', { material: '新關鍵', book: '1~2', start: '101', end: '103', calendarMathMaterialLocked: true }),
    preset('display-science', 'scienceReview', '生物｜新關鍵', 'cal_natural_display', { subject: '生物', material: '新關鍵', start: '4', end: '16' }),
    { ...preset('display-selector', 'extra', '英文｜ACE Reading 第 12 回', '', { title: 'ACE Reading', round: '12' }), source: 'custom' },
  ];
}

async function seed(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-11-01T12:00:00+08:00'));
  await page.goto('/summary.html');
  await page.evaluate(({ prefix, date, items }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, items }));
  }, { prefix, date, items: fixtures() });
  await page.goto('/');
  await selectStudyDate(page, date);
}

test('all book, page, Unit and round templates have a single visible identity and range on desktop and mobile', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await seed(page);
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const unlock = page.locator('[data-item="display-unlock"]');
    const text = await unlock.innerText();
    expect(text.match(/Unlock 3/g)).toHaveLength(1);
    expect(text.match(/Unit 2/g)).toHaveLength(1);
    expect(text.match(/The environment/g)).toHaveLength(1);
    await expect(unlock.locator('.study-reference-details')).toBeHidden();
    await expect(unlock.locator('[data-field="start"]')).toBeEditable();
    await expect(unlock.locator('[data-field="end"]')).toBeEditable();
    for (const id of ['ace', 'gujin', 'listening', 'writing']) {
      const card = page.locator(`[data-item="display-${id}"]`);
      await expect(card.locator('.english-title-half')).toBeHidden();
      await expect(card.locator('[data-check="progress"]')).toBeVisible();
    }
    for (const id of ['unit', 'round']) {
      const card = page.locator(`[data-item="display-${id}"]`);
      await expect(card.locator('.item-title')).not.toContainText(/Unit 2|第 4/);
      await expect(card.locator('.study-reference-details')).toBeHidden();
      await expect(card.locator('input[data-field]').first()).toBeEditable();
    }
    const grammar = page.locator('[data-item="display-grammar"]');
    await expect(grammar.locator('[data-grammar-auto]')).toHaveText('Review 2（Chapter 4–Chapter 6）');
    await expect(grammar).not.toContainText('建議頁碼');
    await expect(grammar).toContainText('if only、as if');
    await expect(page.locator('[data-item="display-azar"] .study-reference-details')).toBeHidden();
    const math = page.locator('[data-item="display-math"]');
    await expect(math.locator('.item-title')).not.toContainText('p.101');
    await expect(math.locator('[data-math-auto]')).not.toContainText('p.');
    await expect(math.locator('[data-field="start"]')).toBeEditable();
    const manual = page.locator('[data-item="display-selector"]');
    await expect(manual.locator('select[data-field="title"]')).toBeEnabled();
    await expect(manual.locator('.item-title')).toHaveText('英文');
    await expect(manual.locator('[data-field="round"]')).toHaveValue('12');
    const science = page.locator('[data-item="display-science"]');
    await expect(science.locator('[data-field="material"]')).toBeEnabled();
    await expect(science.locator('[data-science-auto]')).toBeVisible();
    await expect(science.locator('[data-science-auto]')).not.toContainText(/p\.4|p\.9/);
    for (const id of ['unlock', 'azar', 'grammar', 'ace', 'gujin', 'listening', 'writing', 'unit', 'round', 'math', 'science', 'selector']) {
      await expectCardHierarchy(page, `[data-item="display-${id}"]`, ':scope > .item-top .item-title');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await unlock.screenshot({ path: testInfo.outputPath(`unlock-single-identity-${width}.png`) });
    await page.locator('[data-item="display-ace"]').screenshot({ path: testInfo.outputPath(`ace-text-hierarchy-${width}.png`) });
    await grammar.screenshot({ path: testInfo.outputPath(`grammar-single-range-${width}.png`) });
  }
});

test('editing pages reveals new chapter mappings and restores deduplication without losing saves or source metadata', async ({ page }) => {
  await seed(page);
  const card = page.locator('[data-item="display-unlock"]');
  await expect(card.locator('.study-reference-details')).toBeHidden();
  await card.locator('[data-field="end"]').fill('79');
  await card.locator('[data-field="start"]').fill('58');
  await card.locator('[data-field="start"]').blur();
  await expect(card.locator('.study-reference-details')).toBeVisible();
  await expect(card.locator('[data-book-topic-auto]')).toHaveText('Unit 3');
  await expect(card.locator('[data-book-detail-auto]')).toHaveText('Transport');
  await card.locator('[data-minutes]').fill('19');
  await card.locator('[data-minutes]').blur();
  await card.locator('[data-check="graded"]').check();
  await card.locator('[data-done]').check();
  await page.reload();
  await selectStudyDate(page, date);
  await expect(card.locator('[data-field="start"]')).toHaveValue('58');
  await expect(card.locator('[data-field="end"]')).toHaveValue('79');
  await expect(card.locator('[data-minutes]')).toHaveValue('19');
  await expect(card.locator('[data-check="graded"]')).toBeChecked();
  await expect(card.locator('[data-done]')).toBeChecked();
  await card.locator('[data-field="start"]').fill('36');
  await card.locator('[data-field="end"]').fill('46');
  await card.locator('[data-field="end"]').blur();
  await expect(card.locator('.study-reference-details')).toBeHidden();
  const saved = await page.evaluate(({ prefix, date }) => {
    const record = JSON.parse(localStorage.getItem(prefix + date)!);
    return record.items.find((item: StudyItem) => item.id === 'display-unlock');
  }, { prefix, date });
  expect(saved.f.title).toBe(UNLOCK_3_BOOK);
  expect(saved.title).toBe('Unlock 3｜Unit 2 The environment（1/2）');
});

test('todo uses single book labels and editable numbered ranges and still saves to the original card', async ({ page }) => {
  await seed(page);
  await page.goto('/todo.html');
  await page.locator('#todoLongTerm > summary').click();
  const unlock = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="display-unlock"]') });
  await expandTodoCard(unlock);
  await expect(unlock).toBeVisible();
  expect((await unlock.innerText()).match(/Unlock 3/g)).toHaveLength(1);
  const card = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="display-round"]') });
  await expandTodoCard(card);
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(card.locator('h3')).toHaveText('英文｜自訂回次教材');
    await expect(card.locator('[data-todo-range="start"]')).toBeEditable();
    await expect(card.locator('[data-todo-range="end"]')).toBeEditable();
    await expectCardHierarchy(page, '.todo-card:has([data-item-id="display-round"])', 'h3');
    expect((await card.innerText()).match(/自訂回次教材/g)).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await card.locator('[data-todo-range="end"]').fill('6');
  await card.locator('[data-todo-range="end"]').blur();
  await page.goto('/');
  await selectStudyDate(page, date);
  await expect(page.locator('[data-item="display-round"] [data-field="roundEnd"]')).toHaveValue('6');
});
