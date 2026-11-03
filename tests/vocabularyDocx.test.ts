import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { vocabularyDocxDocument } from '../src/study/vocabularyDocx.ts';
import { vocabularyReviewEntries } from '../src/study/vocabularyReview.ts';
import type { StudyRecord } from '../src/types.ts';
function entries() {
    const record: StudyRecord = { date: '2026-11-02', items: [{ id: 'review', type: 'englishVocabInteractive', done: false, minutes: '', required: false,
                f: { words: [{ text: 'alternate', noun: true, verb: true, translationsByPartOfSpeech: { noun: ['代替者', '候補者'], verb: ['輪流'] },
                            dictionarySources: [{ provider: 'ecdict', label: 'ECDICT', url: 'https://github.com/skywind3000/ECDICT', license: 'MIT' }] }] } }] };
    return vocabularyReviewEntries([record]);
}
test('DOCX is a real OOXML archive with A4 whitespace, repeated headings and merged rows', async () => {
    const words = entries(), before = structuredClone(words);
    const zip = await JSZip.loadAsync(await (await vocabularyDocxDocument(words, '單字', true)).arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    assert.match(xml, /w:pgMar[^>]*w:top="1134"/);
    assert.match(xml, /w:tblHeader/);
    assert.match(xml, /w:vMerge w:val="restart"/);
    assert.match(xml, /w:vMerge w:val="continue"/);
    assert.match(xml, /w:cantSplit/);
    for (const term of ['alternate', '代替者', '候補者', '輪流'])
        assert.ok(xml.includes(term));
    assert.deepEqual(words, before);
});
test('blank DOCX keeps individual answer cells but no hidden translations', async () => {
    const zip = await JSZip.loadAsync(await (await vocabularyDocxDocument(entries(), '單字', false)).arrayBuffer());
    for (const [name, file] of Object.entries(zip.files)) {
        if (file.dir || !name.endsWith('.xml'))
            continue;
        const xml = await file.async('string');
        for (const answer of ['代替者', '候補者', '輪流'])
            assert.equal(xml.includes(answer), false);
    }
    const xml = await zip.file('word/document.xml')!.async('string');
    assert.equal((xml.match(/<w:tr>/g) ?? []).length, 4);
});
test('DOCX safely escapes entered text and includes source notices when exporting dictionary meanings', async () => {
    const words = entries();
    words[0].text = '<tag>&word';
    words[0].referenceSources = { ceec: true, ecdict: true };
    const zip = await JSZip.loadAsync(await (await vocabularyDocxDocument(words, '單字', true)).arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    assert.ok(xml.includes('&lt;tag&gt;&amp;word'));
    assert.ok(xml.includes('MIT License'));
    assert.ok(xml.includes('大學入學考試中心'));
});
