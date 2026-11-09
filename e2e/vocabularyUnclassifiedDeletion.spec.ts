import { expect, test } from '@playwright/test';
import { vocabularyMeaningStarKeys } from '../src/study/vocabularyStars.ts';
import type { EnglishReviewWordEntry } from '../src/types.ts';

test.use({timezoneId:'Asia/Taipei',reducedMotion:'reduce'});
const dates=['2026-10-23','2026-10-24'];
const prefix='study-v11:guest:';

for(const width of [375,1440])test(`the last unclassified translation can be deleted from legacy and structured words at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/vocabulary.review.html');
  const removed=vocabularyMeaningStarKeys('未分詞性',['備註一','備註二']);
  const noun=vocabularyMeaningStarKeys('Noun',['影響力'])[0];
  await page.evaluate(({dates,prefix,removed,noun})=>{
    localStorage.clear();localStorage.setItem('study-v11:meta:active-record-prefix',prefix);
    for(const date of dates)localStorage.setItem(prefix+date,JSON.stringify({schemaVersion:2,date,notes:'保留筆記',items:[{
      id:'review',type:'englishVocabInteractive',source:'custom',done:true,minutes:'15',required:false,f:{words:[
        {id:'legacy',text:'novelty',noun:true,adjective:true,translation:'待刪除的舊翻譯'},
        {id:'structured',text:'leverage',noun:true,translation:'Noun：影響力；備註一、備註二',gsatLevel:4,showGsatLevel:true,
          translationsByPartOfSpeech:{noun:['影響力'],unclassified:['備註一','備註二']},
          vocabularyStars:{card:true,'word:leverage:0':true,[noun]:true,[removed[0]]:true,[removed[1]]:true}},
        {id:'other',text:'other',translation:'其他翻譯'},
      ]},
    }]}));
  },{dates,prefix,removed,noun});
  await page.reload();
  const legacy=page.locator('.vocabulary-row[data-entry-key="novelty"]');
  await legacy.getByRole('button',{name:'編輯「novelty」',exact:true}).click();
  const legacyGroup=legacy.locator('[data-translation-group="unclassified"]');
  await expect(legacyGroup.locator('input')).toHaveCount(1);
  await expect(legacyGroup.locator('[data-delete-translation]')).toBeEnabled();
  await legacyGroup.locator('[data-delete-translation]').click();
  await expect(legacyGroup).toHaveCount(0);
  await legacy.getByRole('button',{name:'完成「novelty」',exact:true}).click();

  const structured=page.locator('.vocabulary-row[data-entry-key="leverage"]');
  await structured.getByRole('button',{name:'編輯「leverage」',exact:true}).click();
  const group=structured.locator('[data-translation-group="unclassified"]');
  await group.locator('[data-delete-translation]').first().click();
  await expect(group.locator('input')).toHaveValue('備註二');
  await expect(group.locator('[data-delete-translation]')).toBeEnabled();
  await group.locator('[data-delete-translation]').click();
  await expect(group).toHaveCount(0);
  await expect(structured.locator('[data-translation-group="noun"] input')).toHaveValue('影響力');
  await expect(structured.locator('[data-translation-group="noun"] [data-delete-translation]')).toBeDisabled();
  await structured.getByRole('button',{name:'完成「leverage」',exact:true}).click();
  await page.getByRole('button',{name:'詞性',exact:true}).click();
  await page.getByRole('button',{name:'字母排序',exact:true}).click();
  await page.reload();
  await expect(structured.locator('.vocabulary-meaning-answer')).toHaveText(['影響力']);
  await legacy.getByRole('button',{name:'編輯「novelty」',exact:true}).click();
  await expect(legacyGroup).toHaveCount(0);

  const saved=await page.evaluate(({dates,prefix})=>dates.map(date=>JSON.parse(localStorage.getItem(prefix+date)!)),{dates,prefix});
  for(const record of saved){
    const words=record.items.find((item:{id:string})=>item.id==='review').f.words as EnglishReviewWordEntry[];
    expect(words[0].translation).toBe('');
    expect(words[0].translationsByPartOfSpeech).toEqual({});
    expect(words[1].translation).toBe('Noun：影響力');
    expect(words[1].translationsByPartOfSpeech).toEqual({noun:['影響力']});
    expect(words[1].vocabularyStars?.[removed[0]]).toBe(false);
    expect(words[1].vocabularyStars?.[removed[1]]).toBe(false);
    expect(words[1].vocabularyStars?.[noun]).toBe(true);
    expect(words[1].vocabularyStars?.card).toBe(true);
    expect(words[1].vocabularyStars?.['word:leverage:0']).toBe(true);
    expect(words[1].gsatLevel).toBe(4);
    expect(words[2].translation).toBe('其他翻譯');
    expect(record.notes).toBe('保留筆記');
    expect(record.items.find((item:{id:string})=>item.id==='review').minutes).toBe('15');
  }
  await page.goto('/?date=2026-10-24');
  await expect(page.locator('#studyDate')).toHaveValue('2026-10-24');
  await page.goto('/vocabulary.review.html');
  await legacy.getByRole('button',{name:'編輯「novelty」',exact:true}).click();
  await expect(legacyGroup).toHaveCount(0);
  expect(await page.evaluate(key=>{
    const record=JSON.parse(localStorage.getItem(key)!);
    return record.items.find((item:{id:string})=>item.id==='review').f.words[0].translation;
  },prefix+'2026-10-24')).toBe('');
});
