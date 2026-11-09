import { expect, test, type Page } from '@playwright/test';
import { calendarItemsByDate } from '../src/application/calendar/reconcileCalendarSchedule.ts';
import type { CalendarTaskRow } from '../src/calendar/calendarBridge.ts';
import { selectStudyDate } from './helpers/siteNavigation.ts';

test.use({ timezoneId: 'Asia/Taipei', reducedMotion: 'reduce' });
const userId = '00000000-0000-0000-0000-000000000071';
const prefix = `study-v11:user:${userId}:`;
const date = '2026-11-02';
function row(id: string, round: number, day = date): CalendarTaskRow {
  return { event_key: `primary:${id}`, source_event_id: id, calendar_id: 'primary', event_date: day,
    title: `英文｜ACE Reading 第 ${round} 回`, description: '', category: 'english' };
}
interface State { rows: CalendarTaskRow[] | object; failed: boolean; stamp: string; owner: string; requests: number;
  statusReads?: number; changeDuringRead?: boolean; syncError?: string; cloud?: Map<string, Record<string, unknown>>; jsonb?: boolean }
function jsonbPayload(value: any): any {
  if (Array.isArray(value)) return value.map(jsonbPayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort((a,b)=>a.length-b.length || (a<b?-1:a>b?1:0)).map(key=>[key,jsonbPayload(value[key])]));
}
async function seed(page: Page): Promise<State> {
  const oldRows = [row('kept', 3), row('deleted', 4), row('revised', 5)];
  const items = JSON.parse(JSON.stringify(calendarItemsByDate(oldRows).get(date)!));
  items[0].done = true; items[0].checkedOn = date; items[0].minutes = '20';
  items[2].done = true; items[2].checkedOn = date; items[2].minutes = '15';
  items[2].f.words = [{ text: 'intriguing', translation: '有趣的' }];
  const state: State = { rows: [row('kept', 3), row('revised', 6), row('new', 7)], failed: false, stamp: '2026-11-07T02:00:00Z', owner: userId, requests: 0 };
  const cloud = new Map<string, Record<string, unknown>>();
  state.cloud = cloud;
  await page.context().route('https://xcpnxkkixsxzgbqsiuud.supabase.co/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/functions/v1/google-calendar')) {
      state.statusReads = (state.statusReads || 0) + 1;
      return route.fulfill({ status: state.failed ? 503 : 200,
        json: { userId: state.owner, connected: true, last_synced_at: state.stamp, sync_error: state.syncError || null } });
    }
    if (url.pathname.endsWith('/rest/v1/calendar_tasks')) {
      state.requests++;
      if (state.changeDuringRead) { state.changeDuringRead = false; state.stamp = '2026-11-07T05:00:00Z'; }
      return route.fulfill({ json: state.rows });
    }
    if (url.pathname.endsWith('/auth/v1/user')) return route.fulfill({ json: { id: userId, aud: 'authenticated', email: 'test@example.com' } });
    if (url.pathname.endsWith('/rest/v1/rpc/upsert_study_record')) {
      const body = route.request().postDataJSON();
      const previous = cloud.get(body.p_study_date);
      if (previous && Number(previous.revision) !== Number(body.p_base_revision)) {
        return route.fulfill({ json: { applied: false, ...previous } });
      }
      const result = { study_date: body.p_study_date, payload: state.jsonb ? jsonbPayload(body.p_payload) : body.p_payload,
        revision: Number(cloud.get(body.p_study_date)?.revision || 0) + 1, updated_at: state.stamp };
      cloud.set(body.p_study_date, result);
      return route.fulfill({ json: { applied: true, ...result } });
    }
    if (url.pathname.endsWith('/rest/v1/study_records')) {
      const requested = url.searchParams.get('study_date')?.replace(/^eq\./, '');
      return route.fulfill({ json: [...cloud.values()].filter(record => !requested || record.study_date === requested) });
    }
    return route.fulfill({ json: [] });
  });
  await page.clock.setFixedTime(new Date('2026-11-07T12:00:00+08:00'));
  await page.goto('/summary.html');
  await page.evaluate(({ prefix, date, userId, items }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem('sb-xcpnxkkixsxzgbqsiuud-auth-token', JSON.stringify({
      access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.signature', refresh_token: 'test-refresh',
      expires_at: 1893456000, token_type: 'bearer', user: { id: userId, aud: 'authenticated', email: 'test@example.com' },
    }));
    localStorage.setItem(prefix + date, JSON.stringify({ date, notes: '保留筆記', items }));
  }, { prefix, date, userId, items });
  return state;
}
async function saved(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), prefix + date);
}

async function makeUnrecordedConflict(page: Page): Promise<void> {
  await page.evaluate(key => {
    const local = JSON.parse(localStorage.getItem(key)!);
    local.notes = '';
    for (const item of local.items) {
      item.done = false; item.minutes = ''; delete item.checkedOn; delete item.f.words;
    }
    local.serverRevision = 2;
    local.localDirty = true;
    local.syncConflict = true;
    local.syncConflictLocal = structuredClone(local);
    local.syncConflictCloud = structuredClone(local);
    local.syncConflictDetails = [{ path: '$.items', kind: 'unknown-base', baseExists: false, localExists: true, cloudExists: true }];
    localStorage.setItem(key, JSON.stringify(local));
  }, prefix + date);
}

test('33 confirmed historical dates stay confirmed after Calendar loading, reload and standalone navigation', async ({ page }) => {
  const state = await seed(page);
  state.jsonb=true;
  const rows = Array.from({ length: 33 }, (_, index) => row(`confirmed-${index}`, index + 1,
    new Date(Date.UTC(2026, 9, index + 1)).toISOString().slice(0, 10)));
  state.rows = rows;
  const records = [...calendarItemsByDate(rows)].map(([date, items]) => ({
    schemaVersion: 2, date, notes: '保留已同步筆記', mood: '', wakeTime: '', biggestBlock: '', firstThingTomorrow: '', items,
  }));
  state.cloud!.clear();
  for (const record of records) state.cloud!.set(record.date, {
    study_date: record.date, payload: record, revision: 2, updated_at: state.stamp,
  });
  await page.evaluate(({ prefix, records, stamp }) => {
    for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key);
    for (const record of records) localStorage.setItem(prefix + record.date, JSON.stringify({
      ...record, serverRevision: 2, serverUpdatedAt: stamp, localDirty: false, syncConflict: false, syncBase: record,
    }));
  }, { prefix, records, stamp: state.stamp });
  const waiting = () => page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)
    && /^\d{4}-\d{2}-\d{2}$/.test(key.slice(prefix.length))).map(key => JSON.parse(localStorage.getItem(key)!))
    .filter(record => record.localDirty || record.syncConflict).map(record => ({date:record.date,conflict:record.syncConflict})), prefix);
  for (let visit = 0; visit < 3; visit++) {
    await page.goto('/');
    await expect(page.locator('#calendarStatusBadge')).toHaveText('已連接');
    await expect.poll(waiting).toEqual([]);
    await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
    for (const record of records) expect((state.cloud!.get(record.date)!.payload as any).notes).toBe('保留已同步筆記');
    await page.goto('/todo.html');
    await expect.poll(() => state.requests).toBeGreaterThan(visit * 2 + 1);
  }
});

for (const path of ['/todo.html', '/summary.html']) test(`Actions data is read on load without focus, reconnect or periodic polling on ${path}`, async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-07T12:00:00+08:00') });
  const state = await seed(page);
  await page.goto(path);
  await expect.poll(async () => (await saved(page)).items.filter((item: any) => item.f.calendarScheduleArchived).length).toBe(2);
  expect(state.requests).toBe(1);
  const statusReads = state.statusReads;
  await page.clock.runFor(11 * 60_000);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(10_000);
  expect(state.requests).toBe(1);
  expect(state.statusReads).toBe(statusReads);
  if (path === '/todo.html') await page.locator('#refreshTodo').click();
  else await page.reload();
  await expect.poll(() => state.requests).toBe(2);
  expect((await saved(page)).notes).toBe('保留筆記');
});

test('an unrecorded Actions mismatch clears an old schedule conflict on todo and remains resolved after Tracker navigation', async ({ page }, testInfo) => {
  try {
    await seed(page); await makeUnrecordedConflict(page);
    await page.goto('/todo.html');
    await expect.poll(async () => (await saved(page)).syncConflict).toBe(false);
    expect((await saved(page)).localDirty).toBe(false);
    await expect(page.locator('.todo-card')).toHaveCount(3);
    await page.goto('/'); await selectStudyDate(page, date);
    await expect.poll(async () => (await saved(page)).syncConflict).toBe(false);
    expect((await saved(page)).syncConflictDetails).toBeUndefined();
    await page.reload();
    await expect.poll(async () => (await saved(page)).syncConflict).toBe(false);
  } catch (error) {
    await testInfo.attach('calendar-conflict-record.json', { body: JSON.stringify(await saved(page), null, 2), contentType: 'application/json' });
    throw error;
  }
});

test('a verified cloud record replaces an untouched local Calendar conflict without uploading the old schedule', async ({ page }) => {
  const state = await seed(page); await makeUnrecordedConflict(page);
  state.failed = true;
  const cloud = { date, notes: '', items: calendarItemsByDate([row('cloud', 9)]).get(date)! };
  state.cloud!.set(date, { study_date: date, payload: cloud, revision: 5, updated_at: state.stamp });
  await page.goto('/'); await selectStudyDate(page, date);
  await expect.poll(async () => (await saved(page)).serverRevision).toBe(5);
  await expect.poll(async () => (await saved(page)).syncConflict).toBe(false);
  expect(JSON.stringify((await saved(page)).items)).toContain('第 9 回');
  expect((state.cloud!.get(date)!.payload as any).items[0].f.round).toBe('9');
  await page.reload();
  expect(JSON.stringify((await saved(page)).items)).toContain('第 9 回');
});

test('a generated magazine month cannot protect an obsolete schedule conflict across reload', async ({ page }) => {
  await seed(page); await makeUnrecordedConflict(page);
  await page.evaluate(({ prefix, date }) => {
    const local = JSON.parse(localStorage.getItem(prefix + date)!);
    local.items.push({ id: `preset-${date}-weekday_magazine`, presetKey: 'weekday_magazine', source: 'preset',
      type: 'magazine', done: false, minutes: '', f: { entries: [{ id: 'generated-row', name: '', month: '11',
        unit: '', minutes: '', magazineMonthInitialized: true, timeTracking: { mode: 'manual', accumulatedSeconds: 0, startedAt: null } }] } });
    localStorage.setItem(prefix + date, JSON.stringify(local));
  }, { prefix, date });
  await page.goto('/todo.html');
  await expect.poll(async () => (await saved(page)).syncConflict).toBe(false);
  expect((await saved(page)).localDirty).toBe(false);
  await expect(page.locator('.todo-card')).toHaveCount(3);
  await page.goto('/'); await selectStudyDate(page, date);
  await page.reload();
  await expect.poll(async () => (await saved(page)).syncConflict).toBe(false);
  expect((await saved(page)).syncConflictDetails).toBeUndefined();
});

test('recorded dates retain actual input through the normal merge instead of whole-day cloud replacement', async ({ page }) => {
  const state = await seed(page); await makeUnrecordedConflict(page);
  await page.evaluate(key => {
    const local = JSON.parse(localStorage.getItem(key)!);
    local.syncBase = structuredClone(local.syncConflictCloud);
    local.notes = '這天已經記錄'; local.items[0].done = true; local.items[0].minutes = '25';
    local.syncConflictLocal = structuredClone(local);
    localStorage.setItem(key, JSON.stringify(local));
  }, prefix + date);
  state.failed = true;
  state.cloud!.set(date, { study_date: date, payload: { date, notes: '雲端版本', items: calendarItemsByDate([row('cloud', 9)]).get(date)! },
    revision: 5, updated_at: state.stamp });
  await page.goto('/'); await selectStudyDate(page, date);
  await expect.poll(async () => (await saved(page)).notes).toBe('這天已經記錄');
  await expect(page.getByRole('group', { name: /今日各科完成時間佔比：英文 25 分鐘/ })).toBeVisible();
  expect(JSON.stringify(await saved(page))).toContain('"done":true');
  await page.reload();
  await selectStudyDate(page, date);
  await expect.poll(async () => (await saved(page)).notes).toBe('這天已經記錄');
  await expect(page.getByRole('group', { name: /今日各科完成時間佔比：英文 25 分鐘/ })).toBeVisible();
});

test('opening todo directly applies the latest Actions schedule, removes deleted reminders and preserves real time and words', async ({ page }) => {
  await seed(page);
  await page.goto('/todo.html');
  await expect.poll(async () => (await saved(page)).items.filter((item: any) => item.f.calendarScheduleArchived).length).toBe(2);
  await expect(page.locator('.todo-card')).toHaveCount(2);
  await expect(page.locator('.todo-card')).not.toContainText(['第 4 回', '第 5 回']);
  await page.goto('/summary.html');
  await expect(page.locator('#summaryTotalCompletion')).toHaveText('33%');
  await expect(page.locator('#summaryComparison')).toContainText('0.6 hr');
  await page.goto('/vocabulary.review.html');
  await expect(page.locator('.vocabulary-row[data-entry-key="intriguing"]')).toContainText('有趣的');
});

test('summary can update a historical completion denominator before Tracker has been opened', async ({ page }) => {
  const state = await seed(page);
  state.rows = [row('kept', 3)];
  await page.reload();
  await expect(page.locator('#summaryTotalCompletion')).toHaveText('100%');
  expect((await saved(page)).notes).toBe('保留筆記');
  await page.reload();
  await expect(page.locator('#summaryTotalCompletion')).toHaveText('100%');
  expect((await saved(page)).items.filter((item: any) => item.f.calendarScheduleArchived).length).toBe(2);
});

test('a moved old event leaves its original date and a genuine successful empty schedule retires all reminders', async ({ page }) => {
  const state = await seed(page);
  state.rows = [row('deleted', 4, '2026-11-06')];
  await page.goto('/todo.html');
  await expect.poll(async () => (await saved(page)).items.every((item: any) => item.f.calendarScheduleArchived)).toBe(true);
  await expect(page.locator('.todo-card')).toHaveCount(1);
  state.rows = []; state.stamp = '2026-11-07T03:00:00Z';
  await page.locator('#refreshTodo').click();
  await expect(page.locator('.todo-card')).toHaveCount(0);
});

test('failed, malformed and cross-account responses retain the existing records rather than treating them as deletions', async ({ page }) => {
  const state = await seed(page);
  const original = await saved(page);
  state.failed = true;
  await page.goto('/todo.html');
  await expect(page.locator('.todo-card')).toHaveCount(1);
  expect(await saved(page)).toEqual(original);
  state.failed = false; state.rows = { invalid: true };
  await page.reload();
  await expect.poll(() => state.requests).toBe(1);
  expect(await saved(page)).toEqual(original);
  state.rows = []; state.owner = 'another-account';
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  expect(await saved(page)).toEqual(original);
});

test('Tracker uses the updated schedule on the original date and a reload cannot restore a deleted checkbox', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await expect(page.locator('#calendarStatusBadge')).toHaveText('已連接');
  await selectStudyDate(page, date);
  await expect.poll(async () => (await saved(page)).items.filter((item: any) => item.f.calendarScheduleArchived).length).toBe(2);
  await page.goto('/todo.html');
  await page.getByRole('combobox', { name: '查看項目', exact: true }).selectOption({ label: '英文｜ACE Reading' });
  await expect(page.locator('.todo-card')).toHaveCount(2);
  await page.goto('/'); await selectStudyDate(page, date);
  await expect(page.locator('[data-item]')).not.toContainText(['第 4 回', '第 5 回']);
  await page.goto('/summary.html');
  await expect(page.locator('#summaryTotalCompletion')).not.toHaveText('100%');
});

test('a peer todo refresh replaces the open Tracker runtime before revised records arrive', async ({ page, context }) => {
  const state = await seed(page);
  state.rows = [row('kept', 3), row('deleted', 4), row('revised', 5)];
  await page.goto('/');
  await expect(page.locator('#calendarStatusBadge')).toHaveText('已連接');
  await selectStudyDate(page, date);
  await expect(page.locator('#calendarStatusBadge')).toHaveText('已連接');
  await expect(page.getByRole('group', { name: /今日各科完成時間佔比：英文 35 分鐘/ })).toBeVisible();
  const peer = await context.newPage();
  await peer.clock.setFixedTime(new Date('2026-11-07T12:01:00+08:00'));
  state.rows = [row('kept', 3), row('revised', 6), row('new', 7)];
  state.stamp = '2026-11-07T03:00:00Z';
  await peer.goto('/todo.html');
  await expect.poll(async () => (await saved(peer)).items.filter((item: any) => item.f.calendarScheduleArchived).length).toBe(2);
  await selectStudyDate(page, '2026-11-03'); await selectStudyDate(page, date);
  const rounds = await page.evaluate(key => {
    function collect(items: any[]): string[] {
      return items.flatMap(item => {
        if (item.f?.calendarScheduleArchived) return [];
        const children = item.f?.dailyWorkSourceItems || item.f?.groupedWorkEntries;
        if (children?.length) return collect(children);
        return item.f?.title === 'ACE Reading' ? [String(item.f.round)] : [];
      });
    }
    return collect(JSON.parse(localStorage.getItem(key)!).items).sort();
  }, prefix + date);
  expect(rounds).toEqual(['3', '6', '7']);
  await expect(page.getByRole('group', { name: /今日各科完成時間佔比：英文 35 分鐘/ })).toBeVisible();
});

test('an Actions update during download or an in-progress status never applies a partial schedule', async ({ page }) => {
  const state = await seed(page), original = await saved(page);
  state.changeDuringRead = true; state.statusReads = 0;
  await page.goto('/todo.html');
  await expect.poll(() => state.statusReads).toBe(2);
  expect(await saved(page)).toEqual(original);
  state.syncError = 'Calendar sync in progress';
  await page.reload();
  await expect(page.locator('.todo-card')).toHaveCount(1);
  expect(await saved(page)).toEqual(original);
  state.syncError = undefined;
  await page.reload();
  await expect.poll(async () => (await saved(page)).items.filter((item: any) => item.f.calendarScheduleArchived).length).toBe(2);
});

test('public history schedules keep their subject and page map through standalone refresh and Tracker', async ({ page }) => {
  const state = await seed(page);
  const history: CalendarTaskRow = { event_key: 'primary:history', source_event_id: 'history', calendar_id: 'primary',
    event_date: date, title: '歷史｜好好學', description: '【識別碼】GSAT-HIST-HAOHAOXUE\n【頁碼範圍】p.2–24', category: 'studyItem' };
  state.rows = [history];
  const items = calendarItemsByDate([history]).get(date)!;
  await page.evaluate(({ key, date, items }) => localStorage.setItem(key, JSON.stringify({ date, notes: '歷史筆記', items })),
    { key: prefix + date, date, items });
  await page.goto('/todo.html');
  await expect(page.locator('.todo-card')).toContainText(['好好學']);
  await expect.poll(async () => (await saved(page)).items[0].f.subject).toBe('歷史');
  await page.goto('/?date=' + date);
  const card = page.locator('#dailyItemList .item.subject-history').first();
  await expect(card).toContainText('好好學');
  await expect(card.locator('[data-field="start"]').first()).toHaveValue('2');
  await expect(card.locator('[data-field="end"]').first()).toHaveValue('24');
  await page.goto('/summary.html');
  await expect.poll(async () => (await saved(page)).items.filter((item: any) => !item.f.calendarScheduleArchived)[0].type).toBe('socialStudy');
  expect((await saved(page)).notes).toBe('歷史筆記');
});
