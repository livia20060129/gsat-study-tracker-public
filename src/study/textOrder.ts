const traditionalChinese = new Intl.Collator('zh-Hant');
const numberedChinese = new Intl.Collator('zh-TW', { numeric: true });

/** Reuse locale setup across large task lists while preserving each existing ordering. */
export function compareTraditionalChinese(left: string, right: string): number {
  return traditionalChinese.compare(left, right);
}

export function compareNumberedChinese(left: string, right: string): number {
  return numberedChinese.compare(left, right);
}
