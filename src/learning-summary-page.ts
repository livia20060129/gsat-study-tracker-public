import './learning-summary.css';
import { readMaterialProgressRecords } from './study/materialProgress.ts';
import {
  SUMMARY_MODES,
  calendarLeadingBlankCount,
  dateKey,
  fixedPeriodRemarks,
  formatClockMinutes,
  shiftSummaryAnchor,
  summarizeStudyItemTime,
  summarizeLearningPeriod,
  summaryPeriod,
  type LearningPeriodSummary,
  type SummaryMode,
} from './study/learningSummary.ts';
import {
  SUBJECT_TIME_COLORS,
  SUBJECT_TIME_SHORT_LABELS,
  subjectTimeArcPath,
  subjectTimeDonutSlices,
  type SubjectTimeSubject,
} from './study/subjectTime.ts';
import type { StudyRecord } from './types.ts';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

let activeMode: SummaryMode = location.hash === '#month' ? 'month' : 'week';
let activeAnchor = dateKey(new Date());
let records: StudyRecord[] = [];
let selectedSubject: SubjectTimeSubject | null = null;
let pendingSubjectEntryOrigin: DOMRect | null = null;
let summaryModeAnimation: Animation | null = null;
let summaryModeTransitionToken = 0;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: ${id}`);
  return found as T;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character));
}

function formatMinutes(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded < 60) return `${rounded} 分`;
  const hours = Math.floor(rounded / 60);
  const minutes = Math.round((rounded - hours * 60) * 10) / 10;
  return minutes > 0 ? `${hours} 小時 ${minutes} 分` : `${hours} 小時`;
}

function formatHours(value: number): string {
  return (Math.round(value / 60 * 10) / 10).toFixed(1);
}

function formatWholeDuration(value: number): string {
  const totalMinutes = Math.max(0, Math.round(value));
  return `${Math.floor(totalMinutes / 60)} 小時 ${totalMinutes % 60} 分鐘`;
}

function signed(value: number, suffix: string): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : rounded < 0 ? '' : '±'}${rounded}${suffix}`;
}

function comparisonClass(value: number, lowerIsBetter = false): string {
  if (value === 0) return 'is-flat';
  const better = lowerIsBetter ? value < 0 : value > 0;
  return better ? 'is-up' : 'is-down';
}

function formatDateLabel(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
}

function tintHex(hex: string, ratio: number): string {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map(index => Number.parseInt(value.slice(index, index + 2), 16));
  const tinted = channels.map(channel => Math.round(channel + (255 - channel) * ratio));
  return `#${tinted.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function opaqueStudyTimeColor(intensity: number): string {
  const empty = [247, 250, 253];
  const full = [82, 139, 208];
  const ratio = Math.max(0, Math.min(1, intensity));
  return `rgb(${empty.map((value, index) => Math.round(value + (full[index] - value) * ratio)).join(',')})`;
}

function summaryMoodClass(mood: string): string {
  if (mood === '身體不適') return ' is-mood-unwell';
  if (mood === '較疲累' || mood === '較疲倦') return ' is-mood-tired';
  if (mood === '外出') return ' is-mood-out';
  return '';
}

function summaryMoodOpacity(totalMinutes: number, maxMinutes: number): number {
  if (totalMinutes <= 0 || maxMinutes <= 0) return 0.38;
  return Number((0.45 + 0.55 * Math.min(1, totalMinutes / maxMinutes)).toFixed(3));
}

function summaryMoodColor(mood: string, opacity: number): string {
  if (mood === '身體不適') return `rgb(255 117 117 / ${opacity})`;
  if (mood === '較疲累' || mood === '較疲倦') return `rgb(255 199 142 / ${opacity})`;
  if (mood === '外出') return `rgb(255 240 189 / ${opacity})`;
  return '';
}

function subjectDonutMarkup(summary: LearningPeriodSummary): string {
  const arcs = subjectTimeDonutSlices(summary.subjectTime);
  const paths = arcs.map(slice => `<path class="summary-donut-slice" data-summary-subject-path="${slice.subject}" d="${subjectTimeArcPath(slice)}" fill="none" stroke="${slice.color}" tabindex="0" role="button" aria-label="${slice.subject} ${formatHours(slice.minutes)} 小時，占 ${slice.percent}%"></path>`).join('');
  const labels = arcs.map(slice => {
    const fontSize = slice.endPercent - slice.startPercent < 6 ? 9.5 : 13;
    return `<button class="summary-donut-label-button" type="button" data-summary-subject="${slice.subject}" style="left:${slice.labelX / 1.6}%;top:${slice.labelY / 1.6}%;font-size:${fontSize}px" aria-label="查看${slice.subject}項目">${SUBJECT_TIME_SHORT_LABELS[slice.subject]}</button>`;
  }).join('');
  return `<div class="summary-donut-shell">
    <svg class="summary-donut-ring" viewBox="0 0 160 160" aria-label="本期各科完成時間占比">
      <circle class="summary-donut-track" cx="80" cy="80" r="56" fill="none"></circle>${paths}
    </svg>
    ${labels}
    <div class="summary-donut-center"><strong>${formatHours(summary.subjectTime.totalMinutes)}</strong><span>hr</span></div>
  </div>`;
}

function detailDonutMarkup(
  totalMinutes: number,
  slices: Array<{ label: string; minutes: number; percent: number; color: string }>,
): string {
  let cursor = 0;
  const paths = slices.map((slice, index) => {
    const startPercent = cursor;
    cursor = index === slices.length - 1 ? 100 : Math.min(100, cursor + slice.percent);
    return `<path class="summary-donut-slice is-detail" d="${subjectTimeArcPath({ startPercent, endPercent: cursor })}" fill="none" stroke="${slice.color}"><title>${escapeHtml(slice.label)}：${formatHours(slice.minutes)} 小時，占 ${slice.percent}%；點擊返回全部科目</title></path>`;
  }).join('');
  return `<div class="summary-donut-shell is-detail">
    <svg class="summary-donut-ring" data-summary-back viewBox="0 0 160 160" tabindex="0" role="button" aria-label="返回全部科目">
      <circle class="summary-donut-track" cx="80" cy="80" r="56" fill="none"></circle>${paths}
    </svg>
    <div class="summary-donut-center"><strong>${formatHours(totalMinutes)}</strong><span>hr</span></div>
  </div>`;
}

function renderCalendar(summary: LearningPeriodSummary): void {
  const calendar = element<HTMLDivElement>('summaryCalendar');
  document.querySelector<HTMLElement>('.summary-calendar-weekdays')!.hidden = activeMode !== 'month';
  calendar.className = `summary-calendar is-${activeMode}`;
  element<HTMLHeadingElement>('calendarTitle').textContent = activeMode === 'week' ? '週曆' : '月曆';
  element<HTMLParagraphElement>('calendarCaption').textContent = `${summary.recordedDayCount} 天已有紀錄`;
  const maxMinutes = Math.max(1, ...summary.days.map(day => day.totalMinutes));
  const blankCount = calendarLeadingBlankCount(summary.period);
  const blanks = Array.from({ length: blankCount }, () => '<span class="summary-calendar-blank" aria-hidden="true"></span>');
  const days = summary.days.map(day => {
    const intensity = day.totalMinutes > 0 ? 0.12 + 0.58 * day.totalMinutes / maxMinutes : 0;
    const timeColor = opaqueStudyTimeColor(intensity);
    const timeText = day.hasRecord ? formatMinutes(day.totalMinutes) : '尚無紀錄';
    const moodClass = summaryMoodClass(day.mood);
    const moodOpacity = summaryMoodOpacity(day.totalMinutes, maxMinutes);
    const coreColor = summaryMoodColor(day.mood, moodOpacity) || timeColor;
    const moodText = day.mood ? `，狀態 ${day.mood}` : '';
    return `<article class="summary-day${day.hasRecord ? ' has-record' : ''}${day.completionPercent === 100 ? ' is-complete' : ''}${moodClass}" role="listitem" style="--day-completion:${day.completionPercent * 3.6}deg;--day-time-color:${timeColor};--day-core-color:${coreColor}">
      <button class="summary-day-button" type="button" data-summary-day aria-expanded="false" aria-label="${escapeHtml(formatDateLabel(day.date))}，${escapeHtml(timeText)}，完成率 ${day.completionPercent}%${escapeHtml(moodText)}">
        <span class="summary-day-week">${activeMode === 'week' ? `週${day.weekday}` : ''}</span>
        <span class="summary-day-ring"><span class="summary-day-core"><strong>${day.dayNumber}</strong></span></span>
      </button>
      <span class="summary-day-tooltip" role="tooltip">
        <strong>${escapeHtml(formatDateLabel(day.date))}</strong>
        <span>學習時間：${escapeHtml(timeText)}</span>
        <span>完成率：${day.completionPercent}%</span>
        ${day.mood ? `<span>狀態：${escapeHtml(day.mood)}</span>` : ''}
      </span>
    </article>`;
  });
  calendar.innerHTML = [...blanks, ...days].join('');
}

function renderSubjectDistribution(summary: LearningPeriodSummary): void {
  const target = element<HTMLDivElement>('summarySubjectDistribution');
  const title = element<HTMLHeadingElement>('subjectTitle');
  if (selectedSubject) {
    const entryOrigin = pendingSubjectEntryOrigin;
    const shouldAnimateEntry = Boolean(entryOrigin)
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.dataset.view = 'detail';
    target.classList.toggle('animate-detail-entry', shouldAnimateEntry);
    target.classList.remove('is-detail-ready');
    const detail = summarizeStudyItemTime(summary.timeEntries, selectedSubject);
    title.textContent = `科目分配｜${selectedSubject}`;
    const baseColor = SUBJECT_TIME_COLORS[selectedSubject];
    const maxPercent = Math.max(1, ...detail.slices.map(slice => slice.percent));
    const slices = detail.slices.map(slice => ({
      ...slice,
      color: tintHex(baseColor, 0.58 * (1 - slice.percent / maxPercent)),
    }));
    const detailRows = Math.max(1, Math.min(4, slices.length));
    const list = slices.map(slice => `<li><i style="background:${slice.color}"></i><span class="summary-subject-detail-name">${escapeHtml(slice.label)}</span><span class="summary-subject-detail-value">${slice.percent}%｜${formatHours(slice.minutes)} hr</span></li>`).join('');
    target.innerHTML = slices.length
      ? `${detailDonutMarkup(detail.totalMinutes, slices)}<ul class="summary-subject-detail-list" style="--summary-detail-rows:${detailRows}">${list}</ul>`
      : `<div class="summary-donut-shell is-empty"><div class="summary-donut-center"><strong>0.0</strong><span>hr</span></div></div><p class="summary-empty">本期尚無此科目的完成時間紀錄。</p>`;
    if (shouldAnimateEntry && entryOrigin) {
      target.getBoundingClientRect();
      requestAnimationFrame(() => {
        const destination = target.querySelector<HTMLElement>('.summary-donut-shell.is-detail');
        const destinationRect = destination?.getBoundingClientRect();
        target.classList.add('is-detail-ready');
        if (!destination || !destinationRect) return;
        const moveX = entryOrigin.left + entryOrigin.width / 2
          - (destinationRect.left + destinationRect.width / 2);
        const moveY = entryOrigin.top + entryOrigin.height / 2
          - (destinationRect.top + destinationRect.height / 2);
        const scale = entryOrigin.width / Math.max(1, destinationRect.width);
        destination.animate([
          { transform: `translate(${moveX}px, ${moveY}px) scale(${scale})`, opacity: .82 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        ], { duration: 380, easing: 'cubic-bezier(.2,.82,.2,1)' });
      });
    } else {
      target.classList.add('is-detail-ready');
    }
    pendingSubjectEntryOrigin = null;
    return;
  }
  title.textContent = '科目分配';
  target.dataset.view = 'subjects';
  target.classList.remove('animate-detail-entry', 'is-detail-ready');
  const slices = summary.subjectTime.slices;
  if (!slices.length) {
    target.innerHTML = `<div class="summary-donut-shell is-empty"><svg class="summary-donut-ring" viewBox="0 0 160 160" aria-hidden="true"><circle class="summary-donut-track" cx="80" cy="80" r="56" fill="none"></circle></svg><div class="summary-donut-center"><strong>0.0</strong><span>hr</span></div></div><p class="summary-empty">本期尚無完成時間紀錄。</p>`;
    return;
  }
  target.innerHTML = subjectDonutMarkup(summary);
}

function returnToSubjectOverview(): void {
  const target = element<HTMLDivElement>('summarySubjectDistribution');
  if (!selectedSubject || target.dataset.view !== 'detail') return;
  const source = target.querySelector<HTMLElement>('.summary-donut-shell.is-detail');
  const sourceRect = source?.getBoundingClientRect();
  selectedSubject = null;
  pendingSubjectEntryOrigin = null;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    renderAll();
    return;
  }
  const overlay = source?.cloneNode(true) as HTMLElement | undefined;
  if (overlay && sourceRect) {
    overlay.classList.add('summary-donut-return-overlay');
    overlay.style.left = `${sourceRect.left}px`;
    overlay.style.top = `${sourceRect.top}px`;
    overlay.style.width = `${sourceRect.width}px`;
    overlay.style.height = `${sourceRect.height}px`;
    document.body.appendChild(overlay);
  }
  renderAll();
  const destination = target.querySelector<HTMLElement>('.summary-donut-shell:not(.is-detail)');
  if (!overlay || !sourceRect || !destination) {
    overlay?.remove();
    return;
  }
  const destinationRect = destination.getBoundingClientRect();
  const moveX = destinationRect.left - sourceRect.left;
  const moveY = destinationRect.top - sourceRect.top;
  const scale = destinationRect.width / Math.max(1, sourceRect.width);
  const overlayMotion = overlay.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${moveX}px, ${moveY}px) scale(${scale})`, opacity: 0 },
  ], { duration: 360, easing: 'cubic-bezier(.2,.82,.2,1)', fill: 'forwards' });
  destination.animate([
    { opacity: 0 },
    { opacity: 0, offset: .55 },
    { opacity: 1 },
  ], { duration: 360, easing: 'ease-out' });
  void overlayMotion.finished.catch(() => undefined).then(() => overlay.remove());
}

function renderTrend(summary: LearningPeriodSummary): void {
  const target = element<HTMLDivElement>('summaryTrend');
  const days = summary.days;
  const width = 720;
  const height = 250;
  const left = 58;
  const right = 42;
  const top = 24;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxMinutes = Math.max(60, ...days.map(day => day.totalMinutes));
  const slot = plotWidth / Math.max(1, days.length);
  const barWidth = Math.max(3, Math.min(28, slot * .58));
  const points = days.map((day, index) => ({
    x: left + slot * (index + .5),
    y: top + plotHeight * (1 - day.completionPercent / 100),
    ...day,
  }));
  const grid = [0, 50, 100].map(percent => {
    const y = top + plotHeight * (1 - percent / 100);
    const timeTick = formatHours(maxMinutes * percent / 100);
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/><text class="trend-time-tick" x="4" y="${y + 4}">${timeTick} hr</text><text class="trend-completion-tick" x="${width - 4}" y="${y + 4}">${percent}%</text>`;
  }).join('');
  const bars = points.map(point => {
    const barHeight = plotHeight * point.totalMinutes / maxMinutes;
    return `<rect x="${point.x - barWidth / 2}" y="${top + plotHeight - barHeight}" width="${barWidth}" height="${barHeight}" rx="4"><title>${point.date}：${formatWholeDuration(point.totalMinutes)}</title></rect>`;
  }).join('');
  const line = points.map(point => `${point.x},${point.y}`).join(' ');
  const dots = points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="3.8"><title>${point.date}：完成率 ${point.completionPercent}%</title></circle>`).join('');
  const labels = points.map((point, index) => {
    const show = activeMode === 'week' || index === 0 || index === points.length - 1 || point.dayNumber % 5 === 0;
    return show ? `<text class="trend-day-label" x="${point.x}" y="${height - 13}">${activeMode === 'week' ? `週${point.weekday}` : point.dayNumber}</text>` : '';
  }).join('');
  target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="本期每日學習時間與完成率趨勢">${grid}${bars}<polyline points="${line}"/>${dots}${labels}</svg>`;
}

function renderComparison(current: LearningPeriodSummary, previous: LearningPeriodSummary): void {
  const timeDelta = current.subjectTime.totalMinutes - previous.subjectTime.totalMinutes;
  const completionDelta = current.completion.settlementPercent - previous.completion.settlementPercent;
  const wakeDelta = current.averageWakeMinutes !== null && previous.averageWakeMinutes !== null
    ? current.averageWakeMinutes - previous.averageWakeMinutes
    : null;
  const wakeDifference = Math.abs(wakeDelta ?? 0);
  const wakeText = wakeDelta === null
    ? '資料不足'
    : wakeDelta === 0
      ? '相同'
      : `${wakeDelta < 0 ? '早起' : '晚起'} ${Math.floor(wakeDifference / 60)} 小時 ${wakeDifference % 60} 分鐘`;
  element<HTMLDListElement>('summaryComparison').innerHTML = `
    <div><dt>學習時間</dt><dd class="${comparisonClass(timeDelta)}">${signed(timeDelta / 60, ' hr')}</dd></div>
    <div><dt>完成率</dt><dd class="${comparisonClass(completionDelta)}">${signed(completionDelta, '%')}</dd></div>`;
  element<HTMLParagraphElement>('wakeComparisonLabel').textContent = activeMode === 'week' ? '相較上週' : '相較上月';
  const wakeValue = element<HTMLElement>('wakeComparisonValue');
  wakeValue.className = `summary-wake-comparison-value ${wakeDelta === null ? 'is-flat' : comparisonClass(wakeDelta, true)}`;
  wakeValue.textContent = wakeText;
}

function renderConclusion(current: LearningPeriodSummary, previous: LearningPeriodSummary): void {
  const remarks = fixedPeriodRemarks(
    current.subjectTime.totalMinutes,
    previous.subjectTime.totalMinutes,
    current.completion.settlementPercent,
    previous.completion.settlementPercent,
  );
  const stateTitle = { increase: '增加', stable: '持平', decrease: '下降' } as const;
  const remarkClass = { increase: 'is-up', stable: 'is-flat', decrease: 'is-down' } as const;
  element<HTMLDivElement>('summaryConclusion').innerHTML = `
    <article class="${remarkClass[remarks.timeState]}"><strong>學習時數${stateTitle[remarks.timeState]}</strong><p>${remarks.time}</p></article>
    <article class="${remarkClass[remarks.completionState]}"><strong>完成率${stateTitle[remarks.completionState]}</strong><p>${remarks.completion}</p></article>`;
}

function renderAll(): void {
  const period = summaryPeriod(activeAnchor, activeMode);
  const previousPeriod = summaryPeriod(shiftSummaryAnchor(activeAnchor, activeMode, -1), activeMode);
  const current = summarizeLearningPeriod(records, period);
  const previous = summarizeLearningPeriod(records, previousPeriod);
  const switcher = element<HTMLDivElement>('summaryModeSwitch');
  switcher.dataset.active = String(SUMMARY_MODES.indexOf(activeMode));
  switcher.querySelectorAll<HTMLButtonElement>('[data-summary-mode]').forEach(button => {
    const selected = button.dataset.summaryMode === activeMode;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  element<HTMLElement>('periodLabel').textContent = period.label;
  element<HTMLButtonElement>('previousPeriod').ariaLabel = activeMode === 'week' ? '上一週' : '上一月';
  element<HTMLButtonElement>('nextPeriod').ariaLabel = activeMode === 'week' ? '下一週' : '下一月';
  element<HTMLParagraphElement>('wakePeriodLabel').textContent = activeMode === 'week' ? '本週平均' : '本月平均';
  element<HTMLHeadingElement>('conclusionTitle').textContent = activeMode === 'week' ? '本週小結' : '本月小結';
  element<HTMLElement>('averageWakeTime').textContent = formatClockMinutes(current.averageWakeMinutes);
  renderCalendar(current);
  renderSubjectDistribution(current);
  renderTrend(current);
  renderComparison(current, previous);
  renderConclusion(current, previous);
}

function switchSummaryMode(mode: SummaryMode): void {
  if (mode === activeMode) return;
  const content = element<HTMLDivElement>('summaryContent');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const applyMode = () => {
    activeMode = mode;
    history.replaceState(null, '', `${location.pathname}${location.search}#${mode}`);
    renderAll();
  };
  if (reducedMotion) {
    summaryModeAnimation?.cancel();
    summaryModeAnimation = null;
    applyMode();
    return;
  }
  const token = ++summaryModeTransitionToken;
  const beforeHeight = content.getBoundingClientRect().height;
  summaryModeAnimation?.cancel();
  content.classList.add('is-mode-transitioning');
  const exit = content.animate([
    { opacity: 1, transform: 'translateY(0)' },
    { opacity: 0, transform: 'translateY(-7px)' },
  ], { duration: 130, easing: 'ease-out', fill: 'forwards' });
  summaryModeAnimation = exit;
  void exit.finished.then(() => {
    if (token !== summaryModeTransitionToken) return;
    exit.cancel();
    applyMode();
    const afterHeight = content.getBoundingClientRect().height;
    const enter = content.animate([
      { height: `${beforeHeight}px`, opacity: 0, transform: 'translateY(9px)' },
      { height: `${afterHeight}px`, opacity: 1, transform: 'translateY(0)' },
    ], { duration: 360, easing: 'cubic-bezier(.2,.78,.2,1)' });
    summaryModeAnimation = enter;
    void enter.finished.then(() => {
      if (token !== summaryModeTransitionToken) return;
      summaryModeAnimation = null;
      content.classList.remove('is-mode-transitioning');
    }).catch(() => {});
  }).catch(() => {});
}

function loadRecords(): void {
  try {
    const result = readMaterialProgressRecords(localStorage);
    records = result.records;
    const source = result.prefix.startsWith('study-v11:user:') ? '目前登入帳號的本機同步資料' : '訪客本機資料';
    element<HTMLParagraphElement>('summarySource').textContent = `${source}｜共讀取 ${records.length} 天紀錄`;
    element<HTMLParagraphElement>('summaryError').hidden = true;
    renderAll();
  } catch {
    records = [];
    element<HTMLParagraphElement>('summarySource').textContent = '無法讀取 Tracker 紀錄';
    const error = element<HTMLParagraphElement>('summaryError');
    error.textContent = '瀏覽器目前不允許存取 Tracker 的本機同步資料，請回到 Tracker 確認瀏覽器儲存權限。';
    error.hidden = false;
    renderAll();
  }
}

element<HTMLDivElement>('summaryModeSwitch').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-summary-mode]');
  if (!button) return;
  const mode = button.dataset.summaryMode as SummaryMode;
  if (!SUMMARY_MODES.includes(mode)) return;
  switchSummaryMode(mode);
});
element<HTMLButtonElement>('previousPeriod').addEventListener('click', () => {
  activeAnchor = shiftSummaryAnchor(activeAnchor, activeMode, -1);
  renderAll();
});
element<HTMLButtonElement>('nextPeriod').addEventListener('click', () => {
  activeAnchor = shiftSummaryAnchor(activeAnchor, activeMode, 1);
  renderAll();
});
element<HTMLDivElement>('summarySubjectDistribution').addEventListener('click', event => {
  const detailBack = (event.target as HTMLElement).closest<HTMLElement>('[data-summary-back]');
  if (detailBack) {
    returnToSubjectOverview();
    return;
  }
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-summary-subject], [data-summary-subject-path]');
  if (!button) return;
  const subject = (button.dataset.summarySubject ?? button.dataset.summarySubjectPath) as SubjectTimeSubject;
  if (!(subject in SUBJECT_TIME_COLORS)) return;
  pendingSubjectEntryOrigin = element<HTMLDivElement>('summarySubjectDistribution')
    .querySelector<HTMLElement>('.summary-donut-shell:not(.is-detail)')
    ?.getBoundingClientRect() ?? null;
  selectedSubject = subject;
  renderAll();
});
element<HTMLDivElement>('summarySubjectDistribution').addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const path = (event.target as HTMLElement).closest<HTMLElement>('[data-summary-subject-path], [data-summary-back]');
  if (!path) return;
  event.preventDefault();
  path.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
element<HTMLDivElement>('summaryCalendar').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-summary-day]');
  if (!button) return;
  const day = button.closest<HTMLElement>('.summary-day');
  if (!day) return;
  const open = !day.classList.contains('is-tooltip-open');
  document.querySelectorAll('.summary-day.is-tooltip-open').forEach(node => node.classList.remove('is-tooltip-open'));
  document.querySelectorAll<HTMLButtonElement>('[data-summary-day]').forEach(node => node.setAttribute('aria-expanded', 'false'));
  day.classList.toggle('is-tooltip-open', open);
  button.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', event => {
  if ((event.target as HTMLElement).closest('.summary-day')) return;
  document.querySelectorAll('.summary-day.is-tooltip-open').forEach(node => node.classList.remove('is-tooltip-open'));
  document.querySelectorAll<HTMLButtonElement>('[data-summary-day]').forEach(node => node.setAttribute('aria-expanded', 'false'));
});
window.addEventListener('storage', loadRecords);
loadRecords();
