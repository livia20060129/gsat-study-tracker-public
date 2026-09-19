type ConnectionMotionState = 'idle' | 'opening' | 'closing';

const MOTION_FALLBACK_MS = 520;
const MOBILE_FLOW_MARGIN_PX = 14;
const MOBILE_VIEWPORT_GAP_PX = 8;
const MOBILE_QUERY = '(max-width: 720px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function limitedExpandedHeight(panel: HTMLDetailsElement): number {
  const naturalHeight = panel.scrollHeight;
  const maxHeight = Number.parseFloat(getComputedStyle(panel).maxHeight);
  return Number.isFinite(maxHeight) ? Math.min(naturalHeight, maxHeight) : naturalHeight;
}

/**
 * Gives the desktop disclosure and mobile bottom sheet one shared open/close
 * lifecycle. Keeping the details element open until the closing transition is
 * complete prevents its content from disappearing before the shell retracts.
 */
export function setupConnectionSettingsMotion(
  panel: HTMLDetailsElement,
  summary: HTMLElement,
): () => void {
  const content = panel.querySelector<HTMLElement>('.connection-settings-content');
  const mobilePlaceholder = document.createElement('div');
  mobilePlaceholder.className = 'connection-dock-placeholder';
  mobilePlaceholder.setAttribute('aria-hidden', 'true');
  panel.before(mobilePlaceholder);
  let state: ConnectionMotionState = 'idle';
  let paintFrame = 0;
  let resizeFrame = 0;
  let fallbackTimer = 0;
  let mobileReservedHeight = 0;
  let mobileCollapsedHeight = 0;
  let backgroundScrollGuarded = false;
  let lastTouchY: number | null = null;

  function isMobile(): boolean {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function prefersReducedMotion(): boolean {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  }

  function eventTargetsPanel(event: Event): boolean {
    return event.target instanceof Node && panel.contains(event.target);
  }

  function handleGuardedTouchStart(event: TouchEvent): void {
    lastTouchY = event.touches[0]?.clientY ?? null;
  }

  function handleGuardedTouchMove(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch || !eventTargetsPanel(event)) {
      event.preventDefault();
      return;
    }

    const deltaY = lastTouchY === null ? 0 : touch.clientY - lastTouchY;
    lastTouchY = touch.clientY;
    const atTop = panel.scrollTop <= 0;
    const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
    const cannotScroll = panel.scrollHeight <= panel.clientHeight;
    if (cannotScroll || (deltaY > 0 && atTop) || (deltaY < 0 && atBottom)) {
      event.preventDefault();
    }
  }

  function clearGuardedTouch(): void {
    lastTouchY = null;
  }

  function handleGuardedWheel(event: WheelEvent): void {
    if (!eventTargetsPanel(event)) event.preventDefault();
  }

  function setBackgroundScrollGuard(active: boolean): void {
    if (backgroundScrollGuarded === active) return;
    backgroundScrollGuarded = active;
    if (active) {
      document.addEventListener('touchstart', handleGuardedTouchStart, { passive: true });
      document.addEventListener('touchmove', handleGuardedTouchMove, { passive: false });
      document.addEventListener('touchend', clearGuardedTouch);
      document.addEventListener('touchcancel', clearGuardedTouch);
      document.addEventListener('wheel', handleGuardedWheel, { passive: false });
      return;
    }
    document.removeEventListener('touchstart', handleGuardedTouchStart);
    document.removeEventListener('touchmove', handleGuardedTouchMove);
    document.removeEventListener('touchend', clearGuardedTouch);
    document.removeEventListener('touchcancel', clearGuardedTouch);
    document.removeEventListener('wheel', handleGuardedWheel);
    clearGuardedTouch();
  }

  function syncBackgroundScrollGuard(): void {
    const mobileOpen = panel.open && isMobile();
    document.body.classList.toggle('connection-sheet-open', mobileOpen);
    setBackgroundScrollGuard(mobileOpen);
    if (!mobileOpen) releaseMobileSpace();
    else if (!mobilePlaceholder.classList.contains('is-active')) reserveMobileSpace();
  }

  function reserveMobileSpace(collapsedHeight?: number): void {
    if (!isMobile()) return;
    if (Number.isFinite(collapsedHeight)) {
      const marginTop = Number.parseFloat(getComputedStyle(panel).marginTop) || 0;
      mobileReservedHeight = Math.max(0, Number(collapsedHeight)) + marginTop;
    } else if (!mobileReservedHeight) {
      mobileReservedHeight = summary.getBoundingClientRect().height + MOBILE_FLOW_MARGIN_PX;
    }
    mobilePlaceholder.style.height = `${mobileReservedHeight}px`;
    mobilePlaceholder.classList.add('is-active');
  }

  function releaseMobileSpace(): void {
    mobilePlaceholder.classList.remove('is-active');
    mobilePlaceholder.style.removeProperty('height');
  }

  function setMobileAnchor(collapsedRect: DOMRect): void {
    mobileCollapsedHeight = collapsedRect.height;
    panel.style.top = `${collapsedRect.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = `${collapsedRect.left}px`;
    panel.style.width = `${collapsedRect.width}px`;
  }

  function clearMobileAnchor(): void {
    panel.style.removeProperty('top');
    panel.style.removeProperty('right');
    panel.style.removeProperty('bottom');
    panel.style.removeProperty('left');
    panel.style.removeProperty('width');
    mobileCollapsedHeight = 0;
  }

  function mobileExpandedHeight(anchorTop: number): number {
    const visualViewport = window.visualViewport;
    const viewportBottom = visualViewport
      ? visualViewport.offsetTop + visualViewport.height
      : window.innerHeight;
    const summaryHeight = summary.getBoundingClientRect().height;
    const availableHeight = Math.max(
      summaryHeight,
      viewportBottom - anchorTop - MOBILE_VIEWPORT_GAP_PX,
    );
    return Math.min(limitedExpandedHeight(panel), availableHeight);
  }

  function clearScheduledWork(): void {
    cancelAnimationFrame(paintFrame);
    cancelAnimationFrame(resizeFrame);
    window.clearTimeout(fallbackTimer);
  }

  function clearMotionStyles(preserveMobileGeometry = false): void {
    panel.classList.remove('is-preparing', 'is-animating', 'is-opening', 'is-closing', 'is-expanded');
    if (!preserveMobileGeometry) {
      panel.style.removeProperty('height');
      clearMobileAnchor();
    }
    panel.style.removeProperty('--connection-summary-height');
    panel.style.removeProperty('--connection-expanded-height');
  }

  function finishOpening(): void {
    if (state !== 'opening') return;
    state = 'idle';
    clearScheduledWork();
    clearMotionStyles(isMobile());
    syncBackgroundScrollGuard();
  }

  function finishClosing(): void {
    if (state !== 'closing') return;
    state = 'idle';
    clearScheduledWork();
    panel.open = false;
    releaseMobileSpace();
    clearMotionStyles();
    syncBackgroundScrollGuard();
  }

  function finishAfterTimeout(action: () => void): void {
    fallbackTimer = window.setTimeout(action, MOTION_FALLBACK_MS);
  }

  function openImmediately(): void {
    clearScheduledWork();
    state = 'idle';
    const mobile = isMobile();
    const collapsedRect = panel.getBoundingClientRect();
    clearMotionStyles();
    if (mobile) {
      reserveMobileSpace(collapsedRect.height);
      setMobileAnchor(collapsedRect);
      panel.style.height = `${collapsedRect.height}px`;
    }
    panel.open = true;
    if (mobile) panel.style.height = `${mobileExpandedHeight(collapsedRect.top)}px`;
    syncBackgroundScrollGuard();
  }

  function closeImmediately(): void {
    clearScheduledWork();
    state = 'idle';
    panel.open = false;
    releaseMobileSpace();
    clearMotionStyles();
    syncBackgroundScrollGuard();
  }

  function startOpening(): void {
    if (prefersReducedMotion()) {
      openImmediately();
      return;
    }
    state = 'opening';
    const mobile = isMobile();
    const collapsedRect = panel.getBoundingClientRect();
    const summaryHeight = summary.getBoundingClientRect().height;
    if (mobile) {
      reserveMobileSpace(collapsedRect.height);
      setMobileAnchor(collapsedRect);
      panel.style.height = `${collapsedRect.height}px`;
    }
    panel.classList.add('is-preparing', 'is-opening');
    panel.style.setProperty('--connection-summary-height', `${summaryHeight}px`);
    if (!mobile) panel.style.height = `${summaryHeight}px`;
    panel.open = true;
    syncBackgroundScrollGuard();

    const expandedHeight = mobile
      ? mobileExpandedHeight(collapsedRect.top)
      : limitedExpandedHeight(panel);
    panel.style.setProperty('--connection-expanded-height', `${expandedHeight}px`);
    panel.getBoundingClientRect();
    paintFrame = requestAnimationFrame(() => {
      if (state !== 'opening') return;
      panel.classList.remove('is-preparing');
      panel.classList.add('is-animating', 'is-expanded');
      panel.style.height = `${mobile ? expandedHeight : limitedExpandedHeight(panel)}px`;
    });
    finishAfterTimeout(finishOpening);
  }

  function startClosing(): void {
    if (prefersReducedMotion()) {
      closeImmediately();
      return;
    }
    state = 'closing';
    const mobile = isMobile();
    const expandedHeight = panel.getBoundingClientRect().height;
    const summaryHeight = summary.getBoundingClientRect().height;
    panel.style.setProperty('--connection-expanded-height', `${expandedHeight}px`);
    panel.style.setProperty('--connection-summary-height', `${summaryHeight}px`);
    panel.classList.add('is-animating', 'is-closing', 'is-expanded');
    panel.style.height = `${expandedHeight}px`;
    panel.getBoundingClientRect();

    paintFrame = requestAnimationFrame(() => {
      if (state !== 'closing') return;
      panel.classList.remove('is-expanded');
      panel.style.height = `${mobile ? mobileCollapsedHeight || summaryHeight : summaryHeight}px`;
    });
    finishAfterTimeout(finishClosing);
  }

  function handleSummaryClick(event: MouseEvent): void {
    const target = event.target as Element | null;
    if (target?.closest('button,a,input,select,textarea')) return;
    event.preventDefault();
    if (state !== 'idle') return;
    if (panel.open) startClosing();
    else startOpening();
  }

  function handleTransitionEnd(event: TransitionEvent): void {
    if (event.target !== panel) return;
    if (event.propertyName !== 'height') return;
    if (state === 'opening') finishOpening();
    else if (state === 'closing') finishClosing();
  }

  function handleContentResize(): void {
    if (state !== 'opening' || isMobile()) return;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (state !== 'opening') return;
      const height = limitedExpandedHeight(panel);
      panel.style.setProperty('--connection-expanded-height', `${height}px`);
      panel.style.height = `${height}px`;
    });
  }

  function handleViewportResize(): void {
    syncBackgroundScrollGuard();
    if (state !== 'idle' || !panel.open || !isMobile()) return;
    const anchorTop = Number.parseFloat(panel.style.top) || panel.getBoundingClientRect().top;
    panel.style.height = `${mobileExpandedHeight(anchorTop)}px`;
  }

  const resizeObserver = content && typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(handleContentResize)
    : null;
  resizeObserver?.observe(content as HTMLElement);
  summary.addEventListener('click', handleSummaryClick);
  panel.addEventListener('transitionend', handleTransitionEnd);
  panel.addEventListener('toggle', syncBackgroundScrollGuard);
  window.addEventListener('resize', handleViewportResize);
  syncBackgroundScrollGuard();

  return function disposeConnectionSettingsMotion(): void {
    clearScheduledWork();
    resizeObserver?.disconnect();
    summary.removeEventListener('click', handleSummaryClick);
    panel.removeEventListener('transitionend', handleTransitionEnd);
    panel.removeEventListener('toggle', syncBackgroundScrollGuard);
    window.removeEventListener('resize', handleViewportResize);
    setBackgroundScrollGuard(false);
    document.body.classList.remove('connection-sheet-open');
    mobilePlaceholder.remove();
  };
}
