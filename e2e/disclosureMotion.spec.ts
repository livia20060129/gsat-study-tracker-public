import { expect, test, type Locator, type Page } from '@playwright/test';
import { expandTodoCard } from './helpers/todoCard.ts';

interface Samples { start: number; middle: number; end: number; error?: string; openAtMiddle?: boolean }
declare global { interface Window { disclosureSamples?: Promise<Samples> } }

async function sampleMotion(page: Page, selector: string, trigger: Locator, screenshot?: string): Promise<Samples> {
  await page.evaluate(({ selector, hold }) => {
    window.disclosureSamples = new Promise(resolve => {
      document.addEventListener('click', function observeClick(): void {
        queueMicrotask(function sampleBeforeNextPaint(): void {
          const panel = document.querySelector<HTMLElement>(selector)!;
          const animations = panel.getAnimations({ subtree: true }).filter(animation => animation.id.startsWith('study-disclosure-'));
          const height = animations.find(animation => animation.id === 'study-disclosure-height');
          if (!height) { resolve({ start: 0, middle: 0, end: 0, error: 'No height transition was created.' }); return; }
          const duration = Number(height.effect!.getTiming().duration);
          function frame(time: number): number {
            animations.forEach(animation => { animation.pause(); animation.currentTime = time; });
            return panel.getBoundingClientRect().height;
          }
          const start = frame(0), middle = frame(duration / 2);
          const openAtMiddle = panel instanceof HTMLDetailsElement ? panel.open : undefined;
          const end = frame(duration);
          if (hold) frame(duration / 2);
          else animations.forEach(animation => animation.finish());
          resolve({ start, middle, end, openAtMiddle });
        });
      }, { once: true });
    });
  }, { selector, hold: Boolean(screenshot) });
  await trigger.click();
  const samples = await page.evaluate(() => window.disclosureSamples!);
  if (screenshot && !samples.error) {
    expect(await page.locator(selector).evaluate(node => {
      const footer = node.querySelector('.todo-actions');
      if (!footer) return true;
      const top = footer.getBoundingClientRect().top;
      return [...node.querySelectorAll('.todo-record-grid,.todo-progress-editor,.todo-time-editor,.todo-control-field')].every(editor => {
        if (editor.getBoundingClientRect().bottom > top - 8) return true;
        const inset = getComputedStyle(editor).clipPath.match(/^inset\((.+)\)$/)?.[1].split(/\s+/);
        return !inset || Number.parseFloat(inset[2] ?? inset[0]) <= 0.5;
      });
    })).toBe(true);
    await page.locator(selector).screenshot({ path: screenshot, animations: 'allow' });
    await page.locator(selector).evaluate(node => {
      node.getAnimations({ subtree: true }).filter(animation => animation.id.startsWith('study-disclosure-')).forEach(animation => animation.finish());
    });
  }
  return samples;
}

function expectSmooth(samples: Samples, opening: boolean): void {
  expect(samples.error).toBeUndefined();
  if (opening) {
    expect(samples.middle).toBeGreaterThan(samples.start + 1);
    expect(samples.middle).toBeLessThan(samples.end - 1);
  } else {
    expect(samples.middle).toBeLessThan(samples.start - 1);
    expect(samples.middle).toBeGreaterThan(samples.end + 1);
  }
}

async function seedTodo(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+08:00'));
  await page.goto('/todo.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    for (const date of ['2026-11-04', '2026-09-01']) localStorage.setItem('study-v11:guest:' + date, JSON.stringify({ date, items: [{
      id: 'motion-science', type: 'scienceReview', title: '物理動畫', source: 'preset', required: true, done: false, minutes: '20',
      f: { subject: '物理', material: '新關鍵', start: '10', end: '12', progress: false },
    }] }));
  });
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await expect(page.locator('#todoLongTermCount')).toHaveText('1 項');
}

test('routine and completion explanations visibly expand and collapse without changing recorded input', async ({ page }) => {
  await page.goto('/');
  for (const selector of ['#routineDisclosure', '.completion-notes']) {
    const panel = page.locator(selector);
    const trigger=selector==='#routineDisclosure'?page.locator('#todayStatusToggle'):panel.locator(':scope > summary');
    expectSmooth(await sampleMotion(page, selector, trigger), true);
    if(selector==='#routineDisclosure')await expect(trigger).toHaveAttribute('aria-expanded','true');
    else await expect(panel).toHaveAttribute('open', '');
    if (selector === '#routineDisclosure') {
      await page.locator('#wakeHour').fill('7');
      await page.locator('#wakeMinute').fill('20');
      await page.locator('#wakeMinute').blur();
    }
    const closing = await sampleMotion(page, selector, trigger);
    expectSmooth(closing, false);
    if(selector==='#routineDisclosure')await expect(panel).toBeHidden();
    else {expect(closing.openAtMiddle).toBe(true);await expect(panel).not.toHaveAttribute('open');}
    if (selector === '#routineDisclosure') {
      await expect(page.locator('#wakeHour')).toHaveValue('7');
      await expect(page.locator('#wakeMinute')).toHaveValue('20');
    }
  }
});

test('dynamically rendered chapter references and weekly sections use the same disclosure motion', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+08:00'));
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-11-05', JSON.stringify({ date: '2026-11-05', items: [{
      id: 'motion-reference', type: 'scienceReview', title: '物理課程', source: 'preset', required: true, done: false, minutes: '',
      f: { subject: '物理', material: '新關鍵', start: '19', end: '38' },
    }, {
      id: 'motion-weekly', type: 'extra', title: '本週閱讀', source: 'preset', required: true, done: false, minutes: '',
      f: { title: 'ACE Reading', round: '3', calendarRoute: 'week' },
    }] }));
  });
  await page.reload();
  const selector = '[data-item="motion-reference"] .study-reference-details';
  const panel = page.locator(selector);
  await expect(panel).toBeVisible();
  expectSmooth(await sampleMotion(page, selector, panel.locator(':scope > summary')), false);
  expectSmooth(await sampleMotion(page, selector, panel.locator(':scope > summary')), true);
  await page.locator('[data-study-items-view="week"]').click();
  const weekly = page.locator('.weekly-day').first();
  await expect(weekly).toBeVisible();
  expectSmooth(await sampleMotion(page, '.weekly-day', weekly.locator(':scope > summary')), false);
  expectSmooth(await sampleMotion(page, '.weekly-day', weekly.locator(':scope > summary')), true);
});

test('todo cards and long-term overdue sections animate both ways and preserve page edits', async ({ page }, testInfo) => {
  await seedTodo(page);
  const selector = '#todoRecentList .todo-card';
  const card = page.locator(selector);
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expectSmooth(await sampleMotion(page, selector, card.locator('h3'), testInfo.outputPath(`todo-motion-${width}-midpoint.png`)), true);
    await card.locator('[data-todo-range="end"]').fill('18');
    await card.locator('[data-todo-range="end"]').blur();
    expectSmooth(await sampleMotion(page, selector, card.locator('.todo-expand')), false);
    await expect(card.locator('.todo-range-summary')).toHaveText('新關鍵｜p.10–18');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expectSmooth(await sampleMotion(page, '#todoLongTerm', page.locator('#todoLongTerm > summary')), true);
  expectSmooth(await sampleMotion(page, '#todoLongTerm', page.locator('#todoLongTerm > summary')), false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('study-v11:guest:2026-11-04')!).items[0].f.end)).toBe('18');
});

test('todo editor content exists during opening, and mobile bounds are checked after motion cleanup', async ({ page }) => {
  await seedTodo(page);
  await page.setViewportSize({ width: 393, height: 852 });
  const card = page.locator('#todoRecentList .todo-card');
  await card.evaluate(node => {
    node.ownerDocument.addEventListener('click', function holdOpening(): void {
      queueMicrotask(() => {
        for (const animation of node.getAnimations({ subtree: true })) {
          if (animation.id.startsWith('study-disclosure-')) {
            animation.pause(); animation.currentTime = 80;
          }
        }
      });
    }, { once: true });
  });
  await card.locator('h3').click();
  await expect(card.locator('.todo-record-grid')).toContainText('新關鍵');
  await expect(card.locator('[data-todo-completion-date]')).toHaveCount(1);
  await expect(card).toHaveAttribute('data-disclosure-motion', 'opening');
  expect(await card.evaluate(node => node.getAnimations()
    .some(animation => animation.id === 'study-disclosure-height' && animation.playState === 'paused'))).toBe(true);
  await card.evaluate(node => node.getAnimations({ subtree: true })
    .filter(animation => animation.id.startsWith('study-disclosure-')).forEach(animation => animation.finish()));
  await expandTodoCard(card);
  const bounds = await card.evaluate(node => {
    const date = node.querySelector('[data-todo-completion-date]')!.getBoundingClientRect();
    const actions = node.querySelector('.todo-actions')!.getBoundingClientRect();
    const controls = node.querySelector('.todo-card-controls')!.getBoundingClientRect();
    return { dateBottom: date.bottom, actionsTop: actions.top, actionsRight: actions.right,
      controlsRight: controls.right, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth };
  });
  expect(bounds.actionsTop).toBeGreaterThanOrEqual(bounds.dateBottom);
  expect(bounds.actionsRight).toBeLessThanOrEqual(bounds.controlsRight + 1);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);
  await expect(card.locator('[data-todo-range="end"]')).toHaveValue('12');
});

test('catalog editor opening and management closing animate while retaining the unsaved draft', async ({ page }) => {
  await page.goto('/material.progress.html');
  await page.locator('#materialsPanel > summary').click();
  await page.locator('#toggleMaterialEditing').click();
  expectSmooth(await sampleMotion(page, '#catalogEditor', page.locator('#newMaterial')), true);
  await page.locator('#catalogTitle').fill('Motion draft');
  expectSmooth(await sampleMotion(page, '#catalogEditor', page.locator('#toggleMaterialEditing')), false);
  await expect(page.locator('#catalogEditor')).toBeHidden();
  expectSmooth(await sampleMotion(page, '#catalogEditor', page.locator('#toggleMaterialEditing')), true);
  await expect(page.locator('#catalogTitle')).toHaveValue('Motion draft');
  expectSmooth(await sampleMotion(page, '#catalogEditor', page.locator('#cancelCatalogEdit')), false);
});

test('vocabulary edit panels animate expansion and collapse and keep saved English and translation', async ({ page }) => {
  await page.goto('/vocabulary.review.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-11-04', JSON.stringify({ date: '2026-11-04', items: [{
      id: 'words', type: 'englishVocabInteractive', done: false, minutes: '', f: { words: [
        { id: 'alternate', text: 'alternate', noun: true, translation: '候補者', translationsByPartOfSpeech: { noun: ['候補者'] } },
      ] },
    }] }));
  });
  await page.reload();
  const selector = '.vocabulary-row[data-entry-key="alternate"]';
  expectSmooth(await sampleMotion(page, selector, page.locator(selector).locator('[data-edit-entry]')), true);
  expectSmooth(await sampleMotion(page, selector, page.locator(selector).locator('[data-edit-entry]')), false);
  await expect(page.locator(selector)).toContainText('候補者');
});

test('rapid reversals start at the painted height, resizing settles naturally and reduced motion skips effects', async ({ page }) => {
  await seedTodo(page);
  const longTerm = page.locator('#todoLongTerm');
  await longTerm.locator('summary').click();
  await longTerm.evaluate(node => {
    const animation = node.getAnimations().find(animation => animation.id === 'study-disclosure-height')!;
    animation.pause(); animation.currentTime = 80;
    node.setAttribute('data-before-reverse', String(node.getBoundingClientRect().height));
    document.addEventListener('click', function observeReversal(): void {
      queueMicrotask(function readFirstReversedFrame(): void {
        const reversed = node.getAnimations().find(animation => animation.id === 'study-disclosure-height')!;
        reversed.pause(); reversed.currentTime = 0;
        node.setAttribute('data-after-reverse', String(node.getBoundingClientRect().height));
      });
    }, { once: true });
  });
  await longTerm.locator('summary').click({ force: true });
  expect(await longTerm.evaluate(node => Math.abs(Number(node.getAttribute('data-after-reverse')) - Number(node.getAttribute('data-before-reverse'))))).toBeLessThan(1.5);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(longTerm).not.toHaveAttribute('data-disclosure-motion');
  await expect(longTerm).not.toHaveAttribute('open');
  for (const open of [true, false]) {
    await longTerm.locator('summary').click();
    await longTerm.evaluate(node => {
      node.getAnimations().find(animation => animation.id === 'study-disclosure-height')?.cancel();
    });
    await expect(longTerm).not.toHaveAttribute('data-disclosure-motion');
    expect(await longTerm.evaluate(node => (node as HTMLDetailsElement).open)).toBe(open);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await longTerm.locator('summary').click();
  await expect(longTerm).toHaveAttribute('open', '');
  expect(await longTerm.evaluate(node => node.getAnimations().filter(animation => animation.id.startsWith('study-disclosure-')).length)).toBe(0);
  await page.locator('#todoRecentList .todo-card h3').click();
  await expect(page.locator('#todoRecentList .todo-card')).not.toHaveAttribute('data-disclosure-motion');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
