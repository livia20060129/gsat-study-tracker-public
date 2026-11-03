import { expect, test } from '@playwright/test';
import { expectCardHierarchy } from './helpers/studyCardHierarchy.ts';

const fixture = `
  <style>
    .item-title { font-size: 22px; font-weight: 800; }
    [data-study-hierarchy="range"] input { font-size: 18px; font-weight: 650; }
    .field > label { font-size: 12px; }
  </style>
  <main><article class="card">
    <h3 class="item-title">英文｜教材</h3>
    <div class="field" data-study-hierarchy="range"><label>起始頁</label><input value="12"></div>
  </article></main>`;

test('hierarchy reads remain valid while complete cards are replaced on every frame', async ({ page }) => {
  await page.setContent(fixture);
  await page.evaluate(() => {
    const host = document.querySelector('main')!;
    function replaceCard(): void {
      host.replaceChildren(host.firstElementChild!.cloneNode(true));
      host.dataset.replacements = String(Number(host.dataset.replacements ?? 0) + 1);
      requestAnimationFrame(replaceCard);
    }
    replaceCard();
  });
  for (let index = 0; index < 40; index += 1) {
    await expectCardHierarchy(page, '.card', '.item-title');
  }
  expect(Number(await page.locator('main').getAttribute('data-replacements'))).toBeGreaterThan(1);
});

test('hierarchy checks still reject smaller titles, insufficient detail contrast and lighter title weights', async ({ page }) => {
  await page.setContent(fixture);
  await expectCardHierarchy(page, '.card', '.item-title');

  await page.locator('.item-title').evaluate(node => { node.style.fontSize = '17px'; });
  await expect(expectCardHierarchy(page, '.card', '.item-title')).rejects.toThrow('Card title must be larger than its range');

  await page.locator('.item-title').evaluate(node => { node.style.fontSize = '22px'; });
  await page.locator('label').evaluate(node => { node.style.fontSize = '14px'; });
  await expect(expectCardHierarchy(page, '.card', '.item-title')).rejects.toThrow('Range must be at least 5px larger than details');

  await page.locator('label').evaluate(node => { node.style.fontSize = '12px'; });
  await page.locator('.item-title').evaluate(node => { node.style.fontWeight = '600'; });
  await expect(expectCardHierarchy(page, '.card', '.item-title')).rejects.toThrow('Card title must be heavier than its range');
});
