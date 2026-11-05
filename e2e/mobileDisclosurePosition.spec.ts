import { expect, test, type Page } from '@playwright/test';

interface PositionFrame { y: number; followTop: number; height: number; time: number }
declare global { interface Window { mobileDisclosureFrames?: Promise<PositionFrame[]> } }

async function seed(page: Page): Promise<void> {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+08:00'));
  await page.goto('/todo.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
    for (const day of ['2026-11-04', '2026-09-01']) localStorage.setItem('study-v11:guest:' + day, JSON.stringify({ date: day, items: [{
      id: 'position', type: 'scienceReview', title: '物理開合定位', source: 'preset', required: true, done: false, minutes: '25',
      f: { subject: '物理', material: '新關鍵', start: '10', end: '12', progress: false, graded: false, corrected: false },
    }] }));
  });
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  await expect(page.locator('#todoLongTermCount')).toHaveText('1 項');
}

async function recordToggle(page: Page, selector: string, trigger: string): Promise<PositionFrame[]> {
  await page.evaluate(selector => {
    const panel = document.querySelector(selector)!;
    const following = document.querySelector('.todo-history-panel')!;
    window.mobileDisclosureFrames = new Promise(resolve => {
      document.addEventListener('click', function beforeClick(): void {
        const frames: PositionFrame[] = [];
        const start = performance.now();
        function sample(time: number): void {
          frames.push({ y: scrollY, followTop: following.getBoundingClientRect().top, height: panel.getBoundingClientRect().height, time });
        }
        sample(0);
        function next(): void {
          const elapsed = performance.now() - start;
          sample(elapsed);
          if (elapsed < 400) requestAnimationFrame(next);
          else resolve(frames);
        }
        requestAnimationFrame(next);
      }, { once: true, capture: true });
    });
  }, selector);
  await page.locator(trigger).click();
  return page.evaluate(() => window.mobileDisclosureFrames!);
}

for (const kind of ['card', 'details'] as const) test(`mobile ${kind} closes at the document bottom without a first-frame or cleanup jump`, async ({ page }, testInfo) => {
  await seed(page);
  const panel = kind === 'card' ? '#todoRecentList .todo-card' : '#todoLongTerm';
  const trigger = kind === 'card' ? panel + ' .todo-expand' : panel + ' > summary';
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const opening = await recordToggle(page, panel, trigger);
  for (let index = 1; index < opening.length; index += 1) {
    const previous = opening[index - 1], frame = opening[index];
    expect(Math.abs(frame.followTop - previous.followTop)).toBeLessThanOrEqual(Math.abs(frame.height - previous.height) + 5);
  }
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const frames = await recordToggle(page, panel, trigger);
  console.log('MOBILE_POSITION', kind, JSON.stringify(frames));
  await testInfo.attach(`mobile-${kind}-frames`, { body: JSON.stringify(frames), contentType: 'application/json' });
  const tops = frames.map(frame => frame.followTop);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(5);
  expect(frames[0].height - frames.at(-1)!.height).toBeGreaterThan(50);
});

test('mobile height-only viewport changes do not abruptly complete an opening disclosure', async ({ page }) => {
  await seed(page);
  const panel = page.locator('#todoRecentList .todo-card');
  await panel.locator('h3').click();
  await panel.evaluate(node => {
    const height = node.getAnimations().find(animation => animation.id === 'study-disclosure-height')!;
    height.pause(); height.currentTime = 80;
  });
  await page.setViewportSize({ width: 375, height: 720 });
  await expect(panel).toHaveAttribute('data-disclosure-motion', 'opening');
  await panel.evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.id.startsWith('study-disclosure-')).forEach(animation => animation.finish()));
  await expect(panel).not.toHaveAttribute('data-disclosure-motion');
  await expect(panel.locator('[data-todo-range="end"]')).toHaveValue('12');
});
