import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/page-transitions.js', import.meta.url), 'utf8');

class EntryAnimation extends EventTarget {
  cancelled = false;
  readonly frames: { opacity: number }[];
  readonly options: { id: string; duration: number };
  constructor(frames: { opacity: number }[], options: { id: string; duration: number }) {
    super();
    this.frames = frames;
    this.options = options;
  }
  cancel(): void { this.cancelled = true; }
}

interface TransitionFixture {
  window: EventTarget;
  document: {
    body: { children: { matches(selector: string): boolean }[] };
    visibilityState: string;
  };
  preference: EventTarget & { matches: boolean };
  animations: EntryAnimation[];
  animatedTargets: string[];
}

function setup(options: { native?: boolean; reduced?: boolean; animate?: boolean } = {}): TransitionFixture {
  const animations: EntryAnimation[] = [];
  const animatedTargets: string[] = [];
  const preference = Object.assign(new EventTarget(), { matches: options.reduced ?? false });
  class ContentElement {
    readonly name: string;
    readonly shared: boolean;
    constructor(name: string, shared: boolean) {
      this.name = name;
      this.shared = shared;
    }
    matches(_selector: string): boolean { return this.shared; }
    animate(frames: { opacity: number }[], settings: { id: string; duration: number }): EntryAnimation {
      const animation = new EntryAnimation(frames, settings);
      animations.push(animation);
      animatedTargets.push(this.name);
      return animation;
    }
  }
  if (options.animate === false) Reflect.set(ContentElement.prototype, 'animate', undefined);
  const body: TransitionFixture['document']['body'] = {
    children: [new ContentElement('main', false), new ContentElement('left rail', true),
      new ContentElement('right rail', true), new ContentElement('mobile bar', true)],
  };
  const document = { body, visibilityState: 'visible' };
  const window = Object.assign(new EventTarget(), { matchMedia: () => preference });
  if (options.native !== false) Object.assign(window, { onpagereveal: null });
  runInNewContext(source, { window, document, Element: ContentElement, HTMLElement: ContentElement });
  return { window, document, preference, animations, animatedTargets };
}

function reveal(target: EventTarget): void {
  target.dispatchEvent(new Event('pagereveal'));
}

test('direct entry fades only the content without changing shared rails, visibility or layout styles', function () {
  const fixture = setup();
  reveal(fixture.window);
  assert.equal(fixture.animations.length, 1);
  assert.deepEqual(Array.from(fixture.animations[0].frames, frame => frame.opacity), [0, 1]);
  assert.equal(fixture.animations[0].options.duration, 200);
  assert.deepEqual(fixture.animatedTargets, ['main']);
  assert.deepEqual(Object.keys(fixture.document.body), ['children']);
});

test('supporting browsers do not duplicate the fade when pageshow also fires', function () {
  const fixture = setup();
  fixture.window.dispatchEvent(new Event('pageshow'));
  reveal(fixture.window);
  fixture.window.dispatchEvent(new Event('pageshow'));
  assert.equal(fixture.animations.length, 1);
});

test('repeated reveals leave only the newest entry animation active', function () {
  const fixture = setup();
  reveal(fixture.window);
  reveal(fixture.window);
  assert.equal(fixture.animations.length, 2);
  assert.equal(fixture.animations[0].cancelled, true);
  assert.equal(fixture.animations[1].cancelled, false);
});

test('leaving cancels the entry and a restored page can animate again', function () {
  const fixture = setup();
  reveal(fixture.window);
  fixture.window.dispatchEvent(new Event('pageswap'));
  assert.equal(fixture.animations[0].cancelled, true);
  fixture.window.dispatchEvent(new Event('pagehide'));
  reveal(fixture.window);
  assert.equal(fixture.animations.length, 2);
  assert.equal(fixture.animations[1].cancelled, false);
});

test('older browsers use pageshow once, including a back-forward-cache restore', function () {
  const fixture = setup({ native: false });
  fixture.window.dispatchEvent(new Event('pageshow'));
  assert.equal(fixture.animations.length, 1);
  fixture.window.dispatchEvent(new Event('pagehide'));
  fixture.window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  assert.equal(fixture.animations.length, 2);
  assert.equal(fixture.animations[0].cancelled, true);
  assert.equal(fixture.animations[1].cancelled, false);
});

test('reduced motion prevents entry and cancels an animation when the preference changes', function () {
  const fixture = setup({ reduced: true });
  reveal(fixture.window);
  assert.equal(fixture.animations.length, 0);
  fixture.preference.matches = false;
  reveal(fixture.window);
  fixture.preference.matches = true;
  fixture.preference.dispatchEvent(new Event('change'));
  assert.equal(fixture.animations[0].cancelled, true);
});

test('hidden pages and missing animation APIs stay usable without an effect', function () {
  const fixture = setup();
  fixture.document.visibilityState = 'hidden';
  reveal(fixture.window);
  assert.equal(fixture.animations.length, 0);
  const unsupported = setup({ animate: false });
  assert.doesNotThrow(() => reveal(unsupported.window));
  assert.equal(unsupported.document.visibilityState, 'visible');
});
