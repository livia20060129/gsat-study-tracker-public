export type TodoDraftField = 'minutes' | 'start' | 'end' | 'completionDate';

/** Drafts belong to an account/date/item, never to a replaceable DOM node. */
export class TodoDrafts {
  private values = new Map<string, Partial<Record<TodoDraftField, string>>>();

  value(key: string, field: TodoDraftField, fallback: string): string {
    return this.values.get(key)?.[field] ?? fallback;
  }

  set(key: string, field: TodoDraftField, value: string): void {
    this.values.set(key, { ...this.values.get(key), [field]: value });
  }

  has(key: string, field: TodoDraftField): boolean {
    return Object.prototype.hasOwnProperty.call(this.values.get(key) ?? {}, field);
  }

  hasRecordEdits(date: string): boolean {
    return [...this.values].some(([key, value]) => key.startsWith(`${date}:`)
      && Object.keys(value).some(field => field !== 'completionDate'));
  }

  remove(key: string, ...fields: TodoDraftField[]): void {
    const draft = this.values.get(key);
    if (!draft) return;
    for (const field of fields) delete draft[field];
    if (!Object.keys(draft).length) this.values.delete(key);
  }

  clear(): void { this.values.clear(); }
}
