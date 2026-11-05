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
  const initialBatch = existing.size === 0 ? document.createDocumentFragment() : null;
  let position = list.firstElementChild;
  for (const entry of entries) {
    const signature = JSON.stringify(entry);
    const previous = existing.get(entry.key);
    const card = previous?.dataset.todoSignature === signature ? previous : createCard(entry);
    card.dataset.todoKey = entry.key;
    card.dataset.todoSignature = signature;
    existing.delete(entry.key);
    if (initialBatch) initialBatch.append(card);
    else {
      if (position !== card) list.insertBefore(card, position);
      // A changed card replaces the old position; unchanged controls retain their node and focus.
      if (previous && previous !== card) previous.remove();
      position = card.nextElementSibling;
    }
  }
  if (initialBatch) list.append(initialBatch);
  for (const obsolete of existing.values()) obsolete.remove();
  if (focusKey && focused && !focused.isConnected) {
    const replacement = Array.from(list.querySelectorAll<HTMLInputElement>('[data-todo-focus-key]'))
      .find(input => input.dataset.todoFocusKey === focusKey);
    replacement?.focus({ preventScroll: true });
  }
}
