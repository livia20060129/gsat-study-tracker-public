import type { PendingSyncEntry } from '../application/cloud/pendingCloudSync.ts';
import { animateVisibility } from './disclosureMotion.ts';
import type { RangeCompletionFailure } from '../application/records/synchronizeRangeCompletion.ts';

const PHASE_LABELS = { waiting: '等待同步', queued: '已排入同步', uploading: '同步中',
  failed: '同步失敗，請手動重試', blocked: '需要處理', paused: '已暫停', conflict: '版本衝突' };
export type PendingSyncAction = 'retry' | 'pause' | 'open' | 'compare' | 'retry-ranges';

export interface PendingSyncDialog {
  open(): void;
  close(): void;
  render(entries: PendingSyncEntry[], rangeFailures?: RangeCompletionFailure[]): void;
  message(text: string): void;
  comparison(date: string, text: string): void;
}

export function initializePendingSyncDialog(
  dialog: HTMLDialogElement,
  act: (action: PendingSyncAction, date: string) => void,
  resolve: (choice: 'local' | 'cloud') => void,
): PendingSyncDialog {
  const list = dialog.querySelector<HTMLElement>('[data-pending-list]')!;
  const message = dialog.querySelector<HTMLElement>('[data-pending-message]')!;
  const comparison = dialog.querySelector<HTMLElement>('[data-pending-comparison]')!;
  const rows = new Map<string, HTMLElement>();
  const rangeSection=document.createElement('section');
  rangeSection.hidden=true;
  rangeSection.innerHTML='<h3>本機完成範圍對照</h3><p data-range-summary></p><ul data-range-failures></ul><button type="button" data-retry-ranges>重試本機對照</button>';
  list.after(rangeSection);
  rangeSection.querySelector('[data-retry-ranges]')!.addEventListener('click',()=>act('retry-ranges',''));
  dialog.querySelector('[data-pending-close]')!.addEventListener('click', function close(): void { dialog.close(); });
  for (const choice of ['local', 'cloud'] as const) {
    dialog.querySelector(`[data-pending-use="${choice}"]`)!.addEventListener('click', function choose(): void { resolve(choice); });
  }
  return {
    open(): void { if (!dialog.open) dialog.showModal(); },
    close(): void { dialog.close(); },
    message(text): void { message.textContent = text; },
    comparison(date, text): void {
      if (!date) animateVisibility(comparison, false);
      comparison.querySelector('[data-pending-date]')!.textContent = date;
      comparison.querySelector('[data-pending-diff]')!.textContent = text;
      if (date) animateVisibility(comparison, true);
    },
    render(entries,rangeFailures=[]): void {
      rangeSection.hidden=!rangeFailures.length;
      rangeSection.querySelector('[data-range-summary]')!.textContent=`${rangeFailures.length} 天尚未更新本機對照；此清單與 Cloud 上傳分開。`;
      const rangeList=rangeSection.querySelector('[data-range-failures]')!;
      const nextRangeText=rangeFailures.map(failure=>failure.date+'：'+failure.reason).join('\n');
      if(rangeList.textContent!==nextRangeText){
        rangeList.replaceChildren(...rangeFailures.map((failure,index)=>{
          const row=document.createElement('li');row.textContent=(index?'\n':'')+failure.date+'：'+failure.reason;return row;
        }));
      }
      dialog.querySelector('[data-pending-count]')!.textContent = entries.length ? `${entries.length} 天尚待確認或處理` : '目前沒有待同步紀錄';
      const dates = new Set(entries.map(entry => entry.date));
      for (const [date, row] of rows) if (!dates.has(date)) { row.remove(); rows.delete(date); }
      for (const [index, entry] of entries.entries()) {
        let row = rows.get(entry.date);
        if (!row) {
          row = document.createElement('article');
          row.className = 'pending-sync-row';
          row.dataset.pendingDate = entry.date;
          row.innerHTML = '<div class="pending-sync-row-heading"><strong data-date></strong><span data-state></span></div><p data-reason></p><small data-attempt></small><div class="pending-sync-actions"></div>';
          row.querySelector('[data-date]')!.textContent = entry.date;
          for (const [action, label] of [['retry', '重試同步'], ['pause', '暫停此日同步'], ['open', '前往當日'], ['compare', '比較與處理']] as const) {
            const button = document.createElement('button');
            button.type = 'button'; button.textContent = label; button.dataset.pendingAction = action;
            button.addEventListener('click', function activate(): void { act(action, entry.date); });
            row.querySelector('.pending-sync-actions')!.append(button);
          }
          list.append(row); rows.set(entry.date, row);
        }
        const position = list.children[index];
        if (position !== row) list.insertBefore(row, position ?? null);
        row.querySelector('[data-state]')!.textContent = PHASE_LABELS[entry.phase];
        row.querySelector('[data-reason]')!.textContent = entry.reason;
        row.querySelector('[data-attempt]')!.textContent = entry.attemptedAt
          ? `上次嘗試 ${new Date(entry.attemptedAt).toLocaleTimeString('zh-TW', { hour12: false })}` : '';
        const busy = entry.phase === 'uploading' || entry.phase === 'queued';
        for (const button of row.querySelectorAll<HTMLButtonElement>('button')) button.disabled = busy;
        const retry = row.querySelector<HTMLButtonElement>('[data-pending-action="retry"]')!;
        retry.textContent = entry.phase === 'paused' ? '恢復並重試' : '重試同步';
        retry.disabled = busy || entry.phase === 'conflict';
        row.querySelector<HTMLButtonElement>('[data-pending-action="pause"]')!.disabled = entry.phase === 'uploading' || entry.phase === 'paused' || entry.phase === 'conflict';
        row.querySelector<HTMLButtonElement>('[data-pending-action="open"]')!.disabled = false;
        row.querySelector<HTMLButtonElement>('[data-pending-action="compare"]')!.disabled = false;
      }
    },
  };
}
