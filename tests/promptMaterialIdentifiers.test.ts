import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const promptHtml = readFileSync(new URL('../public/gpt.prompt.html', import.meta.url), 'utf8');

test('Calendar prompt contains every Natural New Key material identifier', () => {
  const identifiers = [
    'GSAT-BIO-NEWKEY',
    'GSAT-CHEM-NEWKEY',
    'GSAT-PHYS-NEWKEY',
    'GSAT-EARTH-NEWKEY',
  ];

  for (const identifier of identifiers) {
    assert.match(promptHtml, new RegExp(`<code>${identifier}</code>`));
  }
});

test('Calendar prompt keeps per-event identifiers unique', () => {
  assert.match(promptHtml, /主碼後加入日期、週次、主題、課次或回次/);
  assert.match(promptHtml, /GSAT-BIO-NEWKEY-20260919/);
});

test('Azar prompt uses printed pages without a material-version field', () => {
  assert.match(promptHtml, /Azar 英文文法（中階）範例<\/h3><pre>【頁碼範圍】p\.18–29\r?\n【識別碼】GSAT-AZAR-2026-W03<\/pre>/);
  assert.match(promptHtml, /Azar 不加 <code>【講義版本】<\/code>/);
});
