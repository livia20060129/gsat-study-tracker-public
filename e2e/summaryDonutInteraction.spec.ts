import { expect, test, type Page } from '@playwright/test';

async function prepareSummary(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00+08:00'));
  await page.goto('/summary.html#week');
  await page.evaluate(() => {
    localStorage.clear();
    const prefix = 'study-v11:guest:';
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem(prefix + '2026-10-17', JSON.stringify({ date: '2026-10-17', items: ['英文', '數學'].map(subject => ({
      id: subject, type: 'general', title: `${subject}完成項目`, done: true, minutes: '10',
      source: 'preset', required: true, f: { subject },
    })) }));
  });
  await page.reload();
  await expect(page.locator('#summaryCompletedItems li')).toHaveCount(2);
}

for (const width of [1280, 390]) {
  test(`returning donut graphics cannot intercept a new subject selection or enter the tab order (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1200 });
    await prepareSummary(page);
    await page.getByRole('button', { name: '查看英文項目', exact: true }).click();
    await expect(page.locator('#completedItemsTitle')).toHaveText('本週完成項目｜英文');
    await page.evaluate(() => {
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (keyframes, options): Animation {
        const animation = animate.call(this, keyframes, options);
        if (this.classList.contains('summary-donut-return-overlay')) {
          animation.pause();
          animation.currentTime = 355;
        }
        return animation;
      };
    });
    await page.locator('#summarySubjectDistribution [data-summary-back]').press('Enter');
    await expect(page.locator('#completedItemsTitle')).toHaveText('本週完成項目');
    const overlay = page.locator('.summary-donut-return-overlay');
    await expect(overlay).toHaveCount(1);
    const english = page.getByRole('button', { name: '查看英文項目', exact: true });
    const hit = await english.evaluate(button => {
      const bounds = button.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2, y = bounds.top + bounds.height / 2;
      const target = document.elementFromPoint(x, y);
      return { x, y, reachesButton: !!target && button.contains(target), interceptedBy: target?.outerHTML.slice(0, 160) };
    });
    expect(hit.reachesButton, hit.interceptedBy).toBe(true);
    await expect(page.getByRole('button', { name: '返回全部科目', exact: true })).toHaveCount(0);
    await page.mouse.click(hit.x, hit.y);
    await expect(page.locator('#completedItemsTitle')).toHaveText('本週完成項目｜英文');
    await page.getByRole('tab', { name: '月', exact: true }).click();
    await expect(page.locator('#completedItemsTitle')).toHaveText('本月完成項目｜英文');
    await overlay.evaluate(node => node.getAnimations().forEach(animation => animation.finish()));
    await expect(overlay).toHaveCount(0);
    await page.getByRole('button', { name: '顯示全部科目', exact: true }).click();
    await expect(page.locator('#completedItemsTitle')).toHaveText('本月完成項目');
    await expect(page.locator('#summaryCompletedItems li')).toHaveCount(2);
  });
}
