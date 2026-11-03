import assert from 'node:assert/strict';
import test from 'node:test';
import { requestedStudyDate, siteNavigationPage } from '../src/ui/siteNavigation.ts';

test('deployment routes select the same page with or without .html and trailing slash', () => {
  for (const name of ['index', 'todo', 'summary', 'material.progress', 'material.catalog', 'vocabulary.review', 'vocabulary.sources', 'gpt.prompt', 'privacy', 'terms', 'support']) {
    for (const prefix of ['', '/gsat-study-tracker']) {
      for (const suffix of ['', '.html', '/', '.html/']) {
        assert.equal(siteNavigationPage(`${prefix}/${name}${suffix}`), `${name}.html`);
      }
    }
  }
});

test('home remains selected at the site root and a hosted project folder root', () => {
  for (const path of ['', '/', '/gsat-study-tracker/', '/nested/project/']) {
    assert.equal(siteNavigationPage(path), 'index.html');
  }
});

test('unknown routes do not select another page by a partial name', () => {
  for (const path of ['/todo-backup', '/archived-summary.html', '/not-a-page']) {
    assert.equal(siteNavigationPage(path), path.slice(1));
  }
});

test('sidebar date links accept real calendar dates and reject malformed dates', () => {
  assert.equal(requestedStudyDate('?date=2026-11-02'), '2026-11-02');
  assert.equal(requestedStudyDate('?date=2028-02-29&calendar=connected'), '2028-02-29');
  for (const value of ['2026-02-29', '2026-13-01', '2026-11-31', 'bad', '2026-1-2', '']) {
    assert.equal(requestedStudyDate(`?date=${value}`), '');
  }
});
