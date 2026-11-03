import type { Page } from '@playwright/test';

export async function showMobileSection(page: Page, section: 'date' | 'content' | 'tools'): Promise<void> {
    if (!await page.evaluate(() => matchMedia('(max-width: 1199px)').matches)) return;
    const button = page.locator(`#siteMobileBar [data-mobile-section="${section}"]`);
    // Keyboard focus also reveals a navigation bar hidden by a previous scroll.
    await button.focus();
    await button.click();
}

export async function navigateSite(page: Page, destination: string): Promise<void> {
    const summary = destination === 'summary.html';
    const rail = page.locator(summary ? '.site-rail-left' : '.site-rail-right');
    const compact = await page.evaluate(() => matchMedia('(max-width: 1199px)').matches);
    if (compact && destination === 'index.html') {
        await page.locator('.site-mobile-home').focus();
        await page.locator('.site-mobile-home').click();
        return;
    }
    if (compact) await showMobileSection(page, summary ? 'date' : 'tools');
    await rail.locator(`a[href="./${destination}"]`).click();
}
export async function goHome(page: Page): Promise<void> { await navigateSite(page, 'index.html'); }

export async function selectStudyDate(page: Page, date: string): Promise<void> {
    const input = page.locator('#studyDate');
    const rail = page.locator('.site-rail-left');
    const compact = await page.evaluate(() => matchMedia('(max-width: 1199px)').matches);
    if (compact) await showMobileSection(page, 'date');
    await input.fill(date);
    await input.dispatchEvent('change');
    if (compact) await showMobileSection(page, 'content');
    if (await page.locator('.site-mobile-bar').isVisible()) await rail.waitFor({ state: 'hidden' });
}
