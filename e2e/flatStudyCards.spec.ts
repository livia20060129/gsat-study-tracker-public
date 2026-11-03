import { expandTodoCard } from './helpers/todoCard.ts';
import { selectStudyDate } from './helpers/siteNavigation.ts';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEEP_FIFTEEN_BOOK } from '../src/data/bookPageMaps.ts';
import type { StudyItem } from '../src/types.ts';

const prefix = 'study-v11:guest:';
const date = '2026-11-01';
const calendarTopic = 'Calendar 主題只保留在原始資料';
const calendarDescription = 'Google Calendar API：1-2｜數列與級數｜【講義版本】新關鍵 【頁碼範圍】p.101–103 【識別碼】GSAT-NEWKEY-MATH-20261010';

function studyItem(id: string, type: string, fields: StudyItem['f']): StudyItem {
  return { id, type, title: id, source: 'custom', required: false, done: false, minutes: '', f: fields };
}

async function seed(page: Page, items: StudyItem[], recordDate = date): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-11-01T12:00:00+08:00'));
  // Seed from a read-only page so Tracker's departure save cannot replace the fixture.
  await page.goto('/summary.html');
  await page.evaluate(({ prefix, date, items }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, items }));
  }, { prefix, date: recordDate, items });
  await page.goto('/');
  await selectStudyDate(page, recordDate);
}

async function expectRangeOnOneRow(card: Locator, startSelector: string, endSelector: string): Promise<void> {
  const start = card.locator(startSelector);
  const end = card.locator(endSelector);
  await expect(start).toBeVisible();
  await expect(start).toBeEditable();
  await expect(end).toBeVisible();
  await expect(end).toBeEditable();
  const first = await start.boundingBox();
  const last = await end.boundingBox();
  const bounds = await card.boundingBox();
  expect(first).not.toBeNull();
  expect(last).not.toBeNull();
  expect(bounds).not.toBeNull();
  expect(Math.abs(first!.y - last!.y)).toBeLessThan(2);
  expect(first!.x + first!.width).toBeLessThanOrEqual(last!.x);
  expect(first!.x).toBeGreaterThanOrEqual(bounds!.x);
  expect(last!.x + last!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
}

test('flat page and Unit cards keep ranges editable while references omit Calendar topics and stay current', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const items = [
    studyItem('flat-math', 'mathStudy', { material: '教學講義', book: '1', start: '10', end: '12',
      calendarPlanTitle: calendarTopic, calendarUnitPages: 10, calendarWeekTarget: 5, calendarDailyPages: 2,
      calendarSuggestedBook: '1', calendarSuggestedStart: '10', calendarSuggestedEnd: '12' }),
    studyItem('flat-science', 'scienceReview', { subject: '生物', material: '新關鍵', start: '72', end: '82', calendarTopic }),
    studyItem('flat-english', 'extra', { title: 'Azar英文文法（中階）', start: '18', end: '21', calendarTopic }),
    studyItem('flat-chinese', 'chineseReading', { kind: 'book', book: DEEP_FIFTEEN_BOOK, start: '8', end: '25' }),
    studyItem('flat-unit', 'extra', { title: '自訂 Unit 教材', unitStart: '2', unitEnd: '3' }),
  ];
  items[1].description = calendarDescription;
  items[2].description = '保留學習說明｜' + calendarDescription;
  await seed(page, items);
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const item of items) {
      const card = page.locator(`#itemList [data-item="${item.id}"]`);
      const reference = card.locator('.study-reference-details');
      await expect(reference).toHaveCount(1);
      await expect(reference).toHaveAttribute('open', '');
      if (item.id === 'flat-unit') {
        await expect(reference).toBeHidden();
        await expectRangeOnOneRow(card, '[data-field="unitStart"]', '[data-field="unitEnd"]');
        continue;
      }
      await expect(reference.locator('.study-reference-content')).toBeVisible();
      await expect(reference.locator('input, select, textarea, button')).toHaveCount(0);
      await expect(reference).not.toContainText(calendarTopic);
      await expect(reference).not.toContainText('Google Calendar');
      await expect(reference).not.toContainText('建議進度');
      await expect(reference).not.toContainText('建議頁碼');
      await expect(card).not.toContainText('Google Calendar API');
      await reference.locator('summary').click();
      await expect(reference.locator('.study-reference-content')).toBeHidden();
      const keys = item.id === 'flat-unit' ? ['unitStart', 'unitEnd'] : ['start', 'end'];
      await expectRangeOnOneRow(card, `[data-field="${keys[0]}"]`, `[data-field="${keys[1]}"]`);
      if (item.id === 'flat-science') await expect(card.locator('select[data-field="subject"]')).toBeEnabled();
      const surface = await card.evaluate(element => {
        const style = getComputedStyle(element);
        const field = getComputedStyle(element.querySelector('.field')!);
        return { background: style.backgroundColor, stripe: style.borderLeftWidth, shadow: style.boxShadow,
          fieldBorder: field.borderTopWidth, fieldBackground: field.backgroundColor };
      });
      const backgrounds: Record<string, string> = {
        'flat-math': 'rgb(251, 244, 229)', 'flat-science': 'rgb(238, 246, 242)',
        'flat-english': 'rgb(245, 241, 247)', 'flat-chinese': 'rgb(250, 241, 239)', 'flat-unit': 'rgb(245, 241, 247)',
      };
      expect(surface).toEqual({ background: backgrounds[item.id], stripe: '4px', shadow: 'none',
        fieldBorder: '0px', fieldBackground: 'rgba(0, 0, 0, 0)' });
      await reference.locator('summary').click();
      await expect(reference.locator('.study-reference-content')).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const card = page.locator('#itemList [data-item="flat-science"]');
  const oldReference = await card.locator('[data-science-auto]').textContent();
  await card.locator('[data-field="end"]').fill('97');
  await card.locator('[data-field="end"]').blur();
  await expect(card.locator('[data-science-auto]')).not.toHaveText(oldReference!);
  await card.locator('[data-minutes]').fill('22');
  await card.locator('[data-minutes]').blur();
  await card.locator('[data-check="progress"]').check();
  await card.locator(':scope > .item-top > [data-done]').check();
  await expect(card.locator('[data-completion-date]')).toBeVisible();
  await page.reload();
  await expect(card.locator('[data-field="end"]')).toHaveValue('97');
  await expect(card.locator('[data-minutes]')).toHaveValue('22');
  await expect(card.locator('[data-check="progress"]')).toBeChecked();
  await expect(card.locator(':scope > .item-top > [data-done]')).toBeChecked();
  await expect(card.locator('.study-reference-details')).toHaveAttribute('open', '');
  await expect(card.locator('[data-science-auto]')).toBeVisible();
  const storedTopic = await page.evaluate(({ prefix, date }) => {
    const record = JSON.parse(localStorage.getItem(prefix + date)!);
    return record.items.find((item: StudyItem) => item.id === 'flat-science').f.calendarTopic;
  }, { prefix, date });
  expect(storedTopic).toBe(calendarTopic);
  expect(await page.evaluate(({ prefix, date }) => {
    const record = JSON.parse(localStorage.getItem(prefix + date)!);
    return record.items.find((item: StudyItem) => item.id === 'flat-science').description;
  }, { prefix, date })).toBe(calendarDescription);
  await expect(page.locator('#itemList [data-item="flat-english"] .item-desc')).toHaveText('保留學習說明');
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await card.screenshot({ path: testInfo.outputPath(`flat-card-${width}.png`) });
  }
});

test('nested natural subjects display their names once and retain desktop/mobile layout and independent controls', async ({ page }, testInfo) => {
  const recordDate = '2026-10-24';
  const integration = studyItem('flat-integration', 'scienceReview', { subject: '混合', calendarNaturalIntegration: true, calendarTopic });
  integration.f.calendarIntegrationEntries = ['生物', '化學', '物理', '地科'].map(subject => ({
    id: `natural-integration-${recordDate}-${subject}`, type: 'scienceReview', title: subject,
    subject, material: '123日的淬鍊', required: true, done: false, minutes: '',
    source: 'calendarNaturalIntegration', calendarIntegrationChild: true,
    ranges: [[10, 12]], pageText: 'p.10–12', chapterText: '測試章節',
    f: { subject, material: '123日的淬鍊' },
  }));
  integration.source = 'preset';
  integration.required = true;
  integration.presetKey = 'cal_natural_20261024';
  await seed(page, [integration], recordDate);
  await page.setViewportSize({ width: 320, height: 852 });
  const biology = page.locator(`[data-item="natural-integration-${recordDate}-生物"]`);
  const chemistry = page.locator(`[data-item="natural-integration-${recordDate}-化學"]`);
  for (const width of [1280, 721, 720, 375, 320]) {
    await page.setViewportSize({ width, height: 852 });
    for (const subject of ['生物', '化學', '物理', '地科']) {
      const card = page.locator(`[data-item="natural-integration-${recordDate}-${subject}"]`);
      await expect(card.locator('.item-title')).toHaveText(subject);
      const row = card.locator('.science-integration-row');
      await expect(row.getByText('科目', { exact: true })).toHaveCount(0);
      await expect(row.getByText(subject, { exact: true })).toHaveCount(0);
      await expect(row.getByText('123日的淬鍊', { exact: true })).toBeVisible();
      if (width > 720) {
        const fields = await row.locator(':scope > .field').evaluateAll(elements => elements.map(element => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, left: rect.left, right: rect.right };
        }));
        const bounds = (await row.boundingBox())!;
        expect(fields.length).toBeGreaterThanOrEqual(2);
        expect(fields.every(field => Math.abs(field.top - fields[0].top) < 1)).toBe(true);
        expect(Math.abs(fields[0].left - bounds.x)).toBeLessThan(1);
        expect(Math.abs(fields[fields.length - 1].right - bounds.x - bounds.width)).toBeLessThan(1);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1280) {
      await biology.screenshot({ path: testInfo.outputPath('natural-subject-1280.png') });
    }
  }
  const style = await biology.evaluate(element => {
    const style = getComputedStyle(element);
    return { border: style.borderLeftWidth, radius: style.borderRadius, shadow: style.boxShadow };
  });
  expect(style).toEqual({ border: '0px', radius: '0px', shadow: 'none' });
  await biology.locator(':scope > .item-top > [data-done]').check();
  await biology.locator('[data-minutes]').fill('12.5');
  await biology.locator('[data-minutes]').blur();
  await expect(chemistry.locator(':scope > .item-top > [data-done]')).not.toBeChecked();
  const details = biology.locator('.study-reference-details');
  await expect(details).toHaveAttribute('open', '');
  await expect(details).not.toContainText(calendarTopic);
  await expect(details.locator('.study-reference-content')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await biology.screenshot({ path: testInfo.outputPath('flat-natural-320.png') });
  await page.reload();
  await selectStudyDate(page, recordDate);
  await expect(biology.locator(':scope > .item-top > [data-done]')).toBeChecked();
  await expect(biology.locator('[data-minutes]')).toHaveValue('12.5');
  await expect(chemistry.locator(':scope > .item-top > [data-done]')).not.toBeChecked();
});

test('Calendar cards omit repeated readonly book names while preserving selectors, ranges and saved data', async ({ page }, testInfo) => {
  const recordDate = '2026-08-09';
  const definitions = [
    { id: 'identity-azar', type: 'extra', presetKey: 'cal_azar_identity', title: 'Azar英文文法（中階）｜Ch.6 名詞與代名詞',
      f: { title: 'Azar英文文法（中階）', start: '160', end: '164' } },
    { id: 'identity-grammar', type: 'extra', presetKey: 'cal_grammar_identity', title: '英文｜英文文法總複習｜Ch.6 假設語氣',
      f: { title: '英文文法總複習講義', start: '78', end: '83', calendarGrammarTitle: 'Ch.6 假設語氣' } },
    { id: 'identity-reading', type: 'chineseReading', presetKey: 'cal_gujin_identity', title: '國文｜古今悅讀一百 第 76 回',
      f: { kind: 'reading', round: '76' } },
    { id: 'identity-unit', type: 'extra', presetKey: 'cal_scope_identity', title: '英文｜自訂 Unit 教材｜Unit 2–3',
      f: { title: '自訂 Unit 教材', unitStart: '2', unitEnd: '3', calendarEventId: 'identity-unit' } },
  ];
  const items: StudyItem[] = definitions.map(definition => ({ ...definition, source: 'preset', required: true,
    done: false, minutes: '' }));
  items.push(studyItem('identity-editable', 'extra', { title: 'Azar英文文法（中階）', start: '18', end: '21' }));
  items.push({ ...studyItem('identity-material', 'mathStudy', { material: '新關鍵', book: '1~2', start: '101', end: '103',
    calendarMathMaterialLocked: true }), source: 'preset', presetKey: 'cal_math_identity' });
  await seed(page, items, recordDate);
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const definition of definitions) {
      const card = page.locator(`[data-item="${definition.id}"]`);
      await expect(card.locator('.item-title')).toBeVisible();
      await expect(card.locator('.inner').getByText('書名', { exact: true })).toBeHidden();
      await expect(card.locator('.study-fields-deduplicated')).toHaveCount(1);
      if (definition.id === 'identity-unit') {
        await expect(card.locator('[data-field="unitStart"]')).toBeEditable();
        await expect(card.locator('[data-field="unitEnd"]')).toBeEditable();
      } else if (definition.type === 'extra') {
        await expect(card.locator('[data-field="start"]')).toBeEditable();
        await expect(card.locator('[data-field="end"]')).toBeEditable();
      } else {
        await expect(card.locator('.inner').getByText('第 76 回', { exact: true })).toBeHidden();
        await expect(card.locator('.item-title .study-heading-range')).toHaveText('第 76 回');
      }
    }
    await expect(page.locator('[data-item="identity-editable"] select[data-field="title"]')).toBeEnabled();
    await expect(page.locator('[data-item="identity-material"] .fixed-book-value').filter({ hasText: /^新關鍵$/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const azar = page.locator('[data-item="identity-azar"]');
  await azar.locator('[data-field="end"]').fill('165');
  await azar.locator('[data-field="end"]').blur();
  await azar.locator('[data-minutes]').fill('19');
  await azar.locator('[data-minutes]').blur();
  await azar.locator('[data-done]').check();
  await page.reload();
  await selectStudyDate(page, recordDate);
  await expect(azar.locator('[data-field="end"]')).toHaveValue('165');
  await expect(azar.locator('[data-minutes]')).toHaveValue('19');
  await expect(azar.locator('[data-done]')).toBeChecked();
  await expect(azar.locator('.inner').getByText('書名', { exact: true })).toBeHidden();
  expect(await page.evaluate(({ prefix, date }) => {
    const record = JSON.parse(localStorage.getItem(prefix + date)!);
    return record.items.find((item: StudyItem) => item.id === 'identity-azar').f.title;
  }, { prefix, date: recordDate })).toBe('Azar英文文法（中階）');
  await page.setViewportSize({ width: 1280, height: 900 });
  await azar.screenshot({ path: testInfo.outputPath('single-book-title-1280.png') });
});

test('flat todo cards preserve direct range edits and synchronize them back to the original card', async ({ page }) => {
  const original = studyItem('flat-todo', 'scienceReview', { subject: '生物', material: '新關鍵', start: '72', end: '82' });
  original.source = 'preset';
  original.required = true;
  original.description = calendarDescription;
  await seed(page, [original], '2026-10-29');
  await page.setViewportSize({ width: 320, height: 852 });
  await page.goto('/todo.html');
  const todo = page.locator('.todo-card').filter({ has: page.locator('[data-item-id="flat-todo"]') });
  await expandTodoCard(todo);
  await expect(todo).toBeVisible();
  await expect(todo).not.toContainText('Google Calendar API');
  await expect(todo).not.toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(todo).toHaveCSS('border-left-width', '4px');
  await expect(page.locator('.study-record-section')).toHaveCSS('border-top-width', '0px');
  const end = todo.locator('[data-todo-range="end"]');
  await expect(end).toBeEditable();
  await end.fill('97');
  await end.blur();
  await page.reload();
  await expandTodoCard(todo);
  await expect(end).toHaveValue('97');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/');
  await selectStudyDate(page, '2026-10-29');
  const card = page.locator('[data-item="flat-todo"]');
  await expect(card.locator('[data-field="end"]')).toHaveValue('97');
  await expect(card.locator('[data-field="start"]')).toBeVisible();
  await expect(card.locator('.study-reference-details')).toHaveAttribute('open', '');
  await expect(card).not.toContainText('Google Calendar API');
});
