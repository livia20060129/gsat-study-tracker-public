const DURATION = 240;
const EASING = 'cubic-bezier(.2,.75,.25,1)';
const BOX_PROPERTIES = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth', 'marginTop', 'marginBottom'] as const;

interface Motion {
  element: HTMLElement;
  animations: Animation[];
  finish(): void;
  restore(): void;
}

export interface DisclosureSnapshot {
  height: number;
  anchors: Array<{ element: HTMLElement; rect: DOMRect }>;
  scroll: { x: number; y: number };
}

interface MotionOptions {
  finish?: () => void;
  restore?: () => void;
  fade?: HTMLElement[];
  opening?: boolean;
  anchors?: DisclosureSnapshot['anchors'];
  collapseBox?: boolean;
  opacity?: Map<HTMLElement, number>;
  boxFrom?: Partial<Record<typeof BOX_PROPERTIES[number], string>>;
  revealBoundary?: { from: DOMRect; selector: string };
  scroll?: DisclosureSnapshot['scroll'];
}

const motions = new Map<HTMLElement, Motion>();
const detailTargets = new WeakMap<HTMLDetailsElement, boolean>();
const visibilityTargets = new WeakMap<HTMLElement, boolean>();
let initialized = false;

function stopMotion(element: HTMLElement): void {
  const motion = motions.get(element);
  if (!motion) return;
  motions.delete(element);
  for (const animation of motion.animations) animation.cancel();
  motion.restore();
  delete element.dataset.disclosureMotion;
}

function finishMotions(): void {
  for (const motion of [...motions.values()]) motion.finish();
}

function reducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function captureDisclosure(element: HTMLElement, selectors: readonly string[] = []): DisclosureSnapshot {
  const anchors: DisclosureSnapshot['anchors'] = [];
  for (const selector of selectors) {
    const child = element.querySelector<HTMLElement>(selector);
    if (child && child.getClientRects().length) anchors.push({ element: child, rect: child.getBoundingClientRect() });
  }
  return { height: element.getBoundingClientRect().height, anchors, scroll: { x: scrollX, y: scrollY } };
}

function runMotion(
  element: HTMLElement, from: number, to: number,
  options: MotionOptions = {},
): void {
  initializeDisclosureMotion();
  if (reducedMotion() || !element.isConnected || typeof element.animate !== 'function' || Math.abs(from - to) < 1) {
    options.finish?.();
    options.restore?.();
    return;
  }
  const timing: KeyframeAnimationOptions = { duration: DURATION, easing: EASING, fill: 'both' };
  const opening = options.opening !== false;
  const frames: Keyframe[] = [{ height: `${from}px`, overflow: 'hidden' }, { height: `${to}px`, overflow: 'hidden' }];
  if (options.collapseBox) {
    const style = getComputedStyle(element);
    for (const property of BOX_PROPERTIES) {
      frames[0][property] = options.boxFrom?.[property] ?? (options.opening ? '0px' : style[property]);
      frames[1][property] = options.opening ? style[property] : '0px';
    }
    frames.forEach(frame => { frame.minHeight = '0px'; });
  }
  const height = element.animate(frames, {
    ...timing, id: 'study-disclosure-height',
  });
  const animations = [height];
  if (options.scroll) {
    // Measuring the collapsed layout can clamp scroll at the page bottom before
    // the first animation frame. Restore only that synchronous measurement shift.
    element.getBoundingClientRect();
    if (scrollX !== options.scroll.x || scrollY !== options.scroll.y) {
      window.scrollTo({ left: options.scroll.x, top: options.scroll.y, behavior: 'instant' });
    }
  }
  const boundary = options.revealBoundary;
  const boundaryTarget = boundary ? element.querySelector<HTMLElement>(boundary.selector)?.getBoundingClientRect() : null;
  for (const child of options.fade ?? []) {
    if (!child.getClientRects().length) continue;
    const opacity = Number(getComputedStyle(child).opacity);
    const start = options.opacity?.get(child) ?? (opening ? 0 : opacity);
    animations.push(child.animate([{ opacity: start }, { opacity: opening ? opacity : 0 }], {
      ...timing, id: 'study-disclosure-fade',
    }));
    const rect = child.getBoundingClientRect();
    if (boundary && boundaryTarget && rect.right > boundaryTarget.left && rect.left < boundaryTarget.right) {
      // Reveal editors above the moving footer, keeping buttons clear of the inputs.
      const bottom = rect.bottom - boundary.from.top + 8;
      const end = rect.bottom - boundaryTarget.top + 8;
      if (bottom > 0) animations.push(child.animate([{ clipPath: `inset(0 0 ${bottom}px 0)` }, { clipPath: `inset(0 0 ${end}px 0)` }], {
        ...timing, id: 'study-disclosure-clip',
      }));
    }
  }
  for (const anchor of options.anchors ?? []) {
    if (!anchor.element.isConnected || !anchor.element.getClientRects().length) continue;
    const target = anchor.element.getBoundingClientRect();
    const x = anchor.rect.left - target.left, y = anchor.rect.top - target.top;
    if (Math.abs(x) + Math.abs(y) < 1) continue;
    animations.push(anchor.element.animate([{ transform: `translate(${x}px,${y}px)` }, { transform: 'translate(0,0)' }], {
      ...timing, id: 'study-disclosure-anchor',
    }));
  }
  const motion: Motion = {
    element, animations,
    restore(): void { options.restore?.(); },
    finish(): void {
      if (motions.get(element) !== motion) return;
      options.finish?.();
      stopMotion(element);
    },
  };
  element.dataset.disclosureMotion = options.opening === false ? 'closing' : 'opening';
  motions.set(element, motion);
  void height.finished.then(motion.finish, function cancelled(): void {
    // Reversals remove the old owner first; external cancellation still needs cleanup.
    if (motions.get(element) === motion) motion.finish();
  });
}

/** Mutate the existing controls, then animate from their current painted height. */
export function animateDisclosureChange(element: HTMLElement, change: () => void): void {
  const snapshot = captureDisclosure(element, ['h3', '.todo-actions', '.todo-card-meta']);
  stopMotion(element);
  change();
  const opening = element.dataset.expanded !== 'false';
  const fade = opening ? [...element.querySelectorAll<HTMLElement>('.todo-description,.todo-record-grid,.todo-progress-editor,.todo-time-editor,.todo-control-field')] : [];
  const from = snapshot.anchors.find(anchor => anchor.element.matches('.todo-actions'))?.rect;
  const revealBoundary = opening && from ? { from, selector: '.todo-actions' } : undefined;
  runMotion(element, snapshot.height, element.getBoundingClientRect().height, { opening, fade, anchors: snapshot.anchors, revealBoundary, scroll: snapshot.scroll });
}

/** Supports editors that replace their own row while keeping the surrounding list unchanged. */
export function animateDisclosureReplacement(element: HTMLElement, before: DisclosureSnapshot): void {
  stopMotion(element);
  runMotion(element, before.height, element.getBoundingClientRect().height, { fade: [...element.children].filter(child => child instanceof HTMLElement) as HTMLElement[], scroll: before.scroll });
}

export function animateVisibility(element: HTMLElement, visible: boolean): void {
  if ((visibilityTargets.get(element) ?? !element.hidden) === visible) return;
  const scroll = { x: scrollX, y: scrollY };
  const from = element.hidden ? 0 : element.getBoundingClientRect().height;
  const fade = [...element.children].filter(child => child instanceof HTMLElement) as HTMLElement[];
  const opacity = motions.has(element) ? new Map(fade.map(child => [child, Number(getComputedStyle(child).opacity)])) : undefined;
  const style = getComputedStyle(element);
  const boxFrom = motions.has(element) ? Object.fromEntries(BOX_PROPERTIES.map(property => [property, style[property]])) : undefined;
  stopMotion(element);
  visibilityTargets.set(element, visible);
  element.hidden = false;
  const inert = element.inert;
  if (!visible) element.inert = true;
  runMotion(element, from, visible ? element.getBoundingClientRect().height : 0, {
    opening: visible, collapseBox: true, fade, opacity, boxFrom, scroll,
    finish(): void { element.hidden = !visible; visibilityTargets.delete(element); },
    restore(): void { element.inert = inert; },
  });
}

function toggleDetails(details: HTMLDetailsElement): void {
  const opening = !(detailTargets.get(details) ?? details.open);
  const scroll = { x: scrollX, y: scrollY };
  const from = details.getBoundingClientRect().height;
  const previousOpacity = motions.has(details) ? new Map([...details.children].filter(child => child instanceof HTMLElement)
    .map(child => [child as HTMLElement, Number(getComputedStyle(child).opacity)])) : undefined;
  stopMotion(details);
  detailTargets.set(details, opening);
  const summary = details.querySelector<HTMLElement>(':scope > summary')!;
  const content = [...details.children].filter(child => child !== summary && child instanceof HTMLElement) as HTMLElement[];
  let to: number;
  if (opening) {
    details.open = true;
    to = details.getBoundingClientRect().height;
  } else {
    details.open = false;
    to = details.getBoundingClientRect().height;
    details.open = true;
  }
  const inert = content.map(child => child.inert);
  if (!opening) content.forEach(child => { child.inert = true; });
  summary.setAttribute('aria-expanded', String(opening));
  runMotion(details, from, to, {
    opening, fade: content, opacity: previousOpacity, scroll,
    finish(): void {
      details.open = opening;
      summary.setAttribute('aria-expanded', String(opening));
      detailTargets.delete(details);
    },
    restore(): void { content.forEach((child, index) => { child.inert = inert[index]; }); },
  });
}

/** Delegation also covers chapters and weekly cards inserted after Calendar loading. */
export function initializeDisclosureMotion(): void {
  if (initialized) return;
  initialized = true;
  document.addEventListener('click', function activateDisclosure(event): void {
    const target = event.target;
    if (!(target instanceof Element) || event.defaultPrevented) return;
    const summary = target.closest('summary');
    const details = summary?.parentElement;
    if (!(details instanceof HTMLDetailsElement) || details.matches('#connectionSettings,.connection-dock')) return;
    if (target.closest('button,a,input,select,textarea,label')) return;
    event.preventDefault();
    toggleDetails(details);
  });
  let viewportWidth = innerWidth;
  window.addEventListener('resize', function settleWidthChange(): void {
    if (innerWidth === viewportWidth) return;
    viewportWidth = innerWidth;
    finishMotions();
  });
  window.addEventListener('pagehide', finishMotions);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', finishMotions);
}
