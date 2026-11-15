interface StatusFeedbackContext { scope: string; issueKey: string }

/** Acknowledging a notice hides presentation only, without changing sync state. */
export function initializeStatusFeedback(
  row: HTMLElement,
  message: HTMLElement,
  acknowledge: HTMLButtonElement,
  foldedContent: HTMLElement,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  context: (text: string) => StatusFeedbackContext,
  restoreFocus: () => void,
): () => void {
  const acknowledged = new Map<string, string>();
  const position = document.createComment('status-feedback');
  row.before(position);
  let activeNotice = '';
  let foldTimer: ReturnType<typeof setTimeout> | undefined;
  function cancelFold(): void {
    if (foldTimer !== undefined) clearTimeout(foldTimer);
    foldTimer = undefined;
  }
  function current(): { key: string; signature: string; text: string } {
    const text = (message.textContent || '').trim();
    const { scope, issueKey } = context(text);
    return { key: scope + 'meta:acknowledged-status-notice', signature: JSON.stringify([text, issueKey]), text };
  }
  function refresh(): void {
    const { key, signature, text } = current();
    let dismissed = acknowledged.get(key) === signature;
    try { dismissed ||= storage.getItem(key) === signature; } catch { /* Optional local display preference. */ }
    row.hidden = !text || dismissed;
    if (row.hidden) { cancelFold(); activeNotice = ''; return; }
    const notice = JSON.stringify([key, signature]);
    if (notice === activeNotice) return;
    cancelFold(); activeNotice = notice;
    position.after(row);
    row.dataset.placement = 'summary';
    foldTimer = setTimeout(() => {
      foldTimer = undefined;
      if (row.hidden || activeNotice !== notice) return;
      foldedContent.prepend(row);
      row.dataset.placement = 'details';
    }, 5000);
  }
  acknowledge.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const { key, signature, text } = current();
    if (!text) return;
    acknowledged.set(key, signature);
    try { storage.setItem(key, signature); } catch { /* Keep it dismissed in this page if storage is full. */ }
    refresh();
    restoreFocus();
  });
  new MutationObserver(refresh).observe(message, { childList: true, subtree: true, characterData: true });
  refresh();
  return refresh;
}
