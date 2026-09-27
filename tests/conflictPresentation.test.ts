import assert from 'node:assert/strict';
import test from 'node:test';

import {
  studyRecordConflictDetailsText,
  studyRecordConflictSummary,
} from '../src/storage/conflictPresentation.ts';
import type { StudyRecord, StudyRecordSyncConflict } from '../src/types.ts';

const local: StudyRecord = {
  date: '2026-09-19',
  items: [{
    id: 'azar-2-1',
    type: 'extra',
    title: '英文｜Azar英文文法（中階）',
    done: true,
    minutes: '25',
    required: true,
    f: {
      title: 'Azar英文文法（中階）',
      azarSectionCode: '2-1',
      azarSectionTitle: '過去簡單式：規則變化動詞',
      reason: '時態混淆',
    },
  }],
};

const cloud = structuredClone(local);
cloud.items[0].f.reason = '動詞變化';

const conflicts: StudyRecordSyncConflict[] = [{
  path: '$.items[id:azar-2-1].f.reason',
  kind: 'same-field',
  baseExists: true,
  localExists: true,
  cloudExists: true,
  base: '',
  local: '時態混淆',
  cloud: '動詞變化',
}];

test('conflict summary names the study item and exact field', () => {
  const summary = studyRecordConflictSummary('2026-09-19', conflicts, local, cloud);

  assert.match(summary, /Azar英文文法（中階）｜2-1過去簡單式：規則變化動詞/);
  assert.match(summary, /錯因／不熟觀念/);
  assert.match(summary, /選擇整日版本/);
});

test('conflict detail shows readable local and cloud values instead of a raw JSON path', () => {
  const details = studyRecordConflictDetailsText(conflicts, local, cloud);

  assert.doesNotMatch(details, /\$\.items/);
  assert.match(details, /本機：時態混淆/);
  assert.match(details, /雲端：動詞變化/);
});
