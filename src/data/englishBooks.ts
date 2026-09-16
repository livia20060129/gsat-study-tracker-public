export const LISTENING_TEST_BOOK_TITLE = '大考英聽A攻略';
export const LISTENING_TEST_MIN = 1;
export const LISTENING_TEST_MAX = 10;

export function isListeningTestBookTitle(value: unknown): boolean {
  const title = String(value ?? '').trim();
  return title === LISTENING_TEST_BOOK_TITLE || title === `英文：${LISTENING_TEST_BOOK_TITLE}`;
}

/** Reads `Test N` and `Test N-M` scopes while rejecting tests outside the book's 1-10 range. */
export function listeningTestNumbers(value: string): number[] {
  const tests = new Set<number>();
  const pattern = /\bTest\s*(\d+)(?:\s*[–—~\-至到]\s*(?:Test\s*)?(\d+))?/gi;
  for (const match of value.matchAll(pattern)) {
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) continue;
    for (let test = start; test <= end; test += 1) {
      if (test >= LISTENING_TEST_MIN && test <= LISTENING_TEST_MAX) tests.add(test);
    }
  }
  return [...tests].sort((left, right) => left - right);
}
