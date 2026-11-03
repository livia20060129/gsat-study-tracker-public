import { navigateSite, selectStudyDate } from './helpers/siteNavigation.ts';
import { expect, test } from '@playwright/test';
import { clickConnectionToggle } from './helpers/connectionMotion.ts';
import { expandTodoCard } from './helpers/todoCard.ts';

test('legal pages switch languages and preserve the choice across navigation', async ({ page }) => {
  await page.goto('/privacy.html?lang=zh');
  await expect(page.locator('.header-inner h1:visible')).toHaveText('隱私權政策');
  await expect(page.locator('[data-legal-panel="zh-Hant"]')).toBeVisible();
  await expect(page.locator('[data-legal-panel="en"]')).toBeHidden();

  await page.locator('[data-legal-language="en"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-legal-panel="en"]')).toBeVisible();
  await expect(page).toHaveTitle('Privacy Policy | GSAT Study Tracker');
  await expect(page.locator('.header-inner h1:visible')).toHaveText('Privacy Policy');
  await expect(page).toHaveURL(/lang=en/);

  await page.goto('/terms.html');
  await expect(page.locator('[data-legal-panel="en"]')).toBeVisible();
  await expect(page).toHaveTitle('Terms of Service | GSAT Study Tracker');
  await expect(page.locator('.header-inner h1:visible')).toHaveText('Terms of Service');

  await page.goto('/support.html');
  await expect(page.locator('[data-legal-panel="en"]')).toBeVisible();
  await expect(page).toHaveTitle('User Support | GSAT Study Tracker');
  await expect(page.locator('.header-inner h1:visible')).toHaveText('User Support');
  await page.locator('[data-legal-language="zh-Hant"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page.locator('[data-legal-panel="zh-Hant"]')).toBeVisible();
  await expect(page.locator('.header-inner h1:visible')).toHaveText('使用者支援');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBounds = await page.locator('.document, .language-switch').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right };
  }));
  expect(mobileBounds[1].left).toBeGreaterThanOrEqual(mobileBounds[0].left);
  expect(mobileBounds[1].right).toBeLessThanOrEqual(mobileBounds[0].right);
});

const pageErrors = new WeakMap<object, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => { errors.push(error.message); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '每日讀書完成度紀錄卡' })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

test('overdue task page filters subjects and persists skip without marking completion', async ({ page }) => {
  await page.goto('/summary.html');
  await page.evaluate(() => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
    const date = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}${date}`, JSON.stringify({
      date,
      items: [
        {
          id: 'todo-english', type: 'extra', title: '英文閱讀', done: false,
          minutes: '', required: true, source: 'preset',
          f: { title: 'ACE Reading', subject: '英文', book: 'ACE Reading', round: '12', topic: '閱讀測驗', progress: true },
        },
        {
          id: 'todo-math', type: 'mathStudy', title: '數學講義', done: false,
          minutes: '', required: true, source: 'preset',
          f: { subject: '數學A', calendarSuggestedStart: 31, calendarSuggestedEnd: 57 },
        },
        {
          id: 'todo-done', type: 'scienceReview', title: '已完成自然', done: true,
          minutes: '', required: true, source: 'preset', f: { subject: '物理' },
        },
        {
          id: 'todo-deferred', type: 'chineseReading', title: '已延期國文', done: false,
          minutes: '', required: true, source: 'preset', deferred: true, deferredTargetDay: 5,
          f: { subject: '國文' },
        },
        {
          id: 'todo-english-review', type: 'general', presetKey: 'weekday_english_review',
          title: '英文訂正與搭配詞整理', done: false, minutes: '', required: true, source: 'preset', f: {},
        },
        {
          id: 'todo-math-practice', type: 'mathPractice', presetKey: 'sat_math_practice',
          title: '數學講義題目：理解檢查＋錯題標記＋訂正', done: false, minutes: '12', required: true, source: 'preset',
          f: { material: '新關鍵', book: '1~2', start: '10', end: '12', corrected: false },
        },
      ],
    }));
  });

  await page.goto('/');
  await navigateSite(page, 'todo.html');
  await expect(page.getByRole('heading', { name: '待辦事項' })).toBeVisible();
  await expect(page.locator('.todo-card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: '英文訂正與搭配詞整理' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '數學講義題目：理解檢查＋錯題標記＋訂正' })).toHaveCount(0);
  expect(await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => {
      if (!/^study-v11:guest:\d{4}-\d{2}-\d{2}$/.test(key)) return false;
      return JSON.parse(localStorage.getItem(key)!).items?.some((item: { id: string }) => item.id === 'todo-math-practice');
    });
    return key ? JSON.parse(localStorage.getItem(key)!).items.find((item: { id: string }) => item.id === 'todo-math-practice') : null;
  })).toMatchObject({ done: false, minutes: '12', f: { corrected: false } });
  await expect(page.locator('#todoSummary')).toHaveText('共有 2 項待辦');

  await page.getByRole('tab', { name: '英文' }).click();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await expect(page.locator('.todo-card')).toContainText('英文閱讀');
  await page.locator('.todo-card h3').click();
  await expect(page.locator('.todo-record-grid')).toContainText('ACE Reading');
  await expect(page.locator('.todo-record-grid')).toContainText('閱讀測驗');
  await page.setViewportSize({ width: 393, height: 852 });
  const mobileControlBounds = await page.locator('.todo-card').evaluate(node => {
    const date = node.querySelector<HTMLInputElement>('[data-todo-completion-date]')?.getBoundingClientRect();
    const actions = node.querySelector<HTMLElement>('.todo-actions')?.getBoundingClientRect();
    const controls = node.querySelector<HTMLElement>('.todo-card-controls')?.getBoundingClientRect();
    return {
      dateBottom: date?.bottom ?? 0,
      actionsTop: actions?.top ?? 0,
      actionsRight: actions?.right ?? 0,
      controlsRight: controls?.right ?? 0,
      cardClientWidth: node.clientWidth,
      cardScrollWidth: node.scrollWidth,
    };
  });
  expect(mobileControlBounds.actionsTop).toBeGreaterThanOrEqual(mobileControlBounds.dateBottom);
  expect(mobileControlBounds.actionsRight).toBeLessThanOrEqual(mobileControlBounds.controlsRight + 1);
  expect(mobileControlBounds.cardScrollWidth).toBeLessThanOrEqual(mobileControlBounds.cardClientWidth);
  await page.setViewportSize({ width: 1280, height: 720 });
  const progress = page.locator('[data-todo-progress="progress"]');
  await expect(progress).toBeChecked();
  await progress.uncheck();
  await expect.poll(async () => page.evaluate(() => {
    for (const key of Object.keys(localStorage).filter(value => value.startsWith('study-v11:guest:2026-'))) {
      const record = JSON.parse(localStorage.getItem(key) ?? '{}');
      const item = record.items?.find((entry: { id: string }) => entry.id === 'todo-english');
      if (item) return item.f?.progress;
    }
    return null;
  })).toBe(false);

  await page.getByRole('button', { name: '計時' }).click();
  await page.getByRole('button', { name: '開始' }).click();
  await page.waitForTimeout(1_100);
  await expect(page.locator('[data-todo-timer-display]')).not.toHaveText('00:00');
  await page.getByRole('button', { name: '完成計時' }).click();

  const minutes = page.getByLabel('英文閱讀的學習時間');
  await minutes.fill('25.5');
  await minutes.dispatchEvent('change');
  await expect(page.locator('#todoFeedback')).toContainText('25.5 分鐘');
  const completionDate = await page.getByLabel('英文閱讀的完成日期').inputValue();
  await page.getByRole('button', { name: '標記完成 英文閱讀' }).click();
  await expect(page.locator('#todoEmpty')).toBeVisible();
  await expect(page.locator('#todoFeedback')).toContainText(`完成日期為 ${completionDate}`);
  await expect(page.locator('#todoHistoryList')).toContainText('英文閱讀');
  await expect.poll(async () => page.evaluate(() => {
    for (const key of Object.keys(localStorage).filter(value => value.startsWith('study-v11:guest:2026-'))) {
      const record = JSON.parse(localStorage.getItem(key) ?? '{}');
      const item = record.items?.find((entry: { id: string }) => entry.id === 'todo-english');
      if (item) return { done: item.done, checkedOn: item.checkedOn, minutes: item.minutes };
    }
    return null;
  })).toEqual({ done: true, checkedOn: completionDate, minutes: '25.5' });

  await page.getByRole('button', { name: '復原' }).click();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await expect(page.getByLabel('英文閱讀的學習時間')).toHaveValue('25.5');
  await page.getByRole('button', { name: '跳過 英文閱讀' }).click();
  await expect(page.locator('#todoEmpty')).toBeVisible();
  await expect(page.locator('#todoFeedback')).toContainText('原排程日期仍保留未完成紀錄');

  await expect.poll(async () => page.evaluate(() => {
    for (const key of Object.keys(localStorage).filter(value => value.startsWith('study-v11:guest:2026-'))) {
      const record = JSON.parse(localStorage.getItem(key) ?? '{}');
      const item = record.items?.find((entry: { id: string }) => entry.id === 'todo-english');
      if (item) return { skipped: Boolean(item.f?.overdueSkippedOn), done: item.done, localDirty: record.localDirty };
    }
    return null;
  })).toEqual({ skipped: true, done: false, localDirty: true });

  await page.getByRole('button', { name: '復原' }).click();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await page.getByRole('button', { name: '跳過 英文閱讀' }).click();
  await page.reload();
  await expect(page.getByRole('tab', { name: '英文' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#todoEmpty')).toBeVisible();
  await expect(page.locator('#todoHistoryList')).toContainText('英文閱讀');
  await expect(page.getByRole('button', { name: '復原 英文閱讀' })).toBeVisible();

  await page.getByRole('tab', { name: '數學' }).click();
  await expect(page.locator('.todo-card')).toContainText('數學講義');
  await page.locator('.todo-card h3').click();
  const mathStart = page.getByLabel('數學講義的起始頁');
  const mathEnd = page.getByLabel('數學講義的結束頁');
  await expect(mathStart).toHaveValue('31');
  await expect(mathEnd).toHaveValue('57');
  await mathEnd.fill('30');
  await mathEnd.dispatchEvent('change');
  await expect(mathEnd).toHaveValue('31');
  await expect.poll(async () => page.evaluate(() => {
    for (const key of Object.keys(localStorage).filter(value => value.startsWith('study-v11:guest:2026-'))) {
      const record = JSON.parse(localStorage.getItem(key) ?? '{}');
      const item = record.items?.find((entry: { id: string }) => entry.id === 'todo-math');
      if (item) return item.f?.end ?? item.f?.calendarSuggestedEnd;
    }
    return null;
  })).toBe('31');
  await mathStart.fill('33');
  await mathStart.dispatchEvent('change');
  await mathEnd.fill('60');
  await mathEnd.dispatchEvent('change');
  await page.reload();
  await expandTodoCard(page.locator('.todo-card'));
  await expect(page.getByLabel('數學講義的起始頁')).toHaveValue('33');
  await expect(page.getByLabel('數學講義的結束頁')).toHaveValue('60');
  await page.getByRole('tab', { name: '自然' }).click();
  await expect(page.locator('#todoEmpty')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const switchBounds = await page.locator('#subjectSwitch').evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewport: document.documentElement.clientWidth };
  });
  expect(switchBounds.left).toBeGreaterThanOrEqual(0);
  expect(switchBounds.right).toBeLessThanOrEqual(switchBounds.viewport);
});

test('todo timer runs for a source item duplicated inside a merged card', async ({ page }) => {
  await page.goto('/summary.html');
  await page.evaluate(() => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
    const date = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const prefix = 'study-v11:guest:';
    const source = {
      id: 'todo-merged-timer', type: 'extra', title: '合併卡片計時測試',
      done: false, minutes: '', required: true, source: 'preset', f: { title: 'ACE Reading', subject: '英文' },
    };
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}${date}`, JSON.stringify({
      date,
      items: [{
        id: 'todo-merged-parent', type: 'general', title: '合併卡片',
        done: false, minutes: '', required: false, source: 'summary',
        f: {
          dailyWorkSourceItems: [source],
          groupedWorkEntries: [{
            id: 'todo-merged-child', type: 'general', title: '合併子項目',
            done: false, minutes: '', required: false, source: 'groupedWork',
            f: { dailyWorkSourceItems: [structuredClone(source)] },
          }],
        },
      }],
    }));
  });

  await page.goto('/todo.html');
  const card = page.locator('.todo-card').filter({ hasText: '合併卡片計時測試' });
  await expect(card).toHaveCount(1);
  await card.locator('h3').click();
  await card.getByRole('button', { name: '計時', exact: true }).click();
  await expect(card.locator('[data-todo-timer-display]')).toHaveText('00:00');
  await card.getByRole('button', { name: '開始' }).click();
  await page.waitForTimeout(1_100);
  await expect(card.locator('[data-todo-timer-display]')).not.toHaveText('00:00');

  await page.reload();
  await card.locator('h3').click();
  await expect(card.getByRole('button', { name: '暫停' })).toBeVisible();
  await expect(card.locator('[data-todo-timer-display]')).not.toHaveText('00:00');
  await card.getByRole('button', { name: '暫停' }).click();
  await expect(card.getByRole('button', { name: '繼續' })).toBeVisible();
});

test('todo page re-reads an original-date completion when restored from browser history', async ({ page }) => {
  await page.goto('about:blank');
  await page.clock.install({ time: new Date('2026-08-10T12:00:00+08:00') });
  await page.goto('/summary.html');
  await page.evaluate(() => {
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}2026-08-09`, JSON.stringify({
      schemaVersion: 2,
      date: '2026-08-09',
      items: [{
        id: 'todo-origin-completion',
        type: 'extra',
        title: '原日期完成同步測試',
        done: false,
        minutes: '',
        required: true,
        source: 'preset',
        f: { subject: '英文', book: 'ACE Reading', topic: '閱讀測驗' },
      }],
    }));
  });

  await page.goto('/');
  await navigateSite(page, 'todo.html');
  await expect(page.locator('.todo-card').filter({ hasText: '原日期完成同步測試' })).toHaveCount(1);
  await page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('study-v11:guest:2026-08-09') || '{}');
    const item = record.items?.find((entry: { id: string }) => entry.id === 'todo-origin-completion');
    item.done = true;
    item.checkedOn = '2026-08-10';
    localStorage.setItem('study-v11:guest:2026-08-09', JSON.stringify(record));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page.locator('.todo-card').filter({ hasText: '原日期完成同步測試' })).toHaveCount(0);
  await expect(page.locator('#todoSummary')).toHaveText('共有 0 項待辦');
});

test('todo page preserves a focused manual-minute draft when leaving the original card', async ({ page }) => {
  await page.goto('about:blank');
  await page.clock.install({ time: new Date('2026-08-10T12:00:00+08:00') });
  await page.goto('/summary.html');
  await page.evaluate(() => {
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}2026-08-09`, JSON.stringify({
      schemaVersion: 2,
      date: '2026-08-09',
      items: [{
        id: 'todo-origin-minutes',
        type: 'extra',
        title: '原日期時間同步測試',
        done: false,
        minutes: '',
        required: true,
        source: 'preset',
        f: { subject: '英文', book: 'ACE Reading', topic: '閱讀測驗' },
      }],
    }));
  });
  await page.goto('/');
  await navigateSite(page, 'todo.html');
  await expandTodoCard(page.locator('.todo-card'));
  await expect(page.getByLabel('原日期時間同步測試的學習時間')).toHaveValue('');

  await page.goBack();
  const studyDate = page.locator('#studyDate');
  await selectStudyDate(page, '2026-08-09');
  const minutes = page.locator('[data-item="todo-origin-minutes"] [data-minutes]').first();
  await minutes.fill('37.5');

  await page.goForward();
  await expect(page.getByRole('heading', { name: '待辦事項' })).toBeVisible();
  await expandTodoCard(page.locator('.todo-card'));
  await expect(page.getByLabel('原日期時間同步測試的學習時間')).toHaveValue('37.5');
});

test('original card accepts the same page and rejects a reversed page range', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}2026-10-14`, JSON.stringify({
      schemaVersion: 2,
      date: '2026-10-14',
      items: [{
        id: 'ordered-page-range',
        type: 'mathStudy',
        title: '頁碼範圍驗證',
        done: false,
        minutes: '',
        required: true,
        source: 'custom',
        f: { material: '新關鍵', book: '1~2', start: '10', end: '20' },
      }],
    }));
  });
  await page.reload();
  await selectStudyDate(page, '2026-10-14');

  const card = page.locator('[data-item="ordered-page-range"]').last();
  const end = card.locator('[data-field="end"]');
  await end.fill('9');
  await end.blur();
  await expect(end).toHaveValue('10');
  await expect.poll(() => page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('study-v11:guest:2026-10-14') || '{}');
    return record.items?.find((item: { id: string }) => item.id === 'ordered-page-range')?.f?.end;
  })).toBe('10');

  await end.fill('10');
  await end.blur();
  await expect.poll(() => page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('study-v11:guest:2026-10-14') || '{}');
    const item = record.items?.find((candidate: { id: string }) => candidate.id === 'ordered-page-range');
    return [item?.f?.start, item?.f?.end];
  })).toEqual(['10', '10']);
});

test('checking correction preserves every other card and saves before revealing the reason field', async ({ page }) => {
  await page.evaluate(() => {
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}2026-10-02`, JSON.stringify({
      date: '2026-10-02',
      items: [
        {
          id: 'correction-target', type: 'extra', title: '訂正測試', done: false, minutes: '', required: false, source: 'custom',
          f: { title: 'ACE Reading', round: '3', progress: true, graded: true, corrected: false, reason: '' },
        },
        {
          id: 'correction-sibling', type: 'general', title: '其他項目', done: false, minutes: '18', required: false, source: 'custom',
          f: { progress: '必須保留' },
        },
      ],
    }));
  });
  await selectStudyDate(page, '2026-10-02');

  const target = page.locator('#itemList [data-item="correction-target"]');
  const sibling = page.locator('#itemList [data-item="correction-sibling"]');
  await expect(target).toBeVisible();
  await expect(sibling.locator('[data-field="progress"]')).toHaveValue('必須保留');
  await sibling.evaluate(node => { node.setAttribute('data-render-sentinel', 'preserved'); });

  await target.locator('[data-check="corrected"]').check();
  await expect(target.locator('[data-correction-reason]')).toBeVisible();
  await expect(sibling).toHaveAttribute('data-render-sentinel', 'preserved');
  await expect(sibling.locator('[data-field="progress"]')).toHaveValue('必須保留');
  await expect.poll(async () => page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('study-v11:guest:2026-10-02') ?? '{}');
    return record.items?.filter((item: { id: string }) => item.id.startsWith('correction-'))
      .map((item: { id: string; f: { corrected?: boolean; progress?: string | boolean } }) => ({
      id: item.id,
      corrected: item.f.corrected,
      progress: item.f.progress,
      }));
  })).toEqual([
    { id: 'correction-target', corrected: true, progress: true },
    { id: 'correction-sibling', corrected: undefined, progress: '必須保留' },
  ]);

  await page.reload();
  await selectStudyDate(page, '2026-10-02');
  await expect(target.locator('[data-check="corrected"]')).toBeChecked();
  await expect(sibling.locator('[data-field="progress"]')).toHaveValue('必須保留');
});

test('English vocabulary review sorts entries and persists editable parts of speech and translations', async ({ page }) => {
  await page.evaluate(() => {
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}2026-09-19`, JSON.stringify({
      date: '2026-09-19',
      items: [{
        id: 'words-one', type: 'englishVocabInteractive', done: false, minutes: '', required: false,
        f: { words: [{ text: 'novelty', noun: true }, { text: 'Leverage', verb: true }] },
      }],
    }));
    localStorage.setItem(`${prefix}2026-09-20`, JSON.stringify({
      date: '2026-09-20',
      items: [{
        id: 'words-two', type: 'general', done: false, minutes: '', required: false,
        f: { words: [
          { text: ' leverage ', noun: true },
          { text: 'pay an insurance premium', fixedCombination: true },
          { text: 'Practice makes perfect.', beautifulSentences: true },
        ] },
      }],
    }));
  });

  await navigateSite(page, 'vocabulary.review.html');
  await expect(page.getByRole('heading', { name: '英文單字複習' })).toBeVisible();
  await page.getByRole('button', { name: '隱藏中文', exact: true }).click();
  const links = page.locator('.vocabulary-word-link');
  await expect(links).toHaveCount(2);
  await expect(links).toHaveText(['Leverage', 'novelty']);
  await expect(page.locator('.vocabulary-letter-group')).toHaveCount(0);
  await expect(page.getByLabel('按詞性篩選單字')).toBeHidden();
  await expect(links.first()).toHaveAttribute(
    'href',
    'https://www.oxfordlearnersdictionaries.com/search/english/?q=Leverage',
  );
  await expect(links.first()).toHaveAttribute('target', '_blank');
  await page.getByRole('button', { name: '組合', exact: true }).click();
  await expect(links).toHaveText(['pay an insurance premium']);
  await expect(page.getByRole('group', { name: '單字排列方式' })).toBeHidden();
  const combinationRow = page.locator('.vocabulary-row[data-entry-key="pay an insurance premium"]');
  await expect(combinationRow.locator('.vocabulary-readonly-translations strong')).toHaveCount(0);
  await combinationRow.getByRole('button', { name: '編輯「pay an insurance premium」' }).click();
  await expect(combinationRow.getByRole('group', { name: '內容類型' })).toBeVisible();
  await expect(combinationRow.getByLabel('組合', { exact: true })).toBeChecked();
  await expect(combinationRow.locator('[data-vocabulary-pos]')).toHaveCount(0);
  await expect(combinationRow.locator('[data-vocabulary-translation]')).toHaveCount(1);
  await combinationRow.getByLabel('句子', { exact: true }).check();
  await expect(page.getByRole('group', { name: '複習內容類型' }).getByRole('button', { name: '句子' }))
    .toHaveAttribute('aria-pressed', 'true');
  await expect(combinationRow.getByLabel('句子', { exact: true })).toBeChecked();
  await expect.poll(async () => page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('study-v11:guest:2026-09-20') ?? '{}');
    return record.items?.[0]?.f?.words?.find((word: { text?: string }) => word.text === 'pay an insurance premium');
  })).toEqual(expect.objectContaining({ fixedCombination: false, beautifulSentences: true }));
  await page.reload();
  await page.getByRole('button', { name: '句子', exact: true }).click();
  await expect(combinationRow).toContainText('pay an insurance premium');
  await combinationRow.getByRole('button', { name: '編輯「pay an insurance premium」' }).click();
  await combinationRow.getByLabel('組合', { exact: true }).check();
  await expect(page.getByRole('group', { name: '複習內容類型' }).getByRole('button', { name: '組合' }))
    .toHaveAttribute('aria-pressed', 'true');
  await combinationRow.getByRole('button', { name: '完成「pay an insurance premium」' }).click();
  await page.getByRole('button', { name: '句子', exact: true }).click();
  await expect(links).toHaveText(['Practice makes perfect.']);
  await expect(page.locator('.vocabulary-row [data-vocabulary-pos]')).toHaveCount(0);
  await page.getByRole('button', { name: '單字', exact: true }).click();
  await expect(links).toHaveText(['Leverage', 'novelty']);
  await expect(page.getByText('🔥 記錄 2 次')).toBeVisible();
  await expect(page.getByText('最近紀錄')).toHaveCount(0);
  const leverageRow = page.locator('.vocabulary-row[data-entry-key="leverage"]');
  await expect(leverageRow.locator('[data-vocabulary-pos], [data-vocabulary-translation]')).toHaveCount(0);
  await expect(leverageRow.locator('.vocabulary-readonly-translations strong')).toHaveText(['Noun', 'Verb']);
  await leverageRow.getByRole('button', { name: '編輯「Leverage」' }).click();
  await expect(leverageRow.getByLabel('英文內容')).toHaveValue('Leverage');
  await leverageRow.getByLabel('英文內容').fill('Applied leverage');
  await leverageRow.getByLabel('英文內容').press('Tab');
  await expect(page.getByText('已儲存「Applied leverage」的整理資料')).toBeVisible();
  const renamedRow = page.locator('.vocabulary-row[data-entry-key="applied leverage"]');
  await expect(renamedRow.locator('.vocabulary-word-link')).toHaveText('Applied leverage');
  await page.reload();
  await renamedRow.getByRole('button', { name: '編輯「Applied leverage」' }).click();
  await renamedRow.getByLabel('英文內容').fill('Leverage');
  await renamedRow.getByLabel('英文內容').press('Tab');
  await expect(page.getByText('已儲存「Leverage」的整理資料')).toBeVisible();
  await expect(leverageRow.getByLabel('Noun', { exact: true })).toBeChecked();
  await expect(leverageRow.getByLabel('Verb', { exact: true })).toBeChecked();
  await leverageRow.getByLabel('Adjective', { exact: true }).check();
  while (await leverageRow.locator('[data-vocabulary-pos-translation="noun"]').count() > 1) {
    const count = await leverageRow.locator('[data-vocabulary-pos-translation="noun"]').count();
    await leverageRow.getByRole('button', { name: `刪除 Noun 第 ${count} 個翻譯`, exact: true }).click();
  }
  await leverageRow.getByLabel('Noun 中文翻譯 1', { exact: true }).fill('影響力');
  await leverageRow.getByLabel('Verb 中文翻譯 1', { exact: true }).fill('運用');
  await expect(page.getByText('已儲存「Leverage」的整理資料')).toBeVisible();
  await leverageRow.getByRole('button', { name: '完成「Leverage」' }).click();
  await expect(leverageRow.locator('[data-vocabulary-pos], [data-vocabulary-translation]')).toHaveCount(0);
  await expect(leverageRow.locator('.vocabulary-translation-counts')).toHaveCount(0);
  await expect(leverageRow.locator('.vocabulary-readonly-translations strong')).toHaveText(['Noun', 'Verb', 'Adjective']);
  const storedWords = await page.evaluate(() => ['2026-09-19', '2026-09-20'].map(date => {
    const record = JSON.parse(localStorage.getItem(`study-v11:guest:${date}`) ?? '{}');
    const word = record.items?.[0]?.f?.words?.find((candidate: { text?: string }) => (
      candidate.text?.trim().toLowerCase() === 'leverage'
    ));
    return { word, localDirty: record.localDirty };
  }));
  expect(storedWords).toEqual([
    { word: expect.objectContaining({ text: 'Leverage', noun: true, verb: true, adjective: true, translation: 'Noun：影響力；Verb：運用', translationsByPartOfSpeech: { noun: ['影響力'], verb: ['運用'], adjective: [''] } }), localDirty: true },
    { word: expect.objectContaining({ text: 'Leverage', noun: true, verb: true, adjective: true, translation: 'Noun：影響力；Verb：運用', translationsByPartOfSpeech: { noun: ['影響力'], verb: ['運用'], adjective: [''] } }), localDirty: true },
  ]);

  await page.getByRole('button', { name: '詞性', exact: true }).click();
  await expect(page.getByLabel('按詞性篩選單字')).toBeVisible();
  await page.getByRole('button', { name: 'Noun', exact: true }).click();
  await expect(page.locator('#vocabulary-group-noun .vocabulary-word-link')).toHaveText(['Leverage', 'novelty']);
  await expect(page.locator('#vocabulary-group-verb')).toHaveCount(0);
  await page.getByRole('button', { name: 'Verb', exact: true }).click();
  await expect(page.locator('#vocabulary-group-verb .vocabulary-word-link')).toHaveText(['Leverage']);
  await expect(page.locator('#vocabulary-group-noun')).toHaveCount(0);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.getByRole('button', { name: '字母排序', exact: true }).click();
  await expect(page.getByLabel('按詞性篩選單字')).toBeHidden();

  await page.getByRole('button', { name: '組合', exact: true }).click();
  await expect(page.locator('.vocabulary-word-link')).toHaveText(['pay an insurance premium']);
  await page.getByLabel('搜尋單字或詞性').fill('verb');
  await expect(page.locator('.vocabulary-word-link')).toHaveCount(0);
  await page.getByRole('button', { name: '單字', exact: true }).click();
  await expect(page.locator('.vocabulary-word-link')).toHaveText(['Leverage']);

  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await page.locator('.vocabulary-panel, .vocabulary-page-header').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right };
  }));
  expect(bounds.every(rect => rect.left >= 0 && rect.right <= 390)).toBe(true);
});

test.skip('mixed writing and timed mock on one date require a persisted exclusive choice', async ({ page }) => {
  await selectStudyDate(page, '2026-09-25');
  const choice = page.locator('#englishTaskChoice');
  await expect(choice).toBeVisible();
  await expect(page.locator('#dailyItemList .item-title', { hasText: '英文：混合題與作文練習' })).toHaveCount(0);
  await expect(page.locator('#dailyItemList .item-title', { hasText: '英文歷屆／模考：限時作答' })).toHaveCount(0);

  await choice.locator('[data-english-task-choice="mock"]').click();
  await expect(page.locator('#dailyItemList .item-title', { hasText: '英文歷屆／模考：限時作答' })).toHaveCount(1);
  await expect(page.locator('#dailyItemList .item-title', { hasText: '英文：混合題與作文練習' })).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('study-v11:guest:2026-09-25') || '{}').englishTaskChoice)).toBe('mock');

  await page.reload();
  await selectStudyDate(page, '2026-09-25');
  await expect(choice.locator('[data-english-task-choice="mock"]')).toHaveAttribute('aria-pressed', 'true');
  await selectStudyDate(page, '2026-09-26');
  await expect(page.locator('#dailyItemList .item-title', { hasText: '英文歷屆／模考：批改與訂正' })).toHaveCount(1);
  const correction = page.locator('#dailyItemList [data-item="preset-2026-09-26-sat_mock_correction"]');
  await correction.locator('[data-minutes]').fill('25');
  await correction.locator('[data-minutes]').blur();

  await selectStudyDate(page, '2026-09-25');
  await choice.locator('[data-english-task-choice="mixed"]').click();
  await expect(page.locator('#dailyItemList .item-title', { hasText: '英文：混合題與作文練習' })).toHaveCount(1);
  await expect(page.locator('#dailyItemList .item-title', { hasText: '英文歷屆／模考：限時作答' })).toHaveCount(0);
  await selectStudyDate(page, '2026-09-26');
  await expect(page.locator('#dailyItemList .item-title', { hasText: '英文歷屆／模考：批改與訂正' })).toHaveCount(0);
  const retained = await page.evaluate(() => JSON.parse(localStorage.getItem('study-v11:guest:2026-09-26') || '{}').items.find((item: { presetKey: string }) => item.presetKey === 'sat_mock_correction'));
  expect(retained.minutes).toBe('25');
  expect(retained.f.englishMockCorrectionInactive).toBe(true);

  await selectStudyDate(page, '2026-09-25');
  await choice.locator('[data-english-task-choice="mock"]').click();
  await selectStudyDate(page, '2026-09-26');
  await expect(correction.locator('[data-minutes]')).toHaveValue('25');
});

test.skip('math periods stack equally and share a centered panel with completion while the donut remains visible', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await selectStudyDate(page, '2026-09-20');
  for (const view of ['pages', 'completion']) {
    await page.locator(`[data-overview-metric="${view}"]`).click();
    const panel = page.locator(`[data-metric-panel="${view}"]`);
    await expect(panel).toHaveClass(/is-active/);
    await page.waitForTimeout(480);
    const position = await panel.evaluate(node => {
      const panelRect = node.getBoundingClientRect();
      const children = Array.from(node.children).map(child => child.getBoundingClientRect());
      const contentTop = Math.min(...children.map(rect => rect.top));
      const contentBottom = Math.max(...children.map(rect => rect.bottom));
      return {
        centerDifference: Math.abs((contentTop + contentBottom) / 2 - (panelRect.top + panelRect.bottom) / 2),
        horizontalDifference: Math.abs((children[0].left + children[0].right) / 2 - (panelRect.left + panelRect.right) / 2),
      };
    });
    expect(position.centerDifference).toBeLessThan(3);
    expect(position.horizontalDifference).toBeLessThan(3);
    await expect(page.locator('#subjectTimeDonut')).toBeVisible();
  }
  await expect(page.locator('#settlementMetrics')).toBeVisible();
  await expect(page.locator('.completion-notes')).not.toHaveAttribute('open');
  await page.locator('.completion-notes > summary').click();
  await expect(page.locator('.completion-notes p').first()).toBeVisible();
  await page.locator('[data-overview-metric="pages"]').click();
  const today = (await page.locator('#metricMathTodayPanel').boundingBox())!;
  const week = (await page.locator('#metricMathWeekPanel').boundingBox())!;
  expect(week.y).toBeGreaterThan(today.y + today.height);
  expect(await page.locator('#metricMathTodayPanel > strong').evaluate(node => getComputedStyle(node).fontSize))
    .toBe(await page.locator('#metricMathWeekPanel > strong').evaluate(node => getComputedStyle(node).fontSize));
});

test.skip('outside status keeps the daily schedule visible', async ({ page }) => {
  await selectStudyDate(page, '2026-09-16');
  const scheduledCards = page.locator('#dailyItemList .item');
  const countBefore = await scheduledCards.count();
  expect(countBefore).toBeGreaterThan(0);

  await page.locator('#mood').selectOption({ label: '外出' });
  await expect(scheduledCards).toHaveCount(countBefore);
  await expect(page.locator('#dailyNotice')).toContainText('原有排程仍保留');
  await expect(page.locator('#dailyNotice')).toContainText('不列入週／月完成率');
});

test('mobile nested natural timer stays inside its card', async ({ page }) => {
  const date = '2026-10-15';
  await page.evaluate(({ date }) => {
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}${date}`, JSON.stringify({
      date,
      items: [{
        id: 'mobile-natural-parent', type: 'scienceReview', title: '自然', done: false,
        minutes: '', required: true, source: 'preset', presetKey: 'cal_natural_mobile_layout',
        f: {
          subject: '混合', calendarNaturalIntegration: true,
          calendarIntegrationEntries: [{
            id: 'natural-integration-2026-10-15-生物', type: 'scienceReview', title: '生物',
            subject: '生物', done: false, minutes: '', required: true,
            source: 'calendarNaturalIntegration', calendarIntegrationChild: true,
            ranges: [[4, 135]], pageText: 'p.4–135', chapterText: 'Chapter 1 細胞的構造與功能',
            f: { subject: '生物', material: '123日的淬鍊' },
          }],
        },
      }],
    }));
  }, { date });
  await selectStudyDate(page, date);
  await page.setViewportSize({ width: 393, height: 852 });

  const child = page.locator('[data-item="natural-integration-2026-10-15-生物"]');
  await expect(child).toBeVisible();
  const bounds = await child.evaluate(node => {
    const card = node.getBoundingClientRect();
    const title = node.querySelector<HTMLElement>('.completion-title-block')?.getBoundingClientRect();
    const control = node.querySelector<HTMLElement>('.time-control')?.getBoundingClientRect();
    const minutes = node.querySelector<HTMLInputElement>('[data-minutes]')?.getBoundingClientRect();
    const modes = node.querySelector<HTMLElement>('.time-mode-segments')?.getBoundingClientRect();
    return {
      cardLeft: card.left,
      cardRight: card.right,
      titleBottom: title?.bottom ?? 0,
      controlTop: control?.top ?? 0,
      controlLeft: control?.left ?? 0,
      controlRight: control?.right ?? 0,
      minutesLeft: minutes?.left ?? 0,
      minutesRight: minutes?.right ?? 0,
      modesLeft: modes?.left ?? 0,
      cardClientWidth: node.clientWidth,
      cardScrollWidth: node.scrollWidth,
    };
  });
  expect(bounds.controlTop).toBeGreaterThanOrEqual(bounds.titleBottom);
  expect(bounds.controlLeft).toBeGreaterThanOrEqual(bounds.cardLeft);
  expect(bounds.controlRight).toBeLessThanOrEqual(bounds.cardRight);
  expect(bounds.minutesLeft).toBeGreaterThanOrEqual(bounds.controlLeft);
  expect(bounds.minutesRight).toBeLessThan(bounds.modesLeft);
  expect(bounds.cardScrollWidth).toBeLessThanOrEqual(bounds.cardClientWidth);
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
  await page.locator('.connection-settings-toggle').click();
  await expect(page.getByRole('button', { name: '忘記密碼' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重寄驗證信' })).toBeVisible();
  await page.getByRole('button', { name: '忘記密碼' }).click();
  await expect(page.locator('#cloudMessage')).toContainText('請先輸入');
});

test('mobile connection settings stay anchored to their scrolled position', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  // Native button fonts differ across platforms; the summary midpoint may hit Save.
  await page.addStyleTag({ content: '#saveBtn { font-size: 16px; }' });
  const openingFrame = await page.evaluate(() => {
    const settings = document.querySelector<HTMLDetailsElement>('#connectionSettings')!;
    const nextPanel = document.querySelector<HTMLElement>('.panel')!;
    window.scrollTo(0, Math.min(520, document.documentElement.scrollHeight - window.innerHeight));
    const scrollTop = window.scrollY;
    const collapsedRect = settings.getBoundingClientRect();
    const nextPanelTop = nextPanel.getBoundingClientRect().top;
    settings.querySelector<HTMLElement>('.connection-settings-toggle')!.click();
    const preparingRect = settings.getBoundingClientRect();
    return {
      backgroundShift: nextPanel.getBoundingClientRect().top - nextPanelTop,
      collapsedHeight: collapsedRect.height,
      collapsedTop: collapsedRect.top,
      preparing: settings.classList.contains('is-preparing'),
      preparingHeight: preparingRect.height,
      preparingTop: preparingRect.top,
      scrollTop,
      scrollTopAfterOpen: window.scrollY,
    };
  });
  expect(openingFrame.scrollTop).toBeGreaterThan(0);
  expect(openingFrame.scrollTopAfterOpen).toBe(openingFrame.scrollTop);
  expect(Math.abs(openingFrame.backgroundShift)).toBeLessThan(1);
  expect(openingFrame.preparing).toBe(true);
  expect(Math.abs(openingFrame.preparingTop - openingFrame.collapsedTop)).toBeLessThan(1);
  expect(Math.abs(openingFrame.preparingHeight - openingFrame.collapsedHeight)).toBeLessThan(1);
  await expect(page.locator('#connectionSettings')).toHaveAttribute('open', '');
  expect(await page.locator('#connectionSettings').evaluate(node => getComputedStyle(node).position)).toBe('fixed');
  await expect(page.locator('.connection-dock-placeholder')).toHaveClass(/is-active/);
  await expect(page.locator('body')).toHaveClass(/connection-sheet-open/);
  expect(await page.locator('body').evaluate(node => getComputedStyle(node).overflowY)).not.toBe('hidden');
  await expect(page.locator('#connectionSettings')).not.toHaveClass(/is-opening/);
  expect(await page.evaluate(() => window.scrollY)).toBe(openingFrame.scrollTop);
  const settledTop = await page.locator('#connectionSettings').evaluate(node => node.getBoundingClientRect().top);
  expect(Math.abs(settledTop - openingFrame.collapsedTop)).toBeLessThan(1);
  await page.locator('#cloudMessage').evaluate((node) => {
    node.textContent = '連線狀態更新後顯示的較長說明文字。'.repeat(18);
  });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const updatedTop = await page.locator('#connectionSettings').evaluate(node => node.getBoundingClientRect().top);
  expect(Math.abs(updatedTop - settledTop)).toBeLessThan(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(openingFrame.scrollTop);
  const closingFrames = await clickConnectionToggle(page.locator('.connection-settings-toggle'));
  expect(closingFrames[0].closing, 'The connection toggle must start closing, not save the record.').toBe(true);
  expect(closingFrames[0].open).toBe(true);
  for (const frame of closingFrames) {
    expect(Math.abs(frame.top - openingFrame.collapsedTop)).toBeLessThan(1);
    expect(frame.scrollTop).toBe(openingFrame.scrollTop);
  }
  await expect(page.locator('#connectionSettings')).not.toHaveAttribute('open', '');
  const collapsedTopAfterClose = await page.locator('#connectionSettings').evaluate(
    node => node.getBoundingClientRect().top,
  );
  expect(Math.abs(collapsedTopAfterClose - openingFrame.collapsedTop)).toBeLessThan(1);
  await expect(page.locator('.connection-dock-placeholder')).not.toHaveClass(/is-active/);
  await expect(page.locator('body')).not.toHaveClass(/connection-sheet-open/);
  expect(await page.evaluate(() => window.scrollY)).toBe(openingFrame.scrollTop);
  await context.close();
});

test('connection settings visibly retract before the details element closes', async ({ page }) => {
  const settings = page.locator('#connectionSettings');
  const toggle = settings.locator('.connection-settings-toggle');
  const collapsedHeight = await settings.evaluate(node => node.getBoundingClientRect().height);
  const openingFrames = await clickConnectionToggle(toggle);
  await expect(settings).toHaveAttribute('open', '');
  expect(openingFrames[0].opening).toBe(true);
  expect(openingFrames.some(frame => frame.open && frame.height > collapsedHeight + 8)).toBe(true);
  await expect(settings).not.toHaveClass(/is-opening/);
  const expandedHeight = await settings.evaluate(node => node.getBoundingClientRect().height);

  const closingFrames = await clickConnectionToggle(toggle);
  expect(closingFrames[0].closing).toBe(true);
  expect(closingFrames[0].open).toBe(true);
  expect(closingFrames.some(frame => frame.open && frame.height < expandedHeight - 8)).toBe(true);
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

test('routine switch preserves drafts, saves on blur, and stays fixed-height on mobile', async ({ page }) => {
  const date = await page.locator('#studyDate').inputValue();
  await page.goto('/summary.html');
  await page.evaluate(({ date }) => {
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}${date}`, JSON.stringify({ schemaVersion: 1, date, wakeTime: '07:20', items: [] }));
  }, { date });
  await page.goto('/');
  await expect(page.locator('#wakeHour')).toHaveValue(/0?7/);
  await expect(page.locator('#routineDisclosure')).not.toHaveAttribute('open');
  await page.locator('#routineDisclosure > summary').click();
  await expect(page.locator('#wakeMinute')).toHaveValue('20');
  await expect(page.locator('#routineTimeSummary')).toHaveCount(0);
  await expect(page.locator('#wakeHour')).not.toHaveAttribute('placeholder');
  await expect(page.locator('#wakeMinute')).not.toHaveAttribute('placeholder');

  const centeredFieldOffsets = await page.locator('.today-info-centered-field').evaluateAll(nodes => nodes.map(node => {
    const field = node.getBoundingClientRect();
    const label = node.querySelector('label')?.getBoundingClientRect();
    const control = node.querySelector('input, .mood-segments')?.getBoundingClientRect();
    if (!label || !control) return Number.POSITIVE_INFINITY;
    const contentCenter = (label.top + control.bottom) / 2;
    const fieldCenter = (field.top + field.bottom) / 2;
    return Math.abs(contentCenter - fieldCenter);
  }));
  expect(centeredFieldOffsets).toHaveLength(1);
  expect(centeredFieldOffsets.every(offset => offset < 3)).toBe(true);

  const inputStageBounds = await page.locator('#routineTimeField').evaluate(node => {
    const stage = node.querySelector('.routine-time-input-stage')?.getBoundingClientRect();
    const inputs = Array.from(node.querySelectorAll<HTMLInputElement>('.routine-time-inputs input')).map(input => input.getBoundingClientRect());
    return {
      stageTop: stage?.top ?? 0,
      stageBottom: stage?.bottom ?? 0,
      inputs: inputs.map(input => ({ top: input.top, bottom: input.bottom })),
    };
  });
  expect(inputStageBounds.inputs).toHaveLength(2);
  expect(
    inputStageBounds.inputs.every(input => input.top >= inputStageBounds.stageTop && input.bottom <= inputStageBounds.stageBottom),
    JSON.stringify(inputStageBounds),
  ).toBe(true);
  const routineBottomGap = await page.locator('#routineTimeField').evaluate(node => {
    const field = node.getBoundingClientRect();
    const stage = node.querySelector('.routine-time-input-stage')?.getBoundingClientRect();
    return field.bottom - (stage?.bottom ?? field.bottom);
  });
  expect(routineBottomGap).toBeLessThan(15);

  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as any).__routineStorageWrites = 0;
    Storage.prototype.setItem = function (key: string, value: string) {
      (window as any).__routineStorageWrites += 1;
      return original.call(this, key, value);
    };
  });
  await page.locator('#wakeHour').fill('8');
  await page.locator('[data-routine-mode="bedtime"]').dispatchEvent('click');
  expect(await page.evaluate(() => (window as any).__routineStorageWrites)).toBe(0);
  await page.locator('#wakeHour').fill('1');
  await page.locator('#wakeMinute').fill('30');
  await expect(page.locator('#routineNextDayHint')).toBeVisible();
  await page.locator('[data-routine-mode="wake"]').dispatchEvent('click');
  await expect(page.locator('#wakeHour')).toHaveValue('8');
  await expect(page.locator('#wakeMinute')).toHaveValue('20');
  await page.locator('[data-routine-mode="bedtime"]').dispatchEvent('click');
  await expect(page.locator('#wakeHour')).toHaveValue('1');
  await expect(page.locator('#wakeMinute')).toHaveValue('30');
  await page.locator('#wakeMinute').blur();
  await expect.poll(() => page.evaluate(() => (window as any).__routineStorageWrites)).toBeGreaterThan(0);

  const stored = await page.evaluate(({ date }) => JSON.parse(localStorage.getItem(`study-v11:guest:${date}`) || '{}'), { date });
  expect(stored.wakeTime).toBe('08:20');
  expect(stored.bedtime).toEqual({ time: '01:30', dateTime: expect.stringMatching(/T01:30$/), nextDay: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const beforeHeight = await page.locator('#routineTimeField').evaluate(node => node.getBoundingClientRect().height);
  await page.locator('[data-routine-mode="wake"]').click();
  await page.waitForTimeout(280);
  const afterHeight = await page.locator('#routineTimeField').evaluate(node => node.getBoundingClientRect().height);
  expect(Math.abs(afterHeight - beforeHeight)).toBeLessThan(1);

  await page.locator('[data-mobile-section="date"]').focus();
  await page.locator('[data-mobile-section="date"]').click();
  const dateContainment = await page.locator('#studyDate').evaluate(node => {
    const input = node.getBoundingClientRect();
    const field = node.closest('.site-rail-date-control')?.getBoundingClientRect();
    return {
      inputLeft: input.left,
      inputRight: input.right,
      fieldLeft: field?.left ?? 0,
      fieldRight: field?.right ?? 0,
    };
  });
  expect(dateContainment.inputLeft).toBeGreaterThanOrEqual(dateContainment.fieldLeft);
  expect(dateContainment.inputRight).toBeLessThanOrEqual(dateContainment.fieldRight);
});

test('cloud conflict prompt names the card, field, and both values', async ({ page }) => {
  const date = '2026-09-20';
  await page.goto('/summary.html');
  await page.evaluate(({ date }) => {
    const prefix = 'study-v11:guest:';
    const local = {
      date,
      items: [{
        id: 'conflict-math', type: 'mathStudy', title: '數學講義：進度',
        done: false, minutes: '25', required: true, f: { material: '新關鍵', book: '1~2' },
      }],
    };
    const cloud = structuredClone(local);
    cloud.items[0].minutes = '40';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}${date}`, JSON.stringify({
      ...local,
      schemaVersion: 1,
      localDirty: true,
      syncConflict: true,
      syncConflictLocal: local,
      syncConflictCloud: cloud,
      syncConflictDetails: [{
        path: '$.items[id:conflict-math].minutes', kind: 'same-field',
        baseExists: true, localExists: true, cloudExists: true,
        base: '15', local: '25', cloud: '40',
      }],
    }));
  }, { date });
  await page.goto('/');
  await selectStudyDate(page, date);
  await page.locator('.connection-settings-toggle').click();

  await expect(page.locator('#cloudConflictText')).toContainText('數學講義：進度 › 讀書時間（分鐘）');
  await expect(page.locator('#cloudConflictDetails')).toContainText('本機：25');
  await expect(page.locator('#cloudConflictDetails')).toContainText('雲端：40');
  await expect(page.getByRole('button', { name: '以本機整日紀錄覆蓋雲端' })).toBeVisible();
  await expect(page.getByRole('button', { name: '以雲端整日紀錄取代本機' })).toBeVisible();
});

test('timer starts from the closest second represented by manual minutes', async ({ page }) => {
  await page.selectOption('#itemType', 'extra');
  await page.click('#addItemBtn');
  const card = page.locator('#itemList [data-item]').filter({ has: page.locator('[data-action="delete-item"]') }).last();
  const minutes = card.locator('[data-minutes]');
  await minutes.fill('12.5');
  await minutes.blur();
  const modeSegments = card.locator('.time-mode-segments');
  await modeSegments.evaluate(node => { node.setAttribute('data-animation-probe', 'original'); });
  await card.locator('[data-action="time-mode-select"][data-time-mode="timer"]').click();
  await expect(modeSegments).toHaveAttribute('data-active', '1');
  await expect(modeSegments).toHaveAttribute('data-animation-probe', 'original');
  await expect(card.locator('[data-timer-display]')).toHaveText('12:30');
  await expect(modeSegments).not.toHaveAttribute('data-animation-probe', 'original');
});

test('pausing from the floating timer changes the original card action to resume', async ({ page }) => {
  await page.selectOption('#itemType', 'extra');
  await page.click('#addItemBtn');
  const card = page.locator('#itemList [data-item]').filter({ has: page.locator('[data-action="delete-item"]') }).last();
  await card.locator('[data-action="time-mode-select"][data-time-mode="timer"]').click();
  const cardToggle = card.locator('[data-action="timer-toggle"]');
  await cardToggle.click();
  await expect(cardToggle).toHaveText('暫停');
  await expect(page.locator('#activeTimerSummary')).toBeVisible();
  await page.waitForTimeout(1_100);

  await page.locator('#activeTimerSummary [data-action="timer-pause-active"]').click();

  await expect(page.locator('#activeTimerSummary')).toBeHidden();
  await expect(card.locator('[data-action="timer-toggle"]')).toHaveText('繼續');
  const pausedTime = await card.locator('[data-timer-display]').textContent();
  await page.waitForTimeout(1_100);
  await expect(card.locator('[data-timer-display]')).toHaveText(pausedTime ?? '');
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
  const completionDate = deferredCard.locator('[data-completion-date]');
  await expect(completionDate.locator('xpath=..')).toContainText('完成日期');
  await expect(completionDate).toHaveValue('2026-09-17');
  const completionDatePosition = await deferredCard.evaluate(node => {
    const title = node.querySelector('.item-title')?.getBoundingClientRect();
    const editor = node.querySelector('.completion-date-editor')?.getBoundingClientRect();
    return { titleBottom: title?.bottom ?? 0, editorTop: editor?.top ?? 0 };
  });
  expect(completionDatePosition.editorTop).toBeGreaterThanOrEqual(completionDatePosition.titleBottom);
  await completionDate.fill('2026-09-18');
  await completionDate.blur();
  await expect(deferredCard.locator('[data-completion-date]')).toHaveValue('2026-09-18');

  const completedOrigin = await page.evaluate(() => JSON.parse(localStorage.getItem('study-v11:guest:2026-09-16') || '{}').items.find((item: { id: string }) => item.id === 'deferred-origin'));
  expect(completedOrigin.done).toBe(true);
  expect(completedOrigin.checkedOn).toBe('2026-09-18');
  expect(completedOrigin.deferredCompletedOn).toBe('2026-09-18');

  await page.reload();
  await expect(page.locator('#dailyItemList [data-item]').filter({ hasText: '延期同步測試' }).locator('[data-done]').first()).toBeChecked();

  await page.locator('#dailyItemList [data-item]').filter({ hasText: '延期同步測試' }).locator('[data-done]').first().uncheck();
  const restoredOrigin = await page.evaluate(() => JSON.parse(localStorage.getItem('study-v11:guest:2026-09-16') || '{}').items.find((item: { id: string }) => item.id === 'deferred-origin'));
  expect(restoredOrigin.done).toBe(false);
  expect(restoredOrigin.checkedOn).toBeUndefined();
  expect(restoredOrigin.deferredCompletedOn).toBeUndefined();
});

test('ordinary completion is written immediately and survives reload', async ({ page }) => {
  await page.goto('about:blank');
  await page.clock.install({ time: new Date('2026-09-20T12:00:00+08:00') });
  await page.goto('/summary.html');
  await page.evaluate(() => {
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}2026-09-20`, JSON.stringify({ schemaVersion: 2, date: '2026-09-20', wakeTime: '06:30', items: [{
      id: 'original-completion', type: 'general', title: '已讀取的原訂項目', source: 'preset',
      required: true, done: false, minutes: '', f: { subject: '英文' },
    }] }));
  });
  await page.goto('/');

  const card = page.locator('#dailyItemList [data-item]').first();
  const itemId = await card.getAttribute('data-item');
  const checkbox = card.locator('[data-done]').first();
  await page.locator('#routineDisclosure > summary').click();
  await page.locator('#wakeMinute').fill('');
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  const completionDate = card.locator('[data-completion-date]');
  await expect(completionDate).toHaveValue('2026-09-20');
  await completionDate.fill('2026-09-19');
  await completionDate.blur();
  const completionDatePosition = await card.evaluate(node => {
    const title = node.querySelector('.item-title')?.getBoundingClientRect();
    const note = node.querySelector('.item-desc')?.getBoundingClientRect();
    const editor = node.querySelector('.completion-date-editor')?.getBoundingClientRect();
    return { contentBottom: Math.max(title?.bottom ?? 0, note?.bottom ?? 0), editorTop: editor?.top ?? 0 };
  });
  expect(completionDatePosition.editorTop).toBeGreaterThanOrEqual(completionDatePosition.contentBottom);

  const stored = await page.evaluate(id => {
    const record = JSON.parse(localStorage.getItem('study-v11:guest:2026-09-20') || '{}');
    return { wakeTime: record.wakeTime, item: record.items.find((entry: { id: string }) => entry.id === id) };
  }, itemId);
  expect(stored.item.done).toBe(true);
  expect(stored.item.checkedOn).toBe('2026-09-19');
  expect(stored.wakeTime).toBe('06:30');

  await page.reload();
  await expect(page.locator(`#dailyItemList [data-item="${itemId}"] [data-done]`).first()).toBeChecked();
  await expect(page.locator(`#dailyItemList [data-item="${itemId}"] [data-completion-date]`)).toHaveValue('2026-09-19');
});

test('Calendar-backed math completion survives navigating to its completion date and back', async ({ page }) => {
  await page.goto('about:blank');
  await page.clock.install({ time: new Date('2026-09-20T12:00:00+08:00') });
  await page.goto('/');
  await page.evaluate(() => {
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}2026-09-16`, JSON.stringify({
      schemaVersion: 2,
      date: '2026-09-16',
      items: [{
        id: 'calendar-new-key-math',
        type: 'mathStudy',
        done: true,
        checkedOn: '2026-09-18',
        minutes: '49.3',
        required: true,
        source: 'preset',
        presetKey: 'calendar-new-key-math',
        title: '數學講義：進度',
        description: 'Google Calendar API：新關鍵',
        f: { material: '新關鍵', book: '1~2', start: '10', end: '13' },
      }],
    }));
  });
  await page.reload();

  const studyDate = page.locator('#studyDate');
  await selectStudyDate(page, '2026-09-16');
  const groupedMathParent = page.locator('#dailyItemList > [data-item]').filter({ hasText: '數學講義：進度' }).first();
  const mathCard = groupedMathParent;
  const itemId = await mathCard.getAttribute('data-item');
  expect(itemId).not.toBeNull();
  await mathCard.locator('[data-minutes]').fill('51.8');
  await mathCard.locator('[data-minutes]').blur();
  await mathCard.locator('[data-done]').first().check();
  const completionDate = mathCard.locator('[data-completion-date]').first();
  await completionDate.fill('2026-09-19');
  await completionDate.blur();

  await selectStudyDate(page, '2026-09-19');
  await selectStudyDate(page, '2026-09-16');

  const restoredCard = page.locator(`#dailyItemsView [data-item="${itemId}"]`).last();
  await expect(restoredCard.locator('[data-done]').first()).toBeChecked();
  await expect(restoredCard.locator('[data-completion-date]').first()).toHaveValue('2026-09-19');
  await expect(restoredCard.locator('[data-minutes]').first()).toHaveValue('51.8');
});

test('completion on another date survives stale-tab navigation to that date and back', async ({ page, context }) => {
  await page.goto('about:blank');
  await page.clock.install({ time: new Date('2026-08-19T12:00:00+08:00') });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    localStorage.setItem('study-v11:guest:2026-08-16', JSON.stringify({ date: '2026-08-16', items: [{
      id: 'cross-tab-original', type: 'general', title: '原訂讀書項目', source: 'preset', required: true,
      done: false, minutes: '', f: { subject: '英文' },
    }] }));
  });
  await page.reload();

  const studyDate = page.locator('#studyDate');
  await selectStudyDate(page, '2026-08-16');
  const itemId = await page.locator('#dailyItemsView [data-item] [data-done]').first().evaluate(input => (
    input.closest('[data-item]')?.getAttribute('data-item') || ''
  ));
  expect(itemId).not.toBe('');

  const writer = await context.newPage();
  await writer.goto('/');
  await selectStudyDate(writer, '2026-08-16');
  const writerCard = writer.locator(`#dailyItemsView [data-item="${itemId}"]`);
  await writerCard.locator('[data-done]').first().check();
  const completionDate = writerCard.locator('[data-completion-date]').first();
  await completionDate.fill('2026-08-19');
  await completionDate.blur();
  await expect(writerCard.locator('[data-done]').first()).toBeChecked();

  // The first page still holds the old unchecked snapshot. Navigating it must
  // merge the newer stored completion instead of writing that snapshot back.
  await selectStudyDate(page, '2026-08-19');
  await expect(studyDate).toHaveValue('2026-08-19');

  await selectStudyDate(writer, '2026-08-19');
  await selectStudyDate(writer, '2026-08-16');

  await expect(writer.locator(`#dailyItemsView [data-item="${itemId}"] [data-done]`).first()).toBeChecked();
  await expect(writer.locator(`#dailyItemsView [data-item="${itemId}"] [data-completion-date]`).first()).toHaveValue('2026-08-19');
  const stored = await writer.evaluate(id => {
    const record = JSON.parse(localStorage.getItem('study-v11:guest:2026-08-16') || '{}');
    return record.items.find((entry: { id: string }) => entry.id === id);
  }, itemId);
  expect(stored.done).toBe(true);
  expect(stored.checkedOn).toBe('2026-08-19');
  await writer.close();
});

test('interactive child completion is written immediately and survives reload', async ({ page }) => {
  await page.goto('about:blank');
  await page.clock.install({ time: new Date('2026-09-21T12:00:00+08:00') });
  await page.goto('/summary.html');
  await page.evaluate(() => {
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}2026-09-21`, JSON.stringify({ schemaVersion: 2, date: '2026-09-21', items: [{
      id: 'monday-vocab-2026-09-21', type: 'englishVocabInteractive', title: '單字練習',
      source: 'preset', required: false, done: false, minutes: '', f: { words: [] },
    }] }));
  });
  await page.goto('/');

  const card = page.locator('#dailyItemList [data-item="monday-vocab-2026-09-21"]');
  const itemId = await card.getAttribute('data-item');
  const checkbox = card.locator('[data-done]').first();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await expect(card.locator('[data-completion-date]')).toHaveValue('2026-09-21');
  const completionDatePosition = await card.evaluate(node => {
    const title = node.querySelector('.fixed-book-value')?.getBoundingClientRect();
    const note = node.querySelector('.field > .small')?.getBoundingClientRect();
    const editor = node.querySelector('.completion-date-editor')?.getBoundingClientRect();
    return { contentBottom: Math.max(title?.bottom ?? 0, note?.bottom ?? 0), editorTop: editor?.top ?? 0 };
  });
  expect(completionDatePosition.editorTop).toBeGreaterThanOrEqual(completionDatePosition.contentBottom);

  const stored = await page.evaluate(id => {
    const record = JSON.parse(localStorage.getItem('study-v11:guest:2026-09-21') || '{}');
    const stack = [...(record.items || [])];
    while (stack.length) {
      const item = stack.shift();
      if (item?.id === id) return item;
      for (const value of Object.values(item?.f || {})) if (Array.isArray(value)) stack.push(...value);
    }
    return null;
  }, itemId);
  expect(stored?.done).toBe(true);

  await page.reload();
  await expect(page.locator(`#dailyItemList [data-item="${itemId}"] [data-done]`).first()).toBeChecked();
});

test('learning summary uses one week/month control for the complete page', async ({ page }) => {
  // Leave the record editor first: its pagehide handler deliberately persists
  // the current form and would otherwise overwrite this isolated fixture.
  await page.goto('/summary.html');
  await page.evaluate(() => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const previous = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
    const previousDate = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-${String(previous.getDate()).padStart(2, '0')}`;
    const normalDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (now.getDay() === 1 ? 1 : -1), 12);
    const normalDate = `${normalDay.getFullYear()}-${String(normalDay.getMonth() + 1).padStart(2, '0')}-${String(normalDay.getDate()).padStart(2, '0')}`;
    const prefix = 'study-v11:guest:';
    const normalCompletionItem = {
      id: 'summary-normal-completion', type: 'general', title: '一般完成項目', done: true,
      minutes: '', required: true, source: 'preset', f: { subject: '數學' },
    };
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(`${prefix}${previousDate}`, JSON.stringify({
      schemaVersion: 2,
      date: previousDate,
      bedtime: { time: '23:45', dateTime: `${previousDate}T23:45`, nextDay: false },
      items: normalDate === previousDate ? [normalCompletionItem] : [],
    }));
    if (normalDate !== previousDate) {
      localStorage.setItem(`${prefix}${normalDate}`, JSON.stringify({
        schemaVersion: 2,
        date: normalDate,
        items: [normalCompletionItem],
      }));
    }
    localStorage.setItem(`${prefix}${date}`, JSON.stringify({
      schemaVersion: 2,
      date,
      mood: '身體不適',
      wakeTime: '06:30',
      items: [
        { id: 'summary-math', type: 'mathStudy', done: true, minutes: '45', required: true, source: 'preset', f: { subject: '數學' } },
        { id: 'summary-english', type: 'englishPractice', title: '英文閱讀', done: true, minutes: '15', required: true, source: 'preset', f: { subject: '英文' } },
        { id: 'summary-english-listening', type: 'englishPractice', title: '英文聽力', done: true, minutes: '15', required: true, source: 'preset', f: { subject: '英文' } },
        { id: 'summary-english-writing', type: 'englishPractice', title: '英文寫作', done: true, minutes: '15', required: true, source: 'preset', f: { subject: '英文' } },
        { id: 'summary-english-grammar', type: 'englishPractice', title: '英文文法', done: true, minutes: '15', required: true, source: 'preset', f: { subject: '英文' } },
        { id: 'summary-english-vocabulary', type: 'englishPractice', title: '英文單字', done: true, minutes: '15', required: true, source: 'preset', f: { subject: '英文' } },
        { id: 'summary-physics', type: 'scienceReview', title: '物理｜運動', done: true, minutes: '10', required: true, source: 'preset', f: { subject: '物理' } },
        { id: 'summary-physics-force', type: 'scienceReview', title: '物理｜力學', done: true, minutes: '10', required: true, source: 'preset', f: { subject: '物理' } },
        { id: 'summary-chemistry', type: 'scienceReview', title: '化學｜反應', done: true, minutes: '20', required: true, source: 'preset', f: { subject: '化學' } },
        { id: 'summary-biology', type: 'biologyInteractive', title: '生物｜細胞', done: true, minutes: '30', required: true, source: 'preset', f: { subject: '生物' } },
        { id: 'summary-earth', type: 'scienceReview', title: '地科｜地質', done: true, minutes: '40', required: true, source: 'preset', f: { subject: '地科' } },
        { id: 'summary-unwell-open', type: 'general', title: '尚未完成項目', done: false, minutes: '', required: true, source: 'preset', f: { subject: '數學' } },
      ],
    }));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: '週／月總結' })).toBeVisible();
  await expect(page.locator('#summaryModeSwitch')).toHaveCount(1);
  await expect(page.locator('#summaryCalendar .summary-day')).toHaveCount(7);
  await expect(page.locator('#calendarTitle')).toHaveText('週曆');
  await expect(page.locator('#personalStatusPeriod')).toHaveText('本週作息統計');
  await expect(page.locator('#averageWakeTime')).toHaveText('06:30');
  await expect(page.locator('#validSleepCount')).toContainText('1／7 晚');
  await expect(page.locator('#sleepTrend')).toBeVisible();
  await expect(page.locator('#summaryTotalCompletion')).toHaveText('100%');
  await expect(page.locator('#summarySubjectDistribution .summary-donut-center strong')).toHaveText('3.8');
  await expect(page.locator('#summarySubjectDistribution .summary-donut-center span')).toHaveText('hr');
  const includeStatusDays = page.locator('#includeStatusDaysCompletion');
  await expect(includeStatusDays).not.toBeChecked();
  await expect(page.locator('#statusDaysCompletionState')).toHaveText('不列入');
  await includeStatusDays.check();
  // Six of seven required tasks are complete; interactive practice contributes time only.
  await expect(page.locator('#summaryTotalCompletion')).toHaveText('86%');
  await expect(page.locator('#statusDaysCompletionState')).toHaveText('列入');
  await page.reload();
  await expect(page.locator('#includeStatusDaysCompletion')).toBeChecked();
  await expect(page.locator('#summaryTotalCompletion')).toHaveText('86%');
  await page.locator('#summaryCalendar .summary-day.is-mood-unwell [data-summary-day]').click();
  await expect(page.locator('#summaryCalendar .summary-day.is-tooltip-open .summary-day-tooltip')).toContainText('學習時間');
  await expect(page.locator('#summaryCalendar .summary-day.is-tooltip-open .summary-day-tooltip')).toContainText('完成率');
  await expect(page.locator('#summaryCalendar .summary-day.is-tooltip-open .summary-day-tooltip')).toContainText('列入週／月完成率');
  await expect.poll(() => page.locator('#summaryCalendar .summary-day.is-tooltip-open .summary-day-tooltip').evaluate(node => getComputedStyle(node).opacity)).toBe('1');
  await page.locator('[data-summary-subject="英文"]').click();
  await expect(page.locator('#subjectTitle')).toHaveText('科目分配｜英文');
  await expect(page.locator('#summarySubjectDistribution .summary-subject-detail-name')).toHaveCount(5);
  const englishDetailColors = await page.locator('#summarySubjectDistribution .summary-subject-detail-list i')
    .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
  expect(new Set(englishDetailColors).size).toBe(5);
  const englishBrightness = englishDetailColors.map(color => {
    const channels = color.match(/\d+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
    return channels.reduce((sum, channel) => sum + channel, 0) / 3;
  });
  expect(Math.max(...englishBrightness) - Math.min(...englishBrightness)).toBeGreaterThan(80);
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
  await expect(page.locator('[data-summary-subject="自然"]')).toHaveCount(1);
  await expect(page.locator('[data-summary-subject="物理"], [data-summary-subject="化學"], [data-summary-subject="生物"], [data-summary-subject="地科"]')).toHaveCount(0);
  await page.locator('[data-summary-subject="自然"]').click();
  await expect(page.locator('#subjectTitle')).toHaveText('科目分配｜自然');
  const naturalItems = page.locator('#summarySubjectDistribution .summary-subject-detail-list li');
  await expect(naturalItems).toHaveCount(5);
  for (const label of ['物理｜運動', '物理｜力學', '化學｜反應', '生物｜互動題', '地科｜地質']) {
    await expect(naturalItems.filter({ hasText: new RegExp(label.replace('｜', '.*')) })).toHaveCount(1);
  }
  const naturalColors = await page.locator('#summarySubjectDistribution .summary-subject-detail-list i')
    .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
  expect(new Set(naturalColors).size).toBeGreaterThanOrEqual(4);
  await page.locator('#summarySubjectDistribution [data-summary-back]').first().click();
  await expect(page.locator('#subjectTitle')).toHaveText('科目分配');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileHeader = await page.locator('.summary-header').evaluate(node => {
    const controls = node.querySelector('.summary-view-controls')!.getBoundingClientRect();
    const header = node.getBoundingClientRect();
    return {
      headingFontSize: getComputedStyle(node.querySelector('h1')!).fontSize,
      controlsCenter: controls.left + controls.width / 2,
      headerCenter: header.left + header.width / 2,
    };
  });
  expect(mobileHeader.headingFontSize).toBe('28px');
  await expect(page.locator('.summary-back')).toHaveCount(0);
  await expect(page.locator('.site-mobile-bar')).toBeVisible();
  expect(Math.abs(mobileHeader.controlsCenter - mobileHeader.headerCenter)).toBeLessThan(3);
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
  await expect(page.locator('#personalStatusPeriod')).toHaveText('本月作息統計');
  await expect(page.locator('#conclusionTitle')).toHaveText('本月小結');
  await expect(page.locator('#summaryContent')).not.toHaveClass(/is-mode-transitioning/);
  await expect.poll(() => page.locator('#summaryContent').evaluate(node => getComputedStyle(node).opacity)).toBe('1');
  await expect(page.locator('.summary-calendar-weekdays')).toBeVisible();
  await expect(page.locator('#summaryCalendar .summary-day')).toHaveCount(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate());
  await expect(page.locator('#periodLabel')).toContainText('月');
});

test('public edition starts without built-in schedule cards', async ({ page }) => {
  await expect(page.locator('#dailyNotice')).toContainText('今日尚無 Google Calendar 匯入項目');
  await expect(page.locator('#dailyItemList [data-item]')).toHaveCount(0);
  await expect(page.locator('#dailyItemList')).toContainText('今日沒有項目');
});


test('material progress only shows checked materials and keeps the selection', async ({ page }) => {
  await page.goto('/material.progress.html');
  await expect(page).toHaveTitle('每日讀書完成度紀錄卡');
  await expect(page.getByRole('heading', { name: '我的教材' })).toBeVisible();
  const materialsPanel = page.locator('#materialsPanel');
  await expect(materialsPanel).not.toHaveAttribute('open', '');
  await expect(page.locator('#materialSelectionList')).toBeHidden();
  await materialsPanel.locator('summary').click();
  await expect(materialsPanel).toHaveAttribute('open', '');
  await expect(page.locator('#materialSelectionList')).toBeVisible();
  await expect(page.locator('#materialProgressList .material-row')).toHaveCount(0);
  await expect(page.locator('#materialSelectionList .material-selection-group > h3')).toHaveText(['分冊講義', '複習講義']);
  await expect(page.locator('[data-material-group="math-split"]')).toContainText('對話式');
  await expect(page.locator('[data-material-group="math-review"]')).toContainText('對話式複習講義');

  const firstMathMaterial = page.locator('#materialSelectionList input[type="checkbox"]').first();
  await firstMathMaterial.check();
  await expect(page.locator('#materialProgressList .material-row')).toHaveCount(1);
  await expect(page.locator('#selectionSummary')).toContainText('已選 1');

  await page.reload();
  await expect(page.locator('#materialSelectionList input[type="checkbox"]').first()).toBeChecked();
  await expect(page.locator('#materialProgressList .material-row')).toHaveCount(1);
  await materialsPanel.locator('summary').click();
  await expect(materialsPanel).toHaveAttribute('open', '');

  await page.getByRole('tab', { name: '英文' }).click();
  await expect(page.locator('#materialProgressList .material-row')).toHaveCount(0);
  await expect(page.locator('#materialEmpty')).toContainText('請先在「我的教材」勾選');
  await expect(page.locator('#materialSelectionList .material-selection-group > h3')).toHaveText(['學測', '其他']);
  const englishExamGroup = page.locator('[data-material-group="english-exam"]');
  const englishOtherGroup = page.locator('[data-material-group="english-other"]');
  await expect(englishExamGroup).toContainText('學測週計畫');
  await expect(englishExamGroup).toContainText('混合題30篇實戰演練');
  await expect(englishExamGroup).toContainText('英語高頻字彙完全攻略');
  await expect(englishExamGroup).toContainText('英文寫作測驗');
  await expect(englishExamGroup).toContainText('英文文法總複習講義');
  await expect(englishOtherGroup).not.toContainText('英文寫作測驗');
  await expect(englishOtherGroup).not.toContainText('英文文法總複習講義');
  await expect(englishOtherGroup).toContainText('Essential Grammar in Use');

  await page.getByRole('tab', { name: '自然' }).click();
  await expect(page.locator('#materialSelectionList .material-selection-group > h3')).toHaveText(['物理', '化學', '地科', '生物']);
  const physicsGroup = page.locator('[data-natural-subject="物理"]');
  await expect(physicsGroup).toContainText('123日的淬鍊');
  await expect(physicsGroup).toContainText('好考點');
  await expect(physicsGroup).toContainText('新關鍵');
  await expect(physicsGroup).toContainText('優勢');
  await expect(physicsGroup).toContainText('逆轉勝');
  await expect(physicsGroup).not.toContainText('自然｜物理');
  await expect(page.locator('[data-natural-subject="地科"]')).toContainText('新關鍵');

  await page.getByRole('tab', { name: '社會' }).click();
  await expect(page.locator('#materialSelectionList .material-selection-group > h3')).toHaveText(['歷史']);
  await expect(page.locator('[data-social-subject="歷史"]')).toContainText('好好學');
  await expect(page.locator('#materialSelectionList')).not.toContainText('學測週計畫');
  await expect(page.locator('[data-social-subject="公民"], [data-social-subject="地理"]')).toHaveCount(0);
});


test('manual material selectors use My Materials and keep existing records editable', async ({ page }) => {
  await page.selectOption('#itemType', 'mathLecture');
  await expect(page.locator('#manualMaterialHint')).toContainText('尚未在「我的教材」勾選數學教材');
  await expect(page.locator('#manageMaterialsLink')).toHaveAttribute('href', './material.progress.html#math');

  await page.evaluate(() => {
    localStorage.setItem('study-v11:guest:material-selection', JSON.stringify([
      'math:對話式:1',
      'english:ace',
      'book:歷史｜好好學',
    ]));
  });
  await page.reload();
  await page.selectOption('#itemType', 'mathLecture');
  await expect(page.locator('#manualMaterialHint')).toContainText('數學已選 1 本教材');
  await page.click('#addItemBtn');

  const mathCard = page.locator('#itemList [data-item]').last();
  const material = mathCard.locator('[data-field="material"]');
  await expect(material.locator('option')).toHaveText(['請選擇', '對話式']);
  await material.selectOption('對話式');
  const book = mathCard.locator('[data-field="book"]');
  await expect(book.locator('option')).toHaveText(['請選擇', '1']);
  await book.selectOption('1');

  await page.selectOption('#itemType', 'socialStudy');
  await expect(page.locator('#manualMaterialHint')).toContainText('社會已選 1 本教材');
  await expect(page.locator('#manageMaterialsLink')).toHaveAttribute('href', './material.progress.html#social');
  await page.click('#addItemBtn');
  const socialCard = page.locator('#itemList [data-item]').last();
  await expect(socialCard).toHaveClass(/subject-history|subject-other/);
  await expect(socialCard.locator('[data-field="subject"] option')).toHaveText(['請選擇', '歷史']);
  await socialCard.locator('[data-field="subject"]').selectOption('歷史');
  await expect(socialCard.locator('[data-field="book"] option')).toHaveText(['請選擇', '好好學']);
  await socialCard.locator('[data-field="book"]').selectOption('歷史｜好好學');
  await expect(socialCard).toHaveClass(/subject-history/);
  await expect(socialCard.locator('[data-book-topic-auto]')).toBeVisible();

  await page.evaluate(() => localStorage.setItem('study-v11:guest:material-selection', '[]'));
  await page.reload();
  const existingMathCard = page.locator('#itemList [data-item]').filter({ has: page.locator('[data-field="material"]') }).last();
  await expect(existingMathCard.locator('[data-field="material"]')).toHaveValue('對話式');
  await expect(existingMathCard.locator('[data-field="material"]')).toContainText('對話式（目前紀錄）');
  await expect(existingMathCard.locator('[data-field="book"]')).toHaveValue('1');

  await page.selectOption('#itemType', 'general');
  await page.click('#addItemBtn');
  const customCard = page.locator('#itemList [data-item]').last();
  await expect(customCard.locator('[data-field="subject"]')).toBeVisible();
  await expect(customCard.locator('[data-field="title"]')).toBeVisible();
  await expect(customCard.locator('[data-field="progress"]')).toBeVisible();
});


test('daily overview only shows completed time and no math page statistics', async ({ page }) => {
  await page.locator('#studyDate').fill('2026-09-20');
  await page.locator('#studyDate').dispatchEvent('change');
  await expect(page.locator('#settlementMetrics')).toBeVisible();
  await expect(page.locator('#overviewStats')).toContainText('今日完成時間');
  await expect(page.locator('#metricMinutesPanel')).toBeVisible();
  await expect(page.locator('#subjectTimeDonut')).toBeVisible();
  await expect(page.locator('#overviewStats')).not.toContainText('今日數學頁數');
  await expect(page.locator('#overviewStats')).not.toContainText('本週數學頁數');
  await expect(page.locator('#overviewMetricTabs')).toHaveCount(0);
  await expect(page.locator('#metricMathTodayPanel')).toHaveCount(0);
  await expect(page.locator('#metricMathWeekPanel')).toHaveCount(0);
});

