import assert from 'node:assert/strict';
import test from 'node:test';

import { dedupePresetDefinitions, type PresetDefinitionLike } from '../src/study/presetDedup.ts';

function definition(
  key: string,
  title: string,
  fields: Record<string, unknown> = {},
): PresetDefinitionLike {
  return { key, type: 'mock', title, description: '說明', required: true, f: fields };
}

test('merges a matching Calendar mock into the built-in card', () => {
  const output = dedupePresetDefinitions([
    definition('fri_mock_timed', '英文歷屆／模考：限時作答', { subject: '英文' }),
    definition('cal_fixed_englishMockTimed_event-1', '英文歷屆／模考：限時作答', {
      calendarFixedTemplate: 'englishMockTimed',
      calendarEventId: 'event-1',
      calendarRoute: 'today',
    }),
  ]);

  assert.equal(output.length, 1);
  assert.equal(output[0].key, 'fri_mock_timed');
  assert.equal(output[0].f.calendarMerged, true);
  assert.equal(output[0].f.calendarEventId, 'event-1');
});

test('merges Calendar magazine makeup and preserves its extra workload marker', () => {
  const output = dedupePresetDefinitions([
    definition('fri_magazine', '學測英文訓練：英文雜誌'),
    definition('cal_fixed_fixedMagazine_event-2', '學測英文訓練：英文雜誌', {
      calendarFixedTemplate: 'fixedMagazine',
      calendarEventId: 'event-2',
      calendarRoute: 'today',
      calendarMakeup: true,
    }),
  ]);

  assert.equal(output.length, 1);
  assert.equal(output[0].key, 'fri_magazine');
  assert.equal(output[0].f.calendarMerged, true);
  assert.equal(output[0].f.calendarIncludesMakeup, true);
  assert.equal('calendarMakeup' in output[0].f, false);
});

test('collapses duplicate Calendar events that schedule the same work', () => {
  const builtIn = definition('fri_mock_timed', '英文歷屆／模考：限時作答');
  const first = definition('cal_fixed_englishMockTimed_event-1', '英文歷屆／模考：限時作答', {
    calendarFixedTemplate: 'englishMockTimed',
    calendarEventId: 'event-1',
    calendarRoute: 'today',
  });
  const second = definition('cal_fixed_englishMockTimed_event-2', '英文歷屆／模考：限時作答', {
    calendarFixedTemplate: 'englishMockTimed',
    calendarEventId: 'event-2',
    calendarRoute: 'today',
  });
  const weekly = definition('cal_fixed_englishMockTimed_event-3', '英文歷屆／模考：限時作答', {
    calendarFixedTemplate: 'englishMockTimed',
    calendarRoute: 'week',
  });
  const output = dedupePresetDefinitions([builtIn, first, second, weekly]);

  assert.equal(output.length, 2);
  assert.equal(output[0].f.calendarMerged, true);
  assert.equal(output[1].key, weekly.key);
});

test('keeps same-template Calendar work separate when its range differs', () => {
  const first = definition('cal_essential_grammar_12_event-1', '英文｜Essential Grammar in Use｜Unit 12', {
    title: 'Essential Grammar in Use', unit: '12', unitStart: '12', unitEnd: '12', calendarRoute: 'today',
  });
  const second = definition('cal_essential_grammar_13_event-2', '英文｜Essential Grammar in Use｜Unit 13', {
    title: 'Essential Grammar in Use', unit: '13', unitStart: '13', unitEnd: '13', calendarRoute: 'today',
  });

  const output = dedupePresetDefinitions([first, second]);
  assert.equal(output.length, 2);
});

test('merges adjacent Calendar page ranges into one normal item', () => {
  const ranges = [[1, 5], [6, 10], [11, 15]].map(([start, end], index) => definition(
    `cal_fixed_mathStudy_event-${index}`,
    '數學講義：進度',
    {
      calendarFixedTemplate: 'mathStudy', calendarRoute: 'today',
      calendarEventKey: `event-${index}`, material: '教學講義',
      start: String(start), end: String(end),
      unit: '多項式函數', chapter: index < 2 ? '多項式及其運算' : '簡單多項式函數及其圖形',
    },
  ));

  const output = dedupePresetDefinitions(ranges);
  assert.equal(output.length, 1);
  assert.equal(output[0].f.start, '1');
  assert.equal(output[0].f.end, '15');
  assert.equal(output[0].f.groupedWorkEntries, undefined);
  assert.deepEqual(output[0].f.calendarEventKeys, ['event-0', 'event-1', 'event-2']);
});

test('groups interrupted Calendar page ranges as separately countable children', () => {
  const output = dedupePresetDefinitions([
    definition('cal_fixed_mathStudy_event-1', '數學講義：進度', {
      calendarFixedTemplate: 'mathStudy', calendarRoute: 'today', calendarEventKey: 'event-1',
      material: '教學講義', start: '1', end: '5',
    }),
    definition('cal_fixed_mathStudy_event-2', '數學講義：進度', {
      calendarFixedTemplate: 'mathStudy', calendarRoute: 'today', calendarEventKey: 'event-2',
      material: '教學講義', start: '11', end: '15',
    }),
  ]);

  assert.equal(output.length, 1);
  assert.equal(output[0].f.calendarGroupedWork, true);
  const children = output[0].f.groupedWorkEntries as Array<{ f: Record<string, unknown> }>;
  assert.equal(children.length, 2);
  assert.deepEqual(children.map(child => [child.f.start, child.f.end]), [['1', '5'], ['11', '15']]);
});

test('groups repeated Calendar rounds into one parent with separate children', () => {
  const output = dedupePresetDefinitions([
    { ...definition('cal_ace_1_event-1', '英文｜ACE Reading 第 1 回', { title: 'ACE Reading', round: '1', calendarRoute: 'today', calendarEventKey: 'event-1' }), type: 'extra' },
    { ...definition('cal_ace_2_event-2', '英文｜ACE Reading 第 2 回', { title: 'ACE Reading', round: '2', calendarRoute: 'today', calendarEventKey: 'event-2' }), type: 'extra' },
  ]);

  assert.equal(output.length, 1);
  assert.equal(output[0].title, '英文｜ACE Reading');
  const children = output[0].f.groupedWorkEntries as Array<{ f: Record<string, unknown> }>;
  assert.deepEqual(children.map(child => child.f.round), ['1', '2']);
});

test('groups Topic Collection rounds within one topic but never across different topics', () => {
  const topicBook = (key: string, topic: string, round: string) => ({
    ...definition(key, '英文｜主題百匯：克漏字', {
      title: '主題百匯：克漏字', book: '主題百匯：克漏字', topic, round,
      calendarRoute: 'today', calendarBookRangeLocked: true, calendarEventKey: key,
    }),
    type: 'extra',
  });
  const output = dedupePresetDefinitions([
    topicBook('cal_book_new-1', '新新世代', '第一回'),
    topicBook('cal_book_new-2', '新新世代', '第二回'),
    topicBook('cal_book_life-1', '人生哲理', '第一回'),
  ]);

  assert.equal(output.length, 2);
  const newGeneration = output.find(item => item.f.topic === '新新世代');
  const life = output.find(item => item.f.topic === '人生哲理');
  assert.ok(newGeneration);
  assert.deepEqual(
    (newGeneration.f.groupedWorkEntries as Array<{ f: Record<string, unknown> }>).map(child => child.f.round),
    ['第一回', '第二回'],
  );
  assert.equal(life?.f.groupedWorkEntries, undefined);
  assert.equal(life?.f.round, '第一回');
});

test('groups 大考英聽A攻略 Calendar tests into one parent with separate Test children', () => {
  const output = dedupePresetDefinitions([
    { ...definition('cal_listening_a_2_event-1', '英文｜大考英聽A攻略 Test 2', { title: '大考英聽A攻略', round: '2', calendarRoute: 'today', calendarEventKey: 'event-1' }), type: 'extra' },
    { ...definition('cal_listening_a_4_event-2', '英文｜大考英聽A攻略 Test 4', { title: '大考英聽A攻略', round: '4', calendarRoute: 'today', calendarEventKey: 'event-2' }), type: 'extra' },
  ]);

  assert.equal(output.length, 1);
  assert.equal(output[0].title, '英文｜大考英聽A攻略');
  const children = output[0].f.groupedWorkEntries as Array<{ f: Record<string, unknown> }>;
  assert.deepEqual(children.map(child => child.f.round), ['2', '4']);
});

test('groups normal and makeup Calendar rounds while preserving each child metric role', () => {
  const normal = { ...definition('cal_gujin_14_event-1', '國文｜古今悅讀一百 第 14 回', {
    kind: 'reading', round: '14', calendarRoute: 'today', calendarMakeup: false, calendarEventKey: 'event-1',
  }), type: 'chineseReading' };
  const makeup = { ...definition('cal_gujin_11_event-2', '國文｜古今悅讀一百 第 11 回', {
    kind: 'reading', round: '11', calendarRoute: 'today', calendarMakeup: true, calendarEventKey: 'event-2',
  }), type: 'chineseReading', required: false };

  const output = dedupePresetDefinitions([normal, makeup]);
  assert.equal(output.length, 1);
  assert.equal(output[0].title, '國文｜古今悅讀一百');
  assert.equal(output[0].required, true);
  assert.equal(output[0].f.calendarIncludesMakeup, true);
  const children = output[0].f.groupedWorkEntries as Array<{ required: boolean; f: Record<string, unknown> }>;
  assert.deepEqual(children.map(child => [child.f.round, child.required, child.f.calendarMakeup]), [
    ['14', true, false], ['11', false, true],
  ]);
});
