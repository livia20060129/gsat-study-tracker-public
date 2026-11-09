import '../tracker-overview.css';
import { animateVisibility } from './disclosureMotion.ts';
/** Keep the existing select and change handler as the single saved mood value. */
function initializeMoodSlider(): void {
    const select = document.getElementById('mood') as HTMLSelectElement;
    const moods = document.createElement('div');
    moods.className = 'mood-segments';
    moods.setAttribute('role', 'group');
    moods.setAttribute('aria-label', '今日狀態');
    const indicator = document.createElement('span');
    indicator.className = 'mood-segment-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    moods.append(indicator);
    const buttons = [...select.options].map(function moodButton(option, index): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = option.text;
        button.addEventListener('click', function selectMood(): void {
            select.selectedIndex = index;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        moods.append(button);
        return button;
    });
    function updateMood(): void {
        moods.style.setProperty('--mood-index', String(select.selectedIndex));
        buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === select.selectedIndex)));
    }
    select.classList.add('mood-native-source');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select.after(moods);
    select.addEventListener('change', updateMood);
    new MutationObserver(updateMood).observe(document.getElementById('weekdayText')!, { childList: true, characterData: true, subtree: true });
    updateMood();
}
function initializeRoutineDisclosure(): void {
    const field = document.getElementById('routineTimeField')!;
    const select = document.getElementById('mood')!;
    const moodField = select.closest('.field')!;
    const label = moodField.querySelector('label')!;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'todayStatusToggle';
    toggle.className = 'today-status-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'routineDisclosure');
    toggle.innerHTML = '<span><span data-home-icon="heart" aria-hidden="true"></span>今日狀態</span><i aria-hidden="true"></i>';
    label.replaceWith(toggle);
    select.setAttribute('aria-label', '今日狀態');
    const content = document.createElement('div');
    content.id = 'routineDisclosure';
    content.className = 'routine-disclosure';
    content.hidden = true;
    const nextDay = field.querySelector('.routine-time-meta');
    if (nextDay) document.getElementById('routineTimeLabel')!.append(nextDay);
    content.append(field);
    moodField.append(content);
    toggle.addEventListener('click', function toggleTodayStatus(): void {
        const expanded = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(expanded));
        animateVisibility(content, expanded);
    });
}
export function initializeTrackerLayout(): void {
    initializeMoodSlider();
    initializeRoutineDisclosure();
    initializeHomeHeader();
}

/** Small inline line icons keep the home screen independent of an icon runtime. */
function initializeHomeHeader(): void {
    const names: Record<string,string> = { book:'book-open',calendar:'calendar-days',save:'save',settings:'settings',info:'info',heart:'heart-pulse',clock:'clock',clipboard:'clipboard-list',flag:'flag',note:'notebook-pen' };
    function renderIcons(root: ParentNode): void {
        root.querySelectorAll<HTMLElement>('[data-home-icon]').forEach(node => {
            node.dataset.uiIcon = names[node.dataset.homeIcon!] || 'book-open';
        });
    }
    renderIcons(document);
    const date = document.getElementById('studyDate') as HTMLInputElement;
    const mobileBar = document.getElementById('siteMobileBar');
    const mobileHome = mobileBar?.querySelector<HTMLAnchorElement>('.site-mobile-home');
    if (mobileHome) {
        mobileHome.setAttribute('aria-label', 'GSAT Tracker');
        mobileHome.innerHTML = '<span data-home-icon="book" aria-hidden="true"></span><span><strong>GSAT Tracker</strong><small>每日讀書完成度紀錄卡</small></span>';
        renderIcons(mobileHome);
    }
    function updateDate(): void {
        const value = date.value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
        const selected = new Date(`${value}T12:00:00`);
        document.querySelectorAll('[data-home-date-label]').forEach(node => {
            node.textContent = `${value.slice(5).replace('-', '.')} 星期${'日一二三四五六'[selected.getDay()]}`;
        });
    }
    document.querySelectorAll('[data-home-date]').forEach(button => button.addEventListener('click', () => {
        const mobile = document.querySelector<HTMLButtonElement>('#siteMobileBar [data-mobile-section="date"]');
        if (mobile && matchMedia('(max-width:1199px)').matches) mobile.click();
        else { date.focus({ preventScroll: true }); try { date.showPicker(); } catch { date.click(); } }
    }));
    document.querySelector('[data-home-save]')?.addEventListener('click', () => {
        document.getElementById('saveBtn')!.click();
    });
    date.addEventListener('change', updateDate);
    new MutationObserver(updateDate).observe(document.getElementById('weekdayText')!, { childList: true, subtree: true });
    updateDate();
}
