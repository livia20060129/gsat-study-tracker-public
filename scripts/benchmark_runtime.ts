import { materialProgressRows } from '../src/study/materialProgress.ts';
import { overdueTasks } from '../src/study/overdueTasks.ts';
import { organizedOverdueEntries } from '../src/study/overdueOrganization.ts';
import type { StudyRecord } from '../src/types.ts';

/** Fixed in-memory history; no browser storage, accounts or network requests are accessed. */
function benchmarkRecords(): StudyRecord[] {
  return Array.from({ length: 156 }, (_, offset) => ({
    date: new Date(Date.UTC(2026, 10, 4 - offset)).toISOString().slice(0, 10),
    items: Array.from({ length: 12 }, (_, number) => ({
      id: `source-${number}`, type: 'scienceReview', title: `物理｜新關鍵 第 ${number + 1} 單元`,
      source: 'preset', required: true, done: number % 3 === 0, minutes: '25',
      f: { subject: '物理', material: '新關鍵', start: String((offset + number) % 250 + 1), end: String((offset + number) % 250 + 8) },
    })),
  }));
}

function measure(name: string, operation: () => unknown): void {
  operation();
  const times = Array.from({ length: 9 }, function measureSample(): number {
    const start = performance.now();
    for (let index = 0; index < 10; index += 1) operation();
    return (performance.now() - start) / 10;
  }).sort((left, right) => left - right);
  console.log(JSON.stringify({ name, medianMs: +times[4].toFixed(3), minMs: +times[0].toFixed(3) }));
}

const records = benchmarkRecords();
const entries = overdueTasks(records, '2026-11-05');
console.log('Fixture: 156 days, 12 study items per day; 9 samples of 10 operations after warm-up.');
measure('overdue generation', () => overdueTasks(records, '2026-11-05'));
measure('overdue sorting', () => organizedOverdueEntries(entries, 'oldest'));
measure('material page coverage', () => materialProgressRows(records));
