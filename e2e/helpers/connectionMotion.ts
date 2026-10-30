import type { Locator } from '@playwright/test';

interface ConnectionMotionFrame {
  open: boolean;
  opening: boolean;
  closing: boolean;
  top: number;
  height: number;
  scrollTop: number;
}

interface ObservedConnectionPanel extends HTMLDetailsElement {
  observedMotion?: Promise<ConnectionMotionFrame[]>;
}

/** Capture in-browser frames before clicking so slow runner communication cannot miss a transition. */
export async function clickConnectionToggle(toggle: Locator): Promise<ConnectionMotionFrame[]> {
  await toggle.evaluate(function observeToggle(button): void {
    const details = button.closest('details');
    if (!details) throw new Error('Connection toggle must belong to a details panel.');
    const panel = details as ObservedConnectionPanel;
    panel.observedMotion = new Promise<ConnectionMotionFrame[]>(function observe(resolve): void {
      // The panel receives the event after the summary's application handler has run.
      panel.addEventListener('click', function recordClick(): void {
        const frames: ConnectionMotionFrame[] = [];
        function sample(): void {
          const rect = panel.getBoundingClientRect();
          const frame = {
            open: panel.open,
            opening: panel.classList.contains('is-opening'),
            closing: panel.classList.contains('is-closing'),
            top: rect.top,
            height: rect.height,
            scrollTop: window.scrollY,
          };
          frames.push(frame);
          if (frame.opening || frame.closing) requestAnimationFrame(sample);
          else resolve(frames);
        }
        sample();
      }, { once: true });
    });
  });
  await toggle.click();
  return toggle.evaluate(function readFrames(button): Promise<ConnectionMotionFrame[]> {
    const panel = button.closest('details') as ObservedConnectionPanel | null;
    if (!panel?.observedMotion) throw new Error('Connection motion was not observed.');
    return panel.observedMotion;
  });
}
