import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SITE_SECURITY_HEADERS, cloudflareSecurityHeaders, injectStaticSecurityMeta } from '../src/config/siteSecurityHeaders.ts';

test('static hosting headers block foreign scripts, plugins, framing and inline handlers', () => {
  const csp=SITE_SECURITY_HEADERS['Content-Security-Policy'];
  assert.match(csp,/script-src 'self';/);
  assert.match(csp,/script-src-attr 'none'/);
  assert.match(csp,/frame-ancestors 'none'/);
  assert.match(csp,/object-src 'none'/);
  assert.doesNotMatch(csp,/unsafe-eval|script-src[^;]*unsafe-inline/);
  assert.match(cloudflareSecurityHeaders(), /\/assets\/\*[\s\S]*immutable/);
  assert.equal(SITE_SECURITY_HEADERS['X-Content-Type-Options'],'nosniff');
});

test('every static host can enforce script CSP without pretending meta supports frame ancestors', () => {
  const html=injectStaticSecurityMeta('<html><head><script src="./app.js"></script></head><body></body></html>');
  assert.ok(html.indexOf('data-site-csp')<html.indexOf('<script'));
  assert.doesNotMatch(html,/frame-ancestors/);
  assert.equal(injectStaticSecurityMeta(html),html);
});

test('prompt copy uses an external listener and every Action is pinned to a full commit', () => {
  const html=readFileSync(new URL('../public/gpt.prompt.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/onclick=/);
  assert.match(html,/src="\.\/gpt-prompt\.js"/);
  const workflow=readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
  const actions=[...workflow.matchAll(/uses:\s*([\w/-]+)@([^\s]+)/g)];
  assert.ok(actions.length>=6);
  for (const [,name,ref] of actions) assert.match(ref,/^[a-f0-9]{40}$/,name);
});
