import { expect, test, type Locator, type Page } from '@playwright/test';

async function seed(page: Page): Promise<void> {
  await page.goto('/vocabulary.review.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    for (const date of ['2026-11-01', '2026-11-02']) localStorage.setItem(`study-v11:guest:${date}`, JSON.stringify({ schemaVersion: 2, date, items: [{
      id: 'review', type: 'englishVocabInteractive', done: true, minutes: '15', required: false, f: { words: [
        { id: 'alternate', text: 'alternate', noun: true, verb: true, gsatLevel: 3, showGsatLevel: true,
          translationsByPartOfSpeech: { noun: ['代替者', '候補者'], verb: ['輪流'] } },
        { id: 'phrase', text: 'pay a premium', fixedCombination: true, translation: '支付保費；支付溢價' },
        { id: 'sentence', text: 'Time after time, practice makes perfect.', beautifulSentences: true, translation: '一次又一次；熟能生巧' },
      ] },
    }] }));
  });
  await page.reload();
}

test('card, meaning and English stars are independent, survive sorting and reload, and clear all source copies', async ({ page }) => {
  await seed(page);
  const row = page.locator('.vocabulary-row[data-entry-key="alternate"]');
  const card = row.getByRole('button', { name: '標註整張卡片「alternate」', exact: true });
  const noun = row.getByRole('button', { name: '標註 Noun 第 2 筆翻譯', exact: true });
  await card.click();
  await noun.click();
  await expect(row.getByRole('button', { name: '標註 Noun 第 1 筆翻譯', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await row.getByRole('button', { name: '個別標註', exact: true }).click();
  await row.getByRole('button', { name: '標註英文單字「alternate」', exact: true }).click();
  await row.getByRole('button', { name: '結束標註', exact: true }).click();
  await expect(row.locator('.vocabulary-word-link .is-word-starred')).toHaveText('alternate');
  await page.getByRole('button', { name: '隱藏中文', exact: true }).click();
  await expect(row.locator('.vocabulary-meaning-answer').first()).toHaveCSS('visibility', 'hidden');
  await expect(noun).toHaveAttribute('aria-pressed', 'true');
  await noun.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '詞性', exact: true }).click();
  const copies = page.locator('.vocabulary-row[data-entry-key="alternate"]');
  await expect(copies).toHaveCount(2);
  await copies.first().getByRole('button', { name: '標註 Verb 第 1 筆翻譯', exact: true }).click();
  for (const copy of await copies.all()) await expect(copy.getByRole('button', { name: '標註 Verb 第 1 筆翻譯', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(noun).toHaveAttribute('aria-pressed', 'false');
  await expect(row.locator('.is-word-starred')).toHaveCount(1);
  await card.click();
  const saved = await page.evaluate(() => ['2026-11-01', '2026-11-02'].map(date => JSON.parse(localStorage.getItem(`study-v11:guest:${date}`)!).items[0]));
  for (const item of saved) {
    expect(item.done).toBe(true);
    expect(item.minutes).toBe('15');
    expect(item.f.words[0].vocabularyStars).toEqual(expect.objectContaining({ card: false, 'word:alternate:0': true }));
    expect(item.f.words[1].vocabularyStars).toBeUndefined();
  }
});

test('mobile phrases and sentences support separate repeated English tokens and each masked translation without overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await page.getByRole('button', { name: '組合', exact: true }).click();
  const phrase = page.locator('.vocabulary-row[data-entry-key="pay a premium"]');
  await phrase.getByRole('button', { name: '個別標註', exact: true }).click();
  await phrase.getByRole('button', { name: '標註英文單字「premium」', exact: true }).click();
  await phrase.getByRole('button', { name: '標註 中文 第 2 筆翻譯', exact: true }).click();
  await page.getByRole('button', { name: '句子', exact: true }).click();
  const sentence = page.locator('.vocabulary-row').filter({ hasText: 'Time after time' });
  await sentence.getByRole('button', { name: '個別標註', exact: true }).click();
  const repeated = sentence.locator('[data-star-key^="word:time:"]');
  await expect(repeated).toHaveCount(2);
  await repeated.nth(1).click();
  await expect(repeated.first()).toHaveAttribute('aria-pressed', 'false');
  await expect(repeated.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await sentence.getByRole('button', { name: '標註 中文 第 1 筆翻譯', exact: true }).click();
  await page.getByRole('button', { name: '隱藏中文', exact: true }).click();
  await expect(sentence.locator('.vocabulary-meaning-mask')).toHaveText(['－', '－']);
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await sentence.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await sentence.screenshot({ path: testInfo.outputPath(`vocabulary-stars-${width}.png`) });
  }
  await page.reload();
  await page.getByRole('button', { name: '句子', exact: true }).click();
  await expect(sentence.locator('.is-word-starred')).toHaveText('time');
  await expect(sentence.getByRole('button', { name: '標註 中文 第 1 筆翻譯', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('star clicks preserve editing inputs and meaning corrections keep the right star after deleting a neighbor', async ({ page }) => {
  await seed(page);
  const row = page.locator('.vocabulary-row[data-entry-key="alternate"]');
  await row.getByRole('button', { name: '標註 Noun 第 2 筆翻譯', exact: true }).click();
  await row.getByRole('button', { name: '編輯「alternate」', exact: true }).click();
  const input = row.getByLabel('Noun 中文翻譯 2', { exact: true });
  await input.fill('替補者');
  await row.getByRole('button', { name: '標註整張卡片「alternate」', exact: true }).click();
  await expect(input).toHaveValue('替補者');
  await row.getByRole('button', { name: '刪除 Noun 第 1 個翻譯', exact: true }).click();
  await row.getByRole('button', { name: '完成「alternate」', exact: true }).click();
  await expect(row.locator('.vocabulary-meaning-answer').first()).toHaveText('替補者');
  await expect(row.getByRole('button', { name: '標註 Noun 第 1 筆翻譯', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(row.getByRole('button', { name: '標註整張卡片「alternate」', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(row.getByRole('button', { name: '標註 Noun 第 1 筆翻譯', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('a deleted unrelated record cannot block any of the three star controls', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => localStorage.setItem('study-v11:guest:2026-10-30', JSON.stringify({ date: '2026-10-30', items: [] })));
  await page.reload();
  await page.evaluate(() => localStorage.removeItem('study-v11:guest:2026-10-30'));
  const row = page.locator('.vocabulary-row[data-entry-key="alternate"]');
  const card = row.locator('[data-star-key="card"]');
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await row.getByRole('button', { name: '個別標註', exact: true }).click();
  const word = row.getByRole('button', { name: '標註英文單字「alternate」', exact: true });
  await word.click();
  await expect(word).toHaveAttribute('aria-pressed', 'true');
  const meaning = row.getByRole('button', { name: '標註 Noun 第 2 筆翻譯', exact: true });
  await meaning.click();
  await expect(meaning).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(meaning).toHaveAttribute('aria-pressed', 'true');
  await expect(row.locator('.is-word-starred')).toHaveText('alternate');
  expect(await page.evaluate(() => localStorage.getItem('study-v11:guest:2026-10-30'))).toBeNull();
});

test('touching the icon center or button edge toggles every star type', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 812 }, hasTouch: true });
  try {
    const page = await context.newPage();
    await seed(page);
    for (const kind of ['單字', '組合', '句子']) {
      await page.getByRole('button', { name: kind, exact: true }).click();
      const row = page.locator('.vocabulary-row').first();
      await row.getByRole('button', { name: '個別標註', exact: true }).click();
      for (const button of await row.locator('[data-star-key]').all()) {
        await button.scrollIntoViewIfNeeded();
        const bounds = (await button.boundingBox())!;
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await page.touchscreen.tap(bounds.x + 3, bounds.y + 3);
        await expect(button).toHaveAttribute('aria-pressed', 'false');
      }
    }
  } finally { await context.close(); }
});

async function beginStarPointerPress(page: Page, button: Locator): Promise<{ x: number; y: number }> {
  // An actionable center can still leave a fractional pixel clipped at the viewport edge.
  await button.evaluate(node => node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await button.click({ trial: true });
  await expect(button).toBeInViewport({ ratio: 1 });
  await button.evaluate(node => {
    node.addEventListener('pointerdown', function recordPointerDown(): void {
      node.setAttribute('data-pointer-down-probe', 'received');
    }, { once: true });
  });
  const bounds = (await button.boundingBox())!;
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await expect(button).toHaveAttribute('data-pointer-down-probe', 'received');
  return point;
}

test('a fractionally clipped meaning star is centered before a split pointer click', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await seed(page);
  await page.getByRole('button', { name: '個別標註', exact: true }).click();
  const row = page.locator('.vocabulary-row[data-entry-key="alternate"]');
  const button = row.getByRole('button', { name: '標註 Noun 第 2 筆翻譯', exact: true });
  await button.evaluate(node => {
    window.scrollBy({ top: node.getBoundingClientRect().bottom - innerHeight - 0.5, behavior: 'instant' });
  });
  // The fixture must be partly clipped; the exact fraction depends on engine scroll rounding.
  // beginStarPointerPress still requires 100% visibility before every actual press.
  await expect(button).toBeInViewport();
  await expect(button).not.toBeInViewport({ ratio: 1 });
  await beginStarPointerPress(page, button);
  await page.mouse.up();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 1280, height: 600 }, { width: 375, height: 812 }]) {
  test(`background record and metadata writes cannot replace a star between pointer down and click (${viewport.width}x${viewport.height})`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    await page.clock.install({ time: new Date('2026-11-02T12:00:00+08:00') });
    await seed(page);
    const other = await context.newPage();
    await other.goto('/summary.html');
    const row = page.locator('.vocabulary-row[data-entry-key="alternate"]');
    await row.getByRole('button', { name: '個別標註', exact: true }).click();
    for (const [index, key] of ['card', 'word:alternate:0', 'meaning:Noun:%E5%80%99%E8%A3%9C%E8%80%85:0'].entries()) {
      await row.evaluate(node => { node.setAttribute('data-pointer-probe', 'original'); });
      await page.evaluate(() => { (window as unknown as Window & { storageProbe: number }).storageProbe = 0;
        window.addEventListener('storage', () => { (window as unknown as Window & { storageProbe: number }).storageProbe += 1; }, { once: true }); });
      const button = row.locator(`[data-star-key="${key}"]`);
      const point = await beginStarPointerPress(page, button);
      await other.evaluate(({ index }) => {
        const key = 'study-v11:guest:2026-11-02', record = JSON.parse(localStorage.getItem(key)!);
        record.notes = `另一分頁更新 ${index}`;
        if (index === 1) record.items[0].f.words[1].translation = '另一分頁的翻譯';
        localStorage.setItem(key, JSON.stringify(record));
        localStorage.setItem('study-v11:guest:meta:pending-sync:2026-11-02', JSON.stringify({ sequence: index }));
      }, { index });
      await expect.poll(() => page.evaluate(() => (window as unknown as Window & { storageProbe: number }).storageProbe)).toBeGreaterThan(0);
      await page.clock.runFor(250);
      await expect(row).toHaveAttribute('data-pointer-probe', 'original');
      await expect(button).toHaveAttribute('data-pointer-down-probe', 'received');
      expect(await button.evaluate((node, point) => {
        const hit = document.elementFromPoint(point.x, point.y);
        return hit === node || Boolean(hit && node.contains(hit));
      }, point)).toBe(true);
      await page.mouse.up();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await page.clock.runFor(250);
    }
    await page.reload();
    await expect(row.locator('[data-star-key="card"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(row.locator('.is-word-starred')).toHaveText('alternate');
    await expect(row.getByRole('button', { name: '標註 Noun 第 2 筆翻譯', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const concurrentRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('study-v11:guest:2026-11-02')!));
    expect(concurrentRecord.notes).toBe('另一分頁更新 2');
    expect(concurrentRecord.items[0].f.words[1].translation).toBe('另一分頁的翻譯');
    await other.close();
  });
}

test('all three star controls recover from full storage by compacting confirmed baselines', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    for (let day = 20; day < 24; day += 1) {
      const date = `2026-10-${day}`, payload = { schemaVersion: 2, date, notes: '保留筆記'.repeat(2000), items: [] };
      localStorage.setItem('study-v11:guest:' + date, JSON.stringify({ ...payload, localDirty: false, syncConflict: false, serverRevision: 1, syncBase: payload }));
    }
  });
  await page.reload();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    const limit = Object.keys(localStorage).reduce((total, key) => total + localStorage.getItem(key)!.length, 0) + 5;
    Storage.prototype.setItem = function boundedStorage(key, value): void {
      if (this === localStorage) {
        const used = Object.keys(localStorage).reduce((total, name) => total + (name === key ? 0 : localStorage.getItem(name)!.length), value.length);
        if (used > limit) throw new DOMException('full', 'QuotaExceededError');
      }
      original.call(this, key, value);
    };
  });
  const row = page.locator('.vocabulary-row[data-entry-key="alternate"]');
  await row.locator('[data-star-key="card"]').click();
  await row.getByRole('button', { name: '個別標註', exact: true }).click();
  await row.getByRole('button', { name: '標註英文單字「alternate」', exact: true }).click();
  await row.getByRole('button', { name: '標註 Noun 第 2 筆翻譯', exact: true }).click();
  await expect(row.locator('[data-star-key="card"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(row.locator('[data-star-save-error]')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('study-v11:guest:2026-10-20')!).__localSyncBase)).toBe('same-content-v1');
  await page.reload();
  await expect(row.locator('[data-star-key="card"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(row.locator('.is-word-starred')).toHaveText('alternate');
  await expect(row.getByRole('button', { name: '標註 Noun 第 2 筆翻譯', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('unrecoverable star storage failures show beside the card and never claim a saved mark', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as Window & { blockWordWrites: boolean }).blockWordWrites = true;
    Storage.prototype.setItem = function failWordWrites(key, value): void {
      if (this === localStorage && /^study-v11:guest:\d/.test(key) && (window as unknown as Window & { blockWordWrites: boolean }).blockWordWrites) throw new DOMException('full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  const row = page.locator('.vocabulary-row[data-entry-key="alternate"]');
  await row.getByRole('button', { name: '個別標註', exact: true }).click();
  const buttons = [row.locator('[data-star-key="card"]'), row.getByRole('button', { name: '標註英文單字「alternate」', exact: true }), row.getByRole('button', { name: '標註 Noun 第 2 筆翻譯', exact: true })];
  for (const button of buttons) {
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(row.locator('[data-star-save-error]')).toContainText('空間不足');
  }
  await page.evaluate(() => { (window as unknown as Window & { blockWordWrites: boolean }).blockWordWrites = false; });
  for (const button of buttons) { await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true'); }
  await expect(row.locator('[data-star-save-error]')).toHaveCount(0);
});
