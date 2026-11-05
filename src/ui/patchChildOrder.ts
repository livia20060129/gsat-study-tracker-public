/** Move only changed positions; retained controls keep their node, selection and focus. */
export function patchChildOrder(parent: HTMLElement, children: readonly HTMLElement[]): void {
  const keep = new Set(children);
  if (!parent.children.length) {
    const batch = document.createDocumentFragment();
    batch.append(...children);
    parent.append(batch);
    return;
  }
  let cursor = parent.firstElementChild;
  for (const child of children) {
    if (child !== cursor) parent.insertBefore(child, cursor);
    cursor = child.nextElementSibling;
  }
  for (const child of [...parent.children]) if (!keep.has(child as HTMLElement)) child.remove();
}
