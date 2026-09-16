import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cloneOriginalItemForMakeup,
  effectiveTemplatePresetKey,
  mergeMakeupProgress,
  mergeDeferredCarryRanges,
  specialItemTemplate,
} from '../src/study/makeup.ts';
import type { StudyItem, StudyItemType } from '../src/types.ts';

function originalItem(): StudyItem {
  return {
    id: 'preset-2026-08-27-cal-essential',
    type: 'extra',
    done: false,
    minutes: '25',
    required: true,
    source: 'preset',
    presetKey: 'cal_essential_grammar_21_event',
    title: '英文｜Essential Grammar in Use｜Unit 21',
    description: 'Calendar 指定 Unit',
    deferred: true,
    deferredTargetDay: 5,
    f: {
      title: 'Essential Grammar in Use',
      unit: '21',
      unitStart: '21',
      unitEnd: '21',
      calendarRoute: 'today',
    },
  };
}

test('clones a deferred item with its full original template and values', () => {
  const original = originalItem();
  const makeup = cloneOriginalItemForMakeup(original, {
    id: 'preset-2026-08-28-deferred-item',
    presetKey: 'deferred_20260827_item',
    originDate: '2026-08-27',
  });

  assert.equal(makeup.type, 'extra');
  assert.equal(makeup.title, original.title);
  assert.deepEqual(makeup.f, original.f);
  assert.notEqual(makeup.f, original.f);
  assert.equal(makeup.templatePresetKey, original.presetKey);
  assert.equal(effectiveTemplatePresetKey(makeup), original.presetKey);
  assert.equal(makeup.done, false);
  assert.equal(makeup.deferred, false);
  assert.equal(makeup.deferredTargetDay, undefined);
  assert.equal(original.deferred, true);
});

test('restores missing template fields without losing entered makeup progress', () => {
  const template = cloneOriginalItemForMakeup(originalItem(), {
    id: 'makeup',
    presetKey: 'deferred_item',
    originDate: '2026-08-27',
  });
  const existing: StudyItem = {
    ...template,
    done: true,
    minutes: '35',
    f: { corrected: true },
  };

  const merged = mergeMakeupProgress(template, existing);
  assert.equal(merged.done, true);
  assert.equal(merged.minutes, '35');
  assert.equal(merged.f.title, 'Essential Grammar in Use');
  assert.equal(merged.f.unit, '21');
  assert.equal(merged.f.corrected, true);
});

test('keeps every supported deferred item type and its complete field payload', () => {
  const types: StudyItemType[] = [
    'mathStudy', 'mathLecture', 'mathPractice', 'mathOral', 'magazine',
    'englishPractice', 'englishVocabInteractive', 'englishMixedWriting',
    'biologyInteractive', 'scienceReview', 'chineseReading', 'mock', 'general',
    'extra', 'interactive', 'interactiveDaily', 'calendarStudy',
  ];

  for (const type of types) {
    const original: StudyItem = {
      id: `original-${type}`,
      type,
      done: false,
      minutes: '',
      required: true,
      source: 'preset',
      presetKey: `template-${type}`,
      title: `template title ${type}`,
      description: `template description ${type}`,
      deferred: true,
      deferredTargetDay: 6,
      f: { marker: type, nested: { retained: true } },
    };
    const makeup = cloneOriginalItemForMakeup(original, {
      id: `makeup-${type}`,
      presetKey: `deferred-${type}`,
      originDate: '2026-08-27',
    });

    assert.equal(makeup.type, type);
    assert.equal(makeup.title, original.title);
    assert.equal(makeup.f.marker, type);
    assert.deepEqual(makeup.f.nested, { retained: true });
    assert.equal(makeup.templatePresetKey, original.presetKey);
  }
});

test('preserves the three special templates after defer', () => {
  const cases: Array<[StudyItem, string]> = [
    [{ ...originalItem(), type: 'general', presetKey: 'weekday_english_review', title: '英文訂正與搭配詞整理', f: { words: [] } }, 'englishReview'],
    [{ ...originalItem(), type: 'interactiveDaily', presetKey: 'daily_interactive', title: '互動題', f: { interactiveEntries: [] } }, 'interactiveDaily'],
    [{ ...originalItem(), type: 'magazine', presetKey: 'weekday_magazine', title: '學測英文訓練：英文雜誌', f: { entries: [] } }, 'fixedMagazine'],
  ];

  for (const [original, expectedTemplate] of cases) {
    const makeup = cloneOriginalItemForMakeup(original, {
      id: `makeup-${original.presetKey}`,
      presetKey: `deferred-${original.presetKey}`,
      originDate: '2026-08-27',
    });
    assert.equal(specialItemTemplate(makeup), expectedTemplate);
    assert.deepEqual(makeup.f, original.f);
  }
});

test('preserves the original template key through repeated defer cloning', () => {
  const original = originalItem();
  const first = cloneOriginalItemForMakeup(original, {
    id: 'first-makeup',
    presetKey: 'deferred-first',
    originDate: '2026-08-27',
  });
  const second = cloneOriginalItemForMakeup(first, {
    id: 'second-makeup',
    presetKey: 'deferred-second',
    originDate: '2026-08-29',
  });

  assert.equal(second.type, original.type);
  assert.equal(second.title, original.title);
  assert.deepEqual(second.f, original.f);
  assert.equal(second.templatePresetKey, original.presetKey);
  assert.equal(effectiveTemplatePresetKey(second), original.presetKey);
});

function deferredMath(id: string, start: number, end: number): StudyItem {
  return {
    id,
    type: 'mathStudy',
    done: false,
    minutes: '',
    required: true,
    source: 'preset',
    presetKey: `deferred-${id}`,
    templatePresetKey: 'weekday_math_study',
    title: '數學講義：進度',
    description: '延期自 2026-08-25',
    deferredCarry: true,
    deferredOriginDate: '2026-08-25',
    deferredOriginId: id,
    f: { material: '教學講義', book: '1', start: String(start), end: String(end) },
  };
}

test('merges touching deferred ranges into one item', () => {
  const first = deferredMath('a', 1, 5);
  first.f.unit = '多項式函數';
  first.f.chapter = '多項式及其運算';
  const second = deferredMath('b', 6, 10);
  second.f.unit = '多項式函數';
  second.f.chapter = '多項式及其運算';
  const third = deferredMath('c', 11, 15);
  third.f.unit = '多項式函數';
  third.f.chapter = '簡單多項式函數及其圖形';
  const output = mergeDeferredCarryRanges([first, second, third]);
  assert.equal(output.length, 1);
  assert.equal(output[0].f.start, '1');
  assert.equal(output[0].f.end, '15');
  assert.equal(output[0].f.groupedWorkEntries, undefined);
});

test('groups interrupted deferred ranges and preserves child progress on rebuild', () => {
  const template = mergeDeferredCarryRanges([deferredMath('a', 1, 5), deferredMath('b', 11, 15)])[0];
  const entries = template.f.groupedWorkEntries as StudyItem[];
  assert.equal(entries.length, 2);
  const existing = structuredClone(template);
  (existing.f.groupedWorkEntries as StudyItem[])[0].done = true;
  (existing.f.groupedWorkEntries as StudyItem[])[0].checkedOn = '2026-09-17';
  (existing.f.groupedWorkEntries as StudyItem[])[0].deferredCompletedOn = '2026-09-17';

  const merged = mergeMakeupProgress(template, existing);
  assert.equal((merged.f.groupedWorkEntries as StudyItem[])[0].done, true);
  assert.equal((merged.f.groupedWorkEntries as StudyItem[])[0].checkedOn, '2026-09-17');
  assert.equal((merged.f.groupedWorkEntries as StudyItem[])[0].deferredCompletedOn, '2026-09-17');
  assert.equal((merged.f.groupedWorkEntries as StudyItem[])[1].done, false);
});

test('groups deferred rounds into separately countable children', () => {
  const base = deferredMath('round-a', 1, 1);
  delete base.f.start;
  delete base.f.end;
  base.type = 'extra';
  base.title = '英文｜ACE Reading 第 1 回';
  base.f = { title: 'ACE Reading', round: '1' };
  const next = structuredClone(base);
  next.id = 'round-b';
  next.presetKey = 'deferred-round-b';
  next.deferredOriginId = 'round-b';
  next.title = '英文｜ACE Reading 第 2 回';
  next.f.round = '2';

  const output = mergeDeferredCarryRanges([base, next]);
  assert.equal(output.length, 1);
  assert.deepEqual((output[0].f.groupedWorkEntries as StudyItem[]).map(child => child.f.round), ['1', '2']);
});

test('groups deferred 大考英聽A攻略 tests without losing the book template', () => {
  const base = deferredMath('listening-a', 1, 1);
  delete base.f.start;
  delete base.f.end;
  base.type = 'extra';
  base.title = '英文｜大考英聽A攻略 Test 2';
  base.f = { title: '大考英聽A攻略', round: '2' };
  const next = structuredClone(base);
  next.id = 'listening-b';
  next.presetKey = 'deferred-listening-b';
  next.deferredOriginId = 'listening-b';
  next.title = '英文｜大考英聽A攻略 Test 4';
  next.f.round = '4';

  const output = mergeDeferredCarryRanges([base, next]);
  assert.equal(output.length, 1);
  assert.equal(output[0].f.title, '大考英聽A攻略');
  assert.deepEqual((output[0].f.groupedWorkEntries as StudyItem[]).map(child => child.f.round), ['2', '4']);
});
