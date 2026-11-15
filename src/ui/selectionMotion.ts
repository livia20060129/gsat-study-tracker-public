import { siteNavigationPage } from './siteNavigation.ts';

let initialized = false;

/** Only the checked box moves; the card's layout and scroll position stay fixed. */
export function animateCompletionCheckbox(input: HTMLInputElement): Animation | null {
  input.getAnimations().filter(animation => animation.id === 'study-completion-checkbox').forEach(animation => animation.cancel());
  if (!input.checked || matchMedia('(prefers-reduced-motion: reduce)').matches || !input.animate) return null;
  return input.animate([
    { transform: 'scale(1)', offset: 0 },
    { transform: 'scale(1.18)', offset: .38 },
    { transform: 'scale(.995)', offset: .75 },
    { transform: 'scale(1)', offset: 1 },
  ], { id: 'study-completion-checkbox', duration: 300, easing: 'cubic-bezier(.22,.65,.28,1)' });
}

/** Shared chrome is reused on every app, legal, prompt and source page. */
export function initializeSelectionMotion(right: HTMLElement, bar: HTMLElement): void {
  if (initialized) return;
  initialized = true;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 1199px)');
  const nav = bar.querySelector<HTMLElement>('nav')!;
  const mobileSelection = document.createElement('span');
  mobileSelection.className = 'site-mobile-selection';
  mobileSelection.setAttribute('aria-hidden', 'true');
  nav.prepend(mobileSelection);
  nav.dataset.selectionMotion = 'ready';
  const marker = document.createElement('span');
  marker.className = 'site-navigation-selection';
  marker.setAttribute('aria-hidden', 'true');
  const markerSurface = document.createElement('span');
  marker.append(markerSurface);
  right.prepend(marker);
  let markerMotion: Animation | null = null;
  let selectionPulses: Animation[] = [];
  let pendingHref: string | null = null;
  let hoveredLink: HTMLAnchorElement | null = null;
  let focusedLink: HTMLAnchorElement | null = null;
  let frame = 0;

  function menuLink(target: EventTarget | null): HTMLAnchorElement | null {
    if (!(target instanceof Element)) return null;
    const link = target.closest<HTMLAnchorElement>('.site-tools>a,.site-workspace-home');
    return link && right.contains(link) ? link : null;
  }

  function selectedLink(): HTMLAnchorElement | null {
    return right.querySelector<HTMLAnchorElement>('.site-tools a[aria-current=page],.site-workspace-home[aria-current=page]');
  }

  function paintMarker(target: HTMLElement | null, moving = false): Animation | null {
    if (!target || !target.getClientRects().length) {
      markerMotion?.cancel();
      markerMotion = null;
      marker.hidden = true;
      return null;
    }
    const wasHidden = marker.hidden;
    marker.hidden = false;
    const railRect = right.getBoundingClientRect(), rect = target.getBoundingClientRect();
    const before = marker.getBoundingClientRect();
    markerMotion?.cancel();
    // A pulse scales the link around its center. Keep the marker's layout
    // bounds unscaled when hover/resize interrupts that pulse.
    const width = target.offsetWidth, height = target.offsetHeight;
    const to = { left: rect.left + (rect.width - width) / 2 - railRect.left + right.scrollLeft, top: rect.top + (rect.height - height) / 2 - railRect.top + right.scrollTop, width, height };
    const from = { left: before.left - railRect.left + right.scrollLeft, top: before.top - railRect.top + right.scrollTop, width: before.width, height: before.height };
    Object.entries(to).forEach(([property, value]) => marker.style.setProperty(property, `${value}px`));
    const ready = right.dataset.selectionMotion === 'ready';
    right.dataset.selectionMotion = 'ready';
    if (!moving || !ready || reduced.matches || wasHidden || !before.width) return null;
    const pixels = (values: typeof to): Record<string, string> => Object.fromEntries(Object.entries(values).map(([property, value]) => [property, `${value}px`]));
    markerMotion = marker.animate([pixels(from), pixels(to)], { id: 'study-navigation-selection', duration: 260, easing: 'cubic-bezier(.2,.75,.25,1)' });
    return markerMotion;
  }

  function cancelPulses(): void {
    selectionPulses.forEach(animation => animation.cancel());
    selectionPulses = [];
  }

  function pulseSelection(target: HTMLElement): Animation[] {
    cancelPulses();
    if (reduced.matches || !target.animate) return [];
    const frames = [
      { transform: 'scale(1)', offset: 0 },
      { transform: 'scale(1.045)', offset: .38 },
      { transform: 'scale(.995)', offset: .75 },
      { transform: 'scale(1)', offset: 1 },
    ];
    const surfaces = compact.matches ? [target] : [target, markerSurface];
    selectionPulses = surfaces.map(surface => surface.animate(frames, {
      id: 'study-menu-click-bounce', duration: 300, easing: 'cubic-bezier(.22,.65,.28,1)',
    }));
    return selectionPulses;
  }

  function previewLink(link: HTMLAnchorElement | null): void {
    if (pendingHref || compact.matches) return;
    paintMarker(link ?? selectedLink(), true);
  }

  right.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse' || pendingHref || compact.matches) return;
    const target = menuLink(event.target);
    if (!target || target === hoveredLink) return;
    focusedLink = null;
    hoveredLink = target;
    previewLink(target);
  });
  right.addEventListener('pointerout', event => {
    if (event.pointerType !== 'mouse' || !hoveredLink || menuLink(event.relatedTarget)) return;
    hoveredLink = null;
    previewLink(focusedLink);
  });
  right.addEventListener('pointerleave', () => {
    if (!hoveredLink) return;
    hoveredLink = null;
    previewLink(focusedLink);
  });
  right.addEventListener('focusin', event => {
    const target = menuLink(event.target);
    if (!target?.matches(':focus-visible')) return;
    hoveredLink = null;
    focusedLink = target;
    previewLink(target);
  });
  right.addEventListener('focusout', event => {
    if (menuLink(event.relatedTarget)) return;
    focusedLink = null;
    if (!hoveredLink) previewLink(null);
  });

  function updateMobileSelection(): void {
    const buttons = [...nav.querySelectorAll<HTMLButtonElement>('[data-mobile-section]')];
    const index = buttons.findIndex(button => button.getAttribute('aria-pressed') === 'true');
    nav.style.setProperty('--mobile-selection', String(Math.max(0, index)));
  }

  function refreshGeometry(): void {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (!pendingHref) paintMarker(compact.matches ? selectedLink() : hoveredLink ?? focusedLink ?? selectedLink()); });
  }

  new MutationObserver(() => { updateMobileSelection(); refreshGeometry(); }).observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  if (typeof ResizeObserver === 'function') new ResizeObserver(refreshGeometry).observe(right);
  window.addEventListener('resize', refreshGeometry);
  window.addEventListener('pageshow', () => {
    hoveredLink = focusedLink = null;
    cancelPulses();
    refreshGeometry();
  });
  reduced.addEventListener('change', () => {
    if (!reduced.matches) return;
    [markerMotion, ...selectionPulses].forEach(animation => {
      if (animation?.playState === 'running' || animation?.playState === 'paused') animation.finish();
    });
  });
  updateMobileSelection();
  paintMarker(selectedLink());
  right.dataset.selectionMotion = 'ready';

  document.addEventListener('click', function selectNavigation(event): void {
    if (!(event.target instanceof Element) || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest<HTMLAnchorElement>('#siteRightRail a');
    if (!link || link.download || (link.target && link.target !== '_self')) return;
    const destination = new URL(link.href);
    if (destination.origin !== location.origin || !/^https?:$/.test(destination.protocol)) return;
    const page = siteNavigationPage(destination.pathname);
    const target = [...right.querySelectorAll<HTMLAnchorElement>('.site-tools a,.site-workspace-home')].find(anchor => siteNavigationPage(new URL(anchor.href).pathname) === page);
    if (!target) return;
    // Mobile page departures already own the rightward slide. Do not delay or
    // replace their direction, same-tab navigation, or preserved panel nodes.
    if (compact.matches) {
      paintMarker(target);
      if (!event.defaultPrevented || document.documentElement.dataset.menuPageDeparture === 'animating') pulseSelection(target);
      return;
    }
    if (event.defaultPrevented) return;
    if (reduced.matches) { paintMarker(target); return; }
    const samePage = page === siteNavigationPage(location.pathname) && destination.search === location.search;
    if (samePage && destination.hash !== location.hash) { pulseSelection(target); return; }
    event.preventDefault();
    pendingHref = samePage ? null : destination.href;
    cancelPulses();
    const motion = paintMarker(target, true);
    const pulses = pulseSelection(target);
    if (samePage) return;
    const finish = (): void => {
      if (pendingHref !== destination.href) return;
      pendingHref = null;
      location.assign(destination.href);
    };
    const animations = [...(motion ? [motion] : []), ...pulses];
    if (animations.length) void Promise.all(animations.map(animation => animation.finished)).then(finish, () => {});
    else finish();
  }, true);

  // Real browser input may run a microtask checkpoint between capture and
  // bubble listeners. Wait for the next frame so Tracker's save/render handler
  // has finished, then animate the replacement that will actually be painted.
  document.addEventListener('change', function completedTrackerItem(event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('[data-done],[data-week-done]')) return;
    let selector: string;
    if (input.hasAttribute('data-week-done')) {
      selector = `[data-week-done][data-week-date="${CSS.escape(input.dataset.weekDate ?? '')}"][data-week-item="${CSS.escape(input.dataset.weekItem ?? '')}"]`;
    } else {
      const item = input.closest<HTMLElement>('[data-item]');
      if (!item) return;
      selector = `[data-item="${CSS.escape(item.dataset.item!)}"]>.item-top>[data-done]`;
    }
    const occurrence = [...document.querySelectorAll(selector)].indexOf(input);
    const wasFocused = document.activeElement === input;
    const selectedDate = document.querySelector<HTMLInputElement>('#studyDate')?.value;
    requestAnimationFrame(() => {
      if (selectedDate !== document.querySelector<HTMLInputElement>('#studyDate')?.value) return;
      const current = input.isConnected ? input : document.querySelectorAll<HTMLInputElement>(selector)[Math.max(0, occurrence)];
      if (current?.checked === input.checked) {
        if (wasFocused && !input.isConnected) current.focus({ preventScroll: true });
        animateCompletionCheckbox(current);
      }
    });
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || (!pendingHref && !hoveredLink && !focusedLink)) return;
    pendingHref = null;
    hoveredLink = focusedLink = null;
    cancelPulses();
    paintMarker(selectedLink(), true);
  });
  window.addEventListener('pagehide', () => { pendingHref = null; hoveredLink = focusedLink = null; markerMotion?.cancel(); cancelPulses(); cancelAnimationFrame(frame); });
}
