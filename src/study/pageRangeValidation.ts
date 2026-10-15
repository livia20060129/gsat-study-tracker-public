export interface PageRangeValidation {
  valid: boolean;
  message: string;
}

function pageNumber(value: unknown): number | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

/** Empty boundaries are allowed while editing; completed ranges must be positive and ordered. */
export function validatePageRange(start: unknown, end: unknown): PageRangeValidation {
  const startPage = pageNumber(start);
  const endPage = pageNumber(end);
  const invalidBoundary = [startPage, endPage].some(page => (
    page !== null && (!Number.isInteger(page) || page < 1)
  ));
  if (invalidBoundary) {
    return { valid: false, message: '頁碼必須是 1 以上的整數，或留空。' };
  }
  if (startPage !== null && endPage !== null && endPage < startPage) {
    return { valid: false, message: '結束頁必須大於或等於起始頁。' };
  }
  return { valid: true, message: '' };
}
