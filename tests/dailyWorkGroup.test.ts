import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDailyWorkRangeOverrides,
  groupDailyWorkItems,
  propagateDailyWorkDeferred,
  propagateDailyWorkDone,
  propagateDailyWorkField,
  propagateDailyWorkMinutes,
  propagateDailyWorkRangeField,
  replaceDailyWorkMinutes,
  ungroupDailyWorkItems,
} from '../src/study/dailyWorkGroup.ts';
import type { StudyItem } from '../src/types.ts';

function math(id: string, start: number, end: number, deferredCarry = false): StudyItem {
  return {
    id,
    type: 'mathStudy',
    done: false,
    minutes: '',
    required: !deferredCarry,
    source: 'preset',
    presetKey: id,
    title: '數學講義：進度',
    description: deferredCarry ? '延期補做' : 'Google Calendar 當日排程',
    deferredCarry,
    f: { material: '教學講義', book: '1', start: String(start), end: String(end) },
  };
}

function round(id: string, value: number, deferredCarry = false): StudyItem {
  return {
    id,
    type: 'chineseReading',
    done: false,
    minutes: '',
    required: !deferredCarry,
    source: 'preset',
    presetKey: id,
    title: `國文｜古今悅讀一百 第 ${value} 回`,
    description: deferredCarry ? '延期補做' : 'Google Calendar 當日排程',
    deferredCarry,
    f: { kind: 'reading', round: String(value) },
  };
}

function listeningTest(id: string, value: number, deferredCarry = false): StudyItem {
  return {
    id,
    type: 'extra',
    done: false,
    minutes: '',
    required: !deferredCarry,
    source: 'preset',
    presetKey: id,
    title: `英文｜大考英聽A攻略 Test ${value}`,
    description: deferredCarry ? '延期補做' : 'Google Calendar 當日排程',
    deferredCarry,
    f: { title: '大考英聽A攻略', round: String(value) },
  };
}

function englishTopicBook(id: string, topic: string, roundValue: string, deferredCarry = false): StudyItem {
  return {
    id,
    type: 'extra',
    done: false,
    minutes: '',
    required: !deferredCarry,
    source: 'preset',
    presetKey: id,
    title: '英文｜主題百匯：克漏字',
    description: deferredCarry ? '延期補做' : 'Google Calendar 當日排程',
    deferredCarry,
    f: {
      title: '主題百匯：克漏字', book: '主題百匯：克漏字', topic, round: roundValue,
      calendarBookRangeLocked: true,
    },
  };
}

function mathPractice(id: string, start?: number, end?: number, deferredCarry = false): StudyItem {
  return {
    id,
    type: 'mathPractice',
    done: false,
    minutes: '',
    required: !deferredCarry,
    source: 'preset',
    presetKey: id,
    title: '數學講義題目：理解檢查＋錯題標記＋訂正',
    description: deferredCarry ? '延期補做' : '星期日原訂項目',
    deferredCarry,
    f: start && end
      ? { material: '教學講義', book: '1', start: String(start), end: String(end) }
      : {},
  };
}

test('merges the actual daily mix of Calendar and deferred math into one range', () => {
  const sources = [math('current', 158, 165), math('makeup-a', 149, 165, true), math('makeup-b', 166, 173, true)];
  const output = groupDailyWorkItems(sources);
  assert.equal(output.length, 1);
  assert.equal(output[0].f.start, '149');
  assert.equal(output[0].f.end, '173');
  assert.equal(output[0].required, true);
  assert.equal(output[0].deferredCarry, false);
  assert.equal((output[0].f.dailyWorkSourceItems as StudyItem[]).length, 3);
  assert.deepEqual(ungroupDailyWorkItems(output).map(item => item.id).sort(), ['current', 'makeup-a', 'makeup-b'].sort());
});

test('groups different rounds across Calendar and Tracker deferral sources', () => {
  const output = groupDailyWorkItems([round('current-14', 14), round('makeup-11', 11, true)]);
  assert.equal(output.length, 1);
  const children = output[0].f.groupedWorkEntries as StudyItem[];
  assert.deepEqual(children.map(child => child.f.round), ['14', '11']);
  assert.deepEqual(children.map(child => child.required), [true, false]);
});

test('groups different 大考英聽A攻略 tests across Calendar and Tracker deferral sources', () => {
  const output = groupDailyWorkItems([listeningTest('current-2', 2), listeningTest('makeup-4', 4, true)]);
  assert.equal(output.length, 1);
  assert.equal(output[0].title, '英文｜大考英聽A攻略');
  const children = output[0].f.groupedWorkEntries as StudyItem[];
  assert.deepEqual(children.map(child => child.f.round), ['2', '4']);
  assert.deepEqual(children.map(child => child.required), [true, false]);
});

test('groups English Topic Collection rounds only within the same topic', () => {
  const sameTopic = groupDailyWorkItems([
    englishTopicBook('new-generation-1', '新新世代', '第一回'),
    englishTopicBook('new-generation-2', '新新世代', '第二回', true),
  ]);
  assert.equal(sameTopic.length, 1);
  assert.deepEqual(
    (sameTopic[0].f.groupedWorkEntries as StudyItem[]).map(child => [child.f.topic, child.f.round]),
    [['新新世代', '第一回'], ['新新世代', '第二回']],
  );

  const repeatedFirstRound = groupDailyWorkItems([
    englishTopicBook('new-generation-first', '新新世代', '第一回'),
    englishTopicBook('life-first', '人生哲理', '第一回', true),
  ]);
  assert.equal(repeatedFirstRound.length, 2, '第一回 must not merge across different topics');
});

test('keeps interrupted ranges as separate counted children in one card', () => {
  const output = groupDailyWorkItems([math('first', 1, 5), math('second', 11, 15, true)]);
  assert.equal(output.length, 1);
  const children = output[0].f.groupedWorkEntries as StudyItem[];
  assert.deepEqual(children.map(child => [child.f.start, child.f.end]), [['1', '5'], ['11', '15']]);
});

test('stores every edited child field on its hidden source before rebuilding', () => {
  const output = groupDailyWorkItems([math('first', 1, 5), math('second', 11, 15, true)]);
  const children = output[0].f.groupedWorkEntries as StudyItem[];

  propagateDailyWorkField(children[1], 'reason', '第二個範圍的錯因');
  propagateDailyWorkField(children[1], 'corrected', true);

  const sources = ungroupDailyWorkItems(output);
  const second = sources.find(item => item.id === 'second');
  assert.equal(second?.f.reason, '第二個範圍的錯因');
  assert.equal(second?.f.corrected, true);

  const rebuilt = groupDailyWorkItems(sources);
  const rebuiltChildren = rebuilt[0].f.groupedWorkEntries as StudyItem[];
  assert.equal(rebuiltChildren[1].f.reason, '第二個範圍的錯因');
  assert.equal(rebuiltChildren[1].f.corrected, true);
});

test('grouped children keep separate minutes and timer states after rebuilding', () => {
  const output = groupDailyWorkItems([math('first', 1, 5), math('second', 11, 15, true)]);
  const children = output[0].f.groupedWorkEntries as StudyItem[];

  propagateDailyWorkMinutes(children[0], '12');
  propagateDailyWorkField(children[0], 'timeTracking', {
    mode: 'timer', accumulatedSeconds: 720, startedAt: null,
  });
  propagateDailyWorkMinutes(children[1], '34');
  propagateDailyWorkField(children[1], 'timeTracking', {
    mode: 'manual', accumulatedSeconds: 0, startedAt: null,
  });

  const rebuilt = groupDailyWorkItems(ungroupDailyWorkItems(output));
  const rebuiltChildren = rebuilt[0].f.groupedWorkEntries as StudyItem[];
  assert.deepEqual(rebuiltChildren.map(child => child.minutes), ['12', '34']);
  assert.deepEqual(rebuiltChildren.map(child => child.f.timeTracking), [
    { mode: 'timer', accumulatedSeconds: 720, startedAt: null },
    { mode: 'manual', accumulatedSeconds: 0, startedAt: null },
  ]);
});

test('stores object-list fields without sharing the displayed array reference', () => {
  const output = groupDailyWorkItems([math('first', 1, 5), math('second', 11, 15, true)]);
  const children = output[0].f.groupedWorkEntries as StudyItem[];
  const words = [{ text: 'persisted', noun: true }];

  propagateDailyWorkField(children[1], 'words', words);
  words[0].text = 'display-only mutation';

  const rebuilt = groupDailyWorkItems(ungroupDailyWorkItems(output));
  const rebuiltChildren = rebuilt[0].f.groupedWorkEntries as StudyItem[];
  assert.equal((rebuiltChildren[1].f.words as Array<{ text: string }>)[0].text, 'persisted');
});

test('stores a flat merged-card field on the source used after rebuilding', () => {
  const output = groupDailyWorkItems([
    math('current', 158, 165),
    math('earlier-makeup', 149, 157, true),
  ]);

  propagateDailyWorkField(output[0], 'reason', '整張合併卡的錯因');

  const rebuilt = groupDailyWorkItems(ungroupDailyWorkItems(output));
  assert.equal(rebuilt[0].f.reason, '整張合併卡的錯因');
});

test('propagates a merged checkbox back to every hidden source record', () => {
  const output = groupDailyWorkItems([math('current', 1, 5), math('makeup', 6, 10, true)]);
  propagateDailyWorkDone(output[0], true);
  const sources = output[0].f.dailyWorkSourceItems as StudyItem[];
  assert.equal(output[0].done, true);
  assert.equal(sources.every(item => item.done), true);
});

test('groups the blank Sunday math-practice template with deferred page ranges', () => {
  const sources = [
    mathPractice('sunday-original'),
    mathPractice('makeup-a', 149, 157, true),
    mathPractice('makeup-b', 158, 165, true),
  ];
  const output = groupDailyWorkItems(sources);
  assert.equal(output.length, 1);
  assert.equal(output[0].f.groupedWorkEntries, undefined);
  assert.deepEqual([output[0].f.start, output[0].f.end], ['149', '165']);
  assert.equal((output[0].f.dailyWorkSourceItems as StudyItem[]).length, 3);
});

test('groups math-practice across preset, Calendar, and deferred title variants', () => {
  const original = mathPractice('sunday-original');
  const calendar = mathPractice('calendar-range', 149, 157);
  calendar.source = 'calendar';
  calendar.title = '數學講義題目｜理解檢查＋錯題標記＋訂正';
  calendar.f.calendarFixedTemplate = 'mathPractice';
  const deferred = mathPractice('deferred-range', 158, 165, true);
  deferred.title = '數學講義題目｜理解檢查+錯題標記+訂正';

  const output = groupDailyWorkItems([original, calendar, deferred]);

  assert.equal(output.length, 1);
  assert.equal(output[0].f.groupedWorkEntries, undefined);
  assert.deepEqual([output[0].f.start, output[0].f.end], ['149', '165']);
  assert.deepEqual(
    (output[0].f.dailyWorkSourceItems as StudyItem[]).map(item => item.id).sort(),
    ['calendar-range', 'deferred-range', 'sunday-original'],
  );
});

test('groups Sunday Calendar-filled math-practice with a deferred item from another book', () => {
  const sundayCalendar = mathPractice('sun-calendar', 174, 181);
  sundayCalendar.f.calendarFixedTemplate = 'mathPractice';
  sundayCalendar.f.calendarMerged = true;
  sundayCalendar.f.book = '';
  const deferred = mathPractice('prior-deferred', 149, 165, true);
  deferred.f.book = '1';

  const output = groupDailyWorkItems([sundayCalendar, deferred]);

  assert.equal(output.length, 1);
  assert.equal(output[0].f.groupedWorkEntries, undefined);
  assert.deepEqual([output[0].f.start, output[0].f.end], ['149', '181']);
  assert.equal(output[0].required, true);
});

test('preserves the single Sunday math-practice checkbox after rebuilding the daily card', () => {
  const output = groupDailyWorkItems([
    mathPractice('sunday-original'),
    mathPractice('makeup', 149, 157, true),
  ]);
  propagateDailyWorkDone(output[0], true);
  const rebuilt = groupDailyWorkItems(ungroupDailyWorkItems(output));
  assert.equal(rebuilt[0].done, true);
  assert.equal((rebuilt[0].f.dailyWorkSourceItems as StudyItem[]).every(item => item.done), true);
});

test('stores merged math-study minutes on the preferred source used after rebuilding', () => {
  const output = groupDailyWorkItems([
    math('current', 158, 165),
    math('earlier-makeup', 149, 157, true),
  ]);
  assert.deepEqual(
    (output[0].f.dailyWorkSourceItems as StudyItem[]).map(item => item.id),
    ['earlier-makeup', 'current'],
  );
  propagateDailyWorkMinutes(output[0], '45');
  const rebuilt = groupDailyWorkItems(ungroupDailyWorkItems(output));
  assert.equal(rebuilt[0].minutes, '45');
});

test('a completed timer replaces older manual minutes across grouped sources', () => {
  const sources = [
    math('current', 158, 165),
    math('earlier-makeup', 149, 157, true),
  ];
  sources[0].minutes = '25';
  sources[1].minutes = '10';
  const output = groupDailyWorkItems(sources);

  replaceDailyWorkMinutes(output[0], '6.5');

  const stored = ungroupDailyWorkItems(output);
  assert.equal(stored.filter(item => item.minutes).length, 1);
  assert.equal(groupDailyWorkItems(stored)[0].minutes, '6.5');
});

test('stores an edited merged end page on the source that owns the upper boundary', () => {
  const output = groupDailyWorkItems([
    math('current', 158, 165),
    math('earlier-makeup', 149, 157, true),
  ]);
  propagateDailyWorkRangeField(output[0], 'end', '170');
  const sources = ungroupDailyWorkItems(output);
  assert.equal(sources.find(item => item.id === 'current')?.f.end, '170');
  assert.equal(sources.find(item => item.id === 'earlier-makeup')?.f.end, '157');

  const rebuilt = groupDailyWorkItems(sources);
  assert.equal(rebuilt[0].f.start, '149');
  assert.equal(rebuilt[0].f.end, '170');
});

test('stores an edited merged start page on the source that owns the lower boundary', () => {
  const output = groupDailyWorkItems([
    math('current', 158, 165),
    math('earlier-makeup', 149, 157, true),
  ]);
  propagateDailyWorkRangeField(output[0], 'start', '145');
  const sources = ungroupDailyWorkItems(output);
  assert.equal(sources.find(item => item.id === 'current')?.f.start, '158');
  assert.equal(sources.find(item => item.id === 'earlier-makeup')?.f.start, '145');
  assert.equal(groupDailyWorkItems(sources)[0].f.start, '145');
});

test('restores an explicit range edit after Calendar refreshes its suggested pages', () => {
  const item = math('calendar', 158, 165);
  propagateDailyWorkRangeField(item, 'end', '170');
  item.f.end = '165';
  applyDailyWorkRangeOverrides(item);
  assert.equal(item.f.end, '170');
});

test('applies a confirmed deferral to the single math-practice card and all hidden sources', () => {
  const output = groupDailyWorkItems([
    mathPractice('original'),
    mathPractice('scoped', 149, 157),
  ]);
  propagateDailyWorkDeferred(output[0], true, 6);
  const rebuilt = groupDailyWorkItems(ungroupDailyWorkItems(output));
  assert.equal(rebuilt[0].deferred, true);
  assert.equal(rebuilt[0].deferredTargetDay, 6);
  assert.equal(rebuilt[0].done, false);
  assert.equal(
    (rebuilt[0].f.dailyWorkSourceItems as StudyItem[]).every(item => item.deferredTargetDay === 6),
    true,
  );
});

test('flattens Calendar math-practice children and preserves completion and range edits', () => {
  const calendarParent = mathPractice('calendar-parent', 1, 5);
  const first = mathPractice('calendar-child-1', 1, 5);
  const second = mathPractice('calendar-child-2', 11, 15);
  calendarParent.f.calendarFixedTemplate = 'mathPractice';
  calendarParent.f.calendarGroupedWork = true;
  calendarParent.f.groupedWorkEntries = [first, second];

  const output = groupDailyWorkItems([calendarParent]);
  assert.equal(output.length, 1);
  assert.equal(output[0].f.groupedWorkEntries, undefined);
  assert.deepEqual([output[0].f.start, output[0].f.end], ['1', '15']);

  propagateDailyWorkDone(output[0], true);
  propagateDailyWorkRangeField(output[0], 'end', '18');
  const hiddenParent = (output[0].f.dailyWorkSourceItems as StudyItem[])[0];
  const hiddenChildren = hiddenParent.f.groupedWorkEntries as StudyItem[];
  assert.equal(hiddenChildren.every(child => child.done), true);
  assert.equal(hiddenChildren[1].f.end, '18');

  const rebuilt = groupDailyWorkItems(ungroupDailyWorkItems(output));
  assert.equal(rebuilt[0].done, true);
  assert.equal(rebuilt[0].f.end, '18');
  assert.equal(rebuilt[0].f.groupedWorkEntries, undefined);
});
