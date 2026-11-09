import { expect, test, type Page, type Route } from '@playwright/test';
import { recordSyncWatermarkKey } from '../src/storage/syncWatermark.ts';
import type { StudyRecord } from '../src/types.ts';
import { clickConnectionToggle } from './helpers/connectionMotion.ts';

test.use({ timezoneId: 'Asia/Taipei', reducedMotion: 'reduce' });
const today = '2026-08-09';
const user = { id: '00000000-0000-0000-0000-000000000124', email: 'pending@example.test', role: 'authenticated', aud: 'authenticated' };
const prefix = `study-v11:user:${user.id}:`;
const oldDate = '2026-08-03';
interface CloudRow { study_date: string; payload: StudyRecord; revision: number; updated_at: string }
interface State { rows: Map<string, CloudRow>; posts: Map<string, number>; failures: Map<string, number>; held: Route[]; holdReads: boolean; holdList?: boolean; heldLists?: Route[]; beforeSaveReply?: () => Promise<void>; listDates?: string[] }

function record(date: string, notes = '伺服器筆記'): StudyRecord & { completionCelebrations: { version: number; half: boolean; complete: boolean } } {
  return { schemaVersion: 2, date, mood: '', wakeTime: '', biggestBlock: '', firstThingTomorrow: '', notes,
    completionCelebrations: { version: 3, half: false, complete: false }, items: [] };
}

async function setup(page: Page, options: { dates?: string[]; changed?: boolean; blockCleanWrite?: boolean; failures?: number; hold?: boolean } = {}): Promise<State> {
  const dates = options.dates ?? [oldDate];
  const state: State = { rows: new Map(), posts: new Map(), failures: new Map(), held: [], holdReads: !!options.hold };
  for (const date of [today, ...dates]) state.rows.set(date, { study_date: date, payload: record(date), revision: 2, updated_at: date === today ? '2026-08-09T00:00:00Z' : '2026-08-01T00:00:00Z' });
  if (options.failures) state.failures.set(oldDate, options.failures);
  await page.context().addInitScript(({ prefix }) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function simulateStorageCapacity(key, value): void {
      if(this===localStorage && key.endsWith('__cloud-conflict-backup__') && localStorage.getItem('test:block-backup')==='yes') {
        throw new DOMException('simulated backup capacity exhausted','QuotaExceededError');
      }
      if (this === localStorage && key === prefix + localStorage.getItem('test:block-clean-date')) {
        const parsed = JSON.parse(value);
        if (parsed.localDirty === false) throw new DOMException('simulated full storage', 'QuotaExceededError');
      }
      set.call(this, key, value);
    };
  }, { prefix });
  await page.context().route('https://xcpnxkkixsxzgbqsiuud.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url()), requestHeaders = await request.allHeaders();
    const headers = { 'Access-Control-Allow-Origin': requestHeaders.origin || 'http://127.0.0.1:4173',
      'Access-Control-Allow-Headers': requestHeaders['access-control-request-headers'] || 'authorization,apikey,content-type,x-client-info',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Credentials': 'true' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/auth/v1/user')) return route.fulfill({ json: user, headers });
    if (url.pathname.includes('/functions/')) return route.fulfill({ json: { connected: false }, headers });
    if (url.pathname.endsWith('/rest/v1/study_records')) {
      const wanted = url.searchParams.get('study_date')?.replace(/^eq\./, '');
      if(!wanted&&state.holdList){(state.heldLists??=[]).push(route);return;}
      if (wanted && wanted !== today && state.holdReads) { state.held.push(route); return; }
      const rows = wanted ? [...state.rows.values()].filter(row => row.study_date === wanted) : (state.listDates??[today]).map(date=>state.rows.get(date)!);
      return route.fulfill({ json: rows, headers });
    }
    if (url.pathname.endsWith('/rpc/upsert_study_record')) {
      const body = request.postDataJSON(), date = body.p_study_date;
      state.posts.set(date, (state.posts.get(date) ?? 0) + 1);
      const failures = state.failures.get(date) ?? 0;
      if (failures > 0) {
        state.failures.set(date, failures - 1);
        return route.fulfill({ status: 503, json: { message: 'temporary upload unavailable' }, headers });
      }
      const previous = state.rows.get(date);
      if (previous && previous.revision !== body.p_base_revision) return route.fulfill({ json: { ...previous, applied: false }, headers });
      const row = { study_date: date, payload: body.p_payload, revision: (previous?.revision ?? 0) + 1, updated_at: '2026-08-09T01:00:00Z' };
      state.rows.set(date, row);
      await state.beforeSaveReply?.();
      return route.fulfill({ json: { ...row, applied: true }, headers });
    }
    return route.fulfill({ json: [], headers });
  });
  await page.clock.setFixedTime(new Date('2026-08-09T12:00:00+08:00'));
  await page.goto('/summary.html');
  await page.evaluate(({ prefix, today, dates, changed, block, user, watermarkKey, rows }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem('sb-xcpnxkkixsxzgbqsiuud-auth-token', JSON.stringify({ access_token: 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ sub: user.id, role: 'authenticated' })) + '.signature',
      refresh_token: 'test-refresh', token_type: 'bearer', expires_at: 1893456000, expires_in: 3600, user }));
    localStorage.setItem(watermarkKey, '2026-08-09T00:00:00Z');
    for (const row of rows) {
      const dirty = dates.includes(row.study_date);
      const payload = { ...row.payload, ...(dirty && changed ? { notes: '本機新筆記' } : {}) };
      localStorage.setItem(prefix + row.study_date, JSON.stringify({ ...payload, serverRevision: row.revision, serverUpdatedAt: row.updated_at,
        localDirty: dirty, syncConflict: false, syncBase: row.payload }));
    }
    if (block) localStorage.setItem('test:block-clean-date', dates[0]);
  }, { prefix, today, dates, changed: !!options.changed, block: !!options.blockCleanWrite, user,
    watermarkKey: recordSyncWatermarkKey(user.id), rows: [...state.rows.values()] });
  await page.goto('/');
  return state;
}

async function openDetails(page: Page): Promise<void> {
  await page.getByRole('button', { name: '查看詳細', exact: true }).click();
  await expect(page.locator('#cloudPendingDialog')).toBeVisible();
}

async function editWaitingDay(page:Page,state:State):Promise<void>{
  const row=state.rows.get(oldDate)!;
  await page.evaluate(({prefix,oldDate,row})=>{
    localStorage.setItem(prefix+oldDate,JSON.stringify({...row.payload,notes:'舊日期的新筆記',serverRevision:row.revision,serverUpdatedAt:row.updated_at,
      localDirty:true,syncConflict:false,syncBase:row.payload}));
    window.dispatchEvent(new Event('study-records-changed'));
  },{prefix,oldDate,row});
}

test('a manual date retry during a slow cloud read is queued and runs after that read finishes',async({page})=>{
  const state=await setup(page);
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
  await editWaitingDay(page,state);
  state.holdList=true;
  await clickConnectionToggle(page.locator('.connection-settings-toggle'));
  await page.locator('#cloudRefreshBtn').click();
  await expect.poll(()=>state.heldLists?.length??0).toBe(1);
  await openDetails(page);
  const row=page.locator(`[data-pending-date="${oldDate}"]`);
  await row.getByRole('button',{name:'重試同步',exact:true}).click();
  await expect(row.locator('[data-state]')).toHaveText('已排入同步');
  expect(state.rows.get(oldDate)?.payload.notes).toBe('伺服器筆記');
  state.holdList=false;
  await state.heldLists![0].fulfill({json:[state.rows.get(today)!],headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:4173'}});
  await expect.poll(()=>state.rows.get(oldDate)?.payload.notes).toBe('舊日期的新筆記');
  await expect(page.locator('[data-pending-count]')).toHaveText('目前沒有待同步紀錄');
  expect(state.posts.get(oldDate)).toBe(1);
});

test('Save also processes waiting historical dates without needing to navigate to each one',async({page})=>{
  const state=await setup(page);
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
  await editWaitingDay(page,state);
  await page.locator('#notes').fill('當天的新筆記');
  await page.locator('#notes').blur();
  await page.locator('#saveBtn').click();
  await expect.poll(()=>state.rows.get(oldDate)?.payload.notes).toBe('舊日期的新筆記');
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
  expect(state.posts.get(oldDate)).toBe(1);
});

test('an explicit cloud refresh also uploads the 33 range completions generated while applying that refresh',async({page})=>{
  const sourceDate='2026-08-10';
  const dates=Array.from({length:33},(_,index)=>new Date(Date.UTC(2026,7,11+index)).toISOString().slice(0,10));
  const state=await setup(page,{dates:[sourceDate,...dates]});
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
  await page.clock.setFixedTime(new Date('2026-08-10T12:00:00+08:00'));
  await page.goto('/');
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
  const targets=dates.map(date=>{
    const row=state.rows.get(date)!;
    row.payload.items=[{id:'target-'+date,type:'extra',title:'英文｜ACE Reading',source:'preset',required:true,done:false,minutes:'',
      f:{title:'ACE Reading',book:'ACE Reading',round:'1',scopeKind:'round'}}];
    return row;
  });
  await page.evaluate(({prefix,targets})=>{
    for(const row of targets){
      const key=prefix+row.study_date;
      localStorage.setItem(key,JSON.stringify({...row.payload,serverRevision:row.revision,
        serverUpdatedAt:row.updated_at,localDirty:false,syncConflict:false,syncBase:row.payload}));
      window.dispatchEvent(new StorageEvent('storage',{key,storageArea:localStorage}));
    }
  },{prefix,targets});
  const current=state.rows.get(sourceDate)!;
  state.listDates=[sourceDate];
  current.revision++;
  current.payload.items=[{id:'completed-source',type:'extra',title:'英文｜ACE Reading',source:'custom',required:true,done:true,
    minutes:'15',checkedOn:sourceDate,f:{title:'ACE Reading',book:'ACE Reading',round:'1',scopeKind:'round'}}];
  await clickConnectionToggle(page.locator('.connection-settings-toggle'));
  await page.locator('#cloudRefreshBtn').click();
  await expect.poll(()=>page.evaluate(({prefix,dates})=>dates.filter(date=>JSON.parse(localStorage.getItem(prefix+date)!).items[0].done).length,
    {prefix,dates})).toBe(33);
  await expect.poll(()=>dates.filter(date=>state.rows.get(date)!.payload.items[0].done).length).toBe(33);
  await expect.poll(()=>page.evaluate(({prefix,dates})=>dates.filter(date=>JSON.parse(localStorage.getItem(prefix+date)!).localDirty),
    {prefix,dates})).toEqual([]);
  const uploads=dates.map(date=>state.posts.get(date)??0);
  await page.reload();
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
  expect(dates.map(date=>state.posts.get(date)??0)).toEqual(uploads);
});

test('a delayed older bulk read cannot undo a newer confirmed date or make it pending again',async({page})=>{
  const state=await setup(page);
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
  const stale=structuredClone(state.rows.get(oldDate)!);
  state.holdList=true;
  await clickConnectionToggle(page.locator('.connection-settings-toggle'));
  await page.locator('#cloudRefreshBtn').click();
  await expect.poll(()=>state.heldLists?.length??0).toBe(1);
  const newer={...stale,payload:{...stale.payload,notes:'另一頁已確認同步的新版本'},revision:3,updated_at:'2026-08-09T01:00:00Z'};
  state.rows.set(oldDate,newer);state.holdReads=true;
  await page.evaluate(({prefix,oldDate,newer})=>localStorage.setItem(prefix+oldDate,JSON.stringify({...newer.payload,serverRevision:newer.revision,
    serverUpdatedAt:newer.updated_at,localDirty:false,syncConflict:false,syncBase:newer.payload})),{prefix,oldDate,newer});
  state.holdList=false;
  await state.heldLists![0].fulfill({json:[state.rows.get(today)!,stale],headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:4173'}});
  await expect(page.locator('#cloudRefreshBtn')).toBeEnabled();
  const local=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),prefix+oldDate);
  expect(local.notes).toBe(newer.payload.notes);expect(local.serverRevision).toBe(3);expect(local.localDirty).toBe(false);
  expect(state.posts.get(oldDate)??0).toBe(0);
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
});

test('an empty incremental refresh finishes its busy badge without relying on a later record write',async({page})=>{
  await page.clock.install({time:new Date('2026-08-09T12:00:00+08:00')});
  const state=await setup(page,{dates:[]});
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
  await page.clock.runFor(1100);
  state.listDates=[];
  await clickConnectionToggle(page.locator('.connection-settings-toggle'));
  await page.locator('#cloudRefreshBtn').click();
  await expect(page.locator('#cloudRefreshBtn')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
  expect(state.posts.size).toBe(0);
});

test('details list all pending dates and matching cloud contents clear dirty flags without repeat RPC uploads', async ({ page }) => {
  const dates = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'];
  const state = await setup(page, { dates, hold: true });
  await openDetails(page);
  await expect(page.locator('[data-pending-comparison] [data-pending-date]')).toHaveText('');
  await expect(page.locator('[data-pending-count]')).toHaveText('5 天尚待確認或處理');
  await expect(page.locator('[data-pending-list] [data-date]')).toHaveText(dates);
  await expect.poll(() => state.held.length).toBe(5);
  state.holdReads = false;
  for (const route of state.held) await route.fulfill({ json: [state.rows.get(new URL(route.request().url()).searchParams.get('study_date')!.slice(3))!], headers: { 'Access-Control-Allow-Origin': new URL(page.url()).origin } });
  await expect(page.locator('[data-pending-count]')).toHaveText('目前沒有待同步紀錄');
  for (const date of dates) expect(state.posts.get(date) ?? 0).toBe(0);
  const saved = await page.evaluate(({ prefix, dates }) => dates.map(date => JSON.parse(localStorage.getItem(prefix + date)!)), { prefix, dates });
  expect(saved.every(record => record.localDirty === false && record.__localSyncBase === 'same-content-v1')).toBe(true);
});

test('server success with failed local write remains pending with a reason, then manual retry acknowledges without another upload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await setup(page, { changed: true, blockCleanWrite: true });
  await openDetails(page);
  const row = page.locator(`[data-pending-date="${oldDate}"]`);
  await expect(row.locator('[data-reason]')).toContainText('雲端已接收，但本機無法寫回同步狀態');
  expect(state.rows.get(oldDate)?.payload.notes).toBe('本機新筆記');
  expect(state.posts.get(oldDate)).toBe(1);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).localDirty, prefix + oldDate)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pending-sync-details-mobile.png') });
  await page.evaluate(() => localStorage.removeItem('test:block-clean-date'));
  await row.getByRole('button', { name: '重試同步', exact: true }).click();
  await expect(page.locator('[data-pending-count]')).toHaveText('目前沒有待同步紀錄');
  expect(state.posts.get(oldDate)).toBe(1);
});

test('historical failures stop until a manual retry despite idle time, focus and reconnect', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-09T12:00:00+08:00') });
  const state = await setup(page, { changed: true, failures: 1 });
  await expect.poll(() => state.posts.get(oldDate)).toBe(1);
  await openDetails(page);
  const row = page.locator(`[data-pending-date="${oldDate}"]`);
  await expect(row.locator('[data-state]')).toContainText('請手動重試');
  await expect(page.locator('#cloudStatusBadge [data-ui-icon="cloud-exclamation-point"] svg')).toHaveCount(1);
  await page.clock.runFor(11 * 60_000);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('study-records-changed'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(10_000);
  expect(state.posts.get(oldDate)).toBe(1);
  expect(state.rows.get(oldDate)?.payload.notes).toBe('伺服器筆記');
  await row.getByRole('button', { name: '重試同步', exact: true }).click();
  await expect.poll(() => state.rows.get(oldDate)?.payload.notes).toBe('本機新筆記');
  expect(state.posts.get(oldDate)).toBe(2);
  await expect(page.locator('#studyDate')).toHaveValue(today);
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
  await expect(page.locator('#cloudStatusBadge [data-ui-icon="cloud-check"] svg')).toHaveCount(1);
});

test('editing and leaving a field saves locally without an upload until Save is clicked', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-09T12:00:00+08:00') });
  const state = await setup(page);
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
  const before = state.posts.get(today) ?? 0;
  await page.locator('#notes').fill('編輯先存本機');
  await page.locator('#notes').blur();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).notes, prefix + today)).toBe('編輯先存本機');
  await page.clock.runFor(600);
  await expect(page.locator('#cloudStatusBadge [data-ui-icon="cloud-upload"] svg')).toHaveCount(1);
  await page.clock.runFor(11 * 60_000);
  expect(state.posts.get(today) ?? 0).toBe(before);
  expect(state.rows.get(today)?.payload.notes).toBe('伺服器筆記');
  await page.locator('#saveBtn').click();
  await expect.poll(() => state.rows.get(today)?.payload.notes).toBe('編輯先存本機');
  expect(state.posts.get(today)).toBe(before + 1);
  await expect(page.locator('#saveBtn')).toHaveAttribute('data-state', 'success');
});

test('a failed date gets one new attempt on page load without rescheduling itself', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-09T12:00:00+08:00') });
  const state = await setup(page, { changed: true, failures: Infinity });
  await expect.poll(() => state.posts.get(oldDate)).toBe(1);
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null')?.reason,prefix+'meta:pending-sync:'+oldDate)).toContain('temporary upload unavailable');
  await page.clock.runFor(11 * 60_000);
  expect(state.posts.get(oldDate)).toBe(1);
  await page.reload();
  await expect.poll(() => state.posts.get(oldDate)).toBe(2);
  await page.clock.runFor(11 * 60_000);
  expect(state.posts.get(oldDate)).toBe(2);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).localDirty, prefix + oldDate)).toBe(true);
});

test('an edit made during an upload stays pending instead of creating an endless follow-up queue', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-09T12:00:00+08:00') });
  const state = await setup(page);
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
  const before = state.posts.get(today) ?? 0;
  await page.locator('#notes').fill('這次送出的版本');
  await page.locator('#notes').blur();
  state.beforeSaveReply = async () => {
    state.beforeSaveReply = undefined;
    await page.evaluate(key => {
      const latest = JSON.parse(localStorage.getItem(key)!);
      latest.notes = '上傳途中新增的內容'; latest.localDirty = true;
      localStorage.setItem(key, JSON.stringify(latest));
    }, prefix + today);
  };
  await page.locator('#saveBtn').click();
  await expect(page.locator('#saveBtn')).toHaveAttribute('data-state', 'local');
  await page.clock.runFor(11 * 60_000);
  expect(state.posts.get(today)).toBe(before + 1);
  expect(state.rows.get(today)?.payload.notes).toBe('這次送出的版本');
  const local = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), prefix + today);
  expect(local.notes).toBe('上傳途中新增的內容');
  expect(local.localDirty).toBe(true);
  expect(local.syncConflict).toBe(false);
  await openDetails(page);
  const row = page.locator(`[data-pending-date="${today}"]`);
  await expect(row.locator('[data-state]')).toHaveText('等待同步');
  await row.getByRole('button', { name: '重試同步', exact: true }).click();
  await expect.poll(() => state.rows.get(today)?.payload.notes).toBe('上傳途中新增的內容');
});

test('a rejected cross-tab lock reports the pre-upload cause and manual retry finishes explicitly', async ({ page }) => {
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({oldDate})=>{
    const locks=navigator.locks;
    Object.defineProperty(navigator,'locks',{configurable:true,value:{request(...args:unknown[]){
      if(String(args[0]).startsWith('gsat-study-record:') && String(args[0]).endsWith(oldDate)
        && localStorage.getItem('test:allow-record-lock')!=='yes') return Promise.reject(new Error('simulated record lock unavailable'));
      if(locks) return Reflect.apply(locks.request,locks,args);
      const callback=args.at(-1) as ()=>unknown;
      return Promise.resolve().then(callback);
    }}});
  },{oldDate});
  const state=await setup(page,{changed:true});
  await openDetails(page);
  const row=page.locator(`[data-pending-date="${oldDate}"]`);
  await expect(row.locator('[data-state]')).toHaveText('需要處理');
  await expect(row.locator('[data-reason]')).toContainText('未開始上傳：simulated record lock unavailable');
  expect(state.posts.get(oldDate)??0).toBe(0);
  await page.evaluate(()=>localStorage.setItem('test:allow-record-lock','yes'));
  await row.getByRole('button',{name:'重試同步',exact:true}).click();
  await expect(page.locator('[data-pending-message]')).toHaveText(oldDate+' 已確認與雲端同步。');
  expect(state.posts.get(oldDate)).toBe(1);
  expect(errors).toEqual([]);
});

test('a user can pause a date, retain that choice across reload, and explicitly resume it', async ({ page }) => {
  const state = await setup(page, { changed: true, failures: Infinity });
  await openDetails(page);
  const row = page.locator(`[data-pending-date="${oldDate}"]`);
  await expect(row.locator('[data-state]')).toContainText('同步失敗');
  await row.getByRole('button', { name: '暫停此日同步', exact: true }).click();
  await expect(row.locator('[data-state]')).toHaveText('已暫停');
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已暫停 1 天');
  const before = state.posts.get(oldDate);
  await page.reload();
  await openDetails(page);
  await expect(row.locator('[data-state]')).toHaveText('已暫停');
  expect(state.posts.get(oldDate)).toBe(before);
  state.failures.delete(oldDate);
  await row.getByRole('button', { name: '恢復並重試', exact: true }).click();
  await expect(page.locator('[data-pending-count]')).toHaveText('目前沒有待同步紀錄');
});

test('comparison lets the user choose a cloud version with confirmation and a recoverable backup', async ({ page }) => {
  const state = await setup(page, { changed: true, failures: Infinity });
  await openDetails(page);
  const row = page.locator(`[data-pending-date="${oldDate}"]`);
  await expect(row.locator('[data-state]')).toContainText('同步失敗');
  await row.getByRole('button', { name: '暫停此日同步', exact: true }).click();
  await row.getByRole('button', { name: '比較與處理', exact: true }).click();
  await expect(page.locator('[data-pending-comparison]')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '以雲端版本為準', exact: true }).click();
  await expect(page.locator('[data-pending-message]')).toContainText('已完成處理');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).notes, prefix + oldDate)).toBe('伺服器筆記');
  expect(await page.evaluate(key => localStorage.getItem(key) !== null, prefix + '__cloud-conflict-backup__')).toBe(true);
  expect(state.posts.get(oldDate)).toBe(1);
});

test('a full backup store reports capacity, preserves both versions and permits a safe later retry', async ({ page }) => {
  const state=await setup(page,{changed:true,failures:Infinity});
  await openDetails(page);
  const row=page.locator(`[data-pending-date="${oldDate}"]`);
  await expect(row.locator('[data-state]')).toContainText('同步失敗');
  await page.evaluate(()=>localStorage.setItem('test:block-backup','yes'));
  page.on('dialog',dialog=>dialog.accept());
  await row.getByRole('button',{name:'比較與處理',exact:true}).click();
  await expect(page.locator('[data-pending-diff]')).toContainText('兩端內容不同');
  await page.locator('[data-pending-use="cloud"]').click();
  await expect(page.locator('[data-pending-message]')).toContainText('本機儲存空間不足');
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).notes,prefix+oldDate)).toBe('本機新筆記');
  expect(state.rows.get(oldDate)?.payload.notes).toBe('伺服器筆記');
  expect(state.posts.get(oldDate)).toBe(1);
  await page.evaluate(()=>localStorage.removeItem('test:block-backup'));
  await row.getByRole('button',{name:'比較與處理',exact:true}).click();
  await expect(page.locator('[data-pending-diff]')).toContainText('兩端內容不同');
  await page.locator('[data-pending-use="cloud"]').click();
  await expect(page.locator('[data-pending-message]')).toContainText('已完成處理');
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).notes,prefix+oldDate)).toBe('伺服器筆記');
  expect(await page.evaluate(key=>!!localStorage.getItem(key),prefix+'__cloud-conflict-backup__')).toBe(true);
});

test('a changed cloud revision after comparison prevents a stale overwrite', async ({ page }) => {
  const state = await setup(page, { changed: true, failures: Infinity });
  await openDetails(page);
  const row = page.locator(`[data-pending-date="${oldDate}"]`);
  await expect(row.locator('[data-state]')).toContainText('同步失敗');
  await row.getByRole('button', { name: '暫停此日同步', exact: true }).click();
  await row.getByRole('button', { name: '比較與處理', exact: true }).click();
  await expect(page.locator('[data-pending-comparison]')).toBeVisible();
  state.rows.get(oldDate)!.revision += 1;
  state.rows.get(oldDate)!.payload.notes = '其他裝置剛更新';
  const before = state.posts.get(oldDate);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '以本機版本為準', exact: true }).click();
  await expect(page.locator('[data-pending-message]')).toContainText('資料又有更新');
  expect(state.posts.get(oldDate)).toBe(before);
  expect(state.rows.get(oldDate)!.payload.notes).toBe('其他裝置剛更新');
});

test('local edits made during an explicit cloud overwrite are retained and require a new comparison', async ({ page }) => {
  const state = await setup(page, { changed: true, failures: Infinity });
  await openDetails(page);
  const row = page.locator(`[data-pending-date="${oldDate}"]`);
  await expect(row.locator('[data-state]')).toContainText('同步失敗');
  await row.getByRole('button', { name: '暫停此日同步', exact: true }).click();
  await row.getByRole('button', { name: '比較與處理', exact: true }).click();
  await expect(page.locator('[data-pending-comparison]')).toBeVisible();
  state.failures.delete(oldDate);
  state.beforeSaveReply = async () => {
    await page.evaluate(key => {
      const latest = JSON.parse(localStorage.getItem(key)!);
      latest.notes = '送出後另一頁籤的新筆記';
      latest.localDirty = true;
      localStorage.setItem(key, JSON.stringify(latest));
    }, prefix + oldDate);
  };
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '以本機版本為準', exact: true }).click();
  await expect(page.locator('[data-pending-message]')).toContainText('保留新的本機內容');
  expect(state.rows.get(oldDate)!.payload.notes).toBe('本機新筆記');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).notes, prefix + oldDate)).toBe('送出後另一頁籤的新筆記');
  await expect(page.locator('#cloudPendingDetailsBtn')).toBeVisible();
});
