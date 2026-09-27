import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageNames = ['privacy', 'terms', 'support'];
const pages = Object.fromEntries(pageNames.map(name => [
  name,
  readFileSync(new URL(`../public/${name}.html`, import.meta.url), 'utf8'),
]));
const languageScript = readFileSync(new URL('../public/legal-language.js', import.meta.url), 'utf8');

test('all public legal and support pages offer the same bilingual control', () => {
  for (const [name, html] of Object.entries(pages)) {
    assert.match(html, /data-legal-language="zh-Hant"[^>]*aria-pressed="true"/, `${name}: Chinese control`);
    assert.match(html, /data-legal-language="en"[^>]*aria-pressed="false"/, `${name}: English control`);
    assert.match(html, /data-legal-panel="zh-Hant"/, `${name}: Chinese panel`);
    assert.match(html, /data-legal-panel="en" lang="en" hidden/, `${name}: English panel`);
    assert.match(html, /src="\.\/legal-language\.js" defer/, `${name}: shared language controller`);
  }
  assert.match(languageScript, /localStorage\.setItem\(LANGUAGE_STORAGE_KEY, language\)/);
  assert.match(languageScript, /document\.documentElement\.lang = selected/);
  assert.match(languageScript, /url\.searchParams\.set\('lang'/);
});

test('English privacy policy explicitly discloses AI and Limited Use handling', () => {
  assert.match(pages.privacy, /does not integrate with any third-party artificial intelligence or machine learning API/);
  assert.match(pages.privacy, /Google Workspace API data is not used to train, improve, or evaluate generalized AI\/ML models/);
  assert.match(pages.privacy, /adheres to the[\s\S]*Google API Services User Data Policy[\s\S]*including the Limited Use requirements/);
  assert.match(pages.privacy, /static text page and copy tool/);
});
