import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCalendarStudyTaskPlan,
  createCalendarStudyTask,
} from '../src/application/calendar/calendarStudyTaskService.ts';

const baseRow = {
  source_event_id: 'event-1',
  calendar_id: 'primary',
  event_date: '2026-09-05',
  description: '',
  category: 'other',
};

test('application service accepts a Calendar row when its subject is recognizable', () => {
  const task = createCalendarStudyTask({
    ...baseRow,
    event_key: 'primary:event-1:2026-09-05',
    title: '今日項目｜複習英文單字',
  });
  assert.equal(task?.kind, 'subjectItem');
  if (task?.kind === 'subjectItem') assert.equal(task.subject, '英文');
});

test('application service ignores a Calendar row without a recognizable subject', () => {
  const task = createCalendarStudyTask({
    ...baseRow,
    event_key: 'primary:event-unknown:2026-09-05',
    title: '今日項目｜準備明天行程',
  });
  assert.equal(task, null);
});

test('Calendar makeup is normalized to today by the application service', () => {
  const task = createCalendarStudyTask({
    ...baseRow,
    event_key: 'makeup-event',
    title: '本週項目｜補做｜英文訂正與搭配詞整理',
  });
  assert.equal(task?.makeup, true);
  assert.equal(task?.route, 'today');
  assert.equal(task?.kind, 'fixedTemplate');
});

test('application service indexes recognized items and drops unknown rows', () => {
  const plan = buildCalendarStudyTaskPlan([
    { ...baseRow, event_key: 'one', title: 'Essential Grammar in Use｜Unit 12' },
    { ...baseRow, event_key: 'two', title: '本週項目｜英文訂正與搭配詞整理' },
    { ...baseRow, event_key: 'unknown', title: '本週項目｜項目二' },
  ]);
  assert.equal(plan.tasks.length, 2);
  assert.equal(plan.byDate['2026-09-05']?.length, 2);
  assert.deepEqual(plan.tasks.map(task => task.route), ['today', 'week']);
  assert.deepEqual(plan.tasks.map(task => task.kind), ['essentialGrammar', 'fixedTemplate']);
});
