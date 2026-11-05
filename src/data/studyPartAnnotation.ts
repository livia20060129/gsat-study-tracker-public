const PART_PATTERNS = [
  /[（(]\s*(\d+)\s*\/\s*(\d+)\s*[）)]/g,
  /\b(?:unit|round|test)\s+(\d+)\s*\/\s*(\d+)(?!\s*\/)/gi,
  /(?:分段|部分|進度|part)\s*[】\]]?\s*[:：]?\s*(\d+)\s*\/\s*(\d+)(?!\s*\/)/gi,
  /^\s*(\d+)\s*\/\s*(\d+)\s*$/g,
];

/** A split such as (1/2) is not a Unit number, score field or unlabelled calendar date. */
export function hasStudyPartAnnotation(value: unknown): boolean {
  const source = String(value ?? '');
  if (!source.includes('/') && !source.includes('／')) return false;
  const text = source.replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 0xff10))
    .replace(/／/g, '/')
    .replace(/(?:日期|原定|原訂|原|補做日期)\s*[:：]?\s*[（(]?\s*(?:\d{4}[/-])?\d{1,2}[/-]\d{1,2}\s*[）)]?/g, '');
  for (const pattern of PART_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const part = Number(match[1]);
      const total = Number(match[2]);
      if (part >= 1 && part <= total && total <= 100) return true;
    }
  }
  return false;
}
