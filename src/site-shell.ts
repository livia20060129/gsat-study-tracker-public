import { initialRecordPrefix } from './storage/local.ts';
import { decodeStudyRecord } from './storage/studyRecordCodec.ts';
import { overdueTasks } from './study/overdueTasks.ts';
import { overdueEntriesForPeriod } from './study/overduePeriod.ts';
import { overduePreviewGroups } from './study/overdueItemFilter.ts';
import { studyItemProgress } from './study/itemProgress.ts';
import { siteNavigationPage } from './ui/siteNavigation.ts';
import { initializeSidebarDate } from './ui/sidebarDate.ts';
import { initializeDisclosureMotion } from './ui/disclosureMotion.ts';
import { initializeMobileSections } from './ui/mobileSections.ts';
import type { StudyItem, StudyRecord } from './types.ts';
initializeDisclosureMotion();
const cache = new Map<string, {
    raw: string;
    record: StudyRecord;
}>();
const currentPage = siteNavigationPage(location.pathname);
function dateKey(date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function escapeText(text: string): string {
    return text.replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]!);
}
function hasStudyInput(item: StudyItem): boolean {
    if (item.done || Number(item.minutes) > 0 || studyItemProgress(item).some(progress => progress.checked))
        return true;
    return Object.entries(item.f ?? {}).some(([key, value]) => {
        if (key === 'words')
            return Array.isArray(value) && value.some(word => typeof word === 'string' ? word.trim() : word?.text?.trim());
        if (Array.isArray(value))
            return value.some(child => child && typeof child === 'object' && 'f' in child && hasStudyInput(child as StudyItem));
        return false;
    });
}
function hasRecordInput(record: StudyRecord): boolean {
    return Boolean(record.mood || record.wakeTime || record.bedtime || record.notes?.trim() || record.biggestBlock?.trim() || record.firstThingTomorrow?.trim() || record.items.some(hasStudyInput));
}
const left = document.getElementById('siteLeftRail')!;
const right = document.getElementById('siteRightRail')!;
const bar = document.getElementById('siteMobileBar')!;
const mobileSections = initializeMobileSections(left, right, bar);
if (currentPage === 'index.html') bar.querySelector('.site-mobile-home')!.setAttribute('aria-current', 'page');
const railScrollKey = 'study-v11:ui:rail-scroll';
function saveRailScroll(): void {
    try { sessionStorage.setItem(railScrollKey, JSON.stringify([left.scrollTop, right.scrollTop])); }
    catch { /* Navigation still works when session storage is unavailable. */ }
}
function restoreRailScroll(): void {
    try {
        const saved: unknown = JSON.parse(sessionStorage.getItem(railScrollKey) ?? 'null');
        if (!Array.isArray(saved) || saved.length !== 2 || !saved.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) return;
        left.scrollTop = saved[0];
        right.scrollTop = saved[1];
    } catch { /* Missing or invalid UI state does not affect study records. */ }
}
window.addEventListener('pagehide', saveRailScroll);
document.querySelectorAll('[data-navigation="home"]').forEach(link => link.removeAttribute('data-navigation'));
right.querySelector('.site-workspace-home')!.setAttribute('data-navigation', 'home');
right.querySelectorAll<HTMLAnchorElement>('.site-tools a,.site-workspace-home').forEach(link => {
    if (link.getAttribute('href') === `./${currentPage}`) link.setAttribute('aria-current', 'page');
});
left.querySelector('.site-summary-link')!.setAttribute('aria-label', '週／月總結');
if (currentPage === 'summary.html') left.querySelector('.site-summary-link')!.setAttribute('aria-current', 'page');
const sidebarDate = initializeSidebarDate(left, dateKey(), function dateChanged(): void {
    scheduleRefresh();
    mobileSections.showContent();
});
function updateRailStatus(): void {
    const badge = document.getElementById('cloudStatusBadge');
    const state = badge?.textContent?.trim();
    left.querySelector('[data-rail-storage]')!.textContent = state ? `Cloud：${state}` : '資料儲存於本機';
}
function weekDates(value: string): string[] {
    const monday = new Date(`${value}T12:00:00`);
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    return Array.from({ length: 7 }, function dateOfWeek(_, index): string {
        const day = new Date(monday);
        day.setDate(day.getDate() + index);
        return dateKey(day);
    });
}
let previousTicks = '';
let previousPreview = '';
function refreshRails(): void {
    try {
        const today = dateKey(), selected = sidebarDate.value || today;
        const selectedWeek = weekDates(selected), currentWeek = new Set(weekDates(today));
        const needed = new Set([...selectedWeek, ...currentWeek].filter(day => day <= today));
        const prefix = initialRecordPrefix(localStorage), records: StudyRecord[] = [], keys = new Set<string>();
        for (const day of needed) {
            const key = prefix + day;
            const raw = localStorage.getItem(key);
            if (!raw)
                continue;
            keys.add(key);
            let value = cache.get(key);
            if (value?.raw !== raw) {
                const decoded = decodeStudyRecord(raw, key.slice(prefix.length));
                if (!decoded.ok)
                    continue;
                value = { raw, record: decoded.record };
                cache.set(key, value);
            }
            if (value)
                records.push(value.record);
        }
        for (const key of cache.keys())
            if (!keys.has(key))
                cache.delete(key);
        const anchor = new Date(`${selected}T12:00:00`), monday = new Date(anchor);
        monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
        let count = 0;
        const ticks = Array.from({ length: 7 }, (_, index) => {
            const day = new Date(monday);
            day.setDate(day.getDate() + index);
            const key = dateKey(day);
            const entered = key <= today && records.some(record => record.date === key && hasRecordInput(record));
            if (entered)
                count += 1;
            return `<span${entered ? ' class="has-record"' : ''} title="${key}${entered ? ' 已填寫' : ' 尚未填寫'}">${['一', '二', '三', '四', '五', '六', '日'][index]}</span>`;
        });
        left.querySelector('[data-rail-year]')!.textContent = String(anchor.getFullYear());
        left.querySelector('[data-rail-date]')!.textContent = `${String(anchor.getMonth() + 1).padStart(2, '0')}.${String(anchor.getDate()).padStart(2, '0')}`;
        left.querySelector('[data-rail-weekday]')!.textContent = `星期${'日一二三四五六'[anchor.getDay()]}`;
        left.querySelector('[data-rail-days]')!.textContent = String(count);
        left.querySelector('[data-rail-week-description]')!.textContent = `已填寫 ${count} 天紀錄`;
        const tickMarkup = ticks.join('');
        if (previousTicks !== tickMarkup) {
            left.querySelector('.site-week-ticks')!.innerHTML = tickMarkup;
            previousTicks = tickMarkup;
        }
        left.querySelector('[data-rail-account]')!.textContent = prefix.includes(':user:') ? '目前帳號的本機資料' : '訪客本機資料';
        const pending = overdueEntriesForPeriod(overdueTasks(records.filter(record => currentWeek.has(record.date)), today), 'week', today);
        right.querySelector('[data-rail-overdue-count]')!.textContent = `${pending.length} 項`;
        const preview = pending.length ? overduePreviewGroups(pending).slice(0, 10).map(group => `<a class="site-overdue-item" href="./todo.html?period=week&amp;item=${encodeURIComponent(group.key)}#${group.subject}"><strong>${escapeText(group.title)}：${group.count} 項逾期</strong><small>${escapeText(group.subjectLabel)}</small></a>`).join('') : '<p class="site-overdue-empty">本週尚無逾期項目</p>';
        if (previousPreview !== preview) {
            right.querySelector('[data-rail-overdue-list]')!.innerHTML = preview;
            previousPreview = preview;
        }
        updateRailStatus();
    }
    catch {
        previousPreview = '';
        previousTicks = '';
        left.querySelector('[data-rail-account]')!.textContent = '無法讀取本機資料';
        right.querySelector('[data-rail-overdue-list]')!.textContent = '本機資料暫時無法讀取。';
    }
}
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleRefresh(): void { clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshRails, 180); }
window.addEventListener('storage', scheduleRefresh);
window.addEventListener('study-records-changed', scheduleRefresh);
window.addEventListener('pageshow', function refreshRestoredRails(event): void {
    if (event.persisted) scheduleRefresh();
});
window.addEventListener('focus', scheduleRefresh);
document.getElementById('studyDate')?.addEventListener('change', scheduleRefresh);
const badge = document.getElementById('cloudStatusBadge');
if (badge)
    new MutationObserver(updateRailStatus).observe(badge, { childList: true, subtree: true, characterData: true });
setInterval(scheduleRefresh, 60000);
refreshRails();
restoreRailScroll();
