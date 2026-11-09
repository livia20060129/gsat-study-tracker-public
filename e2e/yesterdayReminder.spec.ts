import { expect, test, type Page } from '@playwright/test';
import { selectStudyDate } from './helpers/siteNavigation.ts';

test.use({ timezoneId:'Asia/Taipei' });
const prefix='study-v11:guest:';
const today='2026-11-09';
const previous='2026-11-08';
function record(date:string, firstThingTomorrow:string):string {
  return JSON.stringify({schemaVersion:2,date,firstThingTomorrow,notes:'',mood:'',wakeTime:'',biggestBlock:'',items:[]});
}
async function seed(page:Page, records:Record<string,string>, selected=today):Promise<void>{
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00+08:00'));
  await page.goto('/material.progress.html');
  await page.evaluate(({prefix,records})=>{
    localStorage.clear();localStorage.setItem('study-v11:meta:active-record-prefix',prefix);
    for(const [date,raw] of Object.entries(records))localStorage.setItem(prefix+date,raw);
    localStorage.setItem('study-v11:user:another-account:2026-11-08',JSON.stringify({date:'2026-11-08',firstThingTomorrow:'其他帳號的內容',items:[]}));
  },{prefix,records});
  await page.goto('/?date='+selected);
}

for(const width of [375,1440])test(`yesterday reminder keeps multiline text, correct dates and two equal tabs at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});
  const reminder='先訂正數學\n複習 <b>英文單字</b>\n整理錯題';
  const raw=record(previous,reminder);
  await seed(page,{[previous]:raw,'2026-11-07':record('2026-11-07','前兩天留下的提醒'),[today]:record(today,'這是明天的提醒')});
  const tabs=page.locator('#overviewMetricTabs');
  await expect(tabs.getByRole('tab')).toHaveText(['完成率','昨日提醒']);
  await expect(tabs.getByRole('tab',{name:'完成率',exact:true})).toHaveAttribute('aria-selected','true');
  await tabs.getByRole('tab',{name:'昨日提醒',exact:true}).click();
  await expect(page.locator('#yesterdayReminderPanel')).toHaveClass(/is-active/);
  await expect(page.locator('#yesterdayReminderDate')).toHaveText('來源日期：'+previous);
  expect(await page.locator('#yesterdayReminderText').textContent()).toBe(reminder);
  await expect(page.locator('#yesterdayReminderText b')).toHaveCount(0);
  expect(await page.evaluate(key=>localStorage.getItem(key),prefix+previous)).toBe(raw);
  await expect(page.locator('#completionRatePanel')).toHaveAttribute('inert','');
  await expect(page.locator('#mathPagesPanel')).toHaveCount(0);
  await tabs.getByRole('tab',{name:'昨日提醒',exact:true}).evaluate(async node=>{
    await Promise.all(node.parentElement!.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>undefined)));
  });
  const geometry=await tabs.evaluate(node=>{
    const buttons=Array.from(node.querySelectorAll('button')).map(button=>button.getBoundingClientRect());
    const indicator=node.querySelector('.metric-segment-indicator')!.getBoundingClientRect();
    return {widths:buttons.map(box=>box.width),offset:Math.abs(indicator.left-buttons[1].left)};
  });
  expect(Math.max(...geometry.widths)-Math.min(...geometry.widths)).toBeLessThan(1);
  expect(geometry.offset).toBeLessThan(1);
  await page.locator('#overviewStats').screenshot({path:testInfo.outputPath(`yesterday-reminder-${width}.png`)});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await selectStudyDate(page,'2026-11-08');
  await expect(page.locator('#yesterdayReminderText')).toHaveText('前兩天留下的提醒');
  await selectStudyDate(page,'2026-11-10');
  await expect(page.locator('#yesterdayReminderText')).toHaveText('這是明天的提醒');
  await selectStudyDate(page,'2026-11-13');
  await expect(page.locator('#yesterdayReminderPanel')).toHaveAttribute('data-state','empty');
  await expect(page.locator('#yesterdayReminderText')).toHaveText('前一天尚未填寫「明日第一件事」。');
  expect(await page.evaluate(key=>localStorage.getItem(key),prefix+'2026-11-12')).toBeNull();
  await page.reload();
  await expect(tabs.getByRole('tab',{name:'完成率',exact:true})).toHaveAttribute('aria-selected','true');
});

test('yesterday follows calendar boundaries including a leap day',async({page})=>{
  const cases=[['2027-01-01','2026-12-31'],['2028-03-01','2028-02-29'],['2027-03-01','2027-02-28']];
  await seed(page,Object.fromEntries(cases.map(([,previous])=>[previous,record(previous,'提醒 '+previous)])),cases[0][0]);
  for(const [date,previous] of cases){
    await selectStudyDate(page,date);
    await page.locator('[data-overview-metric="reminder"]').click();
    await expect(page.locator('#yesterdayReminderDate')).toHaveText('來源日期：'+previous);
    await expect(page.locator('#yesterdayReminderText')).toHaveText('提醒 '+previous);
  }
});

test('previous-day writes update the preview without replacing a current-day draft or reading another account',async({page,context})=>{
  await seed(page,{[previous]:record(previous,'原提醒')});
  await page.locator('[data-overview-metric="reminder"]').click();
  const peer=await context.newPage();await peer.goto('/summary.html');
  await page.locator('#notes').fill('仍在輸入的今日草稿');
  await peer.evaluate(({prefix,previous})=>{
    const current=JSON.parse(localStorage.getItem(prefix+previous)!);
    localStorage.setItem(prefix+previous,JSON.stringify({...current,firstThingTomorrow:'另一頁更新的提醒\n第二行'}));
  },{prefix,previous});
  await expect(page.locator('#yesterdayReminderText')).toHaveText('另一頁更新的提醒\n第二行');
  await expect(page.locator('#notes')).toHaveValue('仍在輸入的今日草稿');
  await expect(page.locator('#notes')).toBeFocused();
  await peer.evaluate(()=>localStorage.setItem('study-v11:user:another-account:2026-11-08',JSON.stringify({date:'2026-11-08',firstThingTomorrow:'不應顯示',items:[]})));
  await expect(page.locator('#yesterdayReminderText')).toHaveText('另一頁更新的提醒\n第二行');
  await page.evaluate(({prefix,previous})=>{
    const current=JSON.parse(localStorage.getItem(prefix+previous)!);
    localStorage.setItem(prefix+previous,JSON.stringify({...current,firstThingTomorrow:'本頁同步更新的提醒'}));
    window.dispatchEvent(new Event('study-records-changed'));
  },{prefix,previous});
  await expect(page.locator('#yesterdayReminderText')).toHaveText('本頁同步更新的提醒');
  await expect(page.locator('#notes')).toBeFocused();
  await page.evaluate(({prefix,previous})=>{
    const current=JSON.parse(localStorage.getItem(prefix+previous)!);
    localStorage.setItem(prefix+previous,JSON.stringify({...current,firstThingTomorrow:'返回快取頁面後的提醒'}));
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  },{prefix,previous});
  await expect(page.locator('#yesterdayReminderText')).toHaveText('返回快取頁面後的提醒');
  await expect(page.locator('#notes')).toHaveValue('仍在輸入的今日草稿');
});

test('an unreadable previous day stays intact and is distinguished from an empty reminder',async({page})=>{
  await seed(page,{[previous]:'{broken-json'});
  await page.locator('[data-overview-metric="reminder"]').click();
  await expect(page.locator('#yesterdayReminderPanel')).toHaveAttribute('data-state','unreadable');
  await expect(page.locator('#yesterdayReminderText')).toHaveText('前一天的紀錄無法讀取，請前往該日檢查。');
  expect(await page.evaluate(key=>localStorage.getItem(key),prefix+previous)).toBe('{broken-json');
});
