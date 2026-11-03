export type StudyFieldHierarchy = 'identity' | 'range' | 'detail';

const IDENTITY_LABELS = new Set([
  '書名', '書名／教材', '書名/教材', '教材', '講義', '講義版本', '科目', '國文項目', '雜誌名稱',
]);
const RANGE_LABEL = /^(?:(?:起始|開始|結束)(?:頁|頁碼|Unit|回次|回數|回)|指定頁碼|頁碼(?:範圍)?|指定範圍|範圍|Unit(?:進度)?|回(?:數|次)|Test|冊(?:別|數)|單元(?:進度)?|題號(?:範圍)?)$/i;

/** Shared presentation roles for Tracker fields and todo detail rows. */
export function studyFieldHierarchy(label: string): StudyFieldHierarchy {
  const normalized = label.replace(/\s/g, '');
  if (IDENTITY_LABELS.has(normalized)) return 'identity';
  if (RANGE_LABEL.test(normalized)) return 'range';
  return 'detail';
}

/** Readonly scopes kept in a heading use the range tier without repeating their text. */
export function applyStudyHeadingHierarchy(heading: HTMLElement): void {
  const text = heading.textContent ?? '';
  const range = /第\s*\d+(?:\s*回)?(?:\s*[–—~～\-至到]\s*(?:第\s*)?\d+)?\s*回|\b(?:units?|tests?|rounds?|ch(?:apter)?\.?)\s*\d|\bp\.?\s*\d|(?:單元|主題)\s*\d/i.exec(text);
  if (!range || range.index === 0) return;
  const span = document.createElement('span');
  span.className = 'study-heading-range';
  span.textContent = text.slice(range.index);
  heading.replaceChildren(document.createTextNode(text.slice(0, range.index)), span);
}
