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
  edit.textContent = '✎';
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
  return input;
}
