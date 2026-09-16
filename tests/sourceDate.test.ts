import assert from 'node:assert/strict';
import test from 'node:test';

import { groupedSourceDateText, hasDeferredStudySource, shouldShowSourceDate } from '../src/study/sourceDate.ts';
import type { StudyItem } from '../src/types.ts';

function item(overrides: Partial<StudyItem> = {}): StudyItem {
  return {
    id: 'item',
    type: 'mathStudy',
    done: false,
    minutes: '',
    required: true,
    source: 'preset',
    f: {},
    ...overrides,
  };
}

test('延期子卡片顯示所有實際來源日期', () => {
  const deferred = item({
    deferredCarry: true,
    deferredOriginDates: ['2026-08-29', '2026-08-27', '2026-08-26', '2026-08-28'],
  });
  assert.equal(hasDeferredStudySource(deferred), true);
  assert.equal(groupedSourceDateText(deferred, '2026-08-29'), '8/26-8/29');
});

test('來源日期中斷時只合併各自連續的區段', () => {
  const deferred = item({
    deferredCarry: true,
    deferredOriginDates: ['2026-08-26', '2026-08-28', '2026-08-29'],
  });
  assert.equal(groupedSourceDateText(deferred, '2026-08-29'), '8/26、8/28-8/29');
});

test('Calendar 補做子卡片使用 Calendar 來源日期', () => {
  const calendarMakeup = item({ f: { calendarMakeup: true, calendarSourceDate: '2026-08-25' } });
  assert.equal(hasDeferredStudySource(calendarMakeup), true);
  assert.equal(groupedSourceDateText(calendarMakeup, '2026-08-29'), '8/25');
});

test('合併子卡片會從隱藏的延期來源取得日期', () => {
  const aggregate = item({
    f: {
      dailyWorkSourceItems: [item({ deferredCarry: true, deferredOriginDate: '2026-08-27' })],
    },
  });
  assert.equal(hasDeferredStudySource(aggregate), true);
  assert.equal(groupedSourceDateText(aggregate, '2026-08-29'), '8/27');
});

test('當日原訂 Calendar 項目不顯示來源日期', () => {
  const sameDay = item({ f: { calendarSourceDate: '8/31', calendarMakeup: false } });
  assert.equal(shouldShowSourceDate(sameDay, '2026-08-31'), false);
});

test('非當日來源或延期補做才顯示來源日期', () => {
  const otherDay = item({ f: { calendarSourceDate: '2026-08-30', calendarMakeup: false } });
  const deferredSameDay = item({ deferred: true, f: { calendarSourceDate: '2026-08-31' } });
  assert.equal(shouldShowSourceDate(otherDay, '2026-08-31'), true);
  assert.equal(shouldShowSourceDate(deferredSameDay, '2026-08-31'), true);
});
