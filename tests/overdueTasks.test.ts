import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileCalendarNaturalPriorCoverage } from '../src/study/calendarNaturalCompletion.ts';
import { groupDailyWorkItems, ungroupDailyWorkItems } from '../src/study/dailyWorkGroup.ts';
import {
  normalizedOverdueSubject,
  OVERDUE_UNDO_WINDOW_MS,
  overdueHandledTasks,
  overdueSubjectIndex,
  overdueTaskTimer,
  overdueTasks,
  undoOverdueTaskAction,
  updateOverdueTaskCompletion,
  updateOverdueTaskMinutes,
  updateOverdueTaskPageRange,
  updateOverdueTaskProgress,
  updateOverdueTaskRange,
  updateOverdueTaskSkip,
  updateOverdueTaskTimer,
} from '../src/study/overdueTasks.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(overrides: Partial<StudyItem> = {}): StudyItem {
  return {
    id: 'scheduled-item',
    type: 'general',
    title: '排程項目',
    done: false,
    minutes: '',
    required: true,
    source: 'preset',
    f: {},
    ...overrides,
  };
}

function record(date: string, items: StudyItem[]): StudyRecord {
  return { date, items };
}

test('待辦只列出今天以前尚未完成、未延期且未跳過的正式排程', () => {
  const results = overdueTasks([
    record('2026-10-04', [
      item({ id: 'english', title: '英文閱讀', type: 'extra', f: { title: 'ACE Reading', subject: '英文' } }),
      item({ id: 'done', title: '已完成', done: true }),
      item({ id: 'deferred', title: '已延期', deferred: true, deferredTargetDay: 5 }),
      item({ id: 'deferred-carry', title: '延期補做', deferredCarry: true }),
      item({ id: 'skipped', title: '已跳過', f: { overdueSkippedOn: '2026-10-06' } }),
      item({ id: 'english-review', presetKey: 'weekday_english_review', title: '英文訂正與搭配詞整理' }),
      item({ id: 'legacy-english-review', title: '英文訂正與搭配詞整理' }),
      item({ id: 'math-practice', type: 'mathPractice', title: '數學講義題目：理解檢查＋錯題標記＋訂正' }),
      ...['weekday_math_practice', 'fri_math_practice', 'sat_math_practice', 'sun_math_practice'].map(presetKey => (
        item({ id: presetKey, presetKey })
      )),
      item({ id: 'legacy-math-practice', title: '數學講義題目：理解檢查＋錯題標記＋訂正' }),
      item({ id: 'calendar-math-practice', f: { calendarFixedTemplate: 'mathPractice' } }),
      item({ id: 'template-math-practice', templatePresetKey: 'sat_math_practice' }),
      item({ id: 'custom', title: '自行新增', source: 'custom' }),
    ]),
    record('2026-10-07', [item({ id: 'today', title: '今日項目' })]),
    record('2026-10-08', [item({ id: 'future', title: '未來項目' })]),
  ], '2026-10-07');

  assert.deepEqual(results.map(result => result.itemId), ['english']);
  assert.equal(results[0].subject, 'english');
  assert.equal(results[0].subjectLabel, '英文');
  assert.equal(results[0].daysOverdue, 3);
});

test('待辦帶出原紀錄卡的學習時間與已填欄位', () => {
  const results = overdueTasks([record('2026-10-04', [item({
    id: 'science',
    title: '化學複習',
    type: 'scienceReview',
    minutes: '18.5',
    f: {
      subject: '化學',
      material: '新關鍵',
      start: '40',
      end: '52',
      calendarTopic: '物質的構造',
      progress: true,
      corrected: false,
    },
  })])], '2026-10-07');

  assert.equal(results[0].minutes, '18.5');
  assert.deepEqual(results[0].details, [
    { label: '項目類型', value: '自然複習' },
    { label: '科目', value: '化學' },
    { label: '講義', value: '新關鍵' },
    { label: '起始頁', value: '40', editableRange: 'start' },
    { label: '結束頁', value: '52', editableRange: 'end' },
    { label: 'Google Calendar 當日主題', value: '物質的構造' },
  ]);
  assert.deepEqual(results[0].progress, [
    { key: 'progress', label: '進度', checked: true },
    { key: 'graded', label: '批改', checked: false },
    { key: 'corrected', label: '訂正', checked: false },
  ]);
});

test('原卡模板的進度批改訂正即使尚未儲存也全部顯示且不修改原紀錄', () => {
  const templates: Array<Partial<StudyItem>> = [
    { type: 'scienceReview', f: { subject: '物理', material: '新關鍵' } },
    { type: 'mathLecture', f: { material: '教學講義' } },
    { type: 'chineseReading', f: { kind: 'reading' } },
    ...['ACE Reading', '英文：ACE Reading', '英文寫作測驗', '英文文法總複習講義',
      'Prism Reading', 'Prism Reading 3', '主題百匯：克漏字',
      '主題百匯：篇章結構·閱讀測驗', 'Unlock 3 (Listening, speaking, critical thinking)',
      'Azar英文文法（中階）',
    ].map(title => ({ type: 'extra' as const, f: { title } })),
  ];
  for (const template of templates) {
    const original = record('2026-10-15', [item(template)]);
    const snapshot = structuredClone(original);
    const [entry] = overdueTasks([original], '2026-10-18');
    assert.deepEqual(entry.progress, [
      { key: 'progress', label: '進度', checked: false },
      { key: 'graded', label: '批改', checked: false },
      { key: 'corrected', label: '訂正', checked: false },
    ], JSON.stringify(template));
    assert.deepEqual(original, snapshot);
  }
});

test('不替沒有進度勾選欄的模板新增三個勾選，且互動題不顯示待辦', () => {
  const withoutChecks: Array<Partial<StudyItem>> = [
    { type: 'mathStudy', f: { material: '教學講義' } },
    { type: 'mathLecture', f: {} },
    { type: 'chineseReading', f: { kind: 'writing' } },
    { type: 'chineseReading', f: { kind: 'book' } },
    { type: 'extra', f: { title: 'Essential Grammar in Use' } },
    { type: 'extra', f: { title: 'Traumaland', progress: 'Topic 1' } },
    { type: 'extra', presetKey: 'cal_azar_example', f: { title: 'Azar英文文法（中階）' } },
    { type: 'scienceReview', presetKey: 'cal_natural_example', f: { calendarNaturalIntegration: true } },
  ];
  for (const template of withoutChecks) {
    const [entry] = overdueTasks([record('2026-10-15', [item(template)])], '2026-10-18');
    assert.deepEqual(entry.progress, [], JSON.stringify(template));
  }
  for (const template of [
    { type: 'englishPractice' as const },
    { type: 'interactive' as const, f: { interactiveType: 'englishPractice' } },
  ]) {
    assert.deepEqual(overdueTasks([record('2026-10-15', [item(template)])], '2026-10-18'), []);
  }
});

test('自然待辦進度標記為手動選擇，批改訂正與其他資料分開保存', () => {
  const original = record('2026-10-15', [item({
    type: 'scienceReview', minutes: '25',
    f: { subject: '化學', material: '新關鍵', calendarAutoCompletedProgress: true },
  }), item({ id: 'untouched' })]);
  let updated = updateOverdueTaskProgress(original, 'scheduled-item', 'progress', true);
  assert.ok(updated);
  reconcileCalendarNaturalPriorCoverage(updated.items[0], false);
  assert.equal(updated.items[0].f.progress, true);
  assert.equal(updated.items[0].f.calendarProgressSetByUser, true);
  updated = updateOverdueTaskProgress(updated, 'scheduled-item', 'graded', true);
  assert.ok(updated);
  updated = updateOverdueTaskProgress(updated, 'scheduled-item', 'corrected', true);
  assert.ok(updated);
  assert.equal(updated.items[0].done, false);
  assert.equal(updated.items[0].checkedOn, undefined);
  assert.equal(updated.items[0].minutes, '25');
  assert.deepEqual(updated.items[1], original.items[1]);
  assert.equal(original.items[0].f.progress, undefined);
  assert.deepEqual(overdueTasks([JSON.parse(JSON.stringify(updated))], '2026-10-18')[0].progress.map(field => field.checked), [true, true, true]);

  updated = updateOverdueTaskProgress(updated, 'scheduled-item', 'progress', false);
  assert.ok(updated);
  reconcileCalendarNaturalPriorCoverage(updated.items[0], true);
  assert.equal(updated.items[0].f.progress, false);
  assert.equal(updated.items[0].f.calendarProgressUserValue, false);
  assert.equal(updated.items[0].f.graded, true);
  assert.equal(updated.items[0].f.corrected, true);
});

test('文字型進度保留原內容，不會被誤改成核取方塊', () => {
  const results = overdueTasks([record('2026-10-04', [item({
    id: 'text-progress',
    f: { progress: '完成第一章' },
  })])], '2026-10-07');
  assert.deepEqual(results[0].progress, []);
  assert.deepEqual(results[0].details.at(-1), { label: '進度', value: '完成第一章' });
  assert.equal(updateOverdueTaskProgress(record('2026-10-04', [item({ f: { progress: '完成第一章' } })]), 'scheduled-item', 'progress', true), null);
});

test('待辦數學會讀取 Calendar 建議範圍且所有頁碼範圍可修改', () => {
  const original = record('2026-10-04', [item({
    id: 'math-range',
    type: 'mathStudy',
    title: '數學講義',
    f: { calendarSuggestedStart: 31, calendarSuggestedEnd: 57 },
  })]);
  const [entry] = overdueTasks([original], '2026-10-07');
  assert.deepEqual(entry.details.filter(detail => detail.editableRange), [
    { label: '起始頁', value: '31', editableRange: 'start' },
    { label: '結束頁', value: '57', editableRange: 'end' },
  ]);

  const startUpdated = updateOverdueTaskRange(original, 'math-range', 'start', '33');
  assert.ok(startUpdated);
  const endUpdated = updateOverdueTaskRange(startUpdated, 'math-range', 'end', '60');
  assert.ok(endUpdated);
  assert.equal(endUpdated.items[0].f.start, '33');
  assert.equal(endUpdated.items[0].f.end, '60');
  assert.deepEqual(endUpdated.items[0].f.dailyWorkUserFields, { start: '33', end: '60' });
  assert.equal(updateOverdueTaskRange(original, 'math-range', 'start', '0'), null);
  assert.equal(updateOverdueTaskRange(original, 'math-range', 'end', '1.5'), null);
  assert.equal(updateOverdueTaskRange(original, 'math-range', 'start', '58'), null);
  assert.equal(updateOverdueTaskRange(original, 'math-range', 'end', '30'), null);

  const samePage = updateOverdueTaskPageRange(original, 'math-range', '31', '31');
  assert.ok(samePage);
  assert.equal(samePage.items[0].f.end, '31');

  const editedInEitherOrder = updateOverdueTaskPageRange(original, 'math-range', '60', '70');
  assert.ok(editedInEitherOrder);
  assert.equal(editedInEitherOrder.items[0].f.start, '60');
  assert.equal(editedInEitherOrder.items[0].f.end, '70');
  assert.equal(updateOverdueTaskPageRange(original, 'math-range', '70', '60'), null);
});

test('合併卡片中的真實排程子項目各自出現在待辦且依科目分類', () => {
  const grouped = item({
    id: 'merged-card',
    required: false,
    source: 'summary',
    f: {
      dailyWorkSourceItems: [
        item({ id: 'math-child', title: '數學講義', type: 'mathStudy', f: { subject: '數學A' } }),
        item({ id: 'science-child', title: '物理複習', type: 'scienceReview', f: { subject: '物理' } }),
        item({ id: 'math-practice-child', type: 'mathPractice', title: '數學講義題目：理解檢查＋錯題標記＋訂正' }),
      ],
    },
  });

  const results = overdueTasks([record('2026-10-05', [grouped])], '2026-10-07');
  assert.deepEqual(
    results.map(result => [result.itemId, result.subject]).sort(),
    [['math-child', 'math'], ['science-child', 'natural']],
  );
});

test('跳過與復原會更新巢狀項目但不改動完成狀態或原紀錄', () => {
  const original = record('2026-10-05', [item({
    id: 'parent',
    source: 'summary',
    required: false,
    f: { groupedWorkEntries: [item({ id: 'child', title: '子項目' })] },
  })]);

  const skipped = updateOverdueTaskSkip(original, 'child', '2026-10-07');
  assert.ok(skipped);
  const skippedChild = skipped.items[0].f.groupedWorkEntries?.[0];
  assert.equal(skippedChild?.f.overdueSkippedOn, '2026-10-07');
  assert.equal(skippedChild?.done, false);
  assert.equal(original.items[0].f.groupedWorkEntries?.[0].f.overdueSkippedOn, undefined);

  const restored = updateOverdueTaskSkip(skipped, 'child', null);
  assert.ok(restored);
  assert.equal(restored.items[0].f.groupedWorkEntries?.[0].f.overdueSkippedOn, undefined);
  assert.equal(restored.items[0].f.groupedWorkEntries?.[0].done, false);
  assert.equal(updateOverdueTaskSkip(original, 'missing', '2026-10-07'), null);
});

test('待辦可直接保存分鐘並以實際完成日期更新原卡片', () => {
  const original = record('2026-10-05', [item({
    id: 'parent',
    source: 'summary',
    required: false,
    f: {
      groupedWorkEntries: [
        item({ id: 'finished-child', title: '已完成子項目', done: true }),
        item({ id: 'pending-child', title: '待辦子項目' }),
      ],
    },
  })]);

  const timed = updateOverdueTaskMinutes(original, 'pending-child', '25.5');
  assert.ok(timed);
  assert.equal(timed.items[0].f.groupedWorkEntries?.[1].minutes, '25.5');
  assert.equal(original.items[0].f.groupedWorkEntries?.[1].minutes, '');
  assert.equal(updateOverdueTaskMinutes(original, 'pending-child', '-1'), null);

  const completed = updateOverdueTaskCompletion(timed, 'pending-child', true, '2026-10-08');
  assert.ok(completed);
  assert.equal(completed.items[0].f.groupedWorkEntries?.[1].done, true);
  assert.equal(completed.items[0].f.groupedWorkEntries?.[1].checkedOn, '2026-10-08');
  assert.equal(completed.items[0].done, true);

  const restored = updateOverdueTaskCompletion(completed, 'pending-child', false, '2026-10-08');
  assert.ok(restored);
  assert.equal(restored.items[0].f.groupedWorkEntries?.[1].done, false);
  assert.equal(restored.items[0].f.groupedWorkEntries?.[1].checkedOn, undefined);
  assert.equal(restored.items[0].done, false);
  assert.equal(updateOverdueTaskCompletion(original, 'pending-child', true, 'not-a-date'), null);
});

test('待辦完成與復原同步合併原卡的可見子項目，不影響其他範圍', () => {
  const source = item({ id: 'source', minutes: '25', f: { progress: false } });
  const sibling = item({ id: 'sibling' });
  const original = record('2026-10-15', [item({
    id: 'parent',
    f: {
      dailyWorkSourceItems: [source, sibling],
      groupedWorkEntries: [source, sibling].map(entry => item({
        id: `visible-${entry.id}`,
        f: { dailyWorkSourceItems: [structuredClone(entry)] },
      })),
    },
  })]);

  const completed = updateOverdueTaskCompletion(original, 'source', true, '2026-10-17');
  assert.ok(completed);
  const visible = completed.items[0].f.groupedWorkEntries!;
  assert.equal(visible[0].done, true);
  assert.equal(visible[0].checkedOn, '2026-10-17');
  assert.equal(visible[1].done, false);
  assert.equal(completed.items[0].done, false);
  assert.equal(completed.items[0].f.dailyWorkSourceItems![0].minutes, '25');
  assert.equal(completed.items[0].f.dailyWorkSourceItems![0].f.progress, false);
  assert.equal(original.items[0].f.dailyWorkSourceItems![0].done, false);

  const reloaded = JSON.parse(JSON.stringify(completed)) as StudyRecord;
  const allCompleted = updateOverdueTaskCompletion(reloaded, 'sibling', true, '2026-10-18');
  assert.ok(allCompleted);
  assert.equal(allCompleted.items[0].done, true);
  assert.equal(allCompleted.items[0].checkedOn, '2026-10-18');
  const restored = undoOverdueTaskAction(allCompleted, 'source', '2026-10-18');
  assert.ok(restored);
  assert.equal(restored.items[0].f.groupedWorkEntries![0].done, false);
  assert.equal(restored.items[0].f.groupedWorkEntries![0].checkedOn, undefined);
  assert.equal(restored.items[0].f.groupedWorkEntries![1].done, true);
  assert.equal(restored.items[0].f.groupedWorkEntries![1].checkedOn, '2026-10-18');
  assert.equal(restored.items[0].done, false);
});

test('待辦自然完成是手動選擇，不會在原卡範圍重新檢查後取消', () => {
  const original = record('2026-10-15', [item({
    type: 'scienceReview', f: { calendarAutoCompletedDone: true, progress: false },
  })]);
  const completed = updateOverdueTaskCompletion(original, 'scheduled-item', true, '2026-10-17');
  assert.ok(completed);
  reconcileCalendarNaturalPriorCoverage(completed.items[0], false);
  assert.equal(completed.items[0].done, true);
  assert.equal(completed.items[0].checkedOn, '2026-10-17');
  assert.equal(completed.items[0].f.calendarCompletionUserValue, true);
  assert.equal(completed.items[0].f.progress, false);

  const restored = undoOverdueTaskAction(completed, 'scheduled-item', '2026-10-17');
  assert.ok(restored);
  reconcileCalendarNaturalPriorCoverage(restored.items[0], true);
  assert.equal(restored.items[0].done, false);
  assert.equal(restored.items[0].f.calendarCompletionUserValue, false);
});

test('待辦完成後重新建立原卡不會複製最近處理紀錄', () => {
  const original = record('2026-10-15', [10, 20].map(start => item({
    id: `source-${start}`, type: 'scienceReview', title: '物理',
    f: { subject: '物理', material: '新關鍵', start: String(start), end: String(start + 2) },
  })));
  const now = '2026-10-17T04:00:00.000Z';
  const completed = updateOverdueTaskCompletion(original, 'source-10', true, '2026-10-17', now);
  assert.ok(completed);
  for (let reload = 0; reload < 3; reload++) {
    completed.items = groupDailyWorkItems(ungroupDailyWorkItems(completed.items));
    completed.items = JSON.parse(JSON.stringify(completed.items));
    assert.deepEqual(overdueHandledTasks([completed], Date.parse(now)).map(entry => entry.itemId), ['source-10']);
  }
});

test('待辦完成整張整合卡會勾選各子卡並保留獨立進度', () => {
  for (const childField of ['interactiveEntries', 'calendarIntegrationEntries'] as const) {
    const original = record('2026-10-15', [item({
      f: { [childField]: [item({ id: 'nested', f: { corrected: false } })] },
    })]);
    const completed = updateOverdueTaskCompletion(original, 'scheduled-item', true, '2026-10-17');
    assert.ok(completed);
    assert.equal(completed.items[0].done, true);
    const child = completed.items[0].f[childField]![0] as StudyItem;
    assert.equal(child.done, true);
    assert.equal(child.checkedOn, '2026-10-17');
    assert.equal(child.f.corrected, false);
    const restored = undoOverdueTaskAction(completed, 'scheduled-item', '2026-10-17');
    assert.ok(restored);
    assert.equal(restored.items[0].f[childField]![0].done, false);
    assert.equal((restored.items[0].f[childField]![0] as StudyItem).checkedOn, undefined);
  }
});

test('待辦可更新原卡進度與保存可繼續的計時狀態', () => {
  const original = record('2026-10-05', [item({
    id: 'editable',
    minutes: '2.5',
    f: { progress: false, corrected: false },
  })]);
  const progressed = updateOverdueTaskProgress(original, 'editable', 'progress', true);
  assert.ok(progressed);
  assert.equal(progressed.items[0].f.progress, true);
  assert.equal(original.items[0].f.progress, false);
  assert.equal(updateOverdueTaskProgress(original, 'editable', 'unknown', true), null);

  const timer = { mode: 'timer' as const, accumulatedSeconds: 150, startedAt: 123_000 };
  const timed = updateOverdueTaskTimer(progressed, 'editable', timer, '3.0');
  assert.ok(timed);
  assert.deepEqual(overdueTaskTimer(timed, 'editable'), timer);
  assert.equal(timed.items[0].minutes, '3.0');
});

test('合併卡片的待辦計時會更新真實來源且重載後仍可繼續', () => {
  const source = item({
    id: 'merged-timer-source',
    type: 'extra',
    title: '合併來源計時',
    f: { title: 'ACE Reading', subject: '英文' },
  });
  const duplicatedSource = JSON.parse(JSON.stringify(source)) as StudyItem;
  const original = record('2026-10-05', [item({
    id: 'merged-parent',
    source: 'summary',
    required: false,
    f: {
      dailyWorkSourceItems: [source],
      groupedWorkEntries: [item({
        id: 'merged-child',
        source: 'groupedWork',
        f: { dailyWorkSourceItems: [duplicatedSource] },
      })],
    },
  })]);

  const running = { mode: 'timer' as const, accumulatedSeconds: 12, startedAt: 456_000 };
  const timed = updateOverdueTaskTimer(original, source.id, running);
  assert.ok(timed);
  assert.deepEqual(overdueTaskTimer(timed, source.id), running);
  assert.deepEqual(overdueTasks([timed], '2026-10-07')[0].timer, running);

  const reloaded = JSON.parse(JSON.stringify(timed)) as StudyRecord;
  assert.deepEqual(overdueTaskTimer(reloaded, source.id), running);
  assert.deepEqual(overdueTasks([reloaded], '2026-10-07')[0].timer, running);
  assert.deepEqual(
    reloaded.items[0].f.groupedWorkEntries?.[0].f.dailyWorkSourceItems?.[0].f.timeTracking,
    running,
  );
  const skipped = updateOverdueTaskSkip(reloaded, source.id, '2026-10-07');
  assert.ok(skipped);
  const reloadedSkip = JSON.parse(JSON.stringify(skipped)) as StudyRecord;
  assert.equal(overdueHandledTasks([reloadedSkip]).length, 1);
  const restored = updateOverdueTaskSkip(reloadedSkip, source.id, null);
  assert.ok(restored);
  assert.equal(overdueHandledTasks([JSON.parse(JSON.stringify(restored))]).length, 0);
});

test('完成與跳過移入獨立復原清單，滿 72 小時後自動消失', () => {
  const handledAt = '2026-10-07T01:00:00.000Z';
  const base = record('2026-10-05', [
    item({ id: 'completed', title: '完成項目' }),
    item({ id: 'skipped', title: '跳過項目' }),
  ]);
  const completed = updateOverdueTaskCompletion(base, 'completed', true, '2026-10-07', handledAt);
  assert.ok(completed);
  const handled = updateOverdueTaskSkip(completed, 'skipped', '2026-10-07', handledAt);
  assert.ok(handled);

  const actionTime = Date.parse(handledAt);
  assert.deepEqual(
    overdueHandledTasks([handled], actionTime + OVERDUE_UNDO_WINDOW_MS - 1)
      .map(entry => [entry.itemId, entry.kind]),
    [['completed', 'complete'], ['skipped', 'skip']],
  );
  assert.deepEqual(overdueHandledTasks([handled], actionTime + OVERDUE_UNDO_WINDOW_MS), []);

  const restored = undoOverdueTaskAction(handled, 'completed', '2026-10-08');
  assert.ok(restored);
  assert.equal(restored.items[0].done, false);
  assert.equal(restored.items[0].f.overdueTodoAction, undefined);
  assert.equal(overdueTasks([restored], '2026-10-08').some(entry => entry.itemId === 'completed'), true);
});

test('待辦科目滑塊將無效網址值還原為全部', () => {
  assert.equal(normalizedOverdueSubject('natural'), 'natural');
  assert.equal(normalizedOverdueSubject('invalid'), 'all');
  assert.equal(overdueSubjectIndex('all'), 0);
  assert.equal(overdueSubjectIndex('other'), 5);
});
