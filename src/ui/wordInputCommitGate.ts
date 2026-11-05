interface WordInputScope { prefix: string; date: string }

/** A blur can complete a missed change event, but never commit an old date or account. */
export class WordInputCommitGate {
  private readonly scopes = new WeakMap<object, WordInputScope>();
  private readonly changed = new WeakSet<object>();

  focus(control: object, scope: WordInputScope): void {
    this.scopes.set(control, { ...scope });
    this.changed.delete(control);
  }

  change(control: object): void { this.changed.add(control); }

  leave(control: object, scope: WordInputScope): boolean {
    const original = this.scopes.get(control);
    const handled = this.changed.has(control);
    this.scopes.delete(control);
    this.changed.delete(control);
    return !handled && original?.prefix === scope.prefix && original.date === scope.date;
  }
}
