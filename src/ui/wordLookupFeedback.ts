interface LookupAttempt { query: string; message: string }

/** Keep lookup failures visible when a background record refresh replaces the input node. */
export class WordLookupFeedback {
  private readonly attempts = new Map<string, LookupAttempt>();

  begin(key: string, query: string): LookupAttempt {
    const attempt = { query, message: '' };
    this.attempts.delete(key);
    this.attempts.set(key, attempt);
    if (this.attempts.size > 128) this.attempts.delete(this.attempts.keys().next().value!);
    return attempt;
  }

  fail(key: string, attempt: LookupAttempt, message: string): boolean {
    if (this.attempts.get(key) !== attempt) return false;
    attempt.message = message;
    return true;
  }

  succeed(key: string, attempt: LookupAttempt): void {
    if (this.attempts.get(key) === attempt) this.attempts.delete(key);
  }

  message(key: string, query: string): string {
    const attempt = this.attempts.get(key);
    return attempt?.query === query ? attempt.message : '';
  }
}
