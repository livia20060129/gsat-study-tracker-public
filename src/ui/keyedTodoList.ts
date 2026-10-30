import type { OverdueTaskEntry } from '../study/overdueTasks.ts';

/** Reuses unchanged cards so background updates do not blur a focused input. */
export function updateTodoList(
  list: HTMLElement, entries: OverdueTaskEntry[], createCard: (entry: OverdueTaskEntry) => HTMLElement,
): void {
  const focused = document.activeElement instanceof HTMLInputElement ? document.activeElement : null;
  const focusKey = focused?.dataset.todoFocusKey;
  const existing = new Map(Array.from(list.children).map(node => [
    (node as HTMLElement).dataset.todoKey, node as HTMLElement,
  ]));
  const keep = new Set<HTMLElement>();
  entries.forEach(function updateEntry(entry, index): void {
    const signature = JSON.stringify(entry);
    const previous = existing.get(entry.key);
    const card = previous?.dataset.todoSignature === signature ? previous : createCard(entry);
    card.dataset.todoKey = entry.key;
    card.dataset.todoSignature = signature;
    keep.add(card);
    const position = list.children[index];
    if (position !== card) list.insertBefore(card, position ?? null);
  });
  Array.from(list.children).forEach(node => { if (!keep.has(node as HTMLElement)) node.remove(); });
  if (focusKey && focused && !focused.isConnected) {
    const replacement = Array.from(list.querySelectorAll<HTMLInputElement>('[data-todo-focus-key]'))
      .find(input => input.dataset.todoFocusKey === focusKey);
    replacement?.focus({ preventScroll: true });
  }
}
