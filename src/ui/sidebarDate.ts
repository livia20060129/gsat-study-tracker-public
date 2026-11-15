import { requestedStudyDate } from './siteNavigation.ts';

/** Move the original date input so its storage and date-switch listeners stay intact. */
export function initializeSidebarDate(rail: HTMLElement, today: string, onChange: () => void): HTMLInputElement {
  const original = document.getElementById('studyDate') as HTMLInputElement | null;
  const sourceField = original?.closest('.field');
  const input = original ?? document.createElement('input');
  const dateText = rail.querySelector<HTMLElement>('[data-rail-date]')!;
  const control = document.createElement('label');
  control.className = 'site-rail-date-control';
  dateText.replaceWith(control);
  input.type = 'date';
  input.classList.add('site-date-input');
  input.id ||= 'siteRecordDate';
  input.value ||= requestedStudyDate(location.search) || today;
  input.setAttribute('aria-label', '修改紀錄日期');
  control.htmlFor = input.id;
  const edit = document.createElement('span');
  edit.className = 'site-date-edit';
  edit.dataset.uiIcon = 'pencil';
  edit.setAttribute('aria-hidden', 'true');
  control.append(dateText, edit, input);
  sourceField?.remove();
  input.addEventListener('click', function openNativePicker(event): void {
    if (typeof input.showPicker !== 'function') return;
    try {
      input.showPicker();
      event.preventDefault();
    } catch { /* The input's native interaction remains available in older browsers. */ }
  });
  input.addEventListener('change', function changeRecordDate(): void {
    if (!original && input.value) {
      const tracker = new URL('./index.html', location.href);
      tracker.searchParams.set('date', input.value);
      location.assign(tracker.href);
      return;
    }
    onChange();
  });
  rail.querySelector('.site-week-ticks')?.addEventListener('click', function openWeekday(event): void {
    const click = event as MouseEvent;
    if (!original || click.defaultPrevented || click.button !== 0 || click.metaKey || click.ctrlKey || click.altKey || click.shiftKey || !(click.target instanceof Element)) return;
    const link = click.target.closest<HTMLAnchorElement>('a[data-week-date]');
    if (!link || link.download || (link.target && link.target !== '_self')) return;
    const date = requestedStudyDate(new URL(link.href).search);
    if (!date) return;
    click.preventDefault();
    input.value = date;
    // Keep Tracker's save-before-switch handling, including a failed save
    // restoring the original input value, and the mobile return to content.
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (input.value !== date) return;
    const url = new URL(location.href);
    url.searchParams.set('date', date);
    history.replaceState(history.state, '', url);
  });
  return input;
}
