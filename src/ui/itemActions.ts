type ItemDeleteAction = 'delete-item' | 'mag-delete' | 'makeup-delete' | 'review-delete' | 'interactive-delete';

/** Shared bottom-left action row for user-removable cards; callers keep their existing deletion guards. */
export function renderItemDeleteFooter(action: ItemDeleteAction, index?: number): string {
  const entryIndex = index === undefined ? '' : ` data-index="${index}"`;
  return `<div class="item-footer-actions"><button type="button" class="delete" data-action="${action}"${entryIndex}>刪除此筆</button></div>`;
}
