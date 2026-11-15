import { expect, test } from '@playwright/test';
test('Word downloads respect the selected list, preserve saved data and support blank answers', async ({ page }, testInfo) => {
    await page.goto('/vocabulary.review.html');
    await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:guest:');
        localStorage.setItem('study-v11:guest:2026-11-02', JSON.stringify({ date: '2026-11-02', items: [{ id: 'review', type: 'englishVocabInteractive', done: false, minutes: '', required: false, f: { words: [
                            { text: 'alternate', noun: true, verb: true, translationsByPartOfSpeech: { noun: ['代替者', '候補者'], verb: ['輪流'] } },
                            ...Array.from({ length: 45 }, (_, index) => ({ text: `word ${index + 1}`, noun: true, translationsByPartOfSpeech: { noun: ['中文第一個意思', '中文第二個意思，確認較長的翻譯能夠正常換行。'] } })),
                        ] } }] }));
    });
    await page.reload();
    const original = await page.evaluate(() => localStorage.getItem('study-v11:guest:2026-11-02'));
    await page.locator('#vocabularyExportFormat').selectOption('docx');
    for (const small of [true, false]) {
        await page.locator('#vocabularySearch').fill(small ? 'alternate' : '');
        for (const translated of [true, false]) {
            const pending = page.waitForEvent('download');
            await page.getByRole('button', { name: `${translated ? '有' : '無'}翻譯`, exact: true }).click();
            const download = await pending;
            expect(download.suggestedFilename()).toMatch(/\.docx$/);
            await download.saveAs(testInfo.outputPath(`${small ? 'single' : 'multipage'}-${translated ? 'translated' : 'blank'}.docx`));
            expect(await download.failure()).toBeNull();
        }
    }
    expect(await page.evaluate(() => localStorage.getItem('study-v11:guest:2026-11-02'))).toBe(original);
    await page.locator('#vocabularyExportFormat').selectOption('pdf');
    await expect(page.getByRole('button', { name: '有翻譯', exact: true })).toBeVisible();
});
