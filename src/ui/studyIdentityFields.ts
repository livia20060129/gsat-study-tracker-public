import { studyBookIncludes, studyHeadingText, studyReferenceText, type StudyRangeKind } from './studyDisplayText.ts';
import { applyStudyHeadingHierarchy, studyFieldHierarchy } from './studyFieldHierarchy.ts';

const IDENTITY_LABELS = new Set(['科目', '書名', '書名／教材', '書名/教材', '講義版本', '國文項目']);
const SCOPE_LABELS = new Set(['回數', '回次', 'Unit', 'Test', '主題']);
const FIELD_ROWS = [
  '.math-main-row', '.science-main-row', '.chinese-book-main-row', '.english-book-row',
  '.english-book-page-row', '.english-title-half', '.grid-2', '.grid-3', '.grid-4', '.field-grid',
].join(',');

const sourceText = new WeakMap<HTMLElement, { source: string; output: string }>();

/** Keep source text in the view only, so live range edits can reveal previously repeated chapters. */
function originalText(element: HTMLElement): string {
  const current = element.textContent ?? '';
  const saved = sourceText.get(element);
  return saved?.output === current ? saved.source : current;
}

function displayText(element: HTMLElement, value: string): void {
  const source = originalText(element);
  if (element.textContent !== value) element.textContent = value;
  sourceText.set(element, { source, output: value });
}

function ownedElements<T extends HTMLElement>(card: HTMLElement, selector: string): T[] {
  return [...card.querySelectorAll<T>(selector)].filter(element => element.closest('[data-item]') === card);
}

function rangeKinds(card: HTMLElement): StudyRangeKind[] {
  const kinds = new Set<StudyRangeKind>();
  for (const input of ownedElements<HTMLInputElement>(card, 'input[data-field]')) {
    const field = input.dataset.field;
    if (field === 'start' || field === 'end') kinds.add('pages');
    if (field === 'unitStart' || field === 'unitEnd' || field === 'unit') kinds.add('unit');
    if (field === 'round' || field === 'roundEnd') kinds.add('round');
  }
  for (const label of ownedElements(card, '.field > label')) {
    const text = label.textContent?.trim() ?? '';
    if (/^(起始|結束)頁$/.test(text)) kinds.add('pages');
  }
  return [...kinds];
}

function deduplicateCard(card: HTMLElement): void {
  const kinds = rangeKinds(card);
  const fields = ownedElements(card, '.field');
  for (const field of fields) {
    const label = field.querySelector(':scope > label')?.textContent ?? '';
    field.dataset.studyHierarchy = field.closest('.study-reference-details') ? 'detail' : studyFieldHierarchy(label);
  }
  const selectedBooks = fields.flatMap(field => {
    const label = field.querySelector(':scope > label')?.textContent?.trim() ?? '';
    const select = field.querySelector<HTMLSelectElement>('select');
    if (!IDENTITY_LABELS.has(label) || !select?.value) return [];
    return [select.hasAttribute('data-chinese-kind') ? select.selectedOptions[0].textContent ?? select.value : select.value];
  });
  const readonlyMaterials = fields.flatMap(field => {
    const label = field.querySelector(':scope > label')?.textContent?.trim();
    if (label !== '講義版本' || field.querySelector('input,select,textarea')) return [];
    const value = field.querySelector<HTMLElement>(':scope > .fixed-book-value');
    return value ? [originalText(value)] : [];
  });
  const heading = card.querySelector<HTMLElement>(':scope > .item-top .item-title');
  if (heading) {
    const title = studyHeadingText(originalText(heading), [...selectedBooks, ...readonlyMaterials], kinds);
    const subjects: Record<string, string> = { chinese: '國文', english: '英文', math: '數學', science: '自然' };
    const subject = Object.entries(subjects).find(([key]) => card.classList.contains(`subject-${key}`))?.[1];
    displayText(heading, title || subject || '讀書項目');
  }
  const context = [heading?.textContent ?? '', ...selectedBooks];
  let parent = card.parentElement?.closest<HTMLElement>('[data-item]');
  while (parent) {
    context.push(parent.querySelector(':scope > .item-top .item-title')?.textContent ?? '');
    parent = parent.parentElement?.closest<HTMLElement>('[data-item]');
  }
  const changedRows = new Set<HTMLElement>();
  for (const field of fields) {
    if (field.closest('.study-reference-details') || field.querySelector('input,select,textarea')) continue;
    const row = field.parentElement;
    if (!row?.matches(FIELD_ROWS)) continue;
    const label = field.querySelector(':scope > label')?.textContent?.trim() ?? '';
    const value = field.querySelector<HTMLElement>(':scope > .fixed-book-value');
    if (!value) continue;
    const text = originalText(value);
    const scope = SCOPE_LABELS.has(label);
    const remaining = scope ? studyReferenceText(text, context) : text;
    if (scope) displayText(value, remaining);
    const repeated = label !== '講義版本' && IDENTITY_LABELS.has(label)
      ? context.some(previous => studyBookIncludes(previous, text))
      : scope && !remaining;
    field.hidden = repeated;
    if (!repeated) context.push(remaining);
    if (repeated || row.classList.contains('study-fields-deduplicated')) changedRows.add(row);
  }
  for (const row of changedRows) {
    const count = [...row.children].filter(child => !(child as HTMLElement).hidden).length;
    row.hidden = count === 0;
    row.classList.add('study-fields-deduplicated');
    row.style.setProperty('--study-field-count', String(count));
  }
  for (const reference of ownedElements(card, '.study-reference-details')) {
    for (const field of reference.querySelectorAll<HTMLElement>('.field')) {
      const value = field.querySelector<HTMLElement>(':scope > .small, :scope > .fixed-book-value');
      if (!value) continue;
      const label = field.querySelector<HTMLElement>(':scope > label');
      if (label) displayText(label, originalText(label).split('｜').filter(part => !context.some(previous => studyBookIncludes(previous, part))).join('｜'));
      const text = studyReferenceText(originalText(value), context, kinds);
      displayText(value, text);
      field.hidden = !text;
      if (text) context.push(text);
    }
    reference.hidden = ![...reference.querySelectorAll<HTMLElement>('.field')].some(field => !field.hidden);
  }
  const inner = card.querySelector<HTMLElement>(':scope > .inner');
  if (inner) {
    const visible = [...inner.children].filter(child => !(child as HTMLElement).hidden);
    inner.classList.toggle('study-inner-empty', !visible.length);
    inner.classList.toggle('study-inner-checks-only', visible.every(child => child.matches('.checkline,[data-correction-reason]')));
  }
  if (heading) applyStudyHeadingHierarchy(heading);
}

/** Apply the same presentation rules on initial render and after live range edits. Never change records. */
export function deduplicateStudyIdentityFields(root: ParentNode): void {
  const cards = [...root.querySelectorAll<HTMLElement>('.study-record-section [data-item]')];
  if (root instanceof HTMLElement && root.matches('.study-record-section [data-item]')) cards.unshift(root);
  for (const card of cards) deduplicateCard(card);
}
