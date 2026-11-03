import { shiftCalendarDate } from '../study/sleep.ts';

const SITE_PAGE_NAMES = new Set([
  'index', 'todo', 'summary', 'material.progress', 'material.catalog',
  'vocabulary.review', 'vocabulary.sources', 'gpt.prompt', 'privacy', 'terms', 'support',
]);

export function requestedStudyDate(search: string): string {
  const value = new URLSearchParams(search).get('date') ?? '';
  return shiftCalendarDate(value, 0) === value ? value : '';
}

/** Cloudflare removes .html; GitHub Pages can serve the same app below a folder. */
export function siteNavigationPage(pathname: string): string {
  const segment = pathname.replace(/\/+$/, '').split('/').pop() ?? '';
  const name = segment.replace(/\.html$/, '');
  if (SITE_PAGE_NAMES.has(name)) return `${name}.html`;
  if (!pathname || pathname.endsWith('/')) return 'index.html';
  return segment;
}
