type MobileSection = 'date' | 'content' | 'tools';
const SECTION_ORDER: MobileSection[] = ['date', 'content', 'tools'];

interface SectionSwipe {
  identifier: number;
  x: number;
  y: number;
  scroll: number;
  startedAt: number;
  section: MobileSection;
  horizontal: boolean;
}

interface MobileSections {
  showContent(): void;
}

/** Reuse the original nodes so timers, focused drafts and record listeners survive switching. */
export function initializeMobileSections(left: HTMLElement, right: HTMLElement, bar: HTMLElement): MobileSections {
  const compact = matchMedia('(max-width: 1199px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const positions = new Map<MobileSection, number>();
  const concealed = new Map<HTMLElement, boolean>();
  const buttons = [...bar.querySelectorAll<HTMLButtonElement>('[data-mobile-section]')];
  let section: MobileSection = 'content';
  let previous = 0;
  let direction = 0;
  let distance = 0;
  let scrollFrame = 0;
  let selectionRevision = 0;
  let slideAnimations: Animation[] = [];
  let restorePositions: (() => void)[] = [];
  let outgoingLayer: HTMLElement | null = null;
  let restoreRoots: (() => void)[] = [];
  let swipe: SectionSwipe | null = null;

  function cancelSectionMotion(): void {
    for (const animation of slideAnimations) animation.cancel();
    slideAnimations = [];
    for (const restore of restorePositions.reverse()) restore();
    restorePositions = [];
    for (const restore of restoreRoots.reverse()) restore();
    restoreRoots = [];
    outgoingLayer?.remove();
    outgoingLayer = null;
    delete document.documentElement.dataset.mobileSlideDirection;
  }

  function scrollTop(): number {
    const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    return Math.max(0, Math.min(maximum, window.scrollY));
  }

  function revealNavigation(): void {
    document.body.dataset.mobileNavHidden = 'false';
    previous = scrollTop();
    direction = 0;
    distance = 0;
  }

  function contentNodes(): HTMLElement[] {
    return [...document.body.children].filter((node): node is HTMLElement =>
      node instanceof HTMLElement && !node.matches('.site-rail,.site-mobile-bar,.site-mobile-motion-layer,script,style,link'));
  }

  function sectionRoots(active: MobileSection): HTMLElement[] {
    if (active === 'date') return [left];
    if (active === 'tools') return [right];
    return contentNodes().filter(node => node.matches('main,header,footer,section') && node.getClientRects().length > 0);
  }

  function temporaryStyles(node: HTMLElement, styles: Record<string, string>): void {
    const hadStyleAttribute = node.hasAttribute('style');
    const previousStyles = Object.entries(styles).map(([name, value]) => {
      const previous = { name, value: node.style.getPropertyValue(name), priority: node.style.getPropertyPriority(name) };
      node.style.setProperty(name, value, name === 'left' ? '' : 'important');
      return { ...previous, temporaryValue: node.style.getPropertyValue(name), temporaryPriority: node.style.getPropertyPriority(name) };
    });
    restorePositions.push(function restoreStyles(): void {
      for (const previous of previousStyles) {
        if (node.style.getPropertyValue(previous.name) !== previous.temporaryValue || node.style.getPropertyPriority(previous.name) !== previous.temporaryPriority) continue;
        if (previous.value) node.style.setProperty(previous.name, previous.value, previous.priority);
        else node.style.removeProperty(previous.name);
      }
      if (!hadStyleAttribute && !node.style.length) node.removeAttribute('style');
    });
  }

  function updateContentVisibility(): void {
    if (!compact.matches || section === 'content') {
      for (const [node, wasInert] of concealed) {
        node.classList.remove('site-mobile-content-hidden');
        node.inert = wasInert;
      }
      concealed.clear();
      return;
    }
    for (const node of contentNodes()) {
      if (!concealed.has(node)) concealed.set(node, node.inert);
      node.inert = true;
      node.classList.add('site-mobile-content-hidden');
    }
  }

  function applySection(next: MobileSection): void {
    if (!compact.matches) return;
    positions.set(section, scrollTop());
    const changed = next !== section;
    section = next;
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    document.body.dataset.mobileSection = section;
    left.inert = section !== 'date';
    right.inert = section !== 'tools';
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.mobileSection === section));
    updateContentVisibility();
    if (changed) window.scrollTo({ top: positions.get(section) ?? 0, behavior: 'instant' });
    // Read the restored position now; later frames must still process a user's first scroll.
    revealNavigation();
  }

  function selectSection(next: MobileSection): void {
    if (!compact.matches) return;
    swipe = null;
    if (next !== section) document.dispatchEvent(new Event('study-mobile-section-change'));
    const revision = ++selectionRevision;
    cancelSectionMotion();
    if (section === next || reducedMotion.matches) {
      applySection(next);
      return;
    }
    const direction = SECTION_ORDER.indexOf(next) > SECTION_ORDER.indexOf(section) ? 1 : -1;
    const travel = document.body.getBoundingClientRect().width;
    const outgoing = sectionRoots(section).map(node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const floating = [...node.querySelectorAll<HTMLElement>('.connection-dock')].map(control => ({ control, rect: control.getBoundingClientRect() }));
      return { node, rect, display: style.display, background: style.backgroundColor, floating };
    }).filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight);
    // Save and restore scroll while the original layout is still present.
    applySection(next);
    document.documentElement.dataset.mobileSlideDirection = direction > 0 ? 'forward' : 'backward';
    // Clip outgoing originals in their own viewport. No clones, duplicate IDs,
    // or offscreen layout overflow that Android can scroll into view.
    outgoingLayer = document.createElement('div');
    outgoingLayer.className = 'site-mobile-motion-layer';
    outgoingLayer.inert = true;
    document.body.append(outgoingLayer);
    for (const panel of outgoing) {
      const placeholder = document.createComment('mobile-section-position');
      panel.node.before(placeholder);
      outgoingLayer.append(panel.node);
      restoreRoots.push(() => { placeholder.replaceWith(panel.node); });
      temporaryStyles(panel.node, {
        display: panel.display, visibility: 'visible', position: 'fixed',
        top: `${panel.rect.top}px`, left: `${panel.rect.left}px`, right: 'auto', bottom: 'auto',
        width: `${panel.rect.width}px`, height: `${panel.rect.height}px`,
        'max-width': 'none', 'min-height': '0', margin: '0', 'z-index': '1000', 'pointer-events': 'none',
        'background-color': panel.background === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.body).backgroundColor : panel.background,
      });
      for (const { control, rect } of panel.floating) {
        temporaryStyles(control, {
          position: 'absolute', top: `${rect.top - panel.rect.top}px`, left: `${rect.left - panel.rect.left}px`,
          right: 'auto', bottom: 'auto', width: `${rect.width}px`, height: `${rect.height}px`, margin: '0',
        });
      }
      slideAnimations.push(panel.node.animate([{ left: `${panel.rect.left}px` }, { left: `${panel.rect.left - direction * travel}px` }], {
        id: 'study-mobile-section-out', duration: 240, easing: 'cubic-bezier(.2,.75,.25,1)',
      }));
    }
    for (const target of sectionRoots(next)) {
      if (getComputedStyle(target).position === 'static') temporaryStyles(target, { position: 'relative' });
      slideAnimations.push(target.animate([{ left: `${direction * travel}px` }, { left: '0px' }], {
        id: 'study-mobile-section-in', duration: 240, easing: 'cubic-bezier(.2,.75,.25,1)',
      }));
    }
    Promise.all(slideAnimations.map(animation => animation.finished)).then(function finishSlide(): void {
      if (revision === selectionRevision) cancelSectionMotion();
    }, () => {});
  }

  function observeScroll(): void {
    scrollFrame = 0;
    if (!compact.matches) return;
    const current = scrollTop();
    const delta = current - previous;
    previous = current;
    if (current <= 12) { revealNavigation(); return; }
    // Connection settings own their opening/closing position animation.
    if (document.querySelector('.connection-dock.is-animating,.connection-dock.is-preparing')) return;
    if (Math.abs(delta) < 0.5) return;
    const nextDirection = Math.sign(delta);
    if (direction !== nextDirection) { direction = nextDirection; distance = 0; }
    distance += Math.abs(delta);
    if (distance >= (direction > 0 ? 24 : 12)) {
      document.body.dataset.mobileNavHidden = String(direction > 0);
      distance = 0;
    }
  }

  function swipeDestination(deltaX: number): MobileSection | undefined {
    return SECTION_ORDER[SECTION_ORDER.indexOf(section) + (deltaX < 0 ? 1 : -1)];
  }

  function startSwipe(event: TouchEvent): void {
    swipe = null;
    if (!compact.matches || event.defaultPrevented || event.touches.length !== 1) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="slider"],[draggable="true"]')) return;
    if (document.querySelector('.connection-dock[open],dialog[open],[aria-modal="true"]')) return;
    if (window.getSelection()?.isCollapsed === false) return;
    // Keep native browser edge gestures and nested horizontal scrollers available.
    const touch = event.touches[0];
    if (touch.clientX < 24 || touch.clientX > innerWidth - 24) return;
    for (let node: Element | null = event.target; node && node !== document.body; node = node.parentElement) {
      if (node.scrollWidth > node.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return;
    }
    swipe = { identifier: touch.identifier, x: touch.clientX, y: touch.clientY, scroll: scrollTop(),
      startedAt: performance.now(), section, horizontal: false };
  }

  function moveSwipe(event: TouchEvent): void {
    if (!swipe) return;
    if (event.touches.length !== 1 || event.defaultPrevented || !event.cancelable
      || swipe.section !== section || Math.abs(scrollTop() - swipe.scroll) > 8) { swipe = null; return; }
    const touch = [...event.touches].find(touch => touch.identifier === swipe!.identifier);
    if (!touch) { swipe = null; return; }
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    if (!swipe.horizontal && Math.abs(dy) >= 12 && Math.abs(dy) >= Math.abs(dx)) { swipe = null; return; }
    if (Math.abs(dx) >= 18 && Math.abs(dx) > Math.abs(dy) * 1.5 && swipeDestination(dx)) swipe.horizontal = true;
    if (swipe.horizontal) event.preventDefault();
  }

  function finishSwipe(event: TouchEvent): void {
    const gesture = swipe;
    swipe = null;
    if (!gesture || !gesture.horizontal || !compact.matches || event.defaultPrevented || !event.cancelable
      || event.touches.length || gesture.section !== section || performance.now() - gesture.startedAt > 1200
      || Math.abs(scrollTop() - gesture.scroll) > 8) return;
    const touch = [...event.changedTouches].find(touch => touch.identifier === gesture.identifier);
    if (!touch) return;
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    const next = swipeDestination(dx);
    if (!next || Math.abs(dx) < 64 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    // Cancel the compatibility click so a swiped link/button is never activated.
    event.preventDefault();
    selectSection(next);
  }

  document.addEventListener('touchstart', startSwipe, { passive: true });
  document.addEventListener('touchmove', moveSwipe, { passive: false });
  document.addEventListener('touchend', finishSwipe, { passive: false });
  document.addEventListener('touchcancel', function cancelSwipe(): void { swipe = null; }, { passive: true });

  bar.addEventListener('click', function switchFromNavigation(event): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-mobile-section]');
    const next = button?.dataset.mobileSection;
    if (next === 'date' || next === 'content' || next === 'tools') selectSection(next);
  });
  bar.addEventListener('focusin', revealNavigation);
  window.addEventListener('scroll', function queueScrollObservation(): void {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(observeScroll);
  }, { passive: true });
  document.addEventListener('keydown', function returnFromSection(event): void {
    if (compact.matches && section !== 'content' && event.key === 'Escape') {
      selectSection('content');
      buttons.find(button => button.dataset.mobileSection === 'content')?.focus({ preventScroll: true });
    }
  });
  new MutationObserver(updateContentVisibility).observe(document.body, { childList: true });
  compact.addEventListener('change', function updateLayout(): void {
    swipe = null;
    selectionRevision += 1;
    cancelSectionMotion();
    if (compact.matches) {
      selectSection('content');
      return;
    }
    const wasAlternate = section !== 'content';
    if (wasAlternate) positions.set(section, scrollTop());
    section = 'content';
    left.inert = false;
    right.inert = false;
    updateContentVisibility();
    delete document.body.dataset.mobileSection;
    delete document.body.dataset.mobileNavHidden;
    if (wasAlternate) window.scrollTo({ top: positions.get('content') ?? 0, behavior: 'instant' });
  });
  reducedMotion.addEventListener('change', cancelSectionMotion);
  window.addEventListener('pagehide', function stopLeavingPageMotion(): void {
    swipe = null;
    selectionRevision += 1;
    cancelSectionMotion();
  });
  if (compact.matches) selectSection('content');
  return { showContent(): void { selectSection('content'); } };
}
