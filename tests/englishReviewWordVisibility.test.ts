import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { propagateDailyWorkField } from '../src/study/dailyWorkGroup.ts';
import { vocabularyAutoFillStatus } from '../src/study/vocabularyAutoFill.ts';
import { VOCABULARY_PARTS_OF_SPEECH } from '../src/study/vocabularyTranslationCounts.ts';
import type { StudyItem } from '../src/types.ts';

const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');

function reviewRuntime(dependencies: Record<string, unknown> = {}): ReturnType<typeof createContext> {
  const context = createContext({
    checked: (value: unknown) => value ? ' checked' : '',
    esc: (value: unknown) => String(value ?? ''),
    propagateDailyWorkField,
    vocabularyAutoFillStatus, VOCABULARY_PARTS_OF_SPEECH,
    ...dependencies,
  });
  for (const name of ['englishReviewWordKind', 'renderEnglishReviewWordTagRow', 'renderEnglishReviewWordKind',
    'renderEnglishReview', 'selectEnglishReviewWordKind']) {
    const start = runtime.indexOf(`function ${name}(`);
    const end = runtime.indexOf('\nfunction ', start + 1);
    assert.ok(start >= 0 && end > start, name);
    runInContext(runtime.slice(start, end), context);
  }
  return context;
}

test('initial review rows hide POS only for combinations/sentences, including legacy flags', () => {
  const context = reviewRuntime();
  const variants = [
    { text: 'novelty', noun: true },
    { text: 'pay a premium', fixedCombination: true, verb: true },
    { text: 'Practice makes perfect.', beautifulSentences: true, noun: true },
    { text: 'legacy flags', fixedCombination: true, beautifulSentences: true, adjective: true },
  ];
  for (const [index, word] of variants.entries()) {
    const snapshot = structuredClone(word);
    const html = context.renderEnglishReview({ f: { words: [word] } }) as string;
    const tag = html.match(/<div class="checkline word-pos-primary"[^>]*>/)?.[0];
    assert.ok(tag);
    assert.equal(tag.includes(' hidden'), index !== 0);
    assert.equal((html.match(/data-word-pos=/g) ?? []).length, VOCABULARY_PARTS_OF_SPEECH.length);
    assert.match(html, /data-word-kind-switch/);
    assert.deepEqual(word, snapshot);
  }
  const legacy = context.renderEnglishReview({ f: { words: ['legacy word'] } }) as string;
  assert.match(legacy, /class="checkline word-pos-primary">/);
});

test('switching kinds updates only that row without replacing controls or clearing POS', () => {
  const item: StudyItem = { id: 'review', type: 'englishVocabInteractive', done: false, minutes: '15', required: false,
    f: { words: [{ text: 'novelty', noun: true, verb: false }, { text: 'other', adjective: true }] } };
  const snapshots: StudyItem[] = [];
  const context = reviewRuntime({ persist: () => snapshots.push(structuredClone(item)) });
  const posRow = { hidden: false };
  const buttons = ['word', 'combination', 'sentence'].map(kind => ({
    getAttribute: () => kind,
    attributes: {} as Record<string, string>,
    setAttribute(name: string, value: string): void { this.attributes[name] = value; },
  }));
  const switcher = {
    dataset: { active: '0' },
    querySelectorAll: () => buttons,
    closest: () => ({ querySelector: () => posRow }),
  };
  for (const [index, kind] of ['combination', 'sentence', 'word'].entries()) {
    context.selectEnglishReviewWordKind(item, {
      getAttribute: (name: string) => name === 'data-index' ? '0' : kind,
      closest: () => switcher,
    });
    assert.equal(posRow.hidden, kind !== 'word');
    assert.equal(switcher.dataset.active, String(kind === 'word' ? 0 : index + 1));
    assert.equal(buttons.find(button => button.getAttribute() === kind)?.attributes['aria-pressed'], 'true');
    assert.equal(item.f.words?.[0] && typeof item.f.words[0] === 'object' && item.f.words[0].noun, true);
    assert.deepEqual(item.f.words?.[1], { text: 'other', adjective: true });
    assert.equal(snapshots.length, index + 1);
  }
  assert.equal(item.minutes, '15');
  assert.deepEqual(item.f.words?.[0], { text: 'novelty', noun: true, verb: false, fixedCombination: false, beautifulSentences: false });
});

test('hidden POS rows override the checkbox row flex display without changing slider animation', () => {
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.word-pos-primary\[hidden\]\s*\{\s*display:\s*none\s*\}/);
  assert.match(styles, /\.word-kind-indicator\{[^}]*transition:transform/);
});
