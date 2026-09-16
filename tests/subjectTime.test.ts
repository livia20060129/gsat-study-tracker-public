import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SUBJECT_TIME_SHORT_LABELS,
  subjectTimeArcPath,
  subjectTimeConicGradient,
  subjectTimeDonutSlices,
  summarizeSubjectTime,
} from '../src/study/subjectTime.ts';

test('summarizes minute inputs by subject with one-decimal shares', () => {
  const summary = summarizeSubjectTime([
    { subject: '英文', minutes: '15.5' },
    { subject: '數學', minutes: 30 },
    { subject: '英文', minutes: 4.5 },
    { subject: '自然', minutes: 10 },
  ]);

  assert.equal(summary.totalMinutes, 60);
  assert.deepEqual(
    summary.slices.map(slice => [slice.subject, slice.minutes, slice.percent]),
    [
      ['數學', 30, 50],
      ['英文', 20, 33.3],
      ['自然', 10, 16.7],
    ],
  );
});

test('ignores empty, negative and invalid times and groups unknown subjects as other', () => {
  const summary = summarizeSubjectTime([
    { subject: '數學', minutes: '' },
    { subject: '英文', minutes: -5 },
    { subject: '自然', minutes: 'not-a-number' },
    { subject: '自訂', minutes: 12.5 },
  ]);

  assert.equal(summary.totalMinutes, 12.5);
  assert.deepEqual(summary.slices.map(slice => slice.subject), ['其他']);
  assert.equal(summary.slices[0].percent, 100);
});

test('builds a complete conic gradient and keeps a readable zero state', () => {
  const summary = summarizeSubjectTime([
    { subject: '國文', minutes: 20 },
    { subject: '自然', minutes: 20 },
  ]);
  const gradient = subjectTimeConicGradient(summary);
  assert.match(gradient, /^conic-gradient\(/);
  assert.match(gradient, /0\.000% 50\.000%/);
  assert.match(gradient, /50\.000% 100\.000%/);
  assert.equal(subjectTimeConicGradient(summarizeSubjectTime([])), 'none');
});

test('positions each subject label in the middle of its donut color arc', () => {
  const summary = summarizeSubjectTime([
    { subject: '數學', minutes: 60 },
    { subject: '英文', minutes: 30 },
    { subject: '自然', minutes: 30 },
  ]);
  const slices = subjectTimeDonutSlices(summary);
  assert.deepEqual(slices.map(slice => [slice.subject, slice.startPercent, slice.endPercent]), [
    ['數學', 0, 50],
    ['英文', 50, 75],
    ['自然', 75, 100],
  ]);
  assert.ok(slices.every(slice => Number.isFinite(slice.labelX) && Number.isFinite(slice.labelY)));
  assert.ok(slices.every(slice => Math.abs(Math.hypot(slice.labelX - 80, slice.labelY - 80) - 56) < 0.001));
  assert.ok(Math.abs(slices.reduce((sum, slice) => sum + slice.dashLength, 0) - 2 * Math.PI * 56) < 0.001);
});

test('draws each color as an explicit clockwise SVG arc matching its label geometry', () => {
  const slices = subjectTimeDonutSlices(summarizeSubjectTime([
    { subject: '數學', minutes: 30 },
    { subject: '國文', minutes: 10 },
    { subject: '英文', minutes: 60 },
  ]));

  assert.match(subjectTimeArcPath(slices[0]), /^M 80 24 A 56 56 0 0 1 /);
  assert.match(subjectTimeArcPath(slices[2]), /A 56 56 0 1 1 /);
  assert.doesNotMatch(subjectTimeArcPath(slices[0]), /dashoffset|rotate/);
});

test('a single subject uses a complete two-part circle path', () => {
  const [slice] = subjectTimeDonutSlices(summarizeSubjectTime([
    { subject: '自然', minutes: 45 },
  ]));
  assert.equal((subjectTimeArcPath(slice).match(/ A /g) || []).length, 2);
});

test('uses one clear character for every subject label on the ring', () => {
  assert.deepEqual(SUBJECT_TIME_SHORT_LABELS, {
    數學: '數', 國文: '國', 英文: '英', 物理: '物', 化學: '化', 生物: '生', 地科: '地', 自然: '自', 其他: '社',
  });
});

test('wires the donut into the today-minutes panel and renders minutes in its center', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /今日各科完成時間佔比/);
  assert.match(html, /id="subjectTimeDonut"/);
  assert.match(html, /class="subject-time-center"[^>]*><strong><span id="doneMinutes"[^>]*>0<\/span>/);
  assert.match(runtime, /renderSubjectTimeDonut\(subjectTime\)/);
  assert.match(runtime, /class="subject-time-center".*id="doneMinutes"/);
  assert.match(runtime, /class="subject-time-ring-label"/);
  assert.match(runtime, /subjectTimeArcPath\(slice\)/);
  assert.match(runtime, /data-subject-time-tooltip/);
  assert.match(runtime, /SUBJECT_TIME_SHORT_LABELS\[slice\.subject\]\+' '\+slice\.minutes\+' 分鐘｜'\+slice\.percent\+'%'/);
  assert.match(runtime, /var emptyRing='<svg class="subject-time-ring"/);
  assert.doesNotMatch(runtime, /value\.textContent=slice\.percent/);
  assert.match(runtime, /node\.addEventListener\('mouseenter'/);
  assert.match(runtime, /node\.addEventListener\('click'/);
  assert.match(runtime, /classList\.toggle\('is-muted',nodeIndex!==index\)/);
  assert.match(runtime, /classList\.remove\('is-active','is-muted'\)/);
  assert.match(styles, /subject-time-chart\{[^}]*width:min\(240px,calc\(100% - 24px\)\)/);
  assert.match(styles, /metric-minutes-panel\{[^}]*justify-content:center;[^}]*padding:8px 5px/);
  assert.match(styles, /subject-time-slice\{[^}]*stroke-width:34px;vector-effect:non-scaling-stroke/);
  assert.match(styles, /subject-time-slice\.is-muted\{opacity:\.28\}/);
  assert.match(styles, /subject-time-chart\.is-empty\{background:transparent;box-shadow:none\}/);
  assert.doesNotMatch(styles, /subject-time-chart\.is-empty \.subject-time-track\{stroke-width:/);
  assert.match(styles, /subject-time-track\{[^}]*stroke-width:34px;vector-effect:non-scaling-stroke/);
});
