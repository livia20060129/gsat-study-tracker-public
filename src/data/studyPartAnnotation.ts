/** A split such as (1/2) is not a Unit number, score field or unlabelled calendar date. */
export function hasStudyPartAnnotation(value: unknown): boolean {
  const text = String(value ?? '').replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 0xff10))
    .replace(/／/g, '/')
    .replace(/(?:日期|原定|原訂|原|補做日期)\s*[:：]?\s*[（(]?\s*(?:\d{4}[/-])?\d{1,2}[/-]\d{1,2}\s*[）)]?/g, '');
  const patterns = [/[（(]\s*(\d+)\s*\/\s*(\d+)\s*[）)]/g,
    /\b(?:unit|round|test)\s+(\d+)\s*\/\s*(\d+)(?!\s*\/)/gi,
    /(?:分段|部分|進度|part)\s*[】\]]?\s*[:：]?\s*(\d+)\s*\/\s*(\d+)(?!\s*\/)/gi,
    /^\s*(\d+)\s*\/\s*(\d+)\s*$/g];
  return patterns.some(pattern => [...text.matchAll(pattern)].some(match => {
    const part = Number(match[1]);
    const total = Number(match[2]);
    return part >= 1 && part <= total && total <= 100;
  }));
}
