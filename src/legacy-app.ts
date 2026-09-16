// @ts-nocheck
/**
 * v171 compatibility runtime, progressively extracted into typed modules.
 *
 * This is the existing v167 application logic moved out of the single HTML file
 * into a TypeScript module. It still uses @ts-nocheck for the remaining legacy UI surface; record repositories,
 * sync, math progress, Calendar parsing, and Calendar task creation are delegated to typed modules.
 *
 * New/rewritten logic should move into typed modules under:
 *   application/ · domain/ · infrastructure/ · data/ · study/ · items/ · storage/ · ui/
 */

import { calculateMathProgress, MathProgressIndex } from './study/mathProgress';
import { decideRevisionSync, mergeStudyRecordsForUpload, recordSyncConflicts, sameStudyContent, stripRecordSyncMeta } from './storage/recordSync';
import { ACTIVE_RECORD_PREFIX_KEY, LEGACY_UNSCOPED_PREFIX, storagePrefixForUser } from './storage/local';
import { incrementalSyncStart, latestServerWatermark, recordSyncWatermarkKey } from './storage/syncWatermark';
import { calendarFixedTemplate } from './calendar/calendarBridge';
import { prioritizeCalendarPageRanges } from './calendar/pagePriority';
import { combineNaturalCalendarPlans, resolveNaturalCalendarPlan } from './calendar/naturalPlan';
import { grammarScheduleSummary } from './calendar/scheduleSummary';
import { normalizedGrammarUnitTitle, selectGrammarPlan } from './calendar/grammarPlan';
import { googleCalendarClientConfig } from './config/googleCalendar';
import { formatPercentagePointDelta, groupedMakeupCompletionUnits, groupedOriginalCompletionUnits, makeupCompletionUnit, originalCompletionUnit, summarizeCompletionUnits } from './study/completionMetrics';
import { applyDailyWorkRangeOverrides, groupDailyWorkItems, propagateDailyWorkCompletionDates, propagateDailyWorkDeferred, propagateDailyWorkDone, propagateDailyWorkField, propagateDailyWorkMinutes, propagateDailyWorkRangeField, replaceDailyWorkMinutes, ungroupDailyWorkItems } from './study/dailyWorkGroup';
import { cloneOriginalItemForMakeup, effectiveTemplatePresetKey, mergeDeferredCarryRanges, mergeMakeupProgress, specialItemTemplate } from './study/makeup';
import { dedupePresetDefinitions, presetDefinitionSemanticKey } from './study/presetDedup';
import { countDeferredToDay, deferredCapacityCandidates, DEFERRED_TARGET_LIMIT, futureDeferredDays, isConfirmedDeferred, isDeferrableStudyItem, requiresDeferredLimitConfirmation } from './study/deferDays';
import { groupStudyItemsBySubject, studyItemSubject, studyItemSubjectClass } from './study/subjectOrder';
import { SUBJECT_TIME_SHORT_LABELS, subjectTimeArcPath, subjectTimeDonutSlices, summarizeSubjectTime } from './study/subjectTime';
import { groupedSourceDateText, hasDeferredStudySource, shouldShowSourceDate } from './study/sourceDate';
import { completionCelebrationForChange } from './study/completionCelebration';
import { applyCompletionDateChange, completionDateLabel, deferredCompletionDate, manualCompletionDateChange } from './study/completionCheckedOn';
import { finishStudyTimer, formatStudyTimer, normalizeStudyTimerState, pauseStudyTimer, resetStudyTimer, setTimedEntryMinutes, startStudyTimer, studyTimerFromManualMinutes } from './study/studyTimer';
import { markCalendarNaturalCompletionByUser, markCalendarNaturalProgressByUser, reconcileCalendarNaturalPriorCoverage } from './study/calendarNaturalCompletion';
import { ensureEnglishReviewWordEntryIds } from './study/englishReview';
import { initializeMagazineMonth, magazineMonthForDate } from './study/magazineDefaults';
import { adjacentOverviewMetric, normalizeOverviewMetric, overviewMetricIndex } from './ui/overviewMetricView';
import { adjacentStudyItemsView, normalizeStudyItemsView, studyItemsViewIndex } from './ui/studyItemsView';
import { renderItemDeleteFooter } from './ui/itemActions';
import { LatestTaskQueue } from './storage/latestTaskQueue';
import { withCrossTabLock } from './storage/crossTabLock';
import { CURRENT_STUDY_RECORD_SCHEMA_VERSION } from './storage/studyRecordCodec';
import { CALENDAR_MATH_PLAN, CALENDAR_WEEK_MATH_TARGETS } from './data/mathCalendar';
import { NEWKEY_12_PAGE_MAP, NEWKEY_34_PAGE_MAP } from './data/mathMaterialPageMaps';
import {
  CHEMISTRY_NAVIGATOR_MATERIAL,
  MATH_GRAND_SLAM_MATERIAL,
  MATH_GRAND_SLAM_PAGE_MAP,
  naturalLecturePageMap,
  PHYSICS_ADVANTAGE_MATERIAL,
  PHYSICS_COMEBACK_MATERIAL,
} from './data/lecturePageMaps';
import { CALENDAR_NATURAL_INTEGRATION_DETAILS, CALENDAR_NATURAL_INTEGRATION_ITEMS, CALENDAR_NATURAL_PLAN } from './data/naturalCalendar';
import { isListeningTestBookTitle, LISTENING_TEST_BOOK_TITLE, LISTENING_TEST_MAX } from './data/englishBooks';
import {
  AZAR_GRAMMAR_BOOK_TITLE,
  azarGrammarPageSummary,
  isAzarGrammarBookTitle,
} from './data/azarGrammar';
import {
  bookDetails,
  bookDetailsForTopic,
  bookPageDetailText,
  bookPageText,
  bookPageTopicText,
  bookTopics,
  canonicalPageMappedBook,
  CHINESE_TOPIC_BOOK,
  DEEP_FIFTEEN_BOOK,
  ENGLISH_TOPIC_CLOZE_BOOK,
  ENGLISH_TOPIC_READING_BOOK,
  ENGLISH_MIXED_30_BOOK,
  ENGLISH_WEEKLY_PLAN_BOOK,
  isEnglishPageMappedBook,
  pageMappedBookSubject,
} from './data/bookPageMaps';
import { LocalStudyRecordRepository } from './infrastructure/storage/localStudyRecordRepository';
import { SupabaseStudyRecordRepository } from './infrastructure/storage/supabaseStudyRecordRepository';
import { loadAllCalendarTaskRows } from './infrastructure/storage/supabaseCalendarTaskReader';
import { buildCalendarStudyTaskPlan } from './application/calendar/calendarStudyTaskService';
import { createClient } from '@supabase/supabase-js';
import { parseProgressImportText, progressImportBackupPayload, progressImportResultText } from './application/progressImport';

var DAILY_PRESET_START='2026-08-10';
var MIXED_WRITING_START='2026-08-11';
var CALENDAR_IMPORT_AS_OF='2026-08-17';
var CALENDAR_MATH_UNIT_TARGET_OVERRIDES={"3A｜指數函數與對數函數":60};
var CALENDAR_NATURAL_RECOMMENDED_PAGES={
 "2026-08-17":{
  subject:"生物",material:'123日的淬鍊',ranges:[[4, 7]],
  label:"細胞是生命系統的基本單位",basis:"細胞學說、細胞大小與種類、原核／真核比較；p.8 起進入胞器。"
 },
 "2026-08-18":{
  subject:"化學",material:'123日的淬鍊',ranges:[[9, 20]],
  label:"物質分類與粒子觀",basis:"物質的組成前段：純物質／混合物、元素／化合物及物理、化學變化。"
 },
 "2026-08-19":{
  subject:"生物",material:'123日的淬鍊',ranges:[[10, 13]],
  label:"細胞膜與膜運輸",basis:"細胞膜構造、膜蛋白與膜運輸相關內容。"
 },
 "2026-08-20":{
  subject:"物理",material:'123日的淬鍊',ranges:[[2, 19]],
  label:"量測、單位與圖表表達方式",basis:"Chapter 1 緒論：物理量、SI 單位、科學記號及基本資料表達。"
 },
 "2026-08-21":{
  subject:"生物",material:'123日的淬鍊',ranges:[[8, 13], [40, 43]],
  label:"胞器、尺度與構造功能",basis:"胞器功能與合作流程；另搭配顯微觀察相關頁面。"
 },
 "2026-08-24":{
  subject:"化學",material:'123日的淬鍊',ranges:[[45, 63]],
  label:"原子結構、同位素與週期表",basis:"Chapter 2 前段：原子結構、電子排列、同位素與週期性。"
 },
 "2026-08-25":{
  subject:"物理",material:'123日的淬鍊',ranges:[[20, 55]],
  label:"基本交互作用與受力模型",basis:"Chapter 2 物質的組成和交互作用，涵蓋基本交互作用與受力觀念。"
 },
 "2026-08-26":{
  subject:"生物",material:'123日的淬鍊',ranges:[[14, 15]],
  label:"酵素與反應速率",basis:"細胞代謝起始：酵素、活化能與代謝控制。"
 },
 "2026-08-27":{
  subject:"化學",material:'123日的淬鍊',ranges:[[64, 83]],
  label:"化學鍵與分子間作用力",basis:"Chapter 2 後段：鍵結、結構、作用力與物性。"
 },
 "2026-08-28":{
  subject:"生物",material:'123日的淬鍊',ranges:[[14, 15]],
  label:"ATP、氧化還原與代謝路徑",basis:"ATP 循環與細胞代謝能量耦合。"
 },
 "2026-08-31":{
  subject:"生物",material:'123日的淬鍊',ranges:[[16, 20]],
  label:"細胞呼吸",basis:"細胞呼吸的主要階段、位置、物質流與 ATP。"
 },
 "2026-09-01":{
  subject:"化學",material:'123日的淬鍊',ranges:[[97, 112]],
  label:"化學式、反應式與守恆",basis:"Chapter 3 前段：化學式、反應式、計量與守恆。"
 },
 "2026-09-02":{
  subject:"生物",material:'123日的淬鍊',ranges:[[16, 20]],
  label:"光合作用",basis:"光合作用光反應、碳反應與限制因子。"
 },
 "2026-09-03":{
  subject:"物理",material:'123日的淬鍊',ranges:[[184, 199]],
  label:"功、能量、功率與效率",basis:"Chapter 6 前段：功、動能、位能、功率及能量轉換。"
 },
 "2026-09-04":{
  subject:"化學",material:'123日的淬鍊',ranges:[[113, 128]],
  label:"反應熱、能量圖與催化",basis:"Chapter 3 後段：反應熱、活化能、能量圖與催化。"
 },
 "2026-09-05":{
  subject:"生物",material:'123日的淬鍊',ranges:[[16, 21]],
  label:"呼吸與光合作用比較",basis:"兩種代謝作用的物質流、能量流、胞器位置與比較。"
 },
 "2026-09-07":{
  subject:"物理",material:'123日的淬鍊',ranges:[[56, 75]],
  label:"位置、速度、加速度圖",basis:"Chapter 3 前段：運動描述、x-t／v-t／a-t 圖及斜率、面積。"
 },
 "2026-09-08":{
  subject:"物理",material:'123日的淬鍊',ranges:[[76, 97]],
  label:"牛頓定律、摩擦與圓周運動",basis:"Chapter 3 中段：受力、牛頓定律、摩擦與圓周運動。"
 },
 "2026-09-09":{
  subject:"化學",material:'123日的淬鍊',ranges:[[130, 145]],
  label:"溶液濃度、溶解度與稀釋",basis:"Chapter 4 前段：溶液分類、濃度表示、溶解度與稀釋。"
 },
 "2026-09-10":{
  subject:"生物",material:'123日的淬鍊',ranges:[[24, 33]],
  label:"細胞週期、有絲分裂與減數分裂",basis:"染色體、細胞週期、有絲分裂、減數分裂與配子形成。"
 },
 "2026-09-11":{
  subject:"物理",material:'123日的淬鍊',ranges:[[98, 113]],
  label:"動量、衝量與碰撞",basis:"Chapter 3 後段：動量、衝量、碰撞與守恆條件。"
 },
 "2026-09-14":{
  subject:"物理",material:'123日的淬鍊',ranges:[[144, 157]],
  label:"波的描述與傳播",basis:"Chapter 5 前段：週期、頻率、波長、波速、相位與波的傳播。"
 },
 "2026-09-15":{
  subject:"物理",material:'123日的淬鍊',ranges:[[158, 183]],
  label:"聲音、干涉、繞射與光",basis:"Chapter 5 後段：聲音、反射／折射、干涉、繞射與光的波動現象。"
 },
 "2026-09-16":{
  subject:"生物",material:'123日的淬鍊',ranges:[[74, 77]],
  label:"DNA 結構與複製",basis:"DNA／RNA 結構與 DNA 複製。"
 },
 "2026-09-17":{
  subject:"生物",material:'123日的淬鍊',ranges:[[78, 81]],
  label:"轉錄、轉譯與基因表現",basis:"中心法則、轉錄、轉譯與蛋白質合成。"
 },
 "2026-09-18":{
  subject:"化學",material:'123日的淬鍊',ranges:[[146, 158]],
  label:"水溶液離子、酸鹼與中和",basis:"Chapter 4 中段：電解質、酸鹼、pH 與中和。"
 },
 "2026-09-19":{
  subject:"地科",material:'123日的淬鍊',ranges:[[4, 31]],
  label:"地球形成、定年與太陽系",basis:"地球形成與定年 p.4–13；太陽系及其運動 p.14–31。"
 },
 "2026-09-21":{
  subject:"物理",material:'123日的淬鍊',ranges:[[114, 127]],
  label:"電場、電位與基本電路",basis:"Chapter 4 前段：電作用、電場／電位與基本電路概念。"
 },
 "2026-09-22":{
  subject:"物理",material:'123日的淬鍊',ranges:[[128, 143]],
  label:"磁場、電磁感應與電磁波",basis:"Chapter 4 後段：磁場、感應、發電／馬達與電磁波。"
 },
 "2026-09-23":{
  subject:"生物",material:'123日的淬鍊',ranges:[[60, 63]],
  label:"孟德爾遺傳與機率",basis:"孟德爾遺傳、分離律、獨立分配與遺傳格。"
 },
 "2026-09-24":{
  subject:"生物",material:'123日的淬鍊',ranges:[[64, 71]],
  label:"延伸遺傳、伴性與家系圖",basis:"多等位基因、延伸遺傳、伴性與家系判讀。"
 },
 "2026-09-25":{
  subject:"化學",material:'123日的淬鍊',ranges:[[159, 171]],
  label:"沉澱、氧化還原與電化學",basis:"Chapter 4 後段：離子反應、氧化還原與相關電化學判讀。"
 },
 "2026-09-26":{
  subject:"地科",material:'123日的淬鍊',ranges:[[66, 93]],
  label:"地震波、地球內部與板塊構造",basis:"地震波與地球內部分層 p.66–73；板塊構造 p.74–80；地質作用、臺灣板塊與地震 p.81–93。"
 },
 "2026-09-28":{
  subject:"生物",material:'123日的淬鍊',ranges:[[80, 93]],
  label:"突變、基因調控與生物技術",basis:"基因表現延伸、突變及重組 DNA／生物技術。"
 },
 "2026-09-29":{
  subject:"生物",material:'123日的淬鍊',ranges:[[114, 121]],
  label:"演化證據與天擇",basis:"演化學說、天擇與現代演化觀點。"
 },
 "2026-09-30":{
  subject:"生物",material:'123日的淬鍊',ranges:[[120, 135]],
  label:"物種形成、分類與親緣樹",basis:"物種形成、分類、生物多樣性與親緣關係。"
 },
 "2026-10-01":{
  subject:"地科",material:'123日的淬鍊',ranges:[[114, 167]],
  label:"大氣結構、濕度與天氣系統",basis:"大氣 Chapter 3：分層、濕度、水氣、水平運動、颱風、降雨與氣象觀測。"
 },
 "2026-10-02":{
  subject:"地科",material:'123日的淬鍊',ranges:[[170, 209], [212, 250]],
  label:"海洋、潮汐、氣候與永續",basis:"海洋 Chapter 4＋氣候變遷與永續發展 Chapter 5。"
 },
 "2026-10-03":{
  subject:"化學",material:'123日的淬鍊',ranges:[[173, 227]],
  label:"有機、材料、能源與環境化學",basis:"Chapter 5：有機物、材料／界面活性劑、能源、水與空氣、綠色化學。"
 },
 "2026-10-05":{
  subject:"生物",material:'123日的淬鍊',ranges:[[4, 21], [24, 33], [58, 93], [112, 135]],
  label:"生物高風險整合：細胞→代謝→遺傳→演化",basis:"以已安排過的細胞、代謝、遺傳與演化核心頁做整合回顧。"
 },
 "2026-10-06":{
  subject:"化學",material:'123日的淬鍊',ranges:[[9, 20], [45, 83], [97, 128], [130, 171], [173, 227]],
  label:"化學主線：粒子→鍵結→反應→溶液→環境",basis:"依前面各化學主題的核心建議頁做總複習。"
 },
 "2026-10-07":{
  subject:"物理",material:'123日的淬鍊',ranges:[[220, 244]],
  label:"物理主線＋原子現象",basis:"優先補 Chapter 7 量子／原子現象，再以題目整合前面物理主線。"
 },
 "2026-10-08":{
  subject:"地科",material:'123日的淬鍊',ranges:[[4, 38], [66, 93], [114, 167], [170, 209], [212, 250]],
  label:"地球系統：天文→固體地球→大氣海洋→氣候",basis:"地科五大主線核心頁整合。"
 },
 "2026-10-19":{
  subject:"生物",material:'123日的淬鍊',ranges:[[4, 21]],
  label:"細胞結構→膜運輸→代謝整合",basis:"Chapter 1 前段的細胞結構、膜運輸與代謝核心頁。"
 },
 "2026-10-20":{
  subject:"化學",material:'123日的淬鍊',ranges:[[9, 20], [45, 83]],
  label:"粒子觀→原子→鍵結→物性",basis:"Chapter 1 粒子觀＋Chapter 2 原子結構、鍵結與物性。"
 },
 "2026-10-21":{
  subject:"物理",material:'123日的淬鍊',ranges:[[20, 55], [56, 113], [184, 199]],
  label:"受力→運動→能量與動量",basis:"交互作用、運動與機械能核心頁整合。"
 },
 "2026-10-22":{
  subject:"生物",material:'123日的淬鍊',ranges:[[24, 33], [74, 81]],
  label:"細胞週期→DNA→基因表現",basis:"細胞分裂與遺傳分子機制核心頁。"
 },
 "2026-10-23":{
  subject:"地科",material:'123日的淬鍊',ranges:[[4, 31], [66, 93]],
  label:"地球形成→定年→地震波與板塊",basis:"探索地球＋固體地球核心頁整合。"
 },
 "2026-10-26":{
  subject:"生物",material:'123日的淬鍊',ranges:[[28, 33], [60, 71], [84, 93]],
  label:"減數分裂→孟德爾→家系與生技",basis:"減數分裂、遺傳法則、延伸遺傳與生技核心頁。"
 },
 "2026-10-27":{
  subject:"化學",material:'123日的淬鍊',ranges:[[97, 128], [130, 171], [173, 227]],
  label:"反應守恆→水溶液→氧化還原與環境",basis:"Chapter 3–5 的反應、溶液、氧化還原與環境核心頁。"
 },
 "2026-10-28":{
  subject:"物理",material:'123日的淬鍊',ranges:[[114, 143], [144, 183], [220, 244]],
  label:"波→光→電磁→原子現象",basis:"電磁、波動與量子／原子現象核心頁整合。"
 },
 "2026-10-29":{
  subject:"地科",material:'123日的淬鍊',ranges:[[114, 167], [170, 209], [212, 250]],
  label:"大氣→海洋→氣候與永續",basis:"大氣、海洋與氣候變遷三大主線整合。"
 },
 "2026-10-30":{
  subject:"生物",material:'123日的淬鍊',ranges:[[80, 93], [112, 135]],
  label:"遺傳變異→天擇→演化與親緣",basis:"遺傳變異與演化、物種形成、親緣核心頁整合。"
 }
};

var storagePersistent=true;
var store=(function(){
 try{
  var testKey='study-v11:storage-test';
  window.localStorage.setItem(testKey,'1');window.localStorage.removeItem(testKey);
  return window.localStorage;
 }catch(e){
  storagePersistent=false;
  var memory={};
  return{
   get length(){return Object.keys(memory).length},
   key:function(index){return Object.keys(memory)[index]||null},
   getItem:function(k){return Object.prototype.hasOwnProperty.call(memory,k)?memory[k]:null},
   setItem:function(k,v){memory[String(k)]=String(v)},
   removeItem:function(k){delete memory[String(k)]}
  };
 }
})();
var STORE_PREFIX=storagePrefixForUser(null);
var localRecordRepository=new LocalStudyRecordRepository(store,STORE_PREFIX);
try{store.setItem(ACTIVE_RECORD_PREFIX_KEY,STORE_PREFIX)}catch(e){}
var weekdays=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
var labels={mathStudy:'數學講義：進度',mathLecture:'數學講義',mathPractice:'數學講義題目：理解檢查＋錯題標記＋訂正',mathOral:'數 A 互動題：觀念題',magazine:'英文雜誌',englishPractice:'英文互動題：英聽及學測練習',englishMixedWriting:'英文：混合題與作文練習',chineseReading:'國文',aceReading:'英文：ACE Reading',scienceReview:'自然',mock:'歷屆／模考',general:'一般學習／整理',extra:'英文',interactive:'互動題',interactiveDaily:'互動題',biologyInteractive:'生物互動題',englishVocabInteractive:'英文單字／片語互動題',calendarStudy:'Google Calendar 排程'};
var TRAUMALAND_TOPICS=[{"chapter":1,"title":"MY OVERWHELMING EMPTINESS"},{"chapter":2,"title":"GHOST VAMPIRE"},{"chapter":3,"title":"DING-DONG"},{"chapter":4,"title":"FEEL ALIVE"},{"chapter":5,"title":"THUNDERCLAP"},{"chapter":6,"title":"6 (66)"},{"chapter":7,"title":"BIRD IN FLIGHT"},{"chapter":8,"title":"THE INCIDENT"},{"chapter":9,"title":"PART OF"},{"chapter":10,"title":"GUESS WHO?"},{"chapter":11,"title":"PISTACHIO ICE CREAM"},{"chapter":12,"title":"NDA"},{"chapter":13,"title":"TO FEEL IS TO LIVE"},{"chapter":14,"title":"NO AIR"},{"chapter":15,"title":"THE SOLAR SYSTEM"},{"chapter":16,"title":"WONKY"},{"chapter":17,"title":"POLLY’S"},{"chapter":18,"title":"LIKE CRY, OR LIKE RIP"},{"chapter":19,"title":"USABLE"},{"chapter":20,"title":"SYCAMORE"},{"chapter":21,"title":"CLASSIFIED"},{"chapter":22,"title":"A BRIGHT FUTURE"},{"chapter":23,"title":"MARKED *ANONYMOUS*"},{"chapter":24,"title":"IN CASE OF EMERGENCY"},{"chapter":25,"title":"A STORY"},{"chapter":26,"title":"TURNING TIDES"},{"chapter":27,"title":"DECEPTIVE AND UNRELIABLE"},{"chapter":28,"title":"HELL"},{"chapter":29,"title":"FIND YOURSELF"},{"chapter":30,"title":"PRAYING TO THE STARS"},{"chapter":31,"title":"OK. OK. OK."},{"chapter":32,"title":"PSYCHO"},{"chapter":33,"title":"THE GREATER GOOD"},{"chapter":34,"title":"THE OMEN"},{"chapter":35,"title":"CLINIC ROOM 2"},{"chapter":36,"title":"FAITH IN GOODNESS"}];

var REVIEW_WEEKLY_PAGE_MAP=[
 [2,7,'數與式'],
 [8,13,'直線與圓'],
 [14,20,'多項式函數'],
 [21,25,'第一冊混合題專區'],
 [26,32,'第一冊複習'],
 [33,40,'數列與級數、數據分析'],
 [41,48,'排列組合與機率'],
 [49,55,'三角比'],
 [56,59,'第二冊混合題專區'],
 [60,66,'第一至二冊複習'],
 [67,72,'三角函數'],
 [73,78,'指數、對數函數'],
 [79,84,'平面向量'],
 [85,88,'第三冊混合題專區'],
 [89,95,'第一至三冊複習'],
 [96,100,'空間向量'],
 [101,106,'條件機率與貝氏定理'],
 [107,114,'矩陣'],
 [115,118,'第四冊混合題專區'],
 [119,125,'學測全範圍'],
 [126,132,'學測全範圍']
];
var SMART_34_PAGE_MAP=[
 [5,36,'三角函數'],
 [37,65,'指數與對數函數'],
 [66,95,'平面向量'],
 [96,122,'空間向量'],
 [123,145,'空間中的平面與直線'],
 [146,166,'條件機率與貝氏定理'],
 [167,198,'矩陣'],
 [199,213,'B版補充教材'],
 [214,217,'115學測試題數學A']
];
var SMART_12_PAGE_MAP=[
 [5,25,'實數與指對數'],
 [26,54,'直線與圓'],
 [55,86,'多項式函數'],
 [87,108,'數列與級數'],
 [109,130,'數據分析'],
 [131,164,'排列組合與機率'],
 [165,99999,'三角比']
];
var GOODPOINT_PHYSICS_CHAPTER_MAP=[
 [6,8,'物理簡史'],
 [9,10,'國際單位 SI 制'],
 [11,11,'考點大補丸'],
 [12,13,'選擇題型當場練'],
 [14,14,'混合非選搶分數'],
 [15,17,'物體運動的 x-t 圖'],
 [18,20,'物體運動的 v-t 圖'],
 [21,22,'物體運動的 a-t 圖'],
 [23,24,'直線等加速度運動'],
 [25,26,'考點大補丸'],
 [27,31,'選擇題型當場練'],
 [32,34,'混合非選搶分數'],
 [35,37,'牛頓第一運動定律'],
 [38,39,'牛頓第二運動定律'],
 [40,41,'終端速度'],
 [42,43,'電梯中的體重問題'],
 [44,45,'牛頓第三運動定律'],
 [46,47,'考點大補丸'],
 [48,53,'選擇題型當場練'],
 [54,55,'混合非選搶分數'],
 [56,57,'重力的基本概念'],
 [58,61,'重力場問題的解法'],
 [62,63,'失重狀態'],
 [64,65,'考點大補丸'],
 [66,69,'選擇題型當場練'],
 [70,71,'混合非選搶分數'],
 [72,74,'日心說與克卜勒定律'],
 [75,78,'克卜勒第一、二定律'],
 [79,80,'克卜勒第三定律'],
 [81,82,'衛星運動'],
 [83,84,'考點大補丸'],
 [85,89,'選擇題型當場練'],
 [90,91,'混合非選搶分數'],
 [92,94,'波的基本性質'],
 [95,96,'波的反射'],
 [97,98,'波的折射'],
 [99,101,'波的繞射與干涉'],
 [102,104,'都卜勒效應'],
 [105,108,'考點大補丸'],
 [109,116,'選擇題型當場練'],
 [117,118,'混合非選搶分數'],
 [119,121,'庫侖定律'],
 [122,123,'靜電感應'],
 [124,125,'磁場與磁力線'],
 [126,127,'考點大補丸'],
 [128,130,'選擇題型當場練'],
 [131,131,'混合非選搶分數'],
 [132,134,'電流磁效應'],
 [135,138,'電磁感應'],
 [139,140,'電磁感應的應用'],
 [141,143,'電磁波'],
 [144,145,'考點大補丸'],
 [146,152,'選擇題型當場練'],
 [153,154,'混合非選搶分數'],
 [155,157,'原子結構的探索'],
 [158,159,'強作用與弱作用'],
 [160,161,'原子核的衰變'],
 [162,162,'考點大補丸'],
 [163,167,'選擇題型當場練'],
 [168,169,'混合非選搶分數'],
 [170,172,'功與功率'],
 [173,176,'動能與位能'],
 [177,179,'溫度與熱能'],
 [180,182,'核反應與核能'],
 [183,185,'能量轉換'],
 [186,189,'考點大補丸'],
 [190,195,'選擇題型當場練'],
 [196,197,'混合非選搶分數'],
 [198,201,'光電效應'],
 [202,203,'物質波'],
 [204,207,'原子光譜與氫原子模型'],
 [208,209,'考點大補丸'],
 [210,214,'選擇題型當場練'],
 [215,217,'混合非選搶分數'],
 [218,223,'115年學測試題']
];
var GOODPOINT_CHEMISTRY_CHAPTER_MAP=[
 [6,7,'實驗室的器材與守則'],
 [8,10,'氣體的製備與收集'],
 [11,13,'考點大補丸'],
 [14,18,'選擇題型當場練'],
 [19,22,'混合非選搶分數'],
 [23,25,'物質的狀態'],
 [26,27,'物質的分離'],
 [28,30,'層析操作方法'],
 [31,35,'考點大補丸'],
 [36,44,'選擇題型當場練'],
 [45,48,'混合非選搶分數'],
 [49,52,'質量守恆、定比定律與倍比定律'],
 [53,54,'原子結構與電子排列'],
 [55,58,'週期表與元素週期性'],
 [59,60,'考點大補丸'],
 [61,65,'選擇題型當場練'],
 [66,68,'混合非選搶分數'],
 [69,71,'化學鍵與物質的特性'],
 [72,73,'分子物質之路易斯結構'],
 [74,76,'化學式的種類與化學式求法'],
 [77,79,'考點大補丸'],
 [80,85,'選擇題型當場練'],
 [86,89,'混合非選搶分數'],
 [90,91,'反應式的意義與平衡'],
 [92,93,'化學計量'],
 [94,95,'化學反應熱'],
 [96,96,'考點大補丸'],
 [97,102,'選擇題型當場練'],
 [103,105,'混合非選搶分數'],
 [106,107,'溶液的特性與濃度計算'],
 [108,110,'溶解度的表示與圖表判讀'],
 [111,112,'考點大補丸'],
 [113,117,'選擇題型當場練'],
 [118,120,'混合非選搶分數'],
 [121,123,'酸鹼的特性'],
 [124,127,'酸鹼計算、酸鹼指示劑與酸鹼中和'],
 [128,130,'選擇題型當場練'],
 [131,134,'混合非選搶分數'],
 [135,137,'氧化還原反應的判斷'],
 [138,139,'氧化劑與還原劑的判斷'],
 [140,143,'選擇題型當場練'],
 [144,146,'混合非選搶分數'],
 [147,149,'生物體內的有機物'],
 [150,152,'藥品與界面活性劑'],
 [153,154,'考點大補丸'],
 [155,159,'選擇題型當場練'],
 [160,162,'混合非選搶分數'],
 [163,165,'水的處理與空氣污染'],
 [166,167,'現代科技與綠色化學'],
 [168,170,'考點大補丸'],
 [171,174,'選擇題型當場練'],
 [175,178,'混合非選搶分數'],
 [179,184,'115學測試題']
];
var GOODPOINT_PHYSICS_PAGE_MAP=[
 [6,14,'物理簡史與國際單位制'],
 [15,34,'物體的運動'],
 [35,55,'牛頓運動定律'],
 [56,71,'重力'],
 [72,91,'克卜勒行星運動定律'],
 [92,118,'波的性質'],
 [119,131,'靜電力與磁力'],
 [132,154,'電與磁的統一'],
 [155,169,'原子與原子核'],
 [170,197,'功與能量'],
 [198,223,'量子現象']
];
var GOODPOINT_CHEMISTRY_PAGE_MAP=[
 [6,22,'基礎實驗觀念與氣體製備'],
 [23,48,'物質的狀態與物質分離'],
 [49,68,'基本定律、原子結構與週期表'],
 [69,89,'化學鍵與化學式'],
 [90,105,'化學反應式與能量變化'],
 [106,120,'溶液的性質'],
 [121,134,'酸鹼反應'],
 [135,146,'氧化還原反應'],
 [147,162,'生物、有機化學'],
 [163,184,'永續化學']
];
var TEACHING_MATH_PAGE_MAP={
 '1':[
  [1,15,'數與式','實數'],[16,33,'數與式','絕對值'],[34,43,'數與式','式的運算'],[44,67,'數與式','指數與對數'],
  [68,76,'數與式','綜合練習／實戰演練'],
  [77,98,'直線與圓','直線方程式'],[99,120,'直線與圓','直線方程式的應用'],[121,140,'直線與圓','圓與直線的關係'],
  [141,148,'直線與圓','綜合練習／實戰演練'],
  [149,172,'多項式函數','多項式及其運算'],[173,197,'多項式函數','簡單多項式函數及其圖形'],[198,221,'多項式函數','多項不等式']
 ],
 '2':[
  [1,22,'數列與級數','數列與遞迴關係'],[23,41,'數列與級數','級數'],[42,52,'數列與級數','綜合練習／實戰演練'],
  [53,72,'數據分析','一維數據分析'],[73,92,'數據分析','二維數據分析'],[93,106,'數據分析','綜合練習／實戰演練'],
  [107,132,'排列組合','集合與計數原理'],[133,148,'排列組合','排列'],[149,166,'排列組合','組合與二項式定理'],[167,178,'排列組合','綜合練習／實戰演練'],
  [179,197,'古典機率','機率的定義與性質'],[198,207,'古典機率','期望值'],[208,218,'古典機率','綜合練習／實戰演練'],
  [219,237,'三角','直角三角形的三角比'],[238,260,'三角','廣義角與極坐標'],[261,279,'三角','正弦定理與餘弦定理']
 ],
 '3A':[
  [1,11,'三角函數','弧度量'],[12,32,'三角函數','三角函數的圖形及其運用'],[33,49,'三角函數','三角的和角與差角公式'],[50,63,'三角函數','正餘弦的疊合'],
  [64,78,'三角函數','綜合練習／實戰演練'],
  [79,103,'指數函數與對數函數','指數函數'],[104,118,'指數函數與對數函數','對數律'],[119,135,'指數函數與對數函數','對數函數'],
  [136,148,'指數函數與對數函數','綜合練習／實戰演練'],
  [149,172,'平面向量','平面向量的表示法'],[173,194,'平面向量','平面向量的內積'],[195,210,'平面向量','面積與二階行列式']
 ],
 '4A':[
  [1,20,'空間向量','空間概念'],[21,37,'空間向量','空間向量的坐標表示法'],[38,52,'空間向量','空間向量的內積'],[53,70,'空間向量','外積與行列式'],
  [71,86,'空間向量','綜合練習／實戰演練'],
  [87,103,'空間中的平面與直線','空間中的平面方程式'],[104,135,'空間中的平面與直線','空間中的直線方程式'],
  [136,150,'空間中的平面與直線','綜合練習／實戰演練'],
  [151,167,'條件機率與貝式定理','條件機率與獨立事件'],[168,180,'條件機率與貝式定理','貝式定理'],
  [181,196,'條件機率與貝式定理','綜合練習／實戰演練'],
  [197,221,'矩陣','線性方程組與矩陣列運算'],[222,249,'矩陣','矩陣的運算'],[250,275,'矩陣','矩陣的應用']
 ]
};
var CALENDAR_GRAMMAR_PLAN={"2026-08-20":{"title":"Ch.1 英文基本句型（1／2）","start":1,"end":6,"rangeText":"p.1–6","rangeType":"range","focus":"Vi／Vt；S＋Vi；S＋Vi＋SC；S＋Vt＋O"},"2026-08-22":{"title":"Ch.1 英文基本句型（2／2）","start":7,"end":11,"rangeText":"p.7–11","rangeType":"range","focus":"IO／DO、OC 與五大句型綜合辨識"},"2026-08-25":{"title":"Ch.2 動詞時態（1／3）","start":12,"end":17,"rangeText":"p.12–17","rangeType":"range","focus":"現在簡單式、進行式、完成式、完成進行式"},"2026-08-27":{"title":"Ch.2 動詞時態（2／3）","start":18,"end":22,"rangeText":"p.18–22","rangeType":"range","focus":"過去簡單式、進行式、完成式、完成進行式"},"2026-08-29":{"title":"Ch.2 動詞時態（3／3）","start":23,"end":27,"rangeText":"p.23–27","rangeType":"range","focus":"未來簡單式、進行式、完成式、完成進行式與其他時態要點"},"2026-09-01":{"title":"Ch.5 主詞與動詞一致（1／2）","start":64,"end":70,"rangeText":"p.64–70","rangeType":"range","focus":"主詞之後接單複數動詞的基本情形（一）～（三）"},"2026-09-03":{"title":"Ch.5 主詞與動詞一致（2／2）","start":71,"end":77,"rangeText":"p.71–77","rangeType":"range","focus":"依主詞意義與連接詞判斷單複數；關係子句配合"},"2026-09-05":{"title":"Ch.3 被動語態（1／3）","start":28,"end":33,"rangeText":"p.28–33","rangeType":"range","focus":"簡單式、進行式、完成式與助動詞的被動語態"},"2026-09-08":{"title":"Ch.3 被動語態（2／3）","start":34,"end":39,"rangeText":"p.34–39","rangeType":"range","focus":"不能被動的動詞、感官動詞、使役動詞與主動表被動"},"2026-09-10":{"title":"Ch.3 被動語態（3／3）＋Review 1","start":40,"end":47,"rangeText":"p.40–47","rangeType":"range","focus":"慣用被動、表客觀說法、by 片語省略與 Ch.1–3 回顧"},"2026-09-12":{"title":"Ch.4 助動詞（1／3）","start":48,"end":53,"rangeText":"p.48–53","rangeType":"range","focus":"do、have／has／had、shall／should／ought to"},"2026-09-15":{"title":"Ch.4 助動詞（2／3）","start":54,"end":58,"rangeText":"p.54–58","rangeType":"range","focus":"will／would、may／might、can／could"},"2026-09-17":{"title":"Ch.4 助動詞（3／3）","start":59,"end":63,"rangeText":"p.59–63","rangeType":"range","focus":"must、need／dare、used to／had better"},"2026-09-19":{"title":"Ch.10 不定詞（1／3）","start":143,"end":148,"rangeText":"p.143–148","rangeType":"range","focus":"不定詞作主詞、受詞、補語；疑問詞＋不定詞"},"2026-09-22":{"title":"Ch.10 不定詞（2／3）","start":149,"end":153,"rangeText":"p.149–153","rangeType":"range","focus":"不定詞作形容詞；作副詞表示目的與否定目的"},"2026-09-24":{"title":"Ch.10 不定詞（3／3）","start":154,"end":158,"rangeText":"p.154–158","rangeType":"range","focus":"結果用法、修飾形容詞與獨立不定詞片語"},"2026-09-26":{"title":"Ch.11 動名詞（1／2）","start":159,"end":166,"rangeText":"p.159–166","rangeType":"range","focus":"動名詞作主詞、補語、受詞；動名詞與不定詞比較"},"2026-09-29":{"title":"Ch.11 動名詞（2／2）","start":167,"end":173,"rangeText":"p.167–173","rangeType":"range","focus":"意義不同／相同的動詞搭配、介系詞 to＋V-ing、慣用語"},"2026-10-01":{"title":"Ch.12 分詞（1／3）","start":174,"end":179,"rangeText":"p.174–179","rangeType":"range","focus":"分詞的功用、情緒分詞、形容詞子句簡化"},"2026-10-03":{"title":"Ch.12 分詞（2／3）","start":180,"end":185,"rangeText":"p.180–185","rangeType":"range","focus":"同主詞副詞子句簡化：簡單、完成、被動、否定與保留連接詞"},"2026-10-06":{"title":"Ch.12 分詞（3／3）＋Review 4","start":186,"end":192,"rangeText":"p.186–192","rangeType":"range","focus":"不同主詞分詞構句、對等句簡化、with、複合形容詞與 Ch.10–12 回顧"},"2026-10-08":{"title":"Ch.7 名詞子句（1／2）","start":92,"end":97,"rangeText":"p.92–97","rangeType":"range","focus":"that 與 whether 名詞子句：主詞、受詞、補語、同位語"},"2026-10-10":{"title":"Ch.7 名詞子句（2／2）","start":98,"end":102,"rangeText":"p.98–102","rangeType":"range","focus":"wh- 疑問詞子句、wh-ever 子句與相關句型"},"2026-10-13":{"title":"Ch.8 形容詞子句（1／3）","start":103,"end":108,"rangeText":"p.103–108","rangeType":"range","focus":"關係代名詞作主格、受格、所有格；介系詞＋關係代名詞"},"2026-10-15":{"title":"Ch.8 形容詞子句（2／3）","start":109,"end":114,"rangeText":"p.109–114","rangeType":"range","focus":"限定／非限定用法、that、when／where／why／how"},"2026-10-20":{"title":"Ch.8 形容詞子句（3／3）","start":115,"end":120,"rangeText":"p.115–120","rangeType":"range","focus":"準關係代名詞、what／wh-ever 與形容詞子句簡化"},"2026-10-22":{"title":"Ch.9 副詞子句（1／3）","start":121,"end":127,"rangeText":"p.121–127","rangeType":"range","focus":"對等連接詞／連接詞組與表時間的連接詞"},"2026-10-24":{"title":"Ch.9 副詞子句（2／3）","start":128,"end":133,"rangeText":"p.128–133","rangeType":"range","focus":"表條件、原因與目的的連接詞"},"2026-10-27":{"title":"Ch.9 副詞子句（3／3）","start":134,"end":139,"rangeText":"p.134–139","rangeType":"range","focus":"表讓步與狀態的連接詞；副詞子句綜合判讀"},"2026-10-29":{"title":"Review 3（Ch.7–9）","start":140,"end":142,"rangeText":"p.140–142","rangeType":"range","focus":"名詞、形容詞與副詞子句混合複習＋訂正"},"2026-10-31":{"title":"Ch.6 假設語氣（1／2）","start":78,"end":83,"rangeText":"p.78–83","rangeType":"range","focus":"與現在、過去、未來事實相反；省略 if"},"2026-11-03":{"title":"Ch.6 假設語氣（2／2）＋Review 2","start":84,"end":91,"rangeText":"p.84–91","rangeType":"range","focus":"if only、as if、若非、建議／必要與省略 should；Ch.4–6 回顧"},"2026-11-05":{"title":"Ch.13 形容詞與副詞（1／3）","start":193,"end":200,"rangeText":"p.193–200","rangeType":"range","focus":"形容詞位置與用法；修飾可數／不可數名詞的數量形容詞"},"2026-11-07":{"title":"Ch.13 形容詞與副詞（2／3）","start":201,"end":208,"rangeText":"p.201–208","rangeType":"range","focus":"比較級／最高級構成；原級與比較級句型"},"2026-11-10":{"title":"Ch.13 形容詞與副詞（3／3）","start":209,"end":216,"rangeText":"p.209–216","rangeType":"range","focus":"最高級句型、副詞種類與形容詞／副詞搭配"},"2026-11-12":{"title":"Ch.14 代名詞（1／3）","start":217,"end":223,"rangeText":"p.217–223","rangeType":"range","focus":"人稱、反身與所有代名詞"},"2026-11-14":{"title":"Ch.14 代名詞（2／3）","start":224,"end":230,"rangeText":"p.224–230","rangeType":"range","focus":"指示代名詞與不定代名詞（一）"},"2026-11-17":{"title":"Ch.14 代名詞（3／3）","start":231,"end":237,"rangeText":"p.231–237","rangeType":"range","focus":"不定代名詞（二）、one／other／another 與疑問代名詞"},"2026-11-19":{"title":"Ch.15 否定句與倒裝句（1／3）","start":238,"end":243,"rangeText":"p.238–243","rangeType":"range","focus":"雙重否定、部分否定；否定副詞與 only 置首倒裝"},"2026-11-21":{"title":"Ch.15 否定句與倒裝句（2／3）","start":244,"end":249,"rangeText":"p.244–249","rangeType":"range","focus":"地方副詞、假設語氣、so／such…that 與主詞補語倒裝"},"2026-11-24":{"title":"Ch.15 否定句與倒裝句（3／3）","start":250,"end":254,"rangeText":"p.250–254","rangeType":"range","focus":"倒裝整合、感嘆句與附加問句"},"2026-11-26":{"title":"Review 5（Ch.13–15）","start":255,"end":null,"rangeText":"p.255 起","rangeType":"from","focus":"形容詞／副詞、代名詞、否定與倒裝綜合複習＋訂正"},"2026-11-28":{"title":"全冊總複習與錯題回收","start":1,"end":null,"rangeText":"全冊 Ch.1–15","rangeType":"whole","focus":"重做錯題；優先回收 be 動詞、時態／被動、to V／V-ing、三大子句與倒裝"}};

var CALENDAR_WRITING_TEST_PLAN={"2026-08-21":{"round":17,"focus":"基礎連接詞"},"2026-08-24":{"round":19,"focus":"原因、結果與條件"},"2026-08-26":{"round":1,"focus":"讓步、原因與條件"},"2026-08-28":{"round":4,"focus":"條件、替代與時間"},"2026-08-31":{"round":6,"focus":"時間、結果與並列"},"2026-09-02":{"round":23,"focus":"條件、結果與關係詞"},"2026-09-04":{"round":7,"focus":"倍數、同級與條件"},"2026-09-07":{"round":5,"focus":"助動詞、偏好與並列"},"2026-09-09":{"round":8,"focus":"感官、比較與 too...to"},"2026-09-11":{"round":26,"focus":"轉折、結果與偏好"},"2026-09-14":{"round":15,"focus":"使役、感官與慣用語"},"2026-09-16":{"round":18,"focus":"動名詞與介系詞"},"2026-09-18":{"round":9,"focus":"分詞構句與目的"},"2026-09-21":{"round":10,"focus":"結果句型與分詞構句"},"2026-09-23":{"round":11,"focus":"結果句型與偏好"},"2026-09-25":{"round":24,"focus":"不定詞與重要搭配"},"2026-09-28":{"round":29,"focus":"分詞、比較與目的"},"2026-09-30":{"round":30,"focus":"分詞構句與 otherwise"},"2026-10-02":{"round":33,"focus":"目的、不定詞與 help"},"2026-10-05":{"round":34,"focus":"倒裝、比較與形式主詞"},"2026-10-07":{"round":36,"focus":"受詞補語與動詞搭配"},"2026-10-09":{"round":37,"focus":"動詞搭配與助動詞"},"2026-10-12":{"round":38,"focus":"pay／see／take 搭配"},"2026-10-14":{"round":39,"focus":"spend／find it／prefer"},"2026-10-16":{"round":40,"focus":"原因、疑問詞與 too...to"},"2026-10-19":{"round":2,"focus":"關係副詞與成對連接"},"2026-10-21":{"round":3,"focus":"that／who／when 子句"},"2026-10-23":{"round":12,"focus":"whose 與 lest"},"2026-10-26":{"round":14,"focus":"關係詞與受詞補語"},"2026-10-28":{"round":16,"focus":"since／while 與形式主詞"},"2026-10-30":{"round":20,"focus":"原因、讓步與關係子句"},"2026-11-02":{"round":21,"focus":"關係結構與結果句型"},"2026-11-04":{"round":22,"focus":"whose／when／if 子句"},"2026-11-06":{"round":25,"focus":"關係副詞與時間子句"},"2026-11-09":{"round":27,"focus":"關係代名詞與成對連接"},"2026-11-11":{"round":28,"focus":"關係副詞與否定時間"},"2026-11-13":{"round":31,"focus":"關係子句與補充連接"},"2026-11-16":{"round":13,"focus":"Only when 倒裝與讓步"},"2026-11-18":{"round":32,"focus":"倒裝、關係詞與比較"},"2026-11-20":{"round":35,"focus":"雙重比較與轉折"}};

var EXTRA_READING_TITLES=[
 '雜誌',
 'ACE Reading',
 '大考英聽A攻略',
 AZAR_GRAMMAR_BOOK_TITLE,
 ENGLISH_TOPIC_READING_BOOK,
 ENGLISH_TOPIC_CLOZE_BOOK,
 ENGLISH_WEEKLY_PLAN_BOOK,
 ENGLISH_MIXED_30_BOOK,
 '英文寫作測驗',
 '英文文法總複習講義',
 'Prism Reading',
 'Traumaland- Josh Silver',
 'Warriors- Erin Hunter',
 'NEW TOEIC 新制多益900+ 高頻必考字彙',
 '英文字彙王: 核心單字2001~ 4000',
 '英文字彙王: 核心單字4001~ 6000',
 'ENGLISH VOCABULARY IN USE',
 'Essential Grammar in Use',
 '學一次用一輩子的字首．字根．字尾'
];

var data=null;
var mathProgressIndex=new MathProgressIndex();
var pendingDeferredTargets={};
var deferredLimitPrompt=null;

var SUPABASE_URL='https://arxbirgujbrtzhoficdf.supabase.co';
var SUPABASE_PUBLISHABLE_KEY='sb_publishable_x8YXDSe-6rvX25o38jEl4w_OYn971PA';
var cloudClient=null;
var cloudRecordRepository=null;
var cloudUser=null;
var cloudLoading=false;
var cloudBootstrapPending=false;
var cloudSaveQueue=new LatestTaskQueue(450,async function(date,record){
 await withCloudDateLock(date,async function(){
  // localStorage is shared by tabs. Merge the enqueue-time copy with the copy
  // written by another tab so neither tab's recorded items can disappear.
  var latest=mergeStudyRecordsForUpload(readStoredRecord(date)||record,record);
  return cloudSaveRecord(latest);
 });
});
var cloudActivationSerial=0;
var cloudPullAllPromise=null;
var cloudManualSyncPending=false;
var cloudConflictDate='';
var periodicCloudSaveBusy=false;
var PERIODIC_CLOUD_SAVE_MS=10*60*1000;
var cloudHasError=false;
var cloudVisibleRefreshPending=false;
var deleteUndoState=null;
var deleteUndoTimer=null;
var DELETE_UNDO_MS=8000;

var calendarConnected=false;
var calendarCacheLoaded=false;
var calendarHasError=false;
var calendarParsedByDate={};
var cloudMathPlanByDate={};
var cloudMathPlansByDate={};
var cloudNaturalIntegrationItemsByDate={};
var cloudNaturalIntegrationDetailsByDate={};

function setStorageScope(userId){
 STORE_PREFIX=storagePrefixForUser(userId||null);
 localRecordRepository.setPrefix(STORE_PREFIX);
 try{store.setItem(ACTIVE_RECORD_PREFIX_KEY,STORE_PREFIX)}catch(e){}
 mathProgressIndex.replaceAll([]);
 data=null;
 updateImportBackupButton();
}
function currentStorageIsUserScoped(){return !!cloudUser&&STORE_PREFIX===storagePrefixForUser(cloudUser.id)}
function recordSyncWatermark(){
 if(!cloudUser)return null;
 try{return store.getItem(recordSyncWatermarkKey(cloudUser.id))}catch(e){return null}
}
function saveRecordSyncWatermark(value){
 if(!cloudUser||!value)return;
 try{store.setItem(recordSyncWatermarkKey(cloudUser.id),String(value))}catch(e){}
}
function setConnectionBadge(elementId,text,state){
 var badge=id(elementId);if(!badge)return;
 badge.textContent=text;badge.setAttribute('data-state',state||'offline');
}
function dirtyCloudDates(){
 if(!cloudUser||!currentStorageIsUserScoped())return[];
 return localStudyDates().filter(function(date){var rec=readStoredRecord(date);return !!rec&&!!rec.localDirty&&!rec.syncConflict});
}
function updateCloudStatusBadge(){
 if(!cloudUser){setConnectionBadge('cloudStatusBadge','本機模式','offline');return}
 if(cloudLoading||cloudBootstrapPending||cloudManualSyncPending){setConnectionBadge('cloudStatusBadge','同步中','busy');return}
 var pending=dirtyCloudDates().length;
 if(cloudHasError){setConnectionBadge('cloudStatusBadge',pending?'同步失敗・待 '+pending+' 天':'同步異常','error');return}
 if(pending){setConnectionBadge('cloudStatusBadge','待同步 '+pending+' 天','warning');return}
 setConnectionBadge('cloudStatusBadge','已同步','ok');
}
function cloudSetMessage(msg,ok){
 var el=id('cloudMessage');if(el)el.textContent=msg||'';
 if(ok===false)cloudHasError=true;else if(ok===true)cloudHasError=false;
 updateCloudStatusBadge();
}
function cloudUpdateUI(){
 var out=id('cloudLoggedOut'),inn=id('cloudLoggedIn');
 if(!out||!inn)return;
 out.hidden=!!cloudUser;inn.hidden=!cloudUser;
 id('cloudUserEmail').textContent=cloudUser?(cloudUser.email||'已登入'):'';
 updateCloudStatusBadge();
 updateCloudActionButtons();
 updateStorageRecoveryUI();
 calendarUpdateUI();
}
function cloneRecord(rec){
 try{return JSON.parse(JSON.stringify(rec))}catch(e){return rec}
}
function cloudDateLockName(date){
 return 'gsat-study-record:'+(cloudUser&&cloudUser.id?cloudUser.id:'guest')+':'+String(date||'');
}
function withCloudDateLock(date,task){return withCrossTabLock(cloudDateLockName(date),task)}
function updateCloudActionButtons(){
 var disabled=!cloudUser||cloudBootstrapPending||cloudManualSyncPending;
 var refresh=id('cloudRefreshBtn'),merge=id('cloudSyncLocalBtn'),keep=id('cloudKeepLocalBtn'),useCloud=id('cloudUseCloudBtn'),undo=id('cloudUndoConflictBtn');
 if(refresh){refresh.disabled=disabled;refresh.setAttribute('aria-busy',cloudManualSyncPending?'true':'false')}
 if(merge){merge.disabled=disabled;merge.setAttribute('aria-busy',cloudManualSyncPending?'true':'false')}
 if(keep)keep.disabled=disabled;
 if(useCloud)useCloud.disabled=disabled;
 if(undo){undo.disabled=disabled;undo.hidden=!readCloudConflictBackup()}
 var repair=id('repairStorageFromCloudBtn');if(repair)repair.disabled=!cloudUser||disabled||!(data&&data.storageIssue);
}
function storageDecodeErrorText(error){
 return{ 'invalid-json':'內容不是有效的 JSON','invalid-record':'紀錄結構不完整','invalid-schema-version':'資料版本格式錯誤','unsupported-schema-version':'資料來自較新的版本，目前無法安全讀取'}[error]||String(error||'未知格式錯誤');
}
function updateStorageRecoveryUI(){
 var panel=id('storageRecoveryPanel'),message=id('storageRecoveryMessage'),issue=data&&data.storageIssue;if(!panel||!message)return;
 panel.hidden=!issue;
 message.textContent=issue?issue.date+'：'+storageDecodeErrorText(issue.error)+'。原始內容已另外保留；修復前不會儲存或同步這一天。':'';
 var repair=id('repairStorageFromCloudBtn');if(repair)repair.disabled=!issue||!cloudUser||cloudBootstrapPending||cloudManualSyncPending;
}
function updateCloudConflictUI(date){
 cloudConflictDate=String(date||'');
 var box=id('cloudConflictActions'),text=id('cloudConflictText'),details=id('cloudConflictDetails');if(!box||!text)return;
 box.hidden=!cloudConflictDate;
 var rec=cloudConflictDate?readStoredRecord(cloudConflictDate):null,conflicts=recordSyncConflicts(rec);
 text.textContent=cloudConflictDate?cloudConflictDate+' 有 '+(conflicts.length||1)+' 處不同，請選擇要完整保留的版本。':'';
 if(details){
  details.textContent=cloudConflictDate?(conflicts.length?conflicts.slice(0,8).map(conflictDetailText).join('\n'):'缺少共同版本，無法安全判斷各欄位差異。'):'';
 }
 updateCloudActionButtons();
}
function conflictValueText(detail,key){
 if(!detail||!detail[key+'Exists'])return'已刪除';
 var value=detail[key];
 if(value==='')return'已清空';
 if(value===null)return'空值';
 if(typeof value==='object')return Array.isArray(value)?value.length+' 項':'已修改內容';
 var text=String(value);return text.length>28?text.slice(0,28)+'…':text;
}
function conflictDetailText(detail){
 var label=detail.kind==='delete-vs-edit'?'刪除與修改衝突':detail.kind==='unkeyed-array'?'清單同時變更':'同一欄位同時修改';
 return (detail.path||'整份紀錄')+'｜'+label+'｜本機：'+conflictValueText(detail,'local')+'｜雲端：'+conflictValueText(detail,'cloud');
}
function cloudConflictBackupKey(){return STORE_PREFIX+'__cloud-conflict-backup__'}
function readCloudConflictBackup(){
 try{var raw=store.getItem(cloudConflictBackupKey()),value=raw?JSON.parse(raw):null;return value&&value.version===1&&value.date?value:null}catch(e){return null}
}
function writeCloudConflictBackup(value){
 try{store.setItem(cloudConflictBackupKey(),JSON.stringify(value));updateCloudActionButtons();return true}catch(e){return false}
}
function saveCloudConflictBackup(date,local,cloud){
 return writeCloudConflictBackup({version:1,date:date,createdAt:new Date().toISOString(),local:local?cloneRecord(local):null,cloud:cloud?cloneRecord(cloud):null,resolvedRevision:null});
}
function finishCloudConflictBackup(revision){
 var backup=readCloudConflictBackup();if(!backup)return;backup.resolvedRevision=Number(revision||0);writeCloudConflictBackup(backup);
}
function setCloudConflictRecord(local,cloud,details){
 var next=cloneRecord(local);if(!next)return null;
 next.localDirty=true;next.syncConflict=true;
 next.syncConflictDetails=details&&details.length?cloneRecord(details):[{path:'$',kind:'unknown-base',baseExists:false,localExists:true,cloudExists:!!cloud,local:stripRecordSyncMeta(local),cloud:cloud?stripRecordSyncMeta(cloud):undefined}];
 next.syncConflictLocal=stripRecordSyncMeta(local);
 next.syncConflictCloud=cloud?stripRecordSyncMeta(cloud):undefined;
 writeStoredRecord(next);
 if(data&&data.date===next.date){data=cloneRecord(next)}
 updateCloudConflictUI(next.date);return next;
}
async function runCloudManualSync(label,task){
 if(cloudManualSyncPending){cloudSetMessage(label+'正在進行，請稍候。',true);return null}
 cloudManualSyncPending=true;updateCloudActionButtons();
 try{
  var name='gsat-study-manual-sync:'+(cloudUser&&cloudUser.id?cloudUser.id:'guest');
  return await withCrossTabLock(name,task);
 }
 finally{cloudManualSyncPending=false;updateCloudActionButtons()}
}
function readStoredRecord(date){
 return localRecordRepository.load(date);
}
function readStoredRecordResult(date){return localRecordRepository.loadResult(date)}
function localStorageDecodeIssue(date){
 var result=readStoredRecordResult(date);return result.status==='invalid'?result.issue:null;
}
function readRecordFromPrefix(prefix,date){
 return localRecordRepository.loadFromPrefix(prefix,date);
}
function recordDatesForPrefix(prefix){
 return localRecordRepository.listDates(prefix);
}
function writeStoredRecord(rec){
 if(!rec||!rec.date)return false;
 if(rec.storageIssue)return false;
 try{
  rec.schemaVersion=CURRENT_STUDY_RECORD_SCHEMA_VERSION;
  if(!localRecordRepository.save(rec))return false;
  mathProgressIndex.upsert(rec);
  return true;
 }catch(e){return false}
}
function updateCurrentRecordSyncMeta(date,serverRec){
 if(!data||data.date!==date||!serverRec)return;
 if(!sameStudyContent(data,serverRec))return;
 data.serverRevision=serverRec.serverRevision||0;
 data.serverUpdatedAt=serverRec.serverUpdatedAt||'';
 data.syncBase=cloneRecord(serverRec.syncBase||stripRecordSyncMeta(serverRec));
 data.localDirty=false;
 data.syncConflict=false;
 delete data.syncConflictDetails;delete data.syncConflictLocal;delete data.syncConflictCloud;
}
async function cloudSaveRecord(rec,forcedBaseRevision){
 if(!cloudRecordRepository||!cloudUser||!rec||!currentStorageIsUserScoped())return false;
 if(rec.storageIssue||localStorageDecodeIssue(rec.date)){
  cloudSetMessage(rec.date+' 的本機資料無法解碼；已停止上傳，請先下載備份並使用雲端版本修復。',false);return false;
 }
 try{
  var snapshot=null,result=null;
  for(var attempt=0;attempt<2;attempt++){
   var stored=readStoredRecord(rec.date),pending=mergeStudyRecordsForUpload(stored||rec,rec);
   var cloudSnapshot=await cloudRecordRepository.loadDate(rec.date),cloudRecord=cloudSnapshot?cloudSnapshot.record:null;
   var pendingConflicts=recordSyncConflicts(pending);
   if(pendingConflicts.length){
    setCloudConflictRecord(pending.syncConflictLocal||pending,cloudRecord,pendingConflicts);
    cloudSetMessage(rec.date+' 在不同分頁修改了相同欄位；未自動覆蓋，請查看差異後選擇版本。',false);return false;
   }
   snapshot=mergeStudyRecordsForUpload(pending,cloudRecord);
   var mergeConflicts=recordSyncConflicts(snapshot);
   if(mergeConflicts.length){
    setCloudConflictRecord(snapshot.syncConflictLocal||pending,cloudRecord,mergeConflicts);
    cloudSetMessage(rec.date+' 的本機與雲端修改了相同欄位；未自動覆蓋，請查看差異後選擇版本。',false);return false;
   }
   var baseRevision=cloudSnapshot?Number(cloudSnapshot.revision||0):0;
   snapshot.serverRevision=baseRevision;snapshot.serverUpdatedAt=cloudSnapshot?cloudSnapshot.updatedAt:'';
   snapshot.localDirty=true;snapshot.syncConflict=false;
   writeStoredRecord(snapshot);
   result=await cloudRecordRepository.save(snapshot,baseRevision);
   if(result.applied)break;
  }
  if(!snapshot||!result)throw new Error('雲端儲存流程未完成。');
  var current=readStoredRecord(snapshot.date)||snapshot;
  if(!result.applied){
   var newestCloud=result.record||null,failedMerge=newestCloud?mergeStudyRecordsForUpload(current,newestCloud):current;
   current=setCloudConflictRecord(failedMerge.syncConflictLocal||current,newestCloud,recordSyncConflicts(failedMerge));
   if(current&&result.updatedAt){current.serverUpdatedAt=String(result.updatedAt);writeStoredRecord(current)}
   cloudSetMessage(snapshot.date+' 已在其他裝置更新；本機版本未覆蓋雲端，請重新讀取後人工確認。',false);
   return false;
  }

  var saved=result.record;
  if(!saved)throw new Error('無法解析雲端儲存結果。');
  current=readStoredRecord(snapshot.date);
  if(current&&!sameStudyContent(current,snapshot)){
   // User edited again while the earlier save request was in flight. Preserve
   // the newer local content, advance its base revision, then queue one more save.
   current=mergeStudyRecordsForUpload(current,saved);
   var inFlightConflicts=recordSyncConflicts(current);
   if(inFlightConflicts.length){
    setCloudConflictRecord(current.syncConflictLocal||current,saved,inFlightConflicts);
    cloudSetMessage(snapshot.date+' 儲存期間又修改了相同欄位；已停止後續上傳並保留兩邊版本。',false);return false;
   }
   current.serverRevision=saved.serverRevision;
   current.serverUpdatedAt=saved.serverUpdatedAt;
   current.syncBase=cloneRecord(saved.syncBase||stripRecordSyncMeta(saved));
   current.localDirty=true;
   current.syncConflict=false;
   writeStoredRecord(current);
   if(data&&data.date===current.date&&sameStudyContent(data,current)){
    data.serverRevision=current.serverRevision;data.serverUpdatedAt=current.serverUpdatedAt;data.localDirty=true;data.syncConflict=false;
    data.syncBase=cloneRecord(current.syncBase);
   }
   queueCloudSave(current);
  }else{
   writeStoredRecord(saved);
   updateCurrentRecordSyncMeta(saved.date,saved);
  }
  if(cloudConflictDate===saved.date)updateCloudConflictUI('');
  cloudSetMessage('已交叉比對並同步 '+snapshot.date+' 到雲端（revision '+saved.serverRevision+'）。',true);
  return true;
 }catch(e){
  cloudSetMessage('雲端同步失敗：'+(e&&e.message?e.message:String(e)),false);return false
 }
}
function queueCloudSave(rec,allowDuringBootstrap){
 if(!cloudClient||!cloudUser||!rec||cloudLoading||(!allowDuringBootstrap&&cloudBootstrapPending)||rec.syncConflict||!currentStorageIsUserScoped())return;
 var snap=cloneRecord(rec),date=String(rec.date||'');if(!date)return;
 cloudSaveQueue.enqueue(date,snap);
 updateCloudStatusBadge();
}
function queueDirtyCloudRecords(){
 if(!cloudClient||!cloudUser||!currentStorageIsUserScoped())return 0;
 var queued=0;
 localStudyDates().forEach(function(date){
  var rec=readStoredRecord(date);
  if(!rec||!rec.localDirty||rec.syncConflict)return;
  queueCloudSave(rec,true);queued++;
 });
 return queued;
}
async function cloudPullAllRecordsOnce(options){
 var opts=options||{};
 var empty={ok:false,mode:'none',total:0,accepted:0,queued:0,conflicts:0};
 if(!cloudRecordRepository||!cloudUser||!currentStorageIsUserScoped())return empty;
 var pendingByDate={},cloudDates={},conflicts=0,storageIssues=0,accepted=0,total=0,errorMessage='';
 var watermark=recordSyncWatermark(),since=incrementalSyncStart(watermark),mode=since?'incremental':'full';
 try{
  cloudLoading=true;
  if(!opts.silent)cloudSetMessage('正在讀取雲端紀錄…',true);
  var snapshots=await cloudRecordRepository.loadMany(since);total=snapshots.length;
  snapshots.forEach(function(snapshot){
   var cloud=snapshot.record,date=snapshot.studyDate;
   cloudDates[date]=true;
   if(localStorageDecodeIssue(date)){
    conflicts++;storageIssues++;if(data&&data.date===date)updateStorageRecoveryUI();return;
   }
   var local=readStoredRecord(date);
   var decision=decideRevisionSync(local,cloud);
    if(decision==='use-cloud'||decision==='equal'){
     if(cloud){writeStoredRecord(cloud);accepted++}
    }else if(decision==='push-local'){
    if(local)pendingByDate[local.date]=local;
    }else if(local){
     var compared=cloud?mergeStudyRecordsForUpload(local,cloud):local;
     setCloudConflictRecord(compared.syncConflictLocal||local,cloud,recordSyncConflicts(compared));conflicts++;
    }
   });
  if(mode==='full')localStudyDates().forEach(function(date){
   if(cloudDates[date])return;
   var local=readStoredRecord(date);if(local)pendingByDate[date]=local;
  });
  var nextWatermark=latestServerWatermark(snapshots.map(function(snapshot){return{updated_at:snapshot.updatedAt}}),watermark);if(nextWatermark)saveRecordSyncWatermark(nextWatermark);
 }catch(e){errorMessage=e&&e.message?e.message:String(e)}
 finally{cloudLoading=false}
 if(errorMessage){cloudSetMessage('讀取雲端失敗：'+errorMessage,false);return Object.assign({},empty,{mode:mode,error:errorMessage})}
 localStudyDates().forEach(function(date){
  var rec=readStoredRecord(date);if(rec&&rec.localDirty&&!rec.syncConflict)pendingByDate[date]=rec;
 });
 var pending=Object.keys(pendingByDate).map(function(date){return pendingByDate[date]});
 pending.forEach(function(rec){queueCloudSave(rec,true)});
 var msg=(mode==='incremental'?'增量讀取 ':'首次比較 ')+total+' 天雲端紀錄；採用／確認 '+accepted+' 天';
 if(pending.length)msg+='，本機背景待同步 '+pending.length+' 天';
 if(conflicts)msg+='，'+conflicts+' 天有版本衝突且未自動覆蓋';
 if(storageIssues)msg+='（其中 '+storageIssues+' 天本機資料無法解碼，需先修復）';
 if(!opts.silent)cloudSetMessage(msg+'。',conflicts?false:true);
 return{ok:true,mode:mode,total:total,accepted:accepted,queued:pending.length,conflicts:conflicts,storageIssues:storageIssues,message:msg+'。'};
}
async function cloudPullAllRecords(options){
 if(cloudPullAllPromise)return cloudPullAllPromise;
 cloudPullAllPromise=cloudPullAllRecordsOnce(options);
 try{return await cloudPullAllPromise}
 finally{cloudPullAllPromise=null}
}
async function cloudPullDate(date,force){
 if(!cloudRecordRepository||!cloudUser||!date||!currentStorageIsUserScoped())return false;
 // Never compare with the cloud while this tab still has an older save for the
 // same date in flight. The cross-tab lock then prevents another tab writing
 // between this read and the resulting decision.
 await cloudSaveQueue.flush(date);
 return withCloudDateLock(date,async function(){return cloudPullDateLocked(date,force)});
}
async function cloudPullDateLocked(date,force){
 var localToPush=null,cloud=null,conflict=false;
 try{
  cloudLoading=true;
  if(localStorageDecodeIssue(date)){
   cloudSetMessage(date+' 的本機紀錄無法解碼；未使用雲端資料覆蓋，請先從警告區選擇修復。',false);return false;
  }
  var local=readStoredRecord(date);
  var snapshot=await cloudRecordRepository.loadDate(date);cloud=snapshot?snapshot.record:null;
  var decision=decideRevisionSync(local,cloud);
  if(decision==='use-cloud'||decision==='equal'){
   if(cloud)writeStoredRecord(cloud);
  }else if(decision==='push-local')localToPush=local;
  else if(local){var compared=cloud?mergeStudyRecordsForUpload(local,cloud):local;setCloudConflictRecord(compared.syncConflictLocal||local,cloud,recordSyncConflicts(compared));conflict=true}
 }catch(e){cloudSetMessage('讀取雲端失敗：'+(e&&e.message?e.message:String(e)),false);return false}
 finally{cloudLoading=false}
 if(localToPush)await cloudSaveRecord(localToPush);
 if(force||id('studyDate').value===date){
  if(isEditingRecordControl())setCloudVisibleRefreshPending(true);
  else{setCloudVisibleRefreshPending(false);data=loadData(date);var changed=ensureDailyPresets(data,date);writeHeader();render();if(changed)persist(false)}
 }
 if(conflict){updateCloudConflictUI(date);cloudSetMessage(date+' 與雲端版本衝突；兩端內容都保留，未自動覆蓋。',false);return false}
 if(cloudConflictDate===date)updateCloudConflictUI('');
 return !!cloud||!!localToPush;
}
function localStudyDates(){return recordDatesForPrefix(STORE_PREFIX)}
function rebuildMathProgressIndex(){
 var records=[];
 localStudyDates().forEach(function(date){var rec=readStoredRecord(date);if(rec)records.push(rec)});
 mathProgressIndex.replaceAll(records);
}
function legacyLocalDates(){
 var set={};
 recordDatesForPrefix(LEGACY_UNSCOPED_PREFIX).forEach(function(d){set[d]=true});
 recordDatesForPrefix(storagePrefixForUser(null)).forEach(function(d){set[d]=true});
 return Object.keys(set).sort();
}
function legacyCandidate(date){
 var old=readRecordFromPrefix(LEGACY_UNSCOPED_PREFIX,date);
 var guest=readRecordFromPrefix(storagePrefixForUser(null),date);
 if(old&&guest&&!sameStudyContent(old,guest))return{ambiguous:true,record:null};
 return{ambiguous:false,record:guest||old||null};
}
async function cloudForceLocalRecord(rec){
 if(!cloudRecordRepository)throw new Error('雲端 Repository 尚未初始化。');
 await cloudSaveQueue.flush(rec.date);
 return withCloudDateLock(rec.date,async function(){
  var latest=readStoredRecord(rec.date)||rec;
  latest.localDirty=true;latest.syncConflict=false;
  writeStoredRecord(latest);
  return cloudSaveRecord(latest);
 });
}
async function cloudReplaceRecord(rec,withBackup){
 if(!cloudRecordRepository||!rec)return null;
 await cloudSaveQueue.flush(rec.date);
 return withCloudDateLock(rec.date,async function(){
  var before=await cloudRecordRepository.loadDate(rec.date),cloud=before?before.record:null;
  if(withBackup&&!saveCloudConflictBackup(rec.date,readStoredRecord(rec.date)||rec,cloud))throw new Error('無法建立衝突處理備份。');
  var exact=stripRecordSyncMeta(rec),baseRevision=before?Number(before.revision||0):0;
  exact.serverRevision=baseRevision;exact.serverUpdatedAt=before?before.updatedAt:'';exact.localDirty=true;exact.syncConflict=false;
  var result=await cloudRecordRepository.save(exact,baseRevision);
  if(!result.applied||!result.record){setCloudConflictRecord(rec,result.record||cloud,[]);return null}
  writeStoredRecord(result.record);updateCurrentRecordSyncMeta(result.record.date,result.record);finishCloudConflictBackup(result.record.serverRevision);return result.record;
 });
}
async function cloudMergeLocalMissing(){
 if(!cloudClient||!cloudUser||!currentStorageIsUserScoped())return;
 return runCloudManualSync('補上本機資料',async function(){try{
  cloudSetMessage('正在匯入未綁定帳號的本機舊資料…',true);
  var dates=legacyLocalDates(),migrated=0,ambiguous=0,failed=0;
  for(var i=0;i<dates.length;i++){
   var d=dates[i],current=readStoredRecord(d),candidate=legacyCandidate(d);
   if(candidate.ambiguous){ambiguous++;continue}
   if(!candidate.record)continue;
   if(current&&!sameStudyContent(current,candidate.record)){ambiguous++;continue}
   var rec=cloneRecord(current||candidate.record);rec.date=d;
   if(await cloudForceLocalRecord(rec))migrated++;else failed++;
  }
  rebuildMathProgressIndex();load();
  var msg='本機舊資料處理完成：'+migrated+' 天已匯入目前帳號';
  if(ambiguous)msg+='；'+ambiguous+' 天同時存在兩份不同的 legacy／guest 資料，為安全起見未自動選擇';
  if(failed)msg+='；'+failed+' 天同步失敗或發生競爭衝突';
  cloudSetMessage(msg+'。',ambiguous||failed?false:true);
 }catch(e){cloudSetMessage('補上本機資料失敗：'+(e&&e.message?e.message:String(e)),false)}})
}
async function cloudRefreshAllRecords(){
 return runCloudManualSync('重新讀取雲端',async function(){
  await Promise.all(localStudyDates().map(function(date){return cloudSaveQueue.flush(date)}));
  await cloudPullAllRecords();load({skipCloudRead:true});
 });
}
async function cloudKeepLocalConflict(){
 var date=cloudConflictDate;if(!date)return;
 return runCloudManualSync('衝突處理',async function(){
  var rec=readStoredRecord(date);
  if(!rec){cloudSetMessage('找不到 '+date+' 的本機紀錄。',false);return false}
  var exact=rec.syncConflictLocal||rec,saved=await cloudReplaceRecord(exact,true),ok=!!saved;
  if(ok){updateCloudConflictUI('');cloudSetMessage('已完整保留 '+date+' 的本機版本；雲端舊項目不會混回來。',true);if(data&&data.date===date)load({skipCloudRead:true})}
  else cloudSetMessage('保留本機版本失敗；兩邊資料仍保留，沒有覆蓋雲端。',false);
  return ok;
 });
}
async function cloudUseCloudConflict(){
 var date=cloudConflictDate;if(!date||!cloudRecordRepository)return;
 return runCloudManualSync('衝突處理',async function(){
  await cloudSaveQueue.flush(date);
  var ok=await withCloudDateLock(date,async function(){
   var snapshot=await cloudRecordRepository.loadDate(date);
   if(!snapshot||!snapshot.record)return false;
   var local=readStoredRecord(date);if(!saveCloudConflictBackup(date,local,snapshot.record))return false;
   writeStoredRecord(snapshot.record);finishCloudConflictBackup(snapshot.revision);return true;
  });
  if(ok){updateCloudConflictUI('');cloudSetMessage('已完整採用 '+date+' 的雲端版本；本機舊項目不會混回來。',true);if(data&&data.date===date)load({skipCloudRead:true})}
  else cloudSetMessage('無法讀取 '+date+' 的雲端版本，兩端內容仍保持不變。',false);
  return ok;
 });
}
async function cloudUndoConflictResolution(){
 var backup=readCloudConflictBackup();if(!backup||!cloudRecordRepository)return;
 if(!window.confirm('要復原 '+backup.date+' 上一次衝突處理嗎？系統會先確認雲端沒有更新，再恢復處理前的兩份版本。'))return;
 return runCloudManualSync('復原衝突處理',async function(){
  var restored=await withCloudDateLock(backup.date,async function(){
   var current=await cloudRecordRepository.loadDate(backup.date);
   if(!current||Number(current.revision||0)!==Number(backup.resolvedRevision||0))return{ok:false,changed:true};
   if(!backup.cloud)return{ok:false,missing:true};
   var originalCloud=stripRecordSyncMeta(backup.cloud);originalCloud.serverRevision=current.revision;originalCloud.localDirty=true;originalCloud.syncConflict=false;
   var result=await cloudRecordRepository.save(originalCloud,current.revision);
   if(!result.applied||!result.record)return{ok:false,changed:true};
   var local=cloneRecord(backup.local||result.record),details=recordSyncConflicts(local);
   local.serverRevision=result.record.serverRevision;local.serverUpdatedAt=result.record.serverUpdatedAt;local.syncBase=result.record.syncBase;
   setCloudConflictRecord(local,result.record,details);
   try{store.removeItem(cloudConflictBackupKey())}catch(e){}
   updateCloudActionButtons();return{ok:true};
  });
  if(restored.ok){cloudSetMessage('已復原 '+backup.date+' 衝突處理前的兩份版本，請重新選擇。',true);if(data&&data.date===backup.date)load({skipCloudRead:true})}
  else if(restored.changed)cloudSetMessage('雲端在衝突處理後又有新修改，為避免覆蓋，已停止復原。',false);
  else cloudSetMessage('備份缺少原雲端版本，無法自動復原。',false);
  return restored.ok;
 });
}
function downloadStorageRecovery(){
 var issue=data&&data.storageIssue?localStorageDecodeIssue(data.storageIssue.date):null;
 if(!issue){id('status').textContent='目前沒有可下載的損壞紀錄備份。';return}
 try{
  var blob=new Blob([issue.raw],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='gsat-study-record-'+issue.date+'-original-backup.txt';document.body.appendChild(link);link.click();link.remove();
  setTimeout(function(){URL.revokeObjectURL(url)},1000);id('status').textContent='已下載 '+issue.date+' 的原始本機資料備份。';
 }catch(e){id('status').textContent='無法下載原始備份：'+(e&&e.message?e.message:String(e))}
}
async function repairStorageIssueFromCloud(){
 var issue=data&&data.storageIssue,selectedDate=issue&&issue.date;
 if(!selectedDate)return;
 if(!cloudUser||!cloudRecordRepository){cloudSetMessage('請先登入 Cloud 帳號，再使用雲端版本修復。',false);return}
 return runCloudManualSync('修復本機紀錄',async function(){
  try{
   cloudSetMessage('正在讀取 '+selectedDate+' 的雲端版本…',true);
   var snapshot=await cloudRecordRepository.loadDate(selectedDate);
   if(!snapshot||!snapshot.record){cloudSetMessage('雲端沒有 '+selectedDate+' 的紀錄；原始本機備份仍完整保留。',false);return false}
   if(!writeStoredRecord(snapshot.record)){cloudSetMessage('無法寫入修復後的本機紀錄；原始備份未變更。',false);return false}
   data=loadData(selectedDate);updateStorageRecoveryUI();writeHeader();render();
   cloudSetMessage('已用雲端版本修復 '+selectedDate+'；原始損壞內容仍保留在復原備份中。',true);return true;
  }catch(e){cloudSetMessage('修復失敗：'+(e&&e.message?e.message:String(e)),false);return false}
 });
}
async function cloudSignIn(){
 var email=id('cloudEmail').value.trim(),password=id('cloudPassword').value;
 if(!email||!password){cloudSetMessage('請輸入 Email 與密碼。',false);return}
 try{
  var r=await cloudClient.auth.signInWithPassword({email:email,password:password});
  if(r.error)throw r.error;cloudSetMessage('登入成功，正在切換到此帳號的獨立資料空間。',true);
 }catch(e){cloudSetMessage('登入失敗：'+(e&&e.message?e.message:String(e)),false)}
}
async function cloudSignUp(){
 var email=id('cloudEmail').value.trim(),password=id('cloudPassword').value;
 if(!email||password.length<6){cloudSetMessage('請輸入 Email，密碼至少 6 碼。',false);return}
 try{
  var r=await cloudClient.auth.signUp({email:email,password:password});
  if(r.error)throw r.error;
  if(r.data&&r.data.session)cloudSetMessage('帳號建立完成並已登入。',true);
  else cloudSetMessage('帳號已建立；若專案要求 Email 驗證，請先完成驗證後再登入。',true);
 }catch(e){cloudSetMessage('建立帳號失敗：'+(e&&e.message?e.message:String(e)),false)}
}
function cloudAuthReturnUrl(){
 var url=new URL(window.location.href);url.search='';url.hash='';return url.toString();
}
async function cloudRequestPasswordReset(){
 var email=id('cloudEmail').value.trim();
 if(!email){cloudSetMessage('請先輸入要重設密碼的 Email。',false);return}
 try{
  var r=await cloudClient.auth.resetPasswordForEmail(email,{redirectTo:cloudAuthReturnUrl()});
  if(r.error)throw r.error;
  cloudSetMessage('若此 Email 已建立帳號，密碼重設信已寄出；請從信中的連結回到 Tracker。',true);
 }catch(e){cloudSetMessage('無法寄出密碼重設信：'+(e&&e.message?e.message:String(e)),false)}
}
async function cloudResendVerification(){
 var email=id('cloudEmail').value.trim();
 if(!email){cloudSetMessage('請先輸入要驗證的 Email。',false);return}
 try{
  var r=await cloudClient.auth.resend({type:'signup',email:email,options:{emailRedirectTo:cloudAuthReturnUrl()}});
  if(r.error)throw r.error;
  cloudSetMessage('驗證信已重新寄出；請檢查收件匣與垃圾郵件。',true);
 }catch(e){cloudSetMessage('無法重寄驗證信：'+(e&&e.message?e.message:String(e)),false)}
}
function openPasswordRecoveryDialog(){
 var dialog=id('passwordRecoveryDialog');if(!dialog)return;
 id('cloudNewPassword').value='';id('cloudNewPasswordConfirm').value='';id('passwordRecoveryMessage').textContent='';
 if(typeof dialog.showModal==='function'){if(!dialog.open)dialog.showModal()}else dialog.setAttribute('open','');
 setTimeout(function(){id('cloudNewPassword').focus()},0);
}
function closePasswordRecoveryDialog(){
 var dialog=id('passwordRecoveryDialog');if(!dialog)return;
 if(typeof dialog.close==='function'&&dialog.open)dialog.close();else dialog.removeAttribute('open');
}
async function cloudUpdateRecoveredPassword(event){
 if(event)event.preventDefault();
 var password=id('cloudNewPassword').value,confirmation=id('cloudNewPasswordConfirm').value,message=id('passwordRecoveryMessage');
 if(password.length<6){message.textContent='新密碼至少需要 6 碼。';return}
 if(password!==confirmation){message.textContent='兩次輸入的密碼不同。';return}
 var button=id('cloudUpdatePasswordBtn');button.disabled=true;message.textContent='正在更新密碼…';
 try{
  var r=await cloudClient.auth.updateUser({password:password});if(r.error)throw r.error;
  closePasswordRecoveryDialog();cloudSetMessage('密碼已更新，可以繼續使用目前登入的帳號。',true);
 }catch(e){message.textContent='更新密碼失敗：'+(e&&e.message?e.message:String(e))}
 finally{button.disabled=false}
}
async function cloudSignOut(){
 if(!cloudClient)return;await cloudClient.auth.signOut();
}

function calendarSetMessage(msg,ok){
 var el=id('calendarMessage');if(el)el.textContent=msg||'';
 calendarHasError=ok===false;
 var busy=/正在|同步中/.test(String(msg||''));
 if(!cloudUser)setConnectionBadge('calendarStatusBadge','需先登入','offline');
 else if(!calendarConnected&&!googleCalendarClientConfig.isConfigured)setConnectionBadge('calendarStatusBadge','設定未完成','warning');
 else if(busy)setConnectionBadge('calendarStatusBadge','同步中','busy');
 else if(ok===false)setConnectionBadge('calendarStatusBadge','同步異常','error');
 else if(calendarConnected)setConnectionBadge('calendarStatusBadge','已連接','ok');
 else setConnectionBadge('calendarStatusBadge','未連接','offline');
}
function calendarUpdateUI(){
 var connect=id('calendarConnectBtn'),sync=id('calendarSyncBtn'),disconnect=id('calendarDisconnectBtn');
 if(connect){
  connect.disabled=!cloudUser||calendarConnected||!googleCalendarClientConfig.isConfigured;
  connect.title=!googleCalendarClientConfig.isConfigured?(googleCalendarClientConfig.message||'Google Calendar 設定未完成。'):'';
 }
 if(sync)sync.disabled=!cloudUser||!calendarConnected;
 if(disconnect)disconnect.disabled=!cloudUser||!calendarConnected;
 if(!cloudUser)setConnectionBadge('calendarStatusBadge','需先登入','offline');
 else if(calendarConnected)setConnectionBadge('calendarStatusBadge','已連接','ok');
 else if(!googleCalendarClientConfig.isConfigured)setConnectionBadge('calendarStatusBadge','設定未完成','warning');
 else if(calendarHasError)setConnectionBadge('calendarStatusBadge','同步異常','error');
 else setConnectionBadge('calendarStatusBadge','未連接','offline');
}
function calendarFriendlyError(message,body){
 message=String(message||'Calendar request failed');
 if(body&&body.code==='calendar_configuration_error'){
  var missingList=Array.isArray(body.missing)?body.missing:[];
  if(missingList.indexOf('VITE_GOOGLE_CLIENT_ID')>=0)return googleCalendarClientConfig.message||'請在部署環境設定 VITE_GOOGLE_CLIENT_ID 後重新建置網站。';
  var missing=missingList.join('、');
  return 'Google Calendar 伺服器設定未完成'+(missing?'（缺少 '+missing+'）':'')+'。請依 README 設定 Supabase secrets 後重新部署 Calendar Functions。';
 }
 if(/Missing GOOGLE_CLIENT_ID|VITE_GOOGLE_CLIENT_ID/i.test(message))return googleCalendarClientConfig.message||'請在部署環境設定 VITE_GOOGLE_CLIENT_ID 後重新建置網站。';
 if(/Missing GOOGLE_CLIENT_SECRET/i.test(message))return 'Google Calendar 伺服器缺少 GOOGLE_CLIENT_SECRET。請在 Supabase secrets 設定後重新部署 Calendar Functions。';
 if(/Missing GOOGLE_REDIRECT_URI/i.test(message))return 'Google Calendar 伺服器缺少 GOOGLE_REDIRECT_URI。請在 Supabase secrets 設定 OAuth callback 網址。';
 if(/Missing GOOGLE_STATE_SECRET/i.test(message))return 'Google Calendar 伺服器缺少 GOOGLE_STATE_SECRET。請在 Supabase secrets 設定高熵隨機字串。';
 if(/Missing APP_RETURN_URL/i.test(message))return 'Google Calendar 伺服器缺少 APP_RETURN_URL。請設定授權完成後返回 Tracker 的正式網址。';
 return message;
}
async function calendarErrorDetail(error){
 var message=error&&error.message?String(error.message):String(error||'Unknown error');
 var body=null;
 try{
  var response=error&&error.context;
  if(response&&typeof response.clone==='function')response=response.clone();
  if(response&&typeof response.json==='function'){
   body=await response.json();if(body&&body.error)message=String(body.error);
  }
 }catch(e){}
 return calendarFriendlyError(message,body);
}
async function calendarInvoke(action,payload){
 if(!cloudClient||!cloudUser)throw new Error('請先登入 Study Tracker。');
 var body=Object.assign({},payload||{},{action:action});
 var r=await cloudClient.functions.invoke('google-calendar',{body:body});
 if(r.error)throw new Error(await calendarErrorDetail(r.error));
 if(r.data&&r.data.error)throw new Error(calendarFriendlyError(String(r.data.error),r.data));
 return r.data||{};
}
function clearCalendarRuntime(){
 calendarConnected=false;calendarCacheLoaded=false;calendarHasError=false;calendarParsedByDate={};cloudMathPlanByDate={};cloudMathPlansByDate={};cloudNaturalIntegrationItemsByDate={};cloudNaturalIntegrationDetailsByDate={};
 calendarUpdateUI();
}
function naturalRecommendationByTopic(topic){
 var keys=Object.keys(CALENDAR_NATURAL_RECOMMENDED_PAGES||{});
 for(var i=0;i<keys.length;i++){
  var p=CALENDAR_NATURAL_RECOMMENDED_PAGES[keys[i]];
  if(p&&String(p.label||'').trim()===String(topic||'').trim())return cloneObj(p);
 }
 return null;
}
function resolveCloudMathPlan(parsed){
 var matches=[];
 Object.keys(CALENDAR_MATH_PLAN||{}).sort().forEach(function(date){var p=CALENDAR_MATH_PLAN[date];if(p&&p.title===parsed.title)matches.push(p)});
 var base=null,start=Number(parsed.startPage||0),end=Number(parsed.endPage||parsed.startPage||0),idx=Number(parsed.progressIndex||0)-1;
 if(start>0)for(var mi=0;mi<matches.length;mi++)if(Number(matches[mi].start)===start&&Number(matches[mi].end)===end){base=matches[mi];break}
 if(!base&&idx>=0&&idx<matches.length)base=matches[idx];
 if(!base&&CALENDAR_MATH_PLAN[parsed.date]&&CALENDAR_MATH_PLAN[parsed.date].title===parsed.title)base=CALENDAR_MATH_PLAN[parsed.date];
 if(!base&&matches.length)base=matches[0];
 var selected=prioritizeCalendarPageRanges(parsed.startPage,parsed.endPage,base?[[base.start,base.end]]:[]);
 if(!base&&!selected.ranges.length)return null;
 var range=selected.ranges[0],out=cloneObj(base||{unitPages:0,weekTarget:0});
 out.title=parsed.title;if(parsed.material)out.material=parsed.material;if(parsed.book)out.book=parsed.book;
 if(parsed.standardNote&&(parsed.material||parsed.book))out.calendarMaterialSource='calendar';
 if(range){out.start=range[0];out.end=range[1];out.pages=range[1]-range[0]+1}
 out.calendarRangeSource=selected.source;out.calendarEventKey=parsed.eventKey;out.calendarSourceEventId=parsed.sourceEventId;return out;
}
function selectPrimaryCloudMathPlan(date,plans){
 var list=Array.isArray(plans)?plans.filter(Boolean):[];
 if(!list.length)return null;
 var fallback=CALENDAR_MATH_PLAN&&CALENDAR_MATH_PLAN[date]?CALENDAR_MATH_PLAN[date]:null;
 if(fallback&&fallback.title){
  for(var i=0;i<list.length;i++)if(String(list[i].title||'')===String(fallback.title))return list[i];
 }
 return list[0];
}
function resolveCloudGrammarPlan(parsed){
 var title=String(parsed.title||'').replace(/^英文文法\s*[｜:：]\s*/,''),plans=Object.keys(CALENDAR_GRAMMAR_PLAN||{}).sort().map(function(date){return CALENDAR_GRAMMAR_PLAN[date]}).filter(Boolean);
 var base=selectGrammarPlan(title,parsed.unitProgress,parsed.startPage,parsed.endPage,plans);
 var selected=prioritizeCalendarPageRanges(parsed.startPage,parsed.endPage,base&&base.start?[[base.start,base.end||base.start]]:[]);
 if(!base&&!selected.ranges.length)return null;
 var out=cloneObj(base||{}),range=selected.ranges[0];out.title=title;
 if(range){out.start=range[0];out.end=range[1];out.rangeText=range[0]===range[1]?'p.'+range[0]:'p.'+range[0]+'–'+range[1];out.rangeType='range'}
 out.displayTitle=normalizedGrammarUnitTitle(title)||title;out.focus=parsed.standardNote?(parsed.focus||''):(parsed.focus||out.focus||'');out.calendarRangeSource=selected.source;return out;
}
function buildCalendarRuntime(rows){
 calendarParsedByDate={};cloudMathPlanByDate={};cloudMathPlansByDate={};cloudNaturalIntegrationItemsByDate={};cloudNaturalIntegrationDetailsByDate={};
 var plan=buildCalendarStudyTaskPlan(rows||[]);calendarParsedByDate=plan.byDate;
 plan.tasks.forEach(function(parsed){
  var d=parsed.date;
  if(parsed.kind==='math'&&!parsed.makeup){
   var mp=resolveCloudMathPlan(parsed);if(mp){if(!cloudMathPlansByDate[d])cloudMathPlansByDate[d]=[];cloudMathPlansByDate[d].push(mp)}
  }else if(parsed.kind==='naturalIntegration'){
   cloudNaturalIntegrationDetailsByDate[d]={review:parsed.review,pages:parsed.pages,output:parsed.output,minimum:parsed.minimum,time:parsed.time};
   if(parsed.pageItems&&parsed.pageItems.length)cloudNaturalIntegrationItemsByDate[d]=parsed.pageItems.map(function(z){return{subject:z.subject,ranges:[[z.start,z.end]]}});
  }
 });
 Object.keys(cloudMathPlansByDate).forEach(function(date){cloudMathPlanByDate[date]=selectPrimaryCloudMathPlan(date,cloudMathPlansByDate[date])});
}
async function refreshCalendarTaskCache(){
 if(!cloudClient||!cloudUser){clearCalendarRuntime();return 0}
 var rows=await loadAllCalendarTaskRows(cloudClient,cloudUser.id);
 buildCalendarRuntime(rows);calendarCacheLoaded=true;return rows.length;
}
function reconcileStoredCalendarPresets(){
 if(!calendarCacheLoaded)return 0;
 var changedDates=0;
 localStudyDates().sort().forEach(function(ds){
  var rec=loadData(ds);
  if(!ensureDailyPresets(rec,ds))return;
  // Calendar reconciliation may add or remove preset items, but it must not
  // erase an existing revision conflict before the user resolves it.
  rec.localDirty=true;
  if(writeStoredRecord(rec)){changedDates++;if(!rec.syncConflict)queueCloudSave(rec,true)}
 });
 return changedDates;
}
async function calendarRefreshStatus(showMessage){
 if(!cloudUser){clearCalendarRuntime();calendarSetMessage('先登入 Study Tracker 帳號，再連接 Google Calendar。',true);return false}
 try{
  var s=await calendarInvoke('status');calendarConnected=!!s.connected;
  if(calendarConnected){var n=await refreshCalendarTaskCache(),cleaned=cloudBootstrapPending?0:reconcileStoredCalendarPresets();calendarSetMessage('Google Calendar 已連接；已載入 '+n+' 筆同步排程'+(cleaned?'，已更新 '+cleaned+' 天本機項目':'')+'。',true)}
  else{
   calendarCacheLoaded=false;calendarParsedByDate={};
   if(!googleCalendarClientConfig.isConfigured)calendarSetMessage(googleCalendarClientConfig.message,false);
   else calendarSetMessage('尚未連接 Google Calendar；目前使用內建排程 fallback。',true);
  }
  calendarUpdateUI();return calendarConnected;
 }catch(e){calendarCacheLoaded=false;calendarSetMessage('Calendar 連線失敗：'+(e&&e.message?e.message:String(e)),false);calendarUpdateUI();return false}
}
async function calendarConnect(){
 try{
  if(!googleCalendarClientConfig.isConfigured||!googleCalendarClientConfig.clientId){calendarSetMessage(googleCalendarClientConfig.message,false);calendarUpdateUI();return}
  calendarSetMessage('正在建立 Google OAuth 連線…',true);var r=await calendarInvoke('auth-url',{clientId:googleCalendarClientConfig.clientId});if(!r.url)throw new Error('伺服器未回傳 Google 授權網址。');window.location.assign(String(r.url));
 }catch(e){calendarSetMessage('Calendar 連線失敗：'+(e&&e.message?e.message:String(e)),false)}
}
async function calendarSyncNow(){
 try{
  calendarSetMessage('正在從 Google Calendar 讀取最新排程（包含刪除）…',true);var r=await calendarInvoke('sync');calendarConnected=!!r.connected;var n=await refreshCalendarTaskCache(),cleaned=reconcileStoredCalendarPresets();calendarSetMessage('同步完成：Google API 更新 '+Number(r.synced||0)+' 筆、移除 '+Number(r.removed||0)+' 筆；Tracker 載入 '+n+' 筆'+(cleaned?'，已更新 '+cleaned+' 天本機項目':'')+'。',true);load({skipCloudRead:true});
 }catch(e){calendarSetMessage('Calendar 同步失敗：'+(e&&e.message?e.message:String(e)),false)}
}
async function calendarDisconnect(){
 if(!window.confirm('確定要解除 Google Calendar 連線嗎？解除後會停止同步，之後需重新授權才能連接。'))return false;
 try{await calendarInvoke('disconnect');clearCalendarRuntime();calendarSetMessage('已解除 Google Calendar 連線；Tracker 回到內建排程 fallback。',true);load({skipCloudRead:true})}catch(e){calendarSetMessage('解除連線失敗：'+(e&&e.message?e.message:String(e)),false)}
}

function isEditingRecordControl(){
 var active=document.activeElement,tag=active&&active.tagName?String(active.tagName).toUpperCase():'';
 return (tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')&&active!==id('studyDate');
}
function setCloudVisibleRefreshPending(pending){
 cloudVisibleRefreshPending=!!pending;
 var notice=id('cloudRefreshNotice');if(notice)notice.hidden=!cloudVisibleRefreshPending;
}
function refreshVisibleDataAfterBackgroundSync(){
 if(isEditingRecordControl()){setCloudVisibleRefreshPending(true);return false}
 setCloudVisibleRefreshPending(false);
 load({skipCloudRead:true});return true;
}
function applyPendingVisibleCloudRefresh(){
 if(!cloudVisibleRefreshPending||isEditingRecordControl())return false;
 if(!persist(false))return false;
 setCloudVisibleRefreshPending(false);load({skipCloudRead:true});return true;
}
async function retryDirtyCloudRecordsOnReconnect(){
 if(!cloudClient||!cloudUser||!currentStorageIsUserScoped())return false;
 var dates=dirtyCloudDates();
 if(!dates.length){cloudSetMessage('網路已恢復；目前沒有待同步紀錄。',true);return true}
 cloudSetMessage('網路已恢復；正在重試 '+dates.length+' 天待同步紀錄。',true);
 dates.forEach(function(date){var rec=readStoredRecord(date);if(rec)queueCloudSave(rec,true)});
 await Promise.all(dates.map(function(date){return cloudSaveQueue.flush(date)}));
 var remaining=dirtyCloudDates().length;
 if(remaining){cloudSetMessage('網路已恢復，但仍有 '+remaining+' 天尚未同步；可按「儲存紀錄」立即重試。',false);return false}
 cloudSetMessage('網路已恢復；待同步紀錄已全部上傳。',true);return true;
}
async function activateCloudUser(user){
 var serial=++cloudActivationSerial;cloudUser=user||null;setStorageScope(cloudUser?cloudUser.id:null);cloudBootstrapPending=!!cloudUser;cloudUpdateUI();clearCalendarRuntime();
 rebuildMathProgressIndex();
 if(!cloudUser){
  cloudBootstrapPending=false;cloudSetMessage('已登出；目前使用獨立 guest 本機資料。',true);load({skipCloudRead:true});return;
 }

 // Render the account-scoped cache immediately. cacheOnly prevents a missing
 // cached day from being generated and mistaken for a newer server record.
 load({skipCloudRead:true,cacheOnly:true});
 cloudSetMessage('登入完成；已先載入本機快取，雲端紀錄與 Calendar 正在背景同步。',true);
 var recordStats=null;
 try{
  var results=await Promise.all([cloudPullAllRecords({silent:true}),calendarRefreshStatus(false)]);
  recordStats=results[0];
 }catch(e){
  recordStats={ok:false,error:e&&e.message?e.message:String(e)};
 }
 if(serial!==cloudActivationSerial)return;
 cloudBootstrapPending=false;
 updateCloudActionButtons();
 var calendarCleaned=calendarConnected?reconcileStoredCalendarPresets():0;
 var queued=queueDirtyCloudRecords();
 var refreshed=refreshVisibleDataAfterBackgroundSync();
 if(recordStats&&recordStats.ok){
  var msg='登入完成；本機快取已立即顯示，'+recordStats.message;
  if(calendarCleaned)msg+=' Calendar 已更新 '+calendarCleaned+' 天本機項目。';
  if(queued)msg+=' 另有 '+queued+' 天已排入背景上傳。';
  if(!refreshed)msg+=' 目前正在輸入；完成輸入後會安全合併並更新畫面，也可按「立即套用」。';
  cloudSetMessage(msg,recordStats.conflicts?false:true);
 }else{
  cloudSetMessage('已登入並使用本機快取；背景讀取雲端失敗：'+((recordStats&&recordStats.error)||'未知錯誤')+'。',false);
 }
}
async function initCloud(){
 cloudClient=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
 cloudRecordRepository=new SupabaseStudyRecordRepository(cloudClient);
 cloudClient.auth.onAuthStateChange(function(event,session){
  var next=session?session.user:null;
  if(event==='PASSWORD_RECOVERY')setTimeout(openPasswordRecoveryDialog,0);
  if((cloudUser&&next&&cloudUser.id===next.id)||(!cloudUser&&!next))return;
  setTimeout(function(){activateCloudUser(next)},0);
 });
 var s=await cloudClient.auth.getSession(),initialUser=s.data&&s.data.session?s.data.session.user:null;
 if(!data||!((cloudUser&&initialUser&&cloudUser.id===initialUser.id)||(!cloudUser&&!initialUser)))await activateCloudUser(initialUser);
 else cloudUpdateUI();
 var params=new URLSearchParams(window.location.search);if(params.get('calendar')==='connected'){
  params.delete('calendar');var qs=params.toString(),nextUrl=window.location.pathname+(qs?'?'+qs:'')+window.location.hash;window.history.replaceState({},'',nextUrl);
  if(cloudUser)setTimeout(function(){calendarRefreshStatus(true).then(function(){load({skipCloudRead:true})})},0);
 }
}
function id(x){return document.getElementById(x)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function pad(n){return n<10?'0'+n:String(n)}
function dateString(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function parseDate(s){var p=String(s).split('-');return new Date(Number(p[0]),Number(p[1])-1,Number(p[2]),12,0,0)}
function mondayOf(d){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12),day=x.getDay();x.setDate(x.getDate()-(day===0?6:day-1));return x}
function key(d){return STORE_PREFIX+d}
function line(v){return String(v==null?'':v).trim()||'—'}
function uid(prefix){return(prefix||'i')+'-'+Date.now()+'-'+Math.floor(Math.random()*1000000)}
function selected(v,current){return String(v)===String(current)?' selected':''}
function checked(v){return v?' checked':''}

function blank(date){return{schemaVersion:CURRENT_STUDY_RECORD_SCHEMA_VERSION,date:date,serverRevision:0,serverUpdatedAt:'',localDirty:false,syncConflict:false,mood:'',wakeTime:'',items:[],biggestBlock:'',firstThingTomorrow:'',notes:'',completionCelebrations:{version:3,half:false,complete:false}}}
function customCountsOriginal(x){return x&&x.type==='extra'&&(isPrism(x.f&&x.f.title)||((x.f&&x.f.title)==='ENGLISH VOCABULARY IN USE'))}
function normalizeItem(it,date){
 if(!it||typeof it!=='object')return null;
 if(!it.f)it.f={};
 if(it.type==='chineseWriting'){it.type='chineseReading';it.f.kind='writing'}
 if(it.type==='chineseReading'){
  var normalizedChineseBook=canonicalPageMappedBook(it.f.book||it.f.kind||it.title);
  if(normalizedChineseBook&&pageMappedBookSubject(normalizedChineseBook)==='國文'){it.f.kind='book';it.f.book=normalizedChineseBook}
  else if(!it.f.kind&&(it.f.start||it.f.end))it.f.kind='reading';
 }
 var pageBookKey=String(it.presetKey||it.templatePresetKey||'');
 if(/cal_book_/.test(pageBookKey))it.f.calendarBookRangeLocked=true;
 if(it.type==='extra'){
  var normalizedEnglishBook=canonicalPageMappedBook(it.f.title||it.f.book||it.title);
  if(normalizedEnglishBook&&pageMappedBookSubject(normalizedEnglishBook)==='英文'){
   it.f.title=normalizedEnglishBook;it.f.book=normalizedEnglishBook;
   delete it.f.start;delete it.f.end;
   if(it.f.dailyWorkUserFields&&typeof it.f.dailyWorkUserFields==='object'){delete it.f.dailyWorkUserFields.start;delete it.f.dailyWorkUserFields.end}
  }
 }
 if(it.type==='extra'&&isTraumaland(it.f.title))normalizeTraumalandTopic(it.f);
 if(it.type==='extra'&&isEssentialGrammar(it.f.title)){
  if(!it.f.unitStart&&it.f.start)it.f.unitStart=it.f.start;
  if(!it.f.unitEnd&&it.f.end)it.f.unitEnd=it.f.end;
 }
 if(!it.source)it.source='custom';
 hydrateCalendarFixedTemplateItem(it);
 if(it.required===undefined)it.required=it.source==='preset';
 if(it.deferred===undefined)it.deferred=false;
 if(date>=DAILY_PRESET_START&&it.source==='custom')it.required=customCountsOriginal(it);
 if(it.type==='general'&&it.title==='英文訂正與搭配詞整理'&&!it.presetKey){it.presetKey='weekday_english_review';it.source='preset'}
 if(isSaturdayMakeup(it))ensureEntryArray(it,'makeupEntries');
 if(isSaturdayReview(it))ensureEntryArray(it,'reviewEntries');
 if(isInteractiveDaily(it))ensureInteractiveEntries(it);
 return it;
}
function loadData(date){
 var b=blank(date),result=readStoredRecordResult(date);
 if(result.status==='missing')return b;
 if(result.status==='invalid'){
  b.storageIssue={source:'local',date:date,error:result.issue.error,backupKey:result.issue.backupKey,capturedAt:result.issue.capturedAt};return b;
 }
 var o=result.record;
 try{
  b.serverRevision=Number(o.serverRevision||0);b.serverUpdatedAt=o.serverUpdatedAt||'';b.localDirty=!!o.localDirty;b.syncConflict=!!o.syncConflict;
  if(o.syncBase)b.syncBase=cloneObj(o.syncBase);
  if(Array.isArray(o.syncConflictDetails))b.syncConflictDetails=cloneObj(o.syncConflictDetails);
  if(o.syncConflictLocal)b.syncConflictLocal=cloneObj(o.syncConflictLocal);
  if(o.syncConflictCloud)b.syncConflictCloud=cloneObj(o.syncConflictCloud);
  b.mood=o.mood||'';b.wakeTime=o.wakeTime||'';b.biggestBlock=o.biggestBlock||'';b.firstThingTomorrow=o.firstThingTomorrow||'';b.notes=o.notes||'';
  var storedCelebrations=o.completionCelebrations&&o.completionCelebrations.version===3?o.completionCelebrations:null;
  b.completionCelebrations={version:3,half:!!(storedCelebrations&&storedCelebrations.half),complete:!!(storedCelebrations&&storedCelebrations.complete)};
  if(Array.isArray(o.items))for(var i=0;i<o.items.length;i++){var it=normalizeItem(o.items[i],date);if(it)b.items.push(it)}
 }catch(e){}
 return b;
}
function presetDef(key,type,title,description,required,f){return{key:key,type:type,title:title,description:description,required:required!==false,f:f||{}}}
function cloneObj(o){try{return JSON.parse(JSON.stringify(o||{}))}catch(e){return{}}}
function cloneValue(v){if(v===undefined)return v;try{return JSON.parse(JSON.stringify(v))}catch(e){return v}}
function calendarEventKeysFromFields(fields){
 var keys=[];
 function add(value){if(value!==undefined&&value!==null&&String(value).trim()&&keys.indexOf(String(value).trim())<0)keys.push(String(value).trim())}
 if(fields&&Array.isArray(fields.calendarEventKeys))fields.calendarEventKeys.forEach(add);
 if(fields)add(fields.calendarEventKey);
 return keys;
}
function calendarFixedTemplateSpec(template){
 var specs={
  mathStudy:['mathStudy','數學講義：進度','完成講義頁數，並理解該範圍的新觀念、定義、公式與主要例題。',{}],
  mathPractice:['mathPractice','數學講義題目：理解檢查＋錯題標記＋訂正','檢查理解，整理錯因／不熟觀念並完成訂正；若錯題少，可延續講義進度。',{}],
  interactiveDaily:['interactiveDaily','互動題','數 A、英文、生物互動題皆由此手動新增。',{interactiveEntries:[]}],
  fixedMagazine:['magazine','學測英文訓練：英文雜誌','閱讀文章、理解內容並整理字詞。',{entries:[]}],
  englishReview:['general','英文訂正與搭配詞整理','訂正題目並整理重要單字、片語與搭配詞。',{words:[]}],
  englishMixedWriting:['englishMixedWriting','英文：混合題與作文練習','先處理優先修改錯誤，再記錄作文與混合題分數。',{}],
  englishMockTimed:['mock','英文歷屆／模考：限時作答','依正式時間完成一回試題。',{subject:'英文',subjectLocked:true}],
  englishMockCorrection:['mock','英文歷屆／模考：批改與訂正','批改試題、重做錯題、分析選項，並整理單字與搭配詞。',{subject:'英文',subjectLocked:true}],
  weekReview:['general','本週完成度與錯題整理','可依科目新增多筆整理，記錄錯因／不熟觀念。',{reviewEntries:[]}],
  englishLightReading:['extra','英文輕量閱讀','可從既有英文書目中選擇輕量閱讀內容。',{}]
 };
 return specs[template]||null;
}
function hydrateCalendarFixedTemplateItem(it){
 if(!it||!it.f)return false;
 var templateKey=String(it.templatePresetKey||it.presetKey||'');
 if(!/^cal_/.test(templateKey))return false;
 var template=it.f.calendarFixedTemplate||calendarFixedTemplate(it.title||'');
 var spec=calendarFixedTemplateSpec(template);if(!spec)return false;
 var changed=false,originalTitle=it.title||'';
 if(it.type!==spec[0]){it.type=spec[0];changed=true}
 if(it.title!==spec[1]){it.title=spec[1];changed=true}
 var defaults=cloneObj(spec[3]);
 for(var k in defaults)if(Object.prototype.hasOwnProperty.call(defaults,k)&&it.f[k]===undefined){it.f[k]=defaults[k];changed=true}
 if(it.f.calendarFixedTemplate!==template){it.f.calendarFixedTemplate=template;changed=true}
 if(!it.f.calendarOriginalTitle&&originalTitle){it.f.calendarOriginalTitle=originalTitle;changed=true}
 return changed;
}
function calendarAceRound(date){
 var d=parseDate('2026-08-17'),target=parseDate(date),n=0;
 while(d<=target&&n<60){
  var day=d.getDay();
  if(day===1||day===2||day===4||day===5){n++;if(dateString(d)===date)return n}
  d.setDate(d.getDate()+1);
 }
 return 0;
}
function calendarGujinRounds(date){
 var d=parseDate('2026-08-17'),target=parseDate(date),n=0,out=[];
 while(d<=target&&n<100){
  var day=d.getDay(),count=day===3?2:((day>=1&&day<=6)?1:0);
  for(var j=0;j<count&&n<100;j++){n++;if(dateString(d)===date)out.push(n)}
  d.setDate(d.getDate()+1);
 }
 return out;
}
function calendarWritingTest(date){
 return CALENDAR_WRITING_TEST_PLAN[date]||null;
}
function calendarGrammarReview(date){
 return CALENDAR_GRAMMAR_PLAN[date]||null;
}
function calendarNaturalRecommended(date,item){
 if(!(calendarConnected&&calendarCacheLoaded))return CALENDAR_NATURAL_RECOMMENDED_PAGES[date]||null;
 if(!item)return null;
 var keys=calendarEventKeysFromFields(item.f||{});
 var plans=(calendarParsedByDate[date]||[]).filter(function(p){return p.kind==='natural'&&keys.indexOf(p.eventKey)>=0}).map(function(p){return resolveNaturalCalendarPlan(p,naturalRecommendationByTopic(p.topic))}).filter(Boolean);
 return combineNaturalCalendarPlans(plans);
}
function calendarNaturalRanges(p){
 if(!p)return[];
 var a=Array.isArray(p.ranges)?p.ranges:((p.start&&p.end)?[[p.start,p.end]]:[]),out=[];
 for(var i=0;i<a.length;i++){
  var s=Number(a[i][0]),e=Number(a[i][1]);if(!Number.isFinite(s)||!Number.isFinite(e)||s<1||e<s)continue;
  out.push([s,e]);
 }
 return out;
}
function calendarNaturalRangesText(p){
 var a=calendarNaturalRanges(p);
 return a.map(function(r){return r[0]===r[1]?'p.'+r[0]:'p.'+r[0]+'–'+r[1]}).join('、');
}
function addCompletedNaturalInterval(out,item,subject){
 if(!item||item.type!=='scienceReview'||!item.done||!item.f)return;
 var f=item.f;if(f.subject!==subject||f.material!=='123日的淬鍊')return;
 var s=Number(f.start),e=Number(f.end);if(!Number.isFinite(s)||!Number.isFinite(e)||s<1||e<s)return;
 out.push([s,e]);
}
function completedNaturalIntervalsBefore(date,subject){
 var out=[],seenDates={};
 function scanRecord(rec,ds){
  if(!rec||!Array.isArray(rec.items)||!ds||ds>=date||seenDates[ds])return;seenDates[ds]=1;
  rec.items.forEach(function(x){
   addCompletedNaturalInterval(out,x,subject);
   if(isSaturdayMakeup(x))ensureEntryArray(x,'makeupEntries').forEach(function(m){addCompletedNaturalInterval(out,m,subject)});
  });
 }
 try{
  localStudyDates().forEach(function(ds){if(ds<date)scanRecord(readStoredRecord(ds),ds)});
 }catch(e2){}
 out.sort(function(a,b){return a[0]-b[0]||a[1]-b[1]});
 var merged=[];
 out.forEach(function(r){
  var last=merged.length?merged[merged.length-1]:null;
  if(!last||r[0]>last[1]+1)merged.push([r[0],r[1]]);
  else if(r[1]>last[1])last[1]=r[1];
 });
 return merged;
}
function overlapPageCount(a,b){
 var s=Math.max(a[0],b[0]),e=Math.min(a[1],b[1]);return e>=s?e-s+1:0;
}
function calendarNaturalPriorCoverage(date,p){
 var need=calendarNaturalRanges(p),doneRanges=completedNaturalIntervalsBefore(date,p.subject),total=0,done=0;
 need.forEach(function(n){
  total+=n[1]-n[0]+1;
  var parts=[];
  doneRanges.forEach(function(d){var s=Math.max(n[0],d[0]),e=Math.min(n[1],d[1]);if(e>=s)parts.push([s,e])});
  parts.sort(function(a,b){return a[0]-b[0]});
  var merged=[];
  parts.forEach(function(r){
   var last=merged.length?merged[merged.length-1]:null;
   if(!last||r[0]>last[1]+1)merged.push([r[0],r[1]]);
   else if(r[1]>last[1])last[1]=r[1];
  });
  merged.forEach(function(r){done+=r[1]-r[0]+1});
 });
 return{total:total,done:done,all:total>0&&done===total};
}
function applyCalendarNaturalRecommended(rec,date){
 if(!rec||!Array.isArray(rec.items))return false;
 var changed=false;
 function apply(x){
 if(isGroupedWork(x)){groupedWorkEntries(x).forEach(apply);return}
 if(!isCalendarNatural(x)||x.type!=='scienceReview'||isCalendarNaturalIntegration(x))return;
 if(!x.f)x.f={};
 var p=calendarNaturalRecommended(date,x);if(!p||p.subject!==x.f.subject)return;
 var ranges=calendarNaturalRanges(p);
 if(!x.f.material){x.f.material=p.material;changed=true}
 if(ranges.length===1){
  if(!x.f.start){x.f.start=String(ranges[0][0]);changed=true}
  if(!x.f.end){x.f.end=String(ranges[0][1]);changed=true}
 }
 var cov=calendarNaturalPriorCoverage(date,p);
 var meta={
  calendarSuggestedMaterial:p.material,
  calendarSuggestedRanges:ranges,
  calendarSuggestedLabel:p.label,
  calendarSuggestedBasis:p.basis,
  calendarSuggestedTotalPages:cov.total,
  calendarSuggestedDonePages:cov.done
 };
 for(var k in meta)if(Object.prototype.hasOwnProperty.call(meta,k)&&JSON.stringify(x.f[k])!==JSON.stringify(meta[k])){x.f[k]=cloneObj(meta[k]);changed=true}
 if(reconcileCalendarNaturalPriorCoverage(x,cov.all))changed=true;
 }
 rec.items.forEach(apply);
 return changed;
}

function hardcodedCalendarDefsForDate(date){
 var a=[],ace=calendarAceRound(date),g=calendarGujinRounds(date),nat=CALENDAR_NATURAL_PLAN[date],wt=calendarWritingTest(date),gr=calendarGrammarReview(date),nr=calendarNaturalRecommended(date),ni=CALENDAR_NATURAL_INTEGRATION_DETAILS[date]||null;
 if(ace)a.push(presetDef('cal_ace_'+ace,'extra','英文｜ACE Reading 第 '+ace+' 回','Google Calendar：第 '+ace+' 回＋訂正。',true,{title:'ACE Reading',round:String(ace)}));
 if(wt)a.push(presetDef('cal_writing_'+wt.round,'extra','英文｜英文寫作測驗 第 '+wt.round+' 回','Google Calendar：第 '+wt.round+' 回｜'+wt.focus+'。',true,{title:'英文寫作測驗',round:String(wt.round),calendarFocus:wt.focus}));
 if(gr)a.push(presetDef('cal_grammar_'+date.replace(/-/g,''),'extra','英文｜英文文法總複習｜'+gr.title,'Google Calendar：'+gr.title+'｜建議頁碼：'+gr.rangeText+'｜'+gr.focus+'。',true,{title:'英文文法總複習講義',start:gr.rangeType==='whole'?'':(gr.start==null?'':String(gr.start)),end:gr.rangeType==='whole'?'':(gr.end==null?'':String(gr.end)),calendarGrammarTitle:gr.title,calendarRangeText:gr.rangeText,calendarRangeType:gr.rangeType,calendarFocus:gr.focus}));
 for(var i=0;i<g.length;i++)a.push(presetDef('cal_gujin_'+g[i],'chineseReading','國文｜古今悅讀一百 第 '+g[i]+' 回','Google Calendar：第 '+g[i]+' 回＋訂正。',true,{kind:'reading',round:String(g[i])}));
 if(nat){
  var nd='Google Calendar：'+nat;
  if(ni){
   nd+='｜依下列指定科目與頁碼完成。';
   a.push(presetDef('cal_natural_'+date.replace(/-/g,''),'scienceReview','自然',nd,true,{subject:'混合',calendarTopic:nat,calendarSource:'Google Calendar',calendarNaturalIntegration:true,calendarIntegrationReview:ni.review,calendarIntegrationPages:ni.pages,calendarIntegrationOutput:ni.output,calendarIntegrationMinimum:ni.minimum,calendarIntegrationTime:ni.time}));
  }else{
   if(nr){
    var nrs=calendarNaturalRanges(nr).map(function(r){return Number(r[0])===Number(r[1])?'p.'+r[0]:'p.'+r[0]+'–'+r[1]}).join('、');
    if(nrs)nd+='｜建議：'+(nr.material||'123日的淬鍊')+' '+nrs;
    if(nr.basis)nd+='｜'+nr.basis;
   }
   a.push(presetDef('cal_natural_'+date.replace(/-/g,''),'scienceReview','自然',nd,true,{subject:calendarNaturalSubject(nat),calendarTopic:nat,calendarSource:'Google Calendar'}));
  }
 }
 return a;
}
function calendarEventToken(value){return String(value||'event').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80)}
function calendarIdentifierToken(value){
 var raw=String(value||'item'),hash=2166136261;
 for(var i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619)}
 var readable=raw.replace(/[^A-Za-z0-9_-]/g,'_').replace(/^_+|_+$/g,'').slice(0,48)||'item';
 return readable+'_'+(hash>>>0).toString(36)
}
function calendarFixedTemplateDef(p,token){
 var s=calendarFixedTemplateSpec(p.template);if(!s)return null;
 var f=cloneObj(s[3]);f.calendarFixedTemplate=p.template;f.calendarOriginalTitle=p.title;f.calendarEventId=p.sourceEventId;f.calendarEventKey=p.eventKey;
 if((p.template==='mathStudy'||p.template==='mathPractice')&&p.startPage){f.start=String(p.startPage);f.end=String(p.endPage||p.startPage);f.material='教學講義';f.calendarMathMaterialLocked=true}
 return presetDef('cal_fixed_'+p.template+'_'+token,s[0],s[1],s[2]+'｜Google Calendar API：'+p.title,true,f);
}
function calendarAzarSectionDef(p,token,chapter,section){
 var key='cal_azar_'+token+'_ch'+chapter.number+'_'+String(section.code||'section').replace(/[^A-Za-z0-9_-]/g,'_');
 var title=AZAR_GRAMMAR_BOOK_TITLE+'｜Ch.'+chapter.number+' '+chapter.title+'｜'+section.code+section.title;
 return presetDef(key,'extra',title,'Google Calendar API：'+p.title+'｜'+(section.start===section.end?'p.'+section.start:'p.'+section.start+'–'+section.end),true,{title:AZAR_GRAMMAR_BOOK_TITLE,azarChapterNumber:chapter.number,azarChapterTitle:chapter.title,azarChapterLabel:chapter.label,azarSectionCode:section.code,azarSectionTitle:section.title,start:String(section.start),end:String(section.end),round:String(section.code),calendarBookRangeLocked:true,calendarEventId:p.sourceEventId,calendarEventKey:p.eventKey});
}
function calendarMathStudyDef(p,token,preserveSeparate){
 var mp=resolveCloudMathPlan(p)||null,ms=Number(p.startPage||(mp&&mp.start)||0),me=Number(p.endPage||(mp&&mp.end)||ms||0),mm=String(p.material||(mp&&mp.material)||'教學講義'),mb=String(p.book||(mp&&mp.book)||''),fields={material:mm,book:mb,start:ms?String(ms):'',end:me?String(me):'',calendarPlanTitle:p.title,calendarDailyPages:ms&&me?me-ms+1:0,calendarSuggestedStart:ms||'',calendarSuggestedEnd:me||'',calendarSuggestedMaterial:mm,calendarSuggestedBook:mb,calendarRangeSource:mp&&mp.calendarRangeSource||'',calendarMaterialSource:mp&&mp.calendarMaterialSource||'',calendarMathMaterialLocked:true,calendarEventId:p.sourceEventId,calendarEventKey:p.eventKey};
 if(preserveSeparate)fields.calendarPreserveSeparate=true;
 return presetDef('cal_math_'+token,'mathStudy','數學講義：進度','Google Calendar API：'+p.title+(p.description?'｜'+p.description:''),true,fields);
}
function calendarDateHasBuiltInMathStudy(date){var day=parseDate(date).getDay();return day>=1&&day<=6}
function cloudCalendarDefsForDate(date){
 var parsed=calendarParsedByDate[date]||[],out=[];
 parsed.forEach(function(p){
  var token=p.identifier?calendarIdentifierToken(p.identifier):calendarEventToken(p.sourceEventId||p.eventKey),outStart=out.length;
  if(p.kind==='ace'){
   (p.rounds||[]).forEach(function(round){out.push(presetDef('cal_ace_'+round+'_'+token,'extra','英文｜ACE Reading 第 '+round+' 回','Google Calendar API：'+p.title,true,{title:'ACE Reading',round:String(round),calendarEventId:p.sourceEventId,calendarEventKey:p.eventKey}))});
  }else if(p.kind==='listeningA'){
   (p.tests||[]).forEach(function(test){out.push(presetDef('cal_listening_a_'+test+'_'+token,'extra','英文｜'+LISTENING_TEST_BOOK_TITLE+' Test '+test,'Google Calendar API：'+p.title,true,{title:LISTENING_TEST_BOOK_TITLE,round:String(test),calendarEventId:p.sourceEventId,calendarEventKey:p.eventKey}))});
  }else if(p.kind==='gujin'){
   (p.rounds||[]).forEach(function(round){out.push(presetDef('cal_gujin_'+round+'_'+token,'chineseReading','國文｜古今悅讀一百 第 '+round+' 回','Google Calendar API：'+p.title,true,{kind:'reading',round:String(round),calendarEventId:p.sourceEventId,calendarEventKey:p.eventKey}))});
  }else if(p.kind==='bookPages'){
   var pageBookStart=p.startPage==null?'':String(p.startPage),pageBookEnd=p.endPage==null?pageBookStart:String(p.endPage),pageBookFields={kind:'book',book:p.book,title:p.book,start:pageBookStart,end:pageBookEnd,calendarBookRangeLocked:true,calendarEventId:p.sourceEventId,calendarEventKey:p.eventKey};
   if(p.subject==='英文')out.push(presetDef('cal_book_'+token,'extra','英文｜'+p.book,'Google Calendar API：'+p.title,true,pageBookFields));
   else out.push(presetDef('cal_book_'+token,'chineseReading','國文','Google Calendar API：'+p.title,true,pageBookFields));
  }else if(p.kind==='bookScope'){
   var scopeRounds=p.rounds&&p.rounds.length?p.rounds:[''];
   scopeRounds.forEach(function(round,scopeIndex){
    var scopeSuffix=calendarIdentifierToken((p.topic||'unknown')+'_'+(round||'unknown')+'_'+scopeIndex);
    var scopeError=!p.topic||!round?'Calendar 未提供可辨識的主題與回次。':'';
    out.push(presetDef('cal_book_'+token+'_'+scopeSuffix,'extra','英文｜'+p.book,'Google Calendar API：'+p.title+(scopeError?'｜'+scopeError:''),true,{title:p.book,book:p.book,topic:p.topic||'',round:String(round||''),calendarBookRangeLocked:true,calendarScopeParseError:scopeError,calendarEventId:p.sourceEventId,calendarEventKey:p.eventKey}));
   });
  }else if(p.kind==='azarGrammar'){
   var azarChapters=Array.isArray(p.chapters)?p.chapters:[];
   if(azarChapters.length){
    azarChapters.forEach(function(chapter){
     (chapter.sections||[]).forEach(function(section){out.push(calendarAzarSectionDef(p,token,chapter,section))});
    });
   }
   if(out.length===outStart){
    out.push(presetDef('cal_azar_'+token,'extra','英文｜'+AZAR_GRAMMAR_BOOK_TITLE,'Google Calendar API：'+p.title+'｜Calendar 未提供可辨識的第 1～428 頁頁碼。',true,{title:AZAR_GRAMMAR_BOOK_TITLE,start:p.startPage==null?'':String(p.startPage),end:p.endPage==null?'':String(p.endPage),calendarBookRangeLocked:true,calendarAzarParseError:'Calendar 未提供可辨識的第 1～428 頁頁碼。',calendarEventId:p.sourceEventId,calendarEventKey:p.eventKey}));
   }
  }else if(p.kind==='writing'&&p.round){
   out.push(presetDef('cal_writing_'+p.round+'_'+token,'extra','英文｜英文寫作測驗 第 '+p.round+' 回','Google Calendar API：'+p.title,true,{title:'英文寫作測驗',round:String(p.round),calendarFocus:p.focus||'',calendarEventId:p.sourceEventId,calendarEventKey:p.eventKey}));
  }else if(p.kind==='grammar'){
   var rawGt=String(p.title||'').replace(/^英文文法｜/,''),gp=resolveCloudGrammarPlan(p),gt=gp&&gp.displayTitle?gp.displayTitle:rawGt,gs=gp&&gp.start!=null?gp.start:p.startPage,ge=gp&&gp.end!=null?gp.end:p.endPage;
   var rt=gp&&gp.rangeText?gp.rangeText:(gs?(ge&&ge!==gs?'p.'+gs+'–'+ge:'p.'+gs):'依 Calendar 說明');
   out.push(presetDef('cal_grammar_'+token,'extra','英文｜英文文法總複習｜'+gt,'Google Calendar API：'+p.title+'｜'+rt+((p.focus||(gp&&gp.focus))?'｜'+(p.focus||(gp&&gp.focus)):''),true,{title:'英文文法總複習講義',start:gs==null?'':String(gs),end:ge==null?'':String(ge),calendarGrammarTitle:gt,calendarUnitProgress:p.unitProgress||'',calendarRangeText:rt,calendarRangeType:gp&&gp.rangeType?gp.rangeType:(gs?'pages':'calendar'),calendarRangeSource:gp&&gp.calendarRangeSource||null,calendarFocus:p.focus||(gp&&gp.focus)||'',calendarEventId:p.sourceEventId,calendarEventKey:p.eventKey}));
  }else if(p.kind==='essentialGrammar'){
   (p.units||[]).forEach(function(unit){out.push(presetDef('cal_essential_grammar_'+unit+'_'+token,'extra','英文｜Essential Grammar in Use｜Unit '+unit,'Google Calendar API：'+p.title+'｜Unit '+unit,true,{title:'Essential Grammar in Use',unit:String(unit),unitStart:String(unit),unitEnd:String(unit),calendarEventId:p.sourceEventId,calendarEventKey:p.eventKey}))});
  }else if(p.kind==='math'){
   var primaryMath=cloudMathPlanByDate[date]||null,isPrimaryMath=!!primaryMath&&String(primaryMath.calendarEventKey||'')===String(p.eventKey||''),usesBuiltIn=!p.makeup&&calendarDateHasBuiltInMathStudy(date)&&isPrimaryMath;
   if(!usesBuiltIn)out.push(calendarMathStudyDef(p,token,!p.makeup));
  }else if(p.kind==='fixedTemplate'){
   var fixedDef=calendarFixedTemplateDef(p,token);if(fixedDef)out.push(fixedDef);
  }else if(p.kind==='natural'){
   var nr=resolveNaturalCalendarPlan(p,naturalRecommendationByTopic(p.topic)),nd='Google Calendar API：'+p.title,ff={subject:p.subject,calendarTopic:p.title,calendarSource:'Google Calendar API',calendarEventId:p.sourceEventId,calendarEventKey:p.eventKey};
   if(nr){
    var ranges=calendarNaturalRanges(nr),nrs=ranges.map(function(r){return Number(r[0])===Number(r[1])?'p.'+r[0]:'p.'+r[0]+'–'+r[1]}).join('、');
    if(nrs)nd+='｜建議：'+(nr.material||'123日的淬鍊')+' '+nrs;
    if(nr.material)ff.material=nr.material;
    if(nr.calendarRangeSource)ff.calendarRangeSource=nr.calendarRangeSource;
    if(ranges.length===1){ff.start=String(ranges[0][0]);ff.end=String(ranges[0][1])}
   }
   out.push(presetDef('cal_natural_'+token,'scienceReview','自然',nd,true,ff));
  }else if(p.kind==='naturalIntegration'){
   var ni=cloudNaturalIntegrationDetailsByDate[date]||{};
   out.push(presetDef('cal_natural_'+token,'scienceReview','自然','Google Calendar API：'+p.title+'｜依指定科目與頁碼完成。',true,{subject:'混合',calendarTopic:p.title,calendarSource:'Google Calendar API',calendarNaturalIntegration:true,calendarIntegrationReview:ni.review||'',calendarIntegrationPages:ni.pages||'',calendarIntegrationOutput:ni.output||'',calendarIntegrationMinimum:ni.minimum||'',calendarIntegrationTime:ni.time||'',calendarEventId:p.sourceEventId,calendarEventKey:p.eventKey}));
  }else if(p.kind==='subjectItem'){
   out.push(presetDef('cal_subject_'+token,'general',p.title,'Google Calendar API'+(p.description?'：'+p.description:''),true,{subject:p.subject,calendarEventId:p.sourceEventId,calendarEventKey:p.eventKey}));
  }
  var route=p.makeup?'today':(p.route||'today');
  for(var oi=outStart;oi<out.length;oi++){out[oi].required=route==='today'&&!p.makeup;out[oi].f.calendarRoute=route;out[oi].f.calendarMakeup=!!p.makeup;out[oi].f.calendarSourceDate=p.sourceDate||p.date;if(p.identifier)out[oi].f.calendarIdentifier=p.identifier}
 });
 return out;
}
function calendarDefsForDate(date){
 return calendarConnected&&calendarCacheLoaded?cloudCalendarDefsForDate(date):hardcodedCalendarDefsForDate(date);
}
function activeCalendarMathPlan(date){return calendarConnected&&calendarCacheLoaded?(cloudMathPlanByDate[date]||null):(CALENDAR_MATH_PLAN[date]||null)}

function calendarWeekMathTarget(date){
 var mon=dateString(mondayOf(parseDate(date)));
 return Number(CALENDAR_WEEK_MATH_TARGETS[mon]||0);
}
function applyCalendarMathPlan(rec,date){
 var p=activeCalendarMathPlan(date);if(!p||!rec||!Array.isArray(rec.items))return false;
 var x=null;
 for(var i=0;i<rec.items.length;i++)if(rec.items[i]&&rec.items[i].type==='mathStudy'&&rec.items[i].source==='preset'&&!/^cal_math_/.test(String(rec.items[i].presetKey||''))){x=rec.items[i];break}
 if(!x)return false;
 if(!x.f)x.f={};
 var changed=false,blank=!x.f.material&&!x.f.book&&!x.f.start&&!x.f.end;
 if(blank){x.f.material=p.material||'教學講義';x.f.book=p.book;x.f.start=String(p.start);x.f.end=String(p.end);changed=true}
 var userFields=x.f.dailyWorkUserFields&&typeof x.f.dailyWorkUserFields==='object'?x.f.dailyWorkUserFields:{};
 if(p.calendarRangeSource==='calendar'){
 if(!Object.prototype.hasOwnProperty.call(userFields,'start')&&x.f.start!==String(p.start)){x.f.start=String(p.start);changed=true}
 if(!Object.prototype.hasOwnProperty.call(userFields,'end')&&x.f.end!==String(p.end)){x.f.end=String(p.end);changed=true}
 }
 if(p.calendarMaterialSource==='calendar'){
  if(p.material&&!Object.prototype.hasOwnProperty.call(userFields,'material')&&x.f.material!==p.material){x.f.material=p.material;changed=true}
  if(p.book&&!Object.prototype.hasOwnProperty.call(userFields,'book')&&x.f.book!==p.book){x.f.book=p.book;changed=true}
 }
 var meta={calendarPlanTitle:p.title,calendarUnitPages:p.unitPages,calendarUnitTargetPages:Number(CALENDAR_MATH_UNIT_TARGET_OVERRIDES[p.title]||p.unitPages||0),calendarWeekTarget:calendarWeekMathTarget(date),calendarDailyPages:p.pages,calendarSuggestedStart:p.start,calendarSuggestedEnd:p.end,calendarSuggestedMaterial:p.material||'教學講義',calendarSuggestedBook:p.book,calendarRangeSource:p.calendarRangeSource||'unit',calendarMaterialSource:p.calendarMaterialSource||'',calendarMathMaterialLocked:true};
 for(var k in meta)if(Object.prototype.hasOwnProperty.call(meta,k)&&x.f[k]!==meta[k]){x.f[k]=meta[k];changed=true}
 applyMathAuto(x.f);
 return changed;
}
function mixedWritingDay(date){
 if(date<MIXED_WRITING_START)return false;
 var diff=Math.round((parseDate(date).getTime()-parseDate(MIXED_WRITING_START).getTime())/86400000);
 return diff%3===0;
}
function previousDateString(date){var d=parseDate(date);d.setDate(d.getDate()-1);return dateString(d)}
function fridayMockExistsForSaturday(date){return parseDate(date).getDay()!==6||!mixedWritingDay(previousDateString(date))}
function weekdayPresets(day){
 if(day>=1&&day<=4){
  var a=[presetDef('weekday_math_study','mathStudy','數學講義：進度','完成講義頁數，並理解該範圍的新觀念、定義、公式與主要例題。',true)];
  if(day===2||day===4)a.push(presetDef('weekday_math_practice','mathPractice','數學講義題目：理解檢查＋錯題標記＋訂正','檢查理解，整理錯因／不熟觀念並完成訂正；若錯題少，可延續講義進度。',true));
  a.push(presetDef('daily_interactive','interactiveDaily','互動題','數 A、英文、生物互動題皆由此手動新增。',true));
  a.push(presetDef('weekday_magazine','magazine','學測英文訓練：英文雜誌','閱讀文章、理解內容並整理字詞。',true));
  a.push(presetDef('weekday_english_review','general','英文訂正與搭配詞整理','訂正題目並整理重要單字、片語與搭配詞。',true));
  return a;
 }
 if(day===5)return[
  presetDef('fri_math_study','mathStudy','數學講義：進度','完成較輕量的講義頁數，並理解新觀念與主要例題；可參考 8～10 頁。',true),
  presetDef('daily_interactive','interactiveDaily','互動題','數 A、英文、生物互動題皆由此手動新增。',true),
  presetDef('fri_magazine','magazine','學測英文訓練：英文雜誌','閱讀文章、理解內容並整理字詞。',true),
  presetDef('fri_mock_timed','mock','英文歷屆／模考：限時作答','依正式時間完成一回試題。',true,{subject:'英文',subjectLocked:true})
 ];
 if(day===6)return[
  presetDef('sat_math_fill','mathStudy','數學講義：進度','填寫冊別與頁碼，理解該範圍的新觀念與主要例題，並依本週 Google Calendar 頁數目標補足。',true),
  presetDef('sat_math_practice','mathPractice','數學講義題目：理解檢查＋錯題標記＋訂正','檢查理解，整理錯因／不熟觀念並完成訂正；若錯題少，可延續講義進度。',true),
  presetDef('daily_interactive','interactiveDaily','互動題','數 A、英文、生物互動題皆由此手動新增。',true),
  presetDef('sat_mock_correction','mock','英文歷屆／模考：批改與訂正','批改試題、重做錯題、分析選項，並整理單字與搭配詞。',true,{subject:'英文',subjectLocked:true})
 ];
 return[
  presetDef('sun_math_practice','mathPractice','數學講義題目：理解檢查＋錯題標記＋訂正','檢查理解，整理錯因／不熟觀念並完成訂正；若錯題少，可延續講義進度。',true),
  presetDef('daily_interactive','interactiveDaily','互動題','數 A、英文、生物互動題皆由此手動新增。',true),
  presetDef('sun_english_optional','extra','英文輕量閱讀','可從既有英文書目中選擇輕量閱讀內容，不要求完整整理。',false)
 ];
}

function presetsForDate(date){
 var day=parseDate(date).getDay(),defs=weekdayPresets(day).slice(),i,a=[],hasFriMagazine=false;
 if(day===6&&!fridayMockExistsForSaturday(date)){
  for(i=0;i<defs.length;i++)if(defs[i].key!=='sat_mock_correction')a.push(defs[i]);defs=a;
 }
 if(mixedWritingDay(date)){
  a=[];for(i=0;i<defs.length;i++)if(defs[i].key!=='fri_mock_timed')a.push(defs[i]);defs=a;
  defs.push(presetDef('english_mixed_writing','englishMixedWriting','英文：混合題與作文練習','每三天一次；先處理優先修改錯誤，再記錄作文與混合題分數。',true));
 }
 /* 星期五英文雜誌為固定必做，避免任何條件排程或舊版本資料造成遺失。 */
 if(day===5){
  for(i=0;i<defs.length;i++)if(defs[i]&&defs[i].key==='fri_magazine'){hasFriMagazine=true;break}
  if(!hasFriMagazine)defs.push(presetDef('fri_magazine','magazine','學測英文訓練：英文雜誌','閱讀文章、理解內容並整理字詞。',true));
 }
 var cal=calendarDefsForDate(date);for(i=0;i<cal.length;i++)defs.push(cal[i]);
 return dedupePresetDefinitions(defs);
}
function makePresetItem(def,date){return{id:'preset-'+date+'-'+def.key,type:def.type,done:false,deferred:false,minutes:'',required:def.required,source:'preset',presetKey:def.key,templatePresetKey:def.key,title:def.title,description:def.description,f:cloneObj(def.f)}}
function mondayDateOfWeek(date){
 return dateString(mondayOf(parseDate(date)));
}
function weekDayOffset(day){return day===0?6:day-1}
function deferredTargetDay(item){
 var day=Number(item&&item.deferredTargetDay);
 return day===0||(day>=2&&day<=6)?day:0;
}
function deferredTargetLabel(item){return weekdays[deferredTargetDay(item)]||'星期日'}
function confirmedDeferred(item){return !!item&&isConfirmedDeferred(item)}
function pendingDeferredTarget(item){
 if(!item||!Object.prototype.hasOwnProperty.call(pendingDeferredTargets,item.id))return null;
 var day=Number(pendingDeferredTargets[item.id]);
 return day===0||(day>=2&&day<=6)?day:null;
}
function clearPendingDeferred(item){if(item)delete pendingDeferredTargets[item.id]}
function clearDeferredLimitPrompt(item){if(!item||deferredLimitPrompt&&deferredLimitPrompt.itemId===item.id)deferredLimitPrompt=null}
var deferredCapacityCache=null;
function deferredCapacityItems(date){
 var week=mondayDateOfWeek(date);
 if(deferredCapacityCache&&deferredCapacityCache.week===week)return deferredCapacityCache.items;
 var mon=parseDate(week),items=[];
 for(var i=0;i<6;i++){
  var d=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+i,12),ds=dateString(d);
  var r=(data&&data.date===ds)?data:loadData(ds);
  if(r&&Array.isArray(r.items))items=items.concat(r.items);
 }
 deferredCapacityCache={week:week,items:items};
 return items;
}
function deferredTargetCount(date,targetDay,excludedItem){
 return countDeferredToDay(deferredCapacityItems(date),targetDay,excludedItem);
}
function availableDeferredTargetDays(date,item){
 return futureDeferredDays(parseDate(date).getDay()).filter(function(day){
  return deferredTargetCount(date,day,item)<DEFERRED_TARGET_LIMIT;
 });
}
function nextDeferredTargetDay(date,item){
 var days=availableDeferredTargetDays(date,item);
 if(days.length)return days[0];
 var futureDays=futureDeferredDays(parseDate(date).getDay());
 return futureDays.length?futureDays[0]:null;
}
function deferredCapacityMarkup(date,targetDay){
 var count=deferredTargetCount(date,targetDay),countClass=count>DEFERRED_TARGET_LIMIT?' class="defer-capacity-over"':'';
 return '<span'+countClass+'>'+count+'</span>／'+DEFERRED_TARGET_LIMIT;
}
function deferredTargetOptions(date,current,item){
 var days=futureDeferredDays(parseDate(date).getDay()),selected=Number(current);
 if(days.indexOf(selected)<0&&days.length)selected=days[0];
 return days.map(function(day){
  return'<option value="'+day+'"'+(day===selected?' selected':'')+'>'+weekdays[day]+'</option>';
 }).join('');
}
function deferredCarryKey(originDate,item){
 return 'deferred_'+originDate.replace(/-/g,'')+'_'+String(item.id||item.presetKey||'item').replace(/[^A-Za-z0-9_-]/g,'_');
}
function deferredCarryOriginIds(item){
 var ids=[];
 function add(value){if(value!==undefined&&value!==null&&String(value).trim()&&ids.indexOf(String(value).trim())<0)ids.push(String(value).trim())}
 if(item&&Array.isArray(item.deferredOriginIds))item.deferredOriginIds.forEach(add);
 if(item)add(item.deferredOriginId);
 return ids;
}
function deferredCarryMatches(wanted,existing){
 if(!wanted||!existing)return false;
 if(wanted.presetKey&&wanted.presetKey===existing.presetKey)return true;
 var wantedIds=deferredCarryOriginIds(wanted),existingIds=deferredCarryOriginIds(existing);
 return wantedIds.some(function(originId){return existingIds.indexOf(originId)>=0});
}
function groupedWorkEntries(x){return x&&x.f&&Array.isArray(x.f.groupedWorkEntries)?x.f.groupedWorkEntries:[]}
function isGroupedWork(x){return groupedWorkEntries(x).length>0}
function groupedEntryMatch(a,b){
 if(!a||!b)return false;
 if(a.id&&a.id===b.id)return true;
 if(a.presetKey&&a.presetKey===b.presetKey)return true;
 var af=a.f||{},bf=b.f||{},aRound=String(af.round||'').trim(),bRound=String(bf.round||'').trim();
 var aAzarSection=String(af.azarSectionCode||'').trim(),bAzarSection=String(bf.azarSectionCode||'').trim();
 if(aAzarSection&&bAzarSection)return a.type===b.type&&aAzarSection===bAzarSection;
 var ae=calendarEventKeysFromFields(a.f||{}),be=calendarEventKeysFromFields(b.f||{});
 if(ae.some(function(k){return be.indexOf(k)>=0})){
  if(aRound&&bRound)return a.type===b.type&&aRound===bRound&&String(af.topic||'').trim()===String(bf.topic||'').trim()&&String(af.book||af.title||'').trim()===String(bf.book||bf.title||'').trim();
  return true;
 }
 var ao=deferredCarryOriginIds(a),bo=deferredCarryOriginIds(b);
 if(ao.some(function(k){return bo.indexOf(k)>=0}))return true;
 if(aRound&&bRound&&aRound===bRound&&String(af.topic||'').trim()===String(bf.topic||'').trim()&&String(af.book||af.title||'').trim()===String(bf.book||bf.title||'').trim()&&a.type===b.type)return true;
 return af.start&&af.end&&bf.start&&bf.end&&String(af.start)===String(bf.start)&&String(af.end)===String(bf.end)&&a.type===b.type;
}
function mergeGroupedEntry(template,existing){
 var next=cloneValue(template),old=existing||null;
 if(!old)return next;
 next.done=!!old.done;next.minutes=old.minutes||'';
 if(old.checkedOn)next.checkedOn=old.checkedOn;else delete next.checkedOn;
 if(old.deferredCompletedOn)next.deferredCompletedOn=old.deferredCompletedOn;else delete next.deferredCompletedOn;
 next.deferred=!!old.deferred;
 if(old.deferredTargetDay!==undefined)next.deferredTargetDay=old.deferredTargetDay;else delete next.deferredTargetDay;
 next.f=Object.assign({},cloneValue(template.f||{}),cloneValue(old.f||{}));
 ['title','book','topic','start','end','round','azarChapterNumber','azarChapterTitle','azarChapterLabel','azarSectionCode','azarSectionTitle','calendarBookRangeLocked','calendarMathMaterialLocked','calendarScopeParseError','calendarEventId','calendarEventIds','calendarEventKey','calendarEventKeys','calendarSourceDate','calendarSourceDates'].forEach(function(k){if(template.f&&template.f[k]!==undefined)next.f[k]=cloneValue(template.f[k])});
 return next;
}
function reconcileGroupedWorkEntries(templateEntries,existingEntries,legacyParent){
 var templates=Array.isArray(templateEntries)?templateEntries:[],existing=Array.isArray(existingEntries)?existingEntries:[],used={},out=[],legacyParentUses=0;
 templates.forEach(function(template){
  var found=null,fromLegacyParent=false;
  for(var i=0;i<existing.length;i++)if(!used[i]&&groupedEntryMatch(template,existing[i])){used[i]=true;found=existing[i];break}
  if(!found&&legacyParent&&groupedEntryMatch(template,legacyParent)){found=legacyParent;fromLegacyParent=true}
  var mergedEntry=mergeGroupedEntry(template,found);
  if(fromLegacyParent&&legacyParentUses>0)mergedEntry.minutes='';
  if(fromLegacyParent)legacyParentUses++;
  out.push(mergedEntry);
 });
 return out;
}
function updateGroupedParentDone(child){
 if(!child||!data||!Array.isArray(data.items))return;
 for(var i=0;i<data.items.length;i++){
  var parent=data.items[i],entries=groupedWorkEntries(parent);
  if(entries.indexOf(child)>=0){parent.done=entries.length>0&&entries.every(function(entry){return !!entry.done});return}
 }
}
function ensureDeferredForDate(rec,date){
 if(!rec)return false;
 var targetDay=parseDate(date).getDay(),targetOffset=weekDayOffset(targetDay);
 if(targetOffset<1)return false;
 if(!Array.isArray(rec.items))rec.items=[];
 var mon=parseDate(mondayDateOfWeek(date)),wanted={},changed=false;
 for(var i=0;i<targetOffset;i++){
  var d=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+i,12),ds=dateString(d),r=loadData(ds);
  if(!r||!Array.isArray(r.items))continue;
  deferredCapacityCandidates(r.items).forEach(function(x){
   var completedOnTarget=x&&x.done&&deferredCompletionDate(x)>=date;
   if(!x||!isDeferrableStudyItem(x)||!confirmedDeferred(x)||(x.done&&!completedOnTarget))return;
   if(deferredTargetDay(x)!==targetDay)return;
   var k=deferredCarryKey(ds,x),c=cloneOriginalItemForMakeup(x,{id:'preset-'+date+'-'+k,presetKey:k,originDate:ds});
   if(completedOnTarget){c.done=true;c.checkedOn=deferredCompletionDate(x);c.deferredCompletedOn=deferredCompletionDate(x)}
   wanted[k]=c;
  });
 }
 var wantedItems=mergeDeferredCarryRanges(Object.keys(wanted).map(function(k){return wanted[k]}));
 var clean=rec.items.filter(function(x){return !(x&&x.deferredCarry)}),existing=rec.items.filter(function(x){return x&&x.deferredCarry}),used={};
 wantedItems.forEach(function(template){
  var matchIndex=-1;
  for(var ei=0;ei<existing.length;ei++)if(!used[ei]&&existing[ei].presetKey===template.presetKey){matchIndex=ei;break}
  if(matchIndex<0)for(var ei2=0;ei2<existing.length;ei2++)if(!used[ei2]&&deferredCarryMatches(template,existing[ei2])){matchIndex=ei2;break}
  var keep=template;
  if(matchIndex>=0){used[matchIndex]=true;var completedSnapshot=existing[matchIndex]&&existing[matchIndex].done&&deferredCompletionDate(existing[matchIndex])>=date;keep=completedSnapshot?existing[matchIndex]:mergeMakeupProgress(template,existing[matchIndex]);if(JSON.stringify(keep)!==JSON.stringify(existing[matchIndex]))changed=true}
  else changed=true;
  clean.push(keep);
 });
 for(var ui=0;ui<existing.length;ui++)if(!used[ui])changed=true;
 rec.items=clean;
 return changed;
}
function rebuildDeferredForWeek(originDate){
 var mon=mondayOf(parseDate(originDate));
 for(var i=1;i<=6;i++){
  var target=dateString(new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+i,12)),r=loadData(target);
  if(ensureDailyPresets(r,target)){
   writeStoredRecord(r);
   if(typeof queueCloudSave==='function')queueCloudSave(r);
  }
 }
}
function ensureDailyPresets(rec,date){
 if(!rec||date<DAILY_PRESET_START)return false;
 if(!Array.isArray(rec.items))rec.items=[];
 var groupedSnapshot=JSON.stringify(rec.items);
 rec.items=ungroupDailyWorkItems(rec.items);
 var defs=presetsForDate(date),allowed={},i,x,d,changed=false,legacyCalendarByTemplate={},legacyCalendarByPresetKey={},legacyCalendarByEventKey={},legacyCalendarBookMinuteUse={},calendarDefinitionBySemantic={};
 var oldMathKeys={weekday_math_oral:1,fri_math_oral:1,sat_math_oral:1,sun_math_oral:1};
 var oldEnglishKeys={weekday_english_practice:1,fri_other:1,sat_english_practice:1,sun_english_practice:1};
 for(i=0;i<defs.length;i++){
  allowed[defs[i].key]=true;
  if(/^cal_/.test(defs[i].key||'')){
   var defSemantic=(defs[i].f&&defs[i].f.calendarSemanticKey)||presetDefinitionSemanticKey(defs[i]);
   calendarDefinitionBySemantic[defSemantic]=defs[i].key;
  }
 }
 var managed={weekday_math_practice:1,fri_math_practice:1,sat_math_practice:1,sun_math_practice:1,english_mixed_writing:1,fri_mock_timed:1,sat_mock_correction:1,fri_mock_check:1,fri_magazine:1,daily_interactive:1,sat_makeup:1,sat_week_review:1,weekday_math_oral:1,fri_math_oral:1,sat_math_oral:1,sun_math_oral:1,weekday_english_practice:1,fri_other:1,sat_english_practice:1,sun_english_practice:1,sun_math_optional:1,sun_rest:1,sun_plan_optional:1};
 var clean=[];
 for(i=0;i<rec.items.length;i++){
  x=rec.items[i];
  if(x&&x.source==='preset'&&(oldMathKeys[x.presetKey]||oldEnglishKeys[x.presetKey])){changed=true;continue}
  if(x&&x.source==='preset'&&/^cal_/.test(x.presetKey||'')&&!allowed[x.presetKey]){
   var legacyTemplate=(x.f&&x.f.calendarFixedTemplate)||calendarFixedTemplate(itemTitle(x));
   if(legacyTemplate&&(!legacyCalendarByTemplate[legacyTemplate]||x.done))legacyCalendarByTemplate[legacyTemplate]=x;
   var oldSemantic=(x.f&&x.f.calendarSemanticKey)||presetDefinitionSemanticKey({key:x.presetKey,type:x.type,title:itemTitle(x),description:x.description||'',required:!!x.required,f:x.f||{}});
   var retainedKey=calendarDefinitionBySemantic[oldSemantic];
   if(retainedKey&&(!legacyCalendarByPresetKey[retainedKey]||x.done))legacyCalendarByPresetKey[retainedKey]=x;
   var oldEventKeys=calendarEventKeysFromFields(x.f||{});
   oldEventKeys.forEach(function(oldEventKey){if(!legacyCalendarByEventKey[oldEventKey]||x.done)legacyCalendarByEventKey[oldEventKey]=x});
   changed=true;continue
  }
  if(x&&x.source==='preset'&&managed[x.presetKey]&&!allowed[x.presetKey]){changed=true;continue}
  clean.push(x);
 }
 rec.items=clean;
 var by={};
 for(i=0;i<rec.items.length;i++)if(rec.items[i]&&rec.items[i].presetKey)by[rec.items[i].presetKey]=rec.items[i];
 for(i=0;i<defs.length;i++){
  d=defs[i];
  x=by[d.key];
  if(!x){x=makePresetItem(d,date);rec.items.push(x);by[d.key]=x;changed=true}
  if(x.title!==d.title){x.title=d.title;changed=true}
  if(x.description!==d.description){x.description=d.description;changed=true}
  if(x.type!==d.type){x.type=d.type;changed=true}
  if(x.required!==d.required){x.required=d.required;changed=true}
  if(x.templatePresetKey!==d.key){x.templatePresetKey=d.key;changed=true}
  x.source='preset';
  if(!x.f)x.f={};
   if(x.f.calendarGroupedWork&&!(d.f&&d.f.calendarGroupedWork)){
    var remainingGrouped=groupedWorkEntries(x),remainingMatch=null;
    for(var rgi=0;rgi<remainingGrouped.length&&!remainingMatch;rgi++)if(groupedEntryMatch({type:d.type,presetKey:d.key,f:d.f||{}},remainingGrouped[rgi]))remainingMatch=remainingGrouped[rgi];
    if(remainingMatch&&remainingMatch.done&&!x.done)x.done=true;
    delete x.f.groupedWorkEntries;delete x.f.calendarGroupedWork;changed=true;
   }
   if(x.f.calendarMerged&&!(d.f&&d.f.calendarMerged)){
    ['calendarMerged','calendarMergedRange','calendarEventId','calendarEventIds','calendarEventKey','calendarEventKeys','calendarRoute','calendarOriginalTitle','calendarFixedTemplate','calendarIncludesMakeup','calendarSemanticKey','calendarSourceDate','calendarSourceDates','calendarGroupedWork','calendarRangeSource','calendarIdentifier','calendarUnitProgress'].forEach(function(mk){if(Object.prototype.hasOwnProperty.call(x.f,mk)){delete x.f[mk];changed=true}});
  }
  if(/^cal_(ace|azar|book|listening_a|writing|grammar|gujin|natural|essential_grammar|math|english_review|interactive|magazine|fixed|item)_/.test(d.key||'')||(d.f&&d.f.calendarMerged)){
   var df=d.f||{};
   if(/^cal_grammar_/.test(d.key||'')){
    var grammarPagesBlank=!x.f.start&&!x.f.end;
    var grammarUserFields=x.f.dailyWorkUserFields&&typeof x.f.dailyWorkUserFields==='object'?x.f.dailyWorkUserFields:{};
    var grammarExplicitCalendar=df.calendarRangeSource==='calendar';
     for(var dk in df)if(Object.prototype.hasOwnProperty.call(df,dk)){
      if(dk==='groupedWorkEntries'){
       var grammarGrouped=reconcileGroupedWorkEntries(df[dk],x.f[dk],x);
       if(JSON.stringify(x.f[dk])!==JSON.stringify(grammarGrouped)){x.f[dk]=grammarGrouped;changed=true}
       continue
      }
     if(dk==='start'||dk==='end'){
      var grammarHasUserOverride=Object.prototype.hasOwnProperty.call(grammarUserFields,dk);
      if((grammarPagesBlank||grammarExplicitCalendar)&&!grammarHasUserOverride&&x.f[dk]!==df[dk]){x.f[dk]=df[dk];changed=true}
     }else if(x.f[dk]!==df[dk]){x.f[dk]=df[dk];changed=true}
    }
   }else{
     for(var dk2 in df)if(Object.prototype.hasOwnProperty.call(df,dk2)){
      if(dk2==='groupedWorkEntries'){
       var nextGrouped=reconcileGroupedWorkEntries(df[dk2],x.f[dk2],x);
       if(JSON.stringify(x.f[dk2])!==JSON.stringify(nextGrouped)){x.f[dk2]=nextGrouped;changed=true}
       continue
      }
     if(Array.isArray(df[dk2])&&Array.isArray(x.f[dk2])&&!/^calendar/.test(dk2))continue;
     if(JSON.stringify(x.f[dk2])!==JSON.stringify(df[dk2])){x.f[dk2]=cloneValue(df[dk2]);changed=true}
    }
   }
  }
  var mergedTemplate=d.f&&d.f.calendarMerged?d.f.calendarFixedTemplate:null,newEventKeys=calendarEventKeysFromFields(d.f||{}),legacyEventItem=null,legacyEventMatchKey='';
  for(var nei=0;nei<newEventKeys.length&&!legacyEventItem;nei++){legacyEventItem=legacyCalendarByEventKey[newEventKeys[nei]]||null;if(legacyEventItem)legacyEventMatchKey=newEventKeys[nei]}
  var legacyItem=legacyCalendarByPresetKey[d.key]||(mergedTemplate?legacyCalendarByTemplate[mergedTemplate]:null)||legacyEventItem;
   if(legacyItem){
   if(legacyItem.done&&!x.done){x.done=true;changed=true}
    if(legacyItem.checkedOn&&!x.checkedOn){x.checkedOn=legacyItem.checkedOn;changed=true}
    if(legacyItem.deferredCompletedOn&&!x.deferredCompletedOn){x.deferredCompletedOn=legacyItem.deferredCompletedOn;changed=true}
    var isSplitBookDefinition=/^cal_book_/.test(d.key||''),mayCopyLegacyBookMinutes=!isSplitBookDefinition||!legacyEventMatchKey||!legacyCalendarBookMinuteUse[legacyEventMatchKey];
    if(!x.minutes&&legacyItem.minutes&&mayCopyLegacyBookMinutes){x.minutes=legacyItem.minutes;changed=true;if(isSplitBookDefinition&&legacyEventMatchKey)legacyCalendarBookMinuteUse[legacyEventMatchKey]=true}
    if(isGroupedWork(x)){
     var migratedGrouped=reconcileGroupedWorkEntries(groupedWorkEntries(x),groupedWorkEntries(legacyItem),legacyItem);
     if(JSON.stringify(groupedWorkEntries(x))!==JSON.stringify(migratedGrouped)){x.f.groupedWorkEntries=migratedGrouped;changed=true}
     x.done=migratedGrouped.length>0&&migratedGrouped.every(function(entry){return !!entry.done});
    }else if(isGroupedWork(legacyItem)){
     var migratedSingle=groupedWorkEntries(legacyItem).filter(function(entry){return groupedEntryMatch({type:d.type,presetKey:d.key,f:d.f||{}},entry)});
     if(migratedSingle.length){
      var migratedSource=migratedSingle.find(function(entry){return !!entry.done})||migratedSingle[0];
      if(migratedSingle.every(function(entry){return !!entry.done})&&!x.done){x.done=true;changed=true}
      if(migratedSource.checkedOn&&!x.checkedOn){x.checkedOn=migratedSource.checkedOn;changed=true}
      if(migratedSource.deferredCompletedOn&&!x.deferredCompletedOn){x.deferredCompletedOn=migratedSource.deferredCompletedOn;changed=true}
      if(!x.minutes&&migratedSource.minutes){x.minutes=migratedSource.minutes;changed=true}
      if(migratedSource.deferred&&!x.deferred){x.deferred=true;changed=true}
      if(migratedSource.deferredTargetDay!==undefined&&x.deferredTargetDay!==migratedSource.deferredTargetDay){x.deferredTargetDay=migratedSource.deferredTargetDay;changed=true}
      var migratedFields=migratedSource.f||{};
      for(var mf in migratedFields)if(Object.prototype.hasOwnProperty.call(migratedFields,mf)&&!/^calendar/.test(mf)&&!Object.prototype.hasOwnProperty.call(d.f||{},mf)){x.f[mf]=cloneValue(migratedFields[mf]);changed=true}
     }
    }
    var legacyFields=legacyItem.f||{};
   for(var lk in legacyFields)if(Object.prototype.hasOwnProperty.call(legacyFields,lk)&&!/^calendar/.test(lk)){
    var currentValue=x.f[lk],legacyValue=legacyFields[lk],currentBlank=currentValue===undefined||currentValue===null||currentValue===''||(Array.isArray(currentValue)&&currentValue.length===0);
    if(currentBlank&&legacyValue!==undefined&&legacyValue!==null&&legacyValue!==''){x.f[lk]=cloneValue(legacyValue);changed=true}
   }
   delete legacyCalendarByTemplate[mergedTemplate];
   delete legacyCalendarByPresetKey[d.key];
   if(!isSplitBookDefinition)newEventKeys.forEach(function(newEventKey){delete legacyCalendarByEventKey[newEventKey]});
  }
  if(x.f.calendarBookRangeLocked&&x.f.dailyWorkUserFields&&typeof x.f.dailyWorkUserFields==='object'){
   if(Object.prototype.hasOwnProperty.call(x.f.dailyWorkUserFields,'start')){delete x.f.dailyWorkUserFields.start;changed=true}
   if(Object.prototype.hasOwnProperty.call(x.f.dailyWorkUserFields,'end')){delete x.f.dailyWorkUserFields.end;changed=true}
  }
  var rangeBefore=JSON.stringify([x.f.start,x.f.end]);applyDailyWorkRangeOverrides(x);if(rangeBefore!==JSON.stringify([x.f.start,x.f.end]))changed=true;
  normalizeItem(x,date);
 }
 if(by.daily_interactive)ensureInteractiveEntries(by.daily_interactive);
 if(applyCalendarMathPlan(rec,date))changed=true;
 if(applyCalendarNaturalRecommended(rec,date))changed=true;
 for(i=0;i<rec.items.length;i++){
  x=rec.items[i];
  if(isCalendarNaturalIntegration(x)){
   var beforeIntegration=JSON.stringify((x.f&&x.f.calendarIntegrationEntries)||[]);
   ensureCalendarNaturalIntegrationEntries(x,date);
   if(beforeIntegration!==JSON.stringify(x.f.calendarIntegrationEntries||[]))changed=true;
  }
 }
 if(ensureDeferredForDate(rec,date))changed=true;
 rec.items=groupDailyWorkItems(rec.items);
 if(JSON.stringify(rec.items)!==groupedSnapshot)changed=true;
 return changed;
}

function dailyMessageForDate(date){
 var day=parseDate(date).getDay();
 if(day===5&&mixedWritingDay(date))return '星期五：今日以英文混合題與作文練習取代英文歷屆／模考限時作答。';
 if(day===6&&!fridayMockExistsForSaturday(date))return '星期六：因昨天沒有英文歷屆／模考限時作答，今日不安排英文歷屆／模考批改與訂正。';
 var base=['星期日：保留數學講義題目檢查與英文輕量閱讀。','星期一：保留原有固定項目。','星期二：保留原有固定項目。','星期三：保留原有固定項目。','星期四：保留原有固定項目。','星期五：保留原有固定項目。','星期六：保留原有固定項目與週整理。'][day];
 return base+(calendarDefsForDate(date).length||activeCalendarMathPlan(date)?'｜已加入 Google Calendar 當日讀書排程。':'');

}

function newItem(type,source){return{id:uid('i'),type:type||'',done:false,minutes:'',required:false,source:source||'custom',title:'',description:'',f:{}}}
function isAway(rec){return rec&&rec.mood==='外出'}
function visibleItems(rec){if(!rec||!Array.isArray(rec.items))return[];return rec.items.filter(function(x){return !(isAway(rec)&&x&&x.source==='preset')})}
function itemTitle(x){return x&&x.title?x.title:(labels[x.type]||x.type||'未選擇')}
function isEnglishReview(x){return specialItemTemplate(x)==='englishReview'}
function isFixedMagazine(x){return specialItemTemplate(x)==='fixedMagazine'}
function isSaturdayMakeup(x){return !!x&&x.type==='general'&&(effectiveTemplatePresetKey(x)==='sat_makeup'||x.title==='回補本週未完成項目')}
function isSaturdayReview(x){return !!x&&x.type==='general'&&(effectiveTemplatePresetKey(x)==='sat_week_review'||x.title==='本週完成度與錯題整理')}
function isInteractiveDaily(x){return specialItemTemplate(x)==='interactiveDaily'}
function isCalendarAce(x){return !!x&&(x.source==='preset'||x.calendarGroupedChild)&&/^cal_ace_/.test(effectiveTemplatePresetKey(x))}
function isCalendarListeningTestBook(x){return !!x&&(x.source==='preset'||x.calendarGroupedChild)&&/^cal_listening_a_/.test(effectiveTemplatePresetKey(x))}
function isCalendarGujin(x){return !!x&&(x.source==='preset'||x.calendarGroupedChild)&&/^cal_gujin_/.test(effectiveTemplatePresetKey(x))}
function isCalendarNatural(x){return !!x&&(x.source==='preset'||x.calendarGroupedChild)&&/^cal_natural_/.test(effectiveTemplatePresetKey(x))}
function isCalendarNaturalIntegration(x){return !!x&&isCalendarNatural(x)&&x.f&&x.f.calendarNaturalIntegration}
function calendarIntegrationRangeText(ranges){
 if(!Array.isArray(ranges)||!ranges.length)return'—';
 return ranges.map(function(r){return Number(r[0])===Number(r[1])?'p.'+r[0]:'p.'+r[0]+'–'+r[1]}).join('、');
}
function calendarIntegrationChapterText(subject,ranges){
 if(!Array.isArray(ranges)||!ranges.length)return'依實際錯題單元回查';
 var out=[];
 for(var i=0;i<ranges.length;i++){
  var t=day123Text(subject,ranges[i][0],ranges[i][1]);
  if(t&&out.indexOf(t)<0)out.push(t);
 }
 return out.length?out.join('；'):'—';
}
function ensureCalendarNaturalIntegrationEntries(x,date){
 if(!x||!x.f)x.f={};
 if(!Array.isArray(x.f.calendarIntegrationEntries))x.f.calendarIntegrationEntries=[];
 var defs=calendarConnected&&calendarCacheLoaded?(cloudNaturalIntegrationItemsByDate[date]||CALENDAR_NATURAL_INTEGRATION_ITEMS[date]||null):(CALENDAR_NATURAL_INTEGRATION_ITEMS[date]||null);
 if(!defs||!defs.length)return x.f.calendarIntegrationEntries;
 var old=x.f.calendarIntegrationEntries,by={},out=[];
 for(var i=0;i<old.length;i++)if(old[i]&&old[i].subject)by[old[i].subject]=old[i];
 for(var j=0;j<defs.length;j++){
 var d=defs[j],c=by[d.subject]||{};
  c.id='natural-integration-'+date+'-'+d.subject;
  c.type='scienceReview';
  c.title=d.subject;
  c.required=true;
  c.source='calendarNaturalIntegration';
  c.calendarIntegrationChild=true;
  c.subject=d.subject;
  c.material='123日的淬鍊';
  if(c.minutes===undefined)c.minutes='';
  if(!c.f||typeof c.f!=='object')c.f={};
  c.f.subject=d.subject;
  c.f.material='123日的淬鍊';
  c.ranges=cloneObj(d.ranges||[]);
  c.pageText=d.pageText||calendarIntegrationRangeText(c.ranges);
  c.chapterText=d.chapterText||calendarIntegrationChapterText(c.subject,c.ranges);
  c.dynamic=!!d.dynamic;
  if(typeof c.done!=='boolean')c.done=!!x.done;
  out.push(c);
 }
 var legacyMinutes=String(x.minutes||'').trim(),hasChildMinutes=out.some(function(c){return String(c.minutes||'').trim()!==''});
 if(legacyMinutes&&!hasChildMinutes){
  var completedChild=out.find(function(c){return !!c.done});
  if(completedChild){completedChild.minutes=legacyMinutes;x.minutes=''}
 }
 x.f.calendarIntegrationEntries=out;
 x.done=out.length>0&&out.every(function(c){return !!c.done});
 return out;
}
function completionDateMarkup(x){var label=completionDateLabel(x);return label?'<span class="completion-checked-on">'+esc(label)+'</span>':''}
function renderCalendarNaturalIntegrationEntry(c){
 var ranges=Array.isArray(c.ranges)?c.ranges:[];
 var single=ranges.length===1&&!c.dynamic&&!c.pageText.match(/ 或 /);
 var h='<div class="item subject-card subject-natural'+(c.done?' done':'')+'" data-item="'+esc(c.id)+'" style="margin-top:10px"><div class="item-top">';
 h+='<input type="checkbox" data-done'+checked(c.done)+'>';
 h+='<div class="item-title">'+esc(c.subject)+'</div>'+completionDateMarkup(c)+renderTimeControl(c)+'</div>';
 h+='<div class="inner"><div class="science-main-row">';
 h+='<div class="field"><label>科目</label><div class="fixed-book-value">'+esc(c.subject)+'</div></div>';
 h+='<div class="field"><label>講義版本</label><div class="fixed-book-value">123日的淬鍊</div></div>';
 if(single){
  h+='<div class="field compact-number"><label>起始頁</label><div class="fixed-book-value">'+esc(ranges[0][0])+'</div></div>';
  h+='<div class="field compact-number"><label>結束頁</label><div class="fixed-book-value">'+esc(ranges[0][1])+'</div></div>';
 }else{
  h+='<div class="field" style="flex:1"><label>指定頁碼</label><div class="fixed-book-value">'+esc(c.pageText||'—')+'</div></div>';
 }
 h+='</div>';
 h+='<div class="field" style="margin-top:10px"><label>123日的淬鍊｜頁碼對應章節</label><div class="small">'+esc(c.chapterText||'—')+'</div></div>';
 h+='</div></div>';
 return h;
}
function calendarNaturalSubject(title){
 var p=String(title||'').split('｜')[0].trim();
 return p==='自然整合'?'混合':(['物理','化學','生物','地科'].indexOf(p)>=0?p:'混合');
}

function ensureEntryArray(x,name){
 if(!x)return[];
 if(!x.f)x.f={};
 if(!Array.isArray(x.f[name]))x.f[name]=[];
 var a=x.f[name];
 for(var i=0;i<a.length;i++){
  if(!a[i]||typeof a[i]!=='object')a[i]=newItem('',name==='reviewEntries'?'review':'makeup');
  if(!a[i].id)a[i].id=uid(name==='reviewEntries'?'review':'makeup');
  if(!a[i].f)a[i].f={};
  if(!a[i].source)a[i].source=name==='reviewEntries'?'review':'makeup';
  if(a[i].required===undefined)a[i].required=false;
  if(a[i].done===undefined)a[i].done=false;
  if(a[i].minutes===undefined)a[i].minutes='';
 }
 return a;
}
function interactiveDailyChild(type){
 var c=newItem(type,'dailyInteractive');
 c.id=uid('interactive');
 c.type=type;
 c.source='dailyInteractive';
 c.required=true;
 c.title='';
 c.description='';
 c.f={};
 return c;
}
function ensureInteractiveEntries(x){
 if(!x.f)x.f={};
 if(!Array.isArray(x.f.interactiveEntries))x.f.interactiveEntries=[];
 var a=x.f.interactiveEntries,date=(data&&data.date)||'';
 var isMonday=date&&parseDate(date).getDay()===1;
 var mondayVocab=null;
 for(var i=0;i<a.length;i++){
  if(!a[i].f)a[i].f={};
  a[i].source='dailyInteractive';
  a[i].required=true;
  if(a[i].mondayFixedVocab||a[i].type==='englishVocabInteractive'&&a[i].locked){
   a[i].type='englishVocabInteractive';
   a[i].title='英文單字／片語互動題';
   a[i].locked=true;
   a[i].mondayFixedVocab=true;
   a[i].description='驗收上週不熟悉單字／片語';
   if(!mondayVocab)mondayVocab=a[i];
  }else a[i].locked=false;
 }
 if(isMonday&&!mondayVocab){
  mondayVocab=interactiveDailyChild('englishVocabInteractive');
  mondayVocab.id='monday-vocab-'+date;
  mondayVocab.title='英文單字／片語互動題';
  mondayVocab.description='驗收上週不熟悉單字／片語';
  mondayVocab.locked=true;
  mondayVocab.mondayFixedVocab=true;
  a.unshift(mondayVocab);
 }
 x.done=a.length>0&&a.every(function(c){return !!c.done});
 return a;
}
function interactiveDailyTypeOptions(v){
 var a=[
  ['mathOral','數 A 互動題：觀念題'],
  ['englishPractice','英文互動題：英聽及學測練習'],
  ['biologyInteractive','生物互動題'],
  ['englishVocabInteractive','英文單字／片語互動題']
 ];
 return'<option value="">請選擇</option>'+a.map(function(x){return'<option value="'+x[0]+'"'+selected(x[0],v)+'>'+x[1]+'</option>'}).join('');
}
function ensureMagazineEntries(x){
 if(!x.f)x.f={};var studyDate=(data&&data.date)||'';
 if(!Array.isArray(x.f.entries))x.f.entries=[{name:x.f.name||'',month:x.f.month||'',unit:x.f.unit||'',minutes:x.minutes||''}];
 if(!x.f.entries.length)x.f.entries.push({name:'',month:magazineMonthForDate(studyDate),magazineMonthInitialized:true,unit:'',minutes:''});
 x.f.entries.forEach(function(entry){if(!entry.id)entry.id=uid('mag');initializeMagazineMonth(entry,studyDate)});
 return x.f.entries;
}
function fixedMagazineMinutes(x){return ensureMagazineEntries(x).reduce(function(s,r){return s+Number(r.minutes||0)},0)}
function hidesTopMinutes(x){return isEnglishReview(x)||isFixedMagazine(x)||isSaturdayMakeup(x)||isInteractiveDaily(x)||isCalendarNaturalIntegration(x)}

var studyTimerTicker=null;
function timerPointerKey(){return STORE_PREFIX+'active-timer'}
function readTimerPointer(){
 try{var raw=store.getItem(timerPointerKey()),value=raw?JSON.parse(raw):null;return value&&value.date&&value.itemId?value:null}catch(e){return null}
}
function writeTimerPointer(pointer){
 try{if(pointer)store.setItem(timerPointerKey(),JSON.stringify(pointer));else store.removeItem(timerPointerKey())}catch(e){}
}
function sameTimerPointer(a,b){return !!a&&!!b&&a.date===b.date&&a.itemId===b.itemId&&String(a.entryId||'')===String(b.entryId||'')}
function timerTargetForRecord(rec,pointer){
 if(!rec||!pointer)return null;
 var item=findRecursive(rec.items,pointer.itemId);if(!item)return null;
 var entry=null;
 if(pointer.entryId){var entries=ensureMagazineEntries(item);entry=entries.find(function(row){return row.id===pointer.entryId})||null;if(!entry)return null}
 return{record:rec,item:item,entry:entry,pointer:pointer};
}
function currentTimerTarget(item,entryId){
 if(!item)return null;
 var pointer={date:data.date,itemId:item.id};
 if(entryId)pointer.entryId=entryId;
 return timerTargetForRecord(data,pointer);
}
function timerStateForTarget(target){
 var holder=target.entry||target.item.f||(target.item.f={});
 holder.timeTracking=normalizeStudyTimerState(holder.timeTracking);
 return holder.timeTracking;
}
function setTimerStateForTarget(target,state){
 var normalized=normalizeStudyTimerState(state);
 if(target.entry){target.entry.timeTracking=normalized;if(target.record===data)propagateDailyWorkField(target.item,'entries',ensureMagazineEntries(target.item))}
 else{if(!target.item.f)target.item.f={};target.item.f.timeTracking=normalized;if(target.record===data)propagateDailyWorkField(target.item,'timeTracking',normalized)}
 return normalized;
}
function setTimerMinutesForTarget(target,value){
 if(target.entry){
  var entries=ensureMagazineEntries(target.item),entryId=(target.pointer&&target.pointer.entryId)||target.entry.id,currentEntry=setTimedEntryMinutes(entries,entryId,value);
  if(!currentEntry)return;target.entry=currentEntry;
  if(target.record===data)propagateDailyWorkField(target.item,'entries',entries)
 }
 else{target.item.minutes=value;if(target.record===data)replaceDailyWorkMinutes(target.item,value)}
}
function persistTimerTarget(target){
 if(target.record===data){persist(false);return}
 target.record.localDirty=true;target.record.syncConflict=false;
 if(writeStoredRecord(target.record))queueCloudSave(target.record);
}
function recordForTimerDate(date){return data&&data.date===date?data:readStoredRecord(date)}
function activeTimerTarget(){var pointer=readTimerPointer();return pointer?timerTargetForRecord(recordForTimerDate(pointer.date),pointer):null}
function timerTargetTitle(target){
 var title=itemTitle(target.item);
 if(target.entry){var index=ensureMagazineEntries(target.item).indexOf(target.entry);title+='｜第'+(index+1)+'筆'}
 return title;
}
function pauseActiveTimer(now){
 var target=activeTimerTarget();if(!target){writeTimerPointer(null);return null}
 var state=timerStateForTarget(target);if(state.startedAt!==null)setTimerStateForTarget(target,pauseStudyTimer(state,now||Date.now()));
 persistTimerTarget(target);writeTimerPointer(null);return target;
}
function ensureTimerTicker(){
 var pointer=readTimerPointer();
 if(pointer&&!studyTimerTicker)studyTimerTicker=setInterval(refreshTimerUI,1000);
 if(!pointer&&studyTimerTicker){clearInterval(studyTimerTicker);studyTimerTicker=null}
}
function renderTimeControl(x,entry){
 var target={item:x,entry:entry||null},holder=entry||x.f||(x.f={}),state=normalizeStudyTimerState(holder.timeTracking),entryAttr=entry?' data-timer-entry="'+esc(entry.id)+'"':'',mode=state.mode;
 holder.timeTracking=state;
 var h='<span class="time-control"'+entryAttr+'><span class="time-mode-content">';
 if(mode==='manual'){
  if(entry)h+='<span class="minutes-badge"><input type="number" min="0" step="0.1" inputmode="decimal" data-mag-field="minutes" data-index="'+ensureMagazineEntries(x).indexOf(entry)+'" value="'+esc(entry.minutes||'')+'" aria-label="完成分鐘"> 分</span>';
  else h+='<span class="minutes-badge"><input type="number" min="0" step="0.1" inputmode="decimal" data-minutes value="'+esc(x.minutes||'')+'" aria-label="完成分鐘"> 分</span>';
 }else{
  h+='<strong class="timer-display" data-timer-display'+entryAttr+'>'+formatStudyTimer(state)+'</strong>';
  h+='<button class="secondary timer-button" type="button" data-action="timer-toggle"'+entryAttr+'>'+(state.startedAt!==null?'暫停':(state.accumulatedSeconds?'繼續':'開始'))+'</button>';
  h+='<button class="primary timer-button" type="button" data-action="timer-finish"'+entryAttr+'>完成並填入</button>';
  h+='<button class="timer-reset" type="button" data-action="timer-reset"'+entryAttr+'>重設</button>';
  if((entry?entry.minutes:x.minutes)!=='')h+='<span class="timer-filled">已填 '+esc(entry?entry.minutes:x.minutes)+' 分</span>';
 }
 h+='</span><span class="time-mode-segments" role="group" aria-label="時間填寫方式" data-active="'+(mode==='manual'?'0':'1')+'"><span class="time-mode-segment-indicator" aria-hidden="true"></span><button type="button" data-action="time-mode-select" data-time-mode="manual"'+entryAttr+' aria-pressed="'+(mode==='manual'?'true':'false')+'">手動</button><button type="button" data-action="time-mode-select" data-time-mode="timer"'+entryAttr+' aria-pressed="'+(mode==='timer'?'true':'false')+'">計時</button></span>';
 return h+'</span>';
}
function refreshTimerUI(){
 var now=Date.now();
 document.querySelectorAll('[data-timer-display]').forEach(function(display){
  var card=display.closest('[data-item]'),item=card?findItem(card.getAttribute('data-item')):null,entryId=display.getAttribute('data-timer-entry'),target=currentTimerTarget(item,entryId);
  if(target)display.textContent=formatStudyTimer(timerStateForTarget(target),now);
 });
 var summary=id('activeTimerSummary'),display=id('activeTimerDisplay'),title=id('activeTimerTitle'),target=activeTimerTarget();
 if(summary&&target){summary.hidden=false;if(display)display.textContent=formatStudyTimer(timerStateForTarget(target),now);if(title)title.textContent=timerTargetTitle(target)}
 else if(summary){summary.hidden=true;if(readTimerPointer())writeTimerPointer(null)}
 ensureTimerTicker();
}
function nestedTypeOptions(v){return'<option value="">請選擇</option>'+[['mathLecture','數學'],['scienceReview','自然'],['extra','英文'],['chineseReading','國文'],['mock','歷屆／模考']].map(function(a){return'<option value="'+a[0]+'"'+selected(a[0],v)+'>'+a[1]+'</option>'}).join('')}
function reviewTypeOptions(v){return'<option value="">請選擇</option>'+[['mathLecture','數學'],['scienceReview','自然'],['extra','英文'],['chineseReading','國文'],['mock','歷屆／模考']].map(function(a){return'<option value="'+a[0]+'"'+selected(a[0],v)+'>'+a[1]+'</option>'}).join('')}

function ranges(map,start,end){
 var s=Number(start),e=Number(end),out=[];if(!Number.isFinite(s)||s<1)return out;if(!Number.isFinite(e)||e<1)e=s;if(e<s){var t=s;s=e;e=t}
 for(var i=0;i<map.length;i++){var r=map[i];if(e<r[0]||s>r[1])continue;out.push({start:Math.max(s,r[0]),end:Math.min(e,r[1]),row:r})}return out;
}
function rangeText(a,getName){if(!a.length)return'尚無對應資料';return a.map(function(z){var p=z.start===z.end?'p.'+z.start:'p.'+z.start+'–'+z.end;return getName(z.row)+'（'+p+'）'}).join('、')}
function unique(a){return a.filter(function(v,i){return v&&a.indexOf(v)===i})}
function manualOptionGroup(label,values,current,labelFor){
 if(!values.length)return'';
 return'<optgroup label="'+esc(label)+'">'+values.map(function(value){return'<option value="'+esc(value)+'"'+selected(value,current)+'>'+esc(labelFor?labelFor(value):value)+'</option>'}).join('')+'</optgroup>';
}
function mathMaterialOptions(v){
 return'<option value="">請選擇</option>'+manualOptionGroup('新增講義',[MATH_GRAND_SLAM_MATERIAL],v,function(){return MATH_GRAND_SLAM_MATERIAL+'（數學A）'})+manualOptionGroup('其他講義',['教學講義','智慧型','新關鍵','複習週記'],v);
}
function isCalendarMathMaterialLocked(x){
 return !!(x&&x.f&&x.f.material&&x.f.calendarMathMaterialLocked===true&&(x.type==='mathStudy'||x.type==='mathLecture'||x.type==='mathPractice'));
}
function mathBookOptions(material,v){
 var a=material==='教學講義'?['1','2','3A','4A']:((material==='智慧型'||material==='新關鍵')?['1~2','3A~4A']:(material==='新大滿貫'?['A']:[]));
 return'<option value="">請選擇</option>'+a.map(function(x){return'<option value="'+x+'"'+selected(x,v)+'>'+(x==='1~2'?'1～2':x==='3A~4A'?'3A～4A':x==='A'?'數學A':x)+'</option>'}).join('');
}
function mathAutoSections(f){
 if(!f||!f.material)return[];
 if(f.material==='教學講義'&&TEACHING_MATH_PAGE_MAP[f.book])return ranges(TEACHING_MATH_PAGE_MAP[f.book],f.start,f.end);
 if(f.material==='複習週記')return ranges(REVIEW_WEEKLY_PAGE_MAP,f.start,f.end);
 if(f.material==='智慧型')return ranges(f.book==='1~2'?SMART_12_PAGE_MAP:(f.book==='3A~4A'?SMART_34_PAGE_MAP:[]),f.start,f.end);
 if(f.material==='新關鍵')return ranges(f.book==='1~2'?NEWKEY_12_PAGE_MAP:(f.book==='3A~4A'?NEWKEY_34_PAGE_MAP:[]),f.start,f.end);
 if(f.material==='新大滿貫')return ranges(f.book==='A'?MATH_GRAND_SLAM_PAGE_MAP:[],f.start,f.end);
 return[];
}
function applyMathAuto(f){
 var a=mathAutoSections(f);if(!f)return;
 if(f.material==='教學講義'){f.unit=unique(a.map(function(z){return z.row[2]})).join('／');f.chapter=unique(a.map(function(z){return z.row[3]})).join('／')}
 else if(f.material==='複習週記'){f.unit='';f.chapter=unique(a.map(function(z){return z.row[2]})).join('／')}
 else if(f.material==='智慧型'||f.material==='新關鍵'||f.material==='新大滿貫'){f.unit=unique(a.map(function(z){return z.row[2]})).join('／');f.chapter=''}
}
function mathAutoText(f){
 var a=mathAutoSections(f);
 if(f.material==='教學講義')return rangeText(a,function(r){return r[2]+'：'+r[3]});
 return rangeText(a,function(r){return r[2]});
}
function renderMathFields(x,reviewMode){
 var f=x.f,materialField=isCalendarMathMaterialLocked(x)?'<div class="fixed-book-value">'+esc(f.material)+'</div>':'<select data-field="material">'+mathMaterialOptions(f.material)+'</select>',h='<div class="math-main-row"><div class="field"><label>講義版本</label>'+materialField+'</div>';
 if(!f.material)return h+'</div>';
 if(f.material!=='複習週記')h+='<div class="field"><label>冊數</label><select data-field="book">'+mathBookOptions(f.material,f.book)+'</select></div>';
 h+='<div class="field compact-number"><label>起始頁</label><input type="number" min="1" data-field="start" value="'+esc(f.start||'')+'" placeholder="起始"></div><div class="field compact-number"><label>結束頁</label><input type="number" min="1" data-field="end" value="'+esc(f.end||'')+'" placeholder="結束"></div></div>';
 applyMathAuto(f);
 var mathAutoField='<div class="field"><label>'+(f.material==='複習週記'?'對應章節':'對應單元／章節')+'</label><div class="small" data-math-auto>'+esc(mathAutoText(f))+'</div></div>';
 if(hasDeferredStudySource(x))h+='<div class="math-auto-source-row">'+mathAutoField+'<div class="field"><label>來源日期</label><div class="fixed-book-value">'+esc(groupedSourceDateText(x,(data&&data.date)||''))+'</div></div></div>';
 else h+='<div style="margin-top:10px">'+mathAutoField+'</div>';
 if(x.type==='mathStudy'&&f.calendarPlanTitle){
  h+='<div class="field" style="margin-top:10px"><label>Google Calendar 數學排程</label><div class="small"><strong>'+esc(f.calendarPlanTitle)+'</strong><br>本單元共 '+esc(f.calendarUnitPages)+' 頁｜建議總量 '+esc(f.calendarUnitTargetPages||f.calendarUnitPages)+' 頁｜本週需要寫約 '+esc(f.calendarWeekTarget)+' 頁｜今日約 '+esc(f.calendarDailyPages)+' 頁<br>建議頁碼：'+esc(f.calendarSuggestedBook)+' 冊 p.'+esc(f.calendarSuggestedStart)+'–'+esc(f.calendarSuggestedEnd)+'</div></div>';
 }
 if(x.type==='mathLecture'){
  if(!reviewMode)h+='<div class="checkline" style="margin-top:10px"><label><input type="checkbox" data-check="progress"'+checked(f.progress)+'> 進度</label><label><input type="checkbox" data-check="graded"'+checked(f.graded)+'> 批改</label><label><input type="checkbox" data-check="corrected"'+checked(f.corrected)+'> 訂正</label></div>';
  if(reviewMode||f.corrected)h+=reasonField(f);
 }
 return h;
}
function reasonField(f){return'<div class="field" style="margin-top:10px"><label>錯因／不熟觀念</label><textarea rows="3" data-field="reason" placeholder="記錄錯因、仍不熟的觀念或需要再複習的內容">'+esc(f.reason||'')+'</textarea></div>'}

function scienceMaterialOptions(subject,v){
 var a,added=[];
 if(subject==='混合')a=['複習週記'];
 else if(subject==='物理'){added=[PHYSICS_ADVANTAGE_MATERIAL,PHYSICS_COMEBACK_MATERIAL];a=['好考點','新關鍵','大滿貫','123日的淬鍊']}
 else if(subject==='化學'){added=[CHEMISTRY_NAVIGATOR_MATERIAL];a=['好考點','新關鍵','大滿貫','123日的淬鍊']}
 else if(subject==='生物'||subject==='地科')a=['新關鍵','大滿貫','123日的淬鍊'];
 else a=['新關鍵','大滿貫','123日的淬鍊'];
 var hint=!subject?'<optgroup label="新增講義（請先選科目）"><option disabled>化學｜'+CHEMISTRY_NAVIGATOR_MATERIAL+'</option><option disabled>物理｜'+PHYSICS_ADVANTAGE_MATERIAL+'</option><option disabled>物理｜'+PHYSICS_COMEBACK_MATERIAL+'</option></optgroup>':'';
 return'<option value="">請選擇</option>'+manualOptionGroup('新增講義',added,v)+hint+manualOptionGroup(subject==='混合'?'講義':'其他講義',a,v);
}
function normalizeScience(f){
 if(!f)return;
 if(f.subject==='混合')f.material='複習週記';
 else{
  if(f.material==='複習週記')f.material='';
  if((f.subject==='生物'||f.subject==='地科')&&f.material==='好考點')f.material='';
  if(f.material==='領航'&&f.subject!=='化學')f.material='';
  if((f.material==='優勢'||f.material==='逆轉勝')&&f.subject!=='物理')f.material='';
 }
}
function goodPointMaps(subject){return subject==='物理'?[GOODPOINT_PHYSICS_PAGE_MAP,GOODPOINT_PHYSICS_CHAPTER_MAP]:subject==='化學'?[GOODPOINT_CHEMISTRY_PAGE_MAP,GOODPOINT_CHEMISTRY_CHAPTER_MAP]:[[],[]]}
var DAY123_PAGE_MAPS={
 '物理':[
  [2,19,'Chapter 1 緒論'],
  [20,55,'Chapter 2 物質的組成和交互作用'],
  [56,113,'Chapter 3 物體的運動'],
  [114,143,'Chapter 4 電與磁的統一'],
  [144,183,'Chapter 5 光的波動性'],
  [184,219,'Chapter 6 能量'],
  [220,244,'Chapter 7 量子現象']
 ],
 '化學':[
  [2,8,'Chapter 0 學習要領與實驗器材'],
  [9,44,'Chapter 1 物質的組成'],
  [45,95,'Chapter 2 物質的形成'],
  [96,128,'Chapter 3 物質間的反應'],
  [129,171,'Chapter 4 水溶液中的反應'],
  [172,227,'Chapter 5 生活與環境化學']
 ],
 '生物':[
  [2,57,'Chapter 1 細胞的構造與功能'],
  [58,111,'Chapter 2 遺傳'],
  [112,163,'Chapter 3 演化']
 ],
 '地科':[
  [2,63,'Chapter 1 探索地球'],
  [64,111,'Chapter 2 地質'],
  [112,167,'Chapter 3 大氣'],
  [168,209,'Chapter 4 海洋'],
  [210,250,'Chapter 5 氣候變遷與永續發展']
 ]
};
function day123PageMap(subject){return DAY123_PAGE_MAPS[subject]||[]}
function day123Matches(subject,start,end){
 var map=day123PageMap(subject),out=[],s=Number(start),e=Number(end);
 if(!Number.isFinite(s)||s<1)return out;
 if(!Number.isFinite(e)||e<1)e=s;
 if(e<s){var t=s;s=e;e=t}
 for(var i=0;i<map.length;i++){
  var r=map[i];if(!r||e<r[0]||s>r[1])continue;
  out.push({start:Math.max(s,r[0]),end:Math.min(e,r[1]),chapter:r[2]});
 }
 return out;
}
function day123Text(subject,start,end){
 var map=day123PageMap(subject),a=day123Matches(subject,start,end);
 if(!map.length)return subject+'「123日的淬鍊」尚未建立頁碼對應。';
 if(!a.length)return'頁碼不在已建立的教材本文範圍內。';
 return a.map(function(z){return z.chapter+'（'+(z.start===z.end?'p.'+z.start:'p.'+z.start+'–'+z.end)+'）'}).join('、');
}

function lectureNaturalPageMap(subject,material){return naturalLecturePageMap(subject,material)||[]}
function lectureNaturalText(subject,material,start,end){
 var map=lectureNaturalPageMap(subject,material),a=ranges(map,start,end);
 if(!map.length)return'尚未建立此講義的頁碼對照。';
 if(!a.length)return'頁碼不在已建立的教材本文範圍內。';
 var text=rangeText(a,function(r){return r[2]+(r[3]?'｜'+r[3]:'')});
 if(material===PHYSICS_COMEBACK_MATERIAL)text+='；來源照片未提供各單元頁界，需補目錄後才能細分。';
 return text;
}
function applyLectureNatural(f){
 var a=ranges(lectureNaturalPageMap(f.subject,f.material),f.start,f.end);
 f.unit=unique(a.map(function(z){return z.row[2]})).join('／');
 f.chapter=unique(a.map(function(z){return z.row[3]})).join('／');
}

function goodPointCombinedText(subject,start,end){
 var maps=goodPointMaps(subject),units=ranges(maps[0],start,end),chapters=ranges(maps[1],start,end);if(!units.length)return'尚無對應資料';
 var groups=[],standalone=[];
 units.forEach(function(u){
  var normal=[],practice=[];chapters.forEach(function(c){
   var s=Math.max(u.start,c.start),e=Math.min(u.end,c.end);if(e<s)return;
   var p=s===e?'p.'+s:'p.'+s+'–'+e,text=c.row[2]+'（'+p+'）';
   if(c.row[2]==='115學測試題'||c.row[2]==='115年學測試題'){if(standalone.indexOf(text)<0)standalone.push(text)}
   else if(c.row[2]==='考點大補丸'||c.row[2]==='選擇題型當場練'||c.row[2]==='混合非選搶分數')practice.push(text);
   else normal.push(text);
  });
  if(normal.length)groups.push(u.row[2]+'：'+normal.join('、'));
  if(practice.length)groups.push('（'+u.row[2]+'）：'+practice.join('、'));
 });
 return groups.concat(standalone).join('、')||'尚無對應資料';
}
function applyGoodPoint(f){
 var maps=goodPointMaps(f.subject),u=ranges(maps[0],f.start,f.end),c=ranges(maps[1],f.start,f.end);
 f.unit=unique(u.map(function(z){return z.row[2]})).join('／');
 f.chapter=unique(c.map(function(z){return z.row[2]})).join('／');
}
function naturalReviewMatches(f,current){
 var s=Number(f.start),e=Number(f.end),out=[],seen={};if(!Number.isFinite(s)||s<1)return out;if(!Number.isFinite(e)||e<1)e=s;if(e<s){var t=s;s=e;e=t}
 function add(it){if(!it||it===current||it.type!=='scienceReview'||!it.f)return;var q=it.f;if(q.subject!=='混合'||q.material!=='複習週記'||!q.chapter)return;var a=Number(q.start),b=Number(q.end);if(!Number.isFinite(a)||a<1)return;if(!Number.isFinite(b)||b<1)b=a;if(b<a){var z=a;a=b;b=z}if(e<a||s>b)return;var k=a+'|'+b+'|'+q.chapter;if(seen[k])return;seen[k]=1;out.push({start:Math.max(s,a),end:Math.min(e,b),chapter:q.chapter})}
 if(data&&Array.isArray(data.items))data.items.forEach(add);
 try{localStudyDates().forEach(function(date){var o=readStoredRecord(date);if(o&&Array.isArray(o.items))o.items.forEach(add)})}catch(e2){}
 return out.sort(function(a,b){return a.start-b.start});
}
function naturalReviewText(x){var f=x.f,a=naturalReviewMatches(f,x);if(!a.length)return f.chapter||'尚無對應資料';return a.map(function(z){return z.chapter+'（'+(z.start===z.end?'p.'+z.start:'p.'+z.start+'–'+z.end)+'）'}).join('、')}
function applyNaturalReview(x){var a=naturalReviewMatches(x.f,x),c=unique(a.map(function(z){return z.chapter}));if(c.length)x.f.chapter=c.join('／')}
function calendarSourceDateLabel(value){
 var raw=String(value||'').trim(),m=raw.match(/^(?:\d{4}-)?(\d{1,2})[-\/](\d{1,2})$/);
 return m?Number(m[1])+'/'+Number(m[2]):(raw||'—');
}
function calendarTopicSourceRow(x){
 var f=x.f||{},showSource=shouldShowSourceDate(x,(data&&data.date)||'');
 return'<div class="calendar-topic-source-row'+(showSource?'':' source-hidden')+'"><div class="field"><label>Google Calendar 當日主題</label><div class="fixed-book-value">'+esc(f.calendarTopic||'—')+'</div></div>'+(showSource?'<div class="field"><label>來源日期</label><div class="fixed-book-value">'+esc(calendarSourceDateLabel(f.calendarSourceDate))+'</div></div>':'')+'</div>';
}
function renderScienceFields(x,reviewMode){
 var f=x.f;
 if(isCalendarNaturalIntegration(x)){
  var entries=ensureCalendarNaturalIntegrationEntries(x,(data&&data.date)||'');
  var ih='';
  if(f.calendarTopic)ih+=calendarTopicSourceRow(x);
  for(var ii=0;ii<entries.length;ii++)ih+=renderCalendarNaturalIntegrationEntry(entries[ii]);
  return ih;
 }
 normalizeScience(f);if(f.material==='好考點'&&(f.subject==='物理'||f.subject==='化學'))applyGoodPoint(f);else if(f.material==='領航'||f.material==='優勢'||f.material==='逆轉勝')applyLectureNatural(f);if(f.subject==='混合')applyNaturalReview(x);
 var subjectField=isCalendarNatural(x)
  ?'<div class="field"><label>科目</label><div class="fixed-book-value">'+esc(f.subject||'—')+'</div></div>'
  :'<div class="field"><label>科目</label><select data-field="subject"><option value="">請選擇</option>'+['混合','物理','化學','生物','地科'].map(function(s){return'<option'+selected(s,f.subject)+'>'+s+'</option>'}).join('')+'</select></div>';
 var h='<div class="science-main-row">'+subjectField;
 h+='<div class="field"><label>講義版本</label><select data-field="material">'+scienceMaterialOptions(f.subject,f.material)+'</select></div><div class="field compact-number"><label>起始頁</label><input type="number" min="1" data-field="start" value="'+esc(f.start||'')+'" placeholder="起始"></div><div class="field compact-number"><label>結束頁</label><input type="number" min="1" data-field="end" value="'+esc(f.end||'')+'" placeholder="結束"></div></div>';
 if(isCalendarNatural(x)&&f.calendarTopic)h+=calendarTopicSourceRow(x);
 if(f.material==='好考點'&&(f.subject==='物理'||f.subject==='化學'))h+='<div class="field" style="margin-top:10px"><label>對應單元／章節</label><div class="small" data-science-auto>'+esc(goodPointCombinedText(f.subject,f.start,f.end))+'</div></div>';
 if(f.material==='123日的淬鍊'&&f.subject!=='混合')h+='<div class="field" style="margin-top:10px"><label>123日的淬鍊｜頁碼對應章節</label><div class="small" data-science-auto>'+esc(day123Text(f.subject,f.start,f.end))+'</div></div>';
 if(f.material==='領航'||f.material==='優勢'||f.material==='逆轉勝')h+='<div class="field" style="margin-top:10px"><label>'+esc(f.material)+'｜頁碼對應單元／章節</label><div class="small" data-science-auto>'+esc(lectureNaturalText(f.subject,f.material,f.start,f.end))+'</div></div>';
 if(f.subject==='混合'&&f.material==='複習週記')h+='<div class="field" style="margin-top:10px"><label>對應章節</label><div class="small" data-science-auto>'+esc(naturalReviewText(x))+'</div></div>';
 if(!reviewMode)h+='<div class="checkline" style="margin-top:10px"><label><input type="checkbox" data-check="progress"'+checked(f.progress)+'> 進度</label><label><input type="checkbox" data-check="graded"'+checked(f.graded)+'> 批改</label><label><input type="checkbox" data-check="corrected"'+checked(f.corrected)+'> 訂正</label></div>';
 if(reviewMode||f.corrected)h+=reasonField(f);
 return h;
}

function isMagazineTitle(t){return t==='雜誌'||t==='英文雜誌'}
function isAce(t){return t==='ACE Reading'||t==='英文：ACE Reading'}
function isListeningTestBook(t){return isListeningTestBookTitle(t)}
function isWritingTest(t){return t==='英文寫作測驗'}
function isCalendarWritingTest(x){return !!x&&x.source==='preset'&&/^cal_writing_/.test(effectiveTemplatePresetKey(x))}
function isAzarGrammar(t){return isAzarGrammarBookTitle(t)}
function isCalendarAzarGrammar(x){return !!x&&(x.source==='preset'||x.calendarGroupedChild)&&/^cal_azar_/.test(effectiveTemplatePresetKey(x))}
function isGrammarReview(t){return t==='英文文法總複習講義'}
function isCalendarGrammarReview(x){return !!x&&x.source==='preset'&&/^cal_grammar_/.test(effectiveTemplatePresetKey(x))}
function isCalendarEssentialGrammar(x){return !!x&&x.source==='preset'&&/^cal_essential_grammar_/.test(effectiveTemplatePresetKey(x))}
function isWeeklyCalendarItem(x){return !!x&&x.source==='preset'&&x.f&&x.f.calendarRoute==='week'}
function isCalendarMakeup(x){return !!x&&x.source==='preset'&&x.f&&x.f.calendarMakeup===true}
function hasMergedCalendarMakeup(x){return !!x&&x.f&&x.f.calendarIncludesMakeup===true}

var GRAMMAR_REVIEW_PAGE_MAP=[
 [1,11,'Chapter 1 英文基本句型'],
 [12,27,'Chapter 2 動詞時態'],
 [28,44,'Chapter 3 被動語態'],
 [45,47,'Review 1（Chapter 1–Chapter 3）'],
 [48,63,'Chapter 4 助動詞'],
 [64,77,'Chapter 5 主詞與動詞一致'],
 [78,89,'Chapter 6 假設語氣'],
 [90,91,'Review 2（Chapter 4–Chapter 6）'],
 [92,102,'Chapter 7 名詞子句'],
 [103,120,'Chapter 8 形容詞子句（含關係詞）'],
 [121,139,'Chapter 9 副詞子句（含連接詞）'],
 [140,142,'Review 3（Chapter 7–Chapter 9）'],
 [143,158,'Chapter 10 不定詞'],
 [159,173,'Chapter 11 動名詞'],
 [174,190,'Chapter 12 分詞'],
 [191,192,'Review 4（Chapter 10–Chapter 12）'],
 [193,216,'Chapter 13 形容詞與副詞（含比較級）'],
 [217,237,'Chapter 14 代名詞'],
 [238,254,'Chapter 15 否定句與倒裝句'],
 [255,255,'Review 5（Chapter 13–Chapter 15）']
];
function grammarReviewSections(f){
 return ranges(GRAMMAR_REVIEW_PAGE_MAP,f&&f.start,f&&f.end);
}
function grammarReviewAutoText(f){
 return rangeText(grammarReviewSections(f),function(r){return r[2]});
}
function isTraumaland(t){return t==='Traumaland- Josh Silver'||t==='Traumaland'}
function isWarriors(t){return t==='Warriors- Erin Hunter'}
function warriorsBookOptions(v){
 var a=[
  ['1','1: Into the Wild'],
  ['2','2: Fire and Ice'],
  ['3','3: Forest of Secrets'],
  ['4','4: Rising Storm'],
  ['5','5: A Dangerous Path'],
  ['6','6: The Darkest Hour'],
  ['Enter the Clans','Enter the Clans']
 ];
 return'<option value="">請選擇</option>'+a.map(function(x){return'<option value="'+esc(x[0])+'"'+selected(x[0],v)+'>'+esc(x[1])+'</option>'}).join('');
}
function warriorsBookLabel(v){
 var a={'1':'1: Into the Wild','2':'2: Fire and Ice','3':'3: Forest of Secrets','4':'4: Rising Storm','5':'5: A Dangerous Path','6':'6: The Darkest Hour','Enter the Clans':'Enter the Clans'};
 return a[String(v||'')]||'—';
}

function normalizeTraumalandTopic(f){
 if(!f||!f.topic)return;
 var raw=String(f.topic).trim(),upper=raw.toUpperCase();
 for(var i=0;i<TRAUMALAND_TOPICS.length;i++){
  var t=TRAUMALAND_TOPICS[i].title;
  if(t.toUpperCase()===upper){f.topic=t;return}
 }
}
function traumalandTopicOptions(current){
 current=String(current||'').trim();
 var h='<option value="">請選擇 Topic</option>',found=false;
 for(var i=0;i<TRAUMALAND_TOPICS.length;i++){
  var t=TRAUMALAND_TOPICS[i],v=t.title;
  if(current===v)found=true;
  h+='<option value="'+esc(v)+'"'+selected(v,current)+'>第 '+t.chapter+' 章｜'+esc(v)+'</option>';
 }
 if(current&&!found)h+='<option value="'+esc(current)+'" selected>舊紀錄｜'+esc(current)+'</option>';
 return h;
}

function isPrism(t){return t==='Prism Reading'||/^Prism Reading [234]$/.test(String(t||''))}
function isEssentialGrammar(t){return t==='Essential Grammar in Use'}
function isCalendarPageMappedBook(x){
 var f=x&&x.f||{},book=canonicalPageMappedBook(f.book||f.title||x&&x.title);
 return !!book&&f.calendarBookRangeLocked===true;
}
function pageMappedBookOptions(values,current,placeholder){
 var normalized=String(current||'').trim(),found=false,h='<option value="">'+esc(placeholder)+'</option>';
 values.forEach(function(value){if(String(value)===normalized)found=true;h+='<option value="'+esc(value)+'"'+selected(value,normalized)+'>'+esc(value)+'</option>'});
 if(normalized&&!found)h+='<option value="'+esc(normalized)+'" selected>舊紀錄｜'+esc(normalized)+'</option>';
 return h;
}
function englishPageBookTopicOptions(book,current){return pageMappedBookOptions(bookTopics(book),current,'請選擇主題')}
function englishPageBookRoundOptions(book,topic,current){return pageMappedBookOptions(topic?bookDetailsForTopic(book,topic):bookDetails(book),current,'請選擇回次')}
function applyEnglishPageBookSelection(item,field,value){
 var f=item.f||(item.f={}),book=canonicalPageMappedBook(f.title||f.book),next=String(value||'');
 if(!book||pageMappedBookSubject(book)!=='英文'||isCalendarPageMappedBook(item))return false;
 if(field==='topic'){
  var currentRound=String(f.round||''),allowedRounds=bookDetailsForTopic(book,next);
  propagateDailyWorkField(item,'topic',next);
  if(currentRound&&allowedRounds.indexOf(currentRound)<0)propagateDailyWorkField(item,'round','');
 }else if(field==='round'){
  propagateDailyWorkField(item,'round',next);
 }
 return true;
}
function bookPageAutoField(book,start,end){
 return'<div class="chinese-book-map-row"><div class="field"><label>對應主題</label><div class="small" data-book-topic-auto>'+esc(bookPageTopicText(book,start,end))+'</div></div><div class="field"><label>對應章節</label><div class="small" data-book-detail-auto>'+esc(bookPageDetailText(book,start,end))+'</div></div></div>'
}
function applyChineseItemSelection(item,value){
 var book=canonicalPageMappedBook(value),visited=[];
 if(book&&pageMappedBookSubject(book)!=='國文')book=null;
 function apply(target){
  if(!target||visited.indexOf(target)>=0)return;visited.push(target);target.f||(target.f={});target.f.kind=book?'book':String(value||'');target.f.book=book||'';target.f.start='';target.f.end='';
  if(target.f.dailyWorkUserFields&&typeof target.f.dailyWorkUserFields==='object'){target.f.dailyWorkUserFields.start='';target.f.dailyWorkUserFields.end=''}
  var sources=target.f.dailyWorkSourceItems;if(Array.isArray(sources))sources.forEach(apply);
 }
 apply(item);return{kind:item.f.kind,book:item.f.book}
}
function readingOptions(v){
 var added=[ENGLISH_WEEKLY_PLAN_BOOK,ENGLISH_MIXED_30_BOOK],other=EXTRA_READING_TITLES.filter(function(title){return added.indexOf(title)<0});
 return'<option value="">請選擇</option>'+manualOptionGroup('新增講義',added,v)+manualOptionGroup('其他英文項目',other,v);
}
function reviewEnglishOptions(v){
 var added=[ENGLISH_WEEKLY_PLAN_BOOK,ENGLISH_MIXED_30_BOOK],other=['ACE Reading',LISTENING_TEST_BOOK_TITLE,AZAR_GRAMMAR_BOOK_TITLE,'英文寫作測驗','英文文法總複習講義','Prism Reading'];
 return'<option value="">請選擇</option>'+manualOptionGroup('新增講義',added,v)+manualOptionGroup('其他英文項目',other,v);
}
function prismLevel(f){if(f.level)return String(f.level);var m=String(f.title||'').match(/^Prism Reading ([234])$/);return m?m[1]:''}
function prismCefr(v){return String(v)==='2'?'B1':String(v)==='3'?'B2':String(v)==='4'?'C1':'尚未選擇'}
function renderExtraFields(x,reviewMode){
 var f=x.f,t=f.title||'',h='',bookOptions;
 if(reviewMode&&!isPrism(t)&&!isAce(t)&&!isEnglishPageMappedBook(t)&&!isListeningTestBook(t)&&!isAzarGrammar(t)&&!isWritingTest(t)&&!isGrammarReview(t)){
  f.title='';f.level='';f.start='';f.end='';f.round='';f.topic='';f.warriorsBook='';f.chapter='';f.name='';f.month='';f.unit='';f.progress=false;f.graded=false;f.corrected=false;
  t='';
 }
 bookOptions=reviewMode?reviewEnglishOptions(t):readingOptions(t);
 if(isPrism(t)){
  var pl=prismLevel(f);
  h+='<div class="english-book-row"><div class="field english-book"><label>書名</label><select data-field="title">'+bookOptions+'</select></div><div class="field"><label>版本</label><select data-field="level"><option value="">請選擇</option><option value="2"'+selected('2',pl)+'>2</option><option value="3"'+selected('3',pl)+'>3</option><option value="4"'+selected('4',pl)+'>4</option></select></div><div class="field"><label>CEFR Level</label><div class="small">'+prismCefr(pl)+'</div></div></div>';
  h+='<div class="grid-2" style="margin-top:10px"><div class="field compact-number"><label>起始頁</label><input type="number" min="1" data-field="start" value="'+esc(f.start||'')+'"></div><div class="field compact-number"><label>結束頁</label><input type="number" min="1" data-field="end" value="'+esc(f.end||'')+'"></div></div>';
  if(!reviewMode)h+='<div class="checkline" style="margin-top:10px"><label><input type="checkbox" data-check="progress"'+checked(f.progress)+'> 進度</label><label><input type="checkbox" data-check="graded"'+checked(f.graded)+'> 批改</label><label><input type="checkbox" data-check="corrected"'+checked(f.corrected)+'> 訂正</label></div>';
  if(reviewMode||f.corrected)h+=reasonField(f);
 }else if(isAce(t)){
  if(isCalendarAce(x)){
   h+='<div class="english-title-half"><div class="field english-book"><label>書名</label><div class="fixed-book-value">ACE Reading</div></div><div class="field compact-number"><label>回數</label><div class="fixed-book-value">第 '+esc(f.round||'—')+' 回</div></div></div>';
  }else{
   h+='<div class="english-title-half"><div class="field english-book"><label>書名</label><select data-field="title">'+bookOptions+'</select></div><div class="field compact-number"><label>回數</label><div class="inline"><span>第</span><input type="number" min="1" max="60" step="1" inputmode="numeric" data-field="round" value="'+esc(f.round||'')+'"><span>回</span></div></div></div>';
  }
 if(!reviewMode)h+='<div class="checkline" style="margin-top:10px"><label><input type="checkbox" data-check="progress"'+checked(f.progress)+'> 進度</label><label><input type="checkbox" data-check="graded"'+checked(f.graded)+'> 批改</label><label><input type="checkbox" data-check="corrected"'+checked(f.corrected)+'> 訂正</label></div>';
 if(reviewMode||f.corrected)h+=reasonField(f);
 }else if(isEnglishPageMappedBook(t)&&(t==='主題百匯：篇章結構·閱讀測驗'||t==='主題百匯：克漏字')){
  var englishPageBook=canonicalPageMappedBook(t);
  if(isCalendarPageMappedBook(x)){
   h+='<div class="grid-3"><div class="field"><label>書名</label><div class="fixed-book-value">'+esc(englishPageBook)+'</div></div><div class="field"><label>主題</label><div class="fixed-book-value">'+esc(f.topic||'—')+'</div></div><div class="field"><label>回次</label><div class="fixed-book-value">'+esc(f.round||'—')+'</div></div></div>';
   if(f.calendarScopeParseError||!f.topic||!f.round)h+='<div class="small calendar-scope-error" role="alert">'+esc(f.calendarScopeParseError||'Calendar 未提供可辨識的主題與回次。')+'</div>';
  }else{
   h+='<div class="grid-3"><div class="field"><label>書名</label><select data-field="title">'+bookOptions+'</select></div><div class="field"><label>主題</label><select data-book-topic>'+englishPageBookTopicOptions(englishPageBook,f.topic||'')+'</select></div><div class="field"><label>回次</label><select data-book-round>'+englishPageBookRoundOptions(englishPageBook,f.topic||'',f.round||'')+'</select></div></div>';
  }
  if(!reviewMode)h+='<div class="checkline" style="margin-top:10px"><label><input type="checkbox" data-check="progress"'+checked(f.progress)+'> 進度</label><label><input type="checkbox" data-check="graded"'+checked(f.graded)+'> 批改</label><label><input type="checkbox" data-check="corrected"'+checked(f.corrected)+'> 訂正</label></div>';
  if(reviewMode||f.corrected)h+=reasonField(f);
 }else if(isEnglishPageMappedBook(t)){
  var englishMappedBook=canonicalPageMappedBook(t),englishMappedStart=f.start||'',englishMappedEnd=f.end||'';
  if(isCalendarPageMappedBook(x)){
   h+='<div class="english-book-page-row"><div class="field"><label>書名</label><div class="fixed-book-value">'+esc(englishMappedBook)+'</div></div><div class="field compact-number"><label>起始頁</label><div class="fixed-book-value">'+esc(englishMappedStart||'—')+'</div></div><div class="field compact-number"><label>結束頁</label><div class="fixed-book-value">'+esc(englishMappedEnd||englishMappedStart||'—')+'</div></div></div>';
  }else{
   h+='<div class="english-book-page-row"><div class="field"><label>書名</label><select data-field="title">'+bookOptions+'</select></div><div class="field compact-number"><label>起始頁</label><input type="number" min="1" data-field="start" value="'+esc(englishMappedStart)+'"></div><div class="field compact-number"><label>結束頁</label><input type="number" min="1" data-field="end" value="'+esc(englishMappedEnd)+'"></div></div>';
  }
  h+=bookPageAutoField(englishMappedBook,englishMappedStart,englishMappedEnd);
  if(!reviewMode)h+='<div class="checkline" style="margin-top:10px"><label><input type="checkbox" data-check="progress"'+checked(f.progress)+'> 進度</label><label><input type="checkbox" data-check="graded"'+checked(f.graded)+'> 批改</label><label><input type="checkbox" data-check="corrected"'+checked(f.corrected)+'> 訂正</label></div>';
  if(reviewMode||f.corrected)h+=reasonField(f);
 }else if(isAzarGrammar(t)){
  if(isCalendarAzarGrammar(x)){
   var azarPageStart=Number(f.start),azarPageEnd=Number(f.end),azarPageText=Number.isFinite(azarPageStart)&&azarPageStart>0?(azarPageStart===azarPageEnd?'p.'+azarPageStart:'p.'+azarPageStart+'–'+azarPageEnd):'—';
   h+='<div class="grid-2"><div class="field"><label>書名</label><div class="fixed-book-value">'+esc(AZAR_GRAMMAR_BOOK_TITLE)+'</div></div><div class="field"><label>頁碼對照</label><div class="fixed-book-value">'+esc(azarPageText)+'</div></div></div>';
   if(f.calendarAzarParseError)h+='<div class="small calendar-scope-error" role="alert">'+esc(f.calendarAzarParseError)+'</div>';
  }else{
   h+='<div class="english-book-page-row"><div class="field"><label>書名</label><select data-field="title">'+bookOptions+'</select></div><div class="field compact-number"><label>起始頁</label><input type="number" min="1" max="428" data-field="start" value="'+esc(f.start||'')+'"></div><div class="field compact-number"><label>結束頁</label><input type="number" min="1" max="428" data-field="end" value="'+esc(f.end||'')+'"></div></div>';
   h+='<div class="field" style="margin-top:10px"><label>對應章節與分項</label><div class="small" data-azar-auto>'+esc(azarGrammarPageSummary(f.start,f.end))+'</div></div>';
   if(!reviewMode)h+='<div class="checkline" style="margin-top:10px"><label><input type="checkbox" data-check="progress"'+checked(f.progress)+'> 進度</label><label><input type="checkbox" data-check="graded"'+checked(f.graded)+'> 批改</label><label><input type="checkbox" data-check="corrected"'+checked(f.corrected)+'> 訂正</label></div>';
   if(reviewMode||f.corrected)h+=reasonField(f);
  }
 }else if(isListeningTestBook(t)){
  if(isCalendarListeningTestBook(x)){
   h+='<div class="english-title-half"><div class="field english-book"><label>書名</label><div class="fixed-book-value">'+esc(LISTENING_TEST_BOOK_TITLE)+'</div></div><div class="field compact-number"><label>Test</label><div class="fixed-book-value">Test '+esc(f.round||'—')+'</div></div></div>';
  }else{
   h+='<div class="english-title-half"><div class="field english-book"><label>書名</label><select data-field="title">'+bookOptions+'</select></div><div class="field compact-number"><label>Test</label><input type="number" min="1" max="'+LISTENING_TEST_MAX+'" step="1" inputmode="numeric" data-field="round" data-round-book="listening-test" value="'+esc(f.round||'')+'" placeholder="1～10"></div></div>';
  }
  if(!reviewMode)h+='<div class="checkline" style="margin-top:10px"><label><input type="checkbox" data-check="progress"'+checked(f.progress)+'> 進度</label><label><input type="checkbox" data-check="graded"'+checked(f.graded)+'> 批改</label><label><input type="checkbox" data-check="corrected"'+checked(f.corrected)+'> 訂正</label></div>';
  if(reviewMode||f.corrected)h+=reasonField(f);
 }else if(isWritingTest(t)){
  if(isCalendarWritingTest(x)){
   h+='<div class="english-title-half"><div class="field english-book"><label>書名</label><div class="fixed-book-value">英文寫作測驗</div></div><div class="field compact-number"><label>回數</label><div class="fixed-book-value">第 '+esc(f.round||'—')+' 回</div></div></div>';
   if(f.calendarFocus)h+='<div class="small" style="margin-top:8px">Google Calendar 重點：'+esc(f.calendarFocus)+'</div>';
  }else{
   h+='<div class="english-title-half"><div class="field english-book"><label>書名</label><select data-field="title">'+bookOptions+'</select></div><div class="field compact-number"><label>回數</label><div class="inline"><span>第</span><input type="number" min="1" max="40" step="1" inputmode="numeric" data-field="round" value="'+esc(f.round||'')+'"><span>回</span></div></div></div>';
  }
  if(!reviewMode)h+='<div class="checkline" style="margin-top:10px"><label><input type="checkbox" data-check="progress"'+checked(f.progress)+'> 進度</label><label><input type="checkbox" data-check="graded"'+checked(f.graded)+'> 批改</label><label><input type="checkbox" data-check="corrected"'+checked(f.corrected)+'> 訂正</label></div>';
  if(reviewMode||f.corrected)h+=reasonField(f);
 }else if(isGrammarReview(t)){
  if(isCalendarGrammarReview(x)){
   h+='<div class="english-book-page-row"><div class="field"><label>書名</label><div class="fixed-book-value">英文文法總複習講義</div></div><div class="field compact-number"><label>起始頁</label><input type="number" min="1" data-field="start" value="'+esc(f.start||'')+'" placeholder="實際起始"></div><div class="field compact-number"><label>結束頁</label><input type="number" min="1" data-field="end" value="'+esc(f.end||'')+'" placeholder="實際結束"></div></div>';
  }else{
   h+='<div class="english-book-page-row"><div class="field"><label>書名</label><select data-field="title">'+bookOptions+'</select></div><div class="field compact-number"><label>起始頁</label><input type="number" min="1" data-field="start" value="'+esc(f.start||'')+'"></div><div class="field compact-number"><label>結束頁</label><input type="number" min="1" data-field="end" value="'+esc(f.end||'')+'"></div></div>';
  }
  h+='<div class="field" style="margin-top:10px"><label>對應章節</label><div class="small" data-grammar-auto>'+esc(grammarReviewAutoText(f))+'</div></div>';
  if(isCalendarGrammarReview(x)&&f.calendarGrammarTitle){
   var calendarGrammar=grammarScheduleSummary(f.calendarFocus,f.calendarRangeText);
   h+='<div class="field" style="margin-top:10px"><label>Google Calendar 英文文法排程</label><div class="small">'+calendarGrammar.details.map(function(line){return esc(line)}).join('<br>')+'</div></div>';
  }
  if(!reviewMode)h+='<div class="checkline" style="margin-top:10px"><label><input type="checkbox" data-check="progress"'+checked(f.progress)+'> 進度</label><label><input type="checkbox" data-check="graded"'+checked(f.graded)+'> 批改</label><label><input type="checkbox" data-check="corrected"'+checked(f.corrected)+'> 訂正</label></div>';
  if(reviewMode||f.corrected)h+=reasonField(f);
 }else if(!reviewMode&&isEssentialGrammar(t)){
  if(isCalendarEssentialGrammar(x))h+='<div class="english-title-half"><div class="field english-book"><label>書名</label><div class="fixed-book-value">Essential Grammar in Use</div></div><div class="field compact-number"><label>Unit</label><div class="fixed-book-value">Unit '+esc(f.unit||f.unitStart||'—')+'</div></div></div>';
  else h+='<div class="english-book-page-row"><div class="field"><label>書名</label><select data-field="title">'+bookOptions+'</select><div class="small" style="margin-top:5px">全書共 115 Unit</div></div><div class="field compact-number"><label>起始 Unit</label><input type="number" min="1" max="115" step="1" inputmode="numeric" data-field="unitStart" value="'+esc(f.unitStart||'')+'"></div><div class="field compact-number"><label>結束 Unit</label><input type="number" min="1" max="115" step="1" inputmode="numeric" data-field="unitEnd" value="'+esc(f.unitEnd||'')+'"></div></div>';
 }else if(!reviewMode&&isTraumaland(t)){
  if(!f.topic&&f.progress)f.topic=f.progress;
  normalizeTraumalandTopic(f);
  h+='<div class="grid-2"><div class="field"><label>書名</label><select data-field="title">'+bookOptions+'</select></div><div class="field"><label>Topic</label><select data-field="topic">'+traumalandTopicOptions(f.topic||'')+'</select></div></div>';
 }else if(!reviewMode&&isWarriors(t)){
  h+='<div class="english-magazine-main"><div class="field english-book"><label>書名</label><select data-field="title">'+bookOptions+'</select></div><div class="field english-version"><label>冊別</label><select data-field="warriorsBook">'+warriorsBookOptions(f.warriorsBook||'')+'</select></div></div>';
  h+='<div class="english-magazine-sub"><div class="field compact-number"><label>Chapter</label><input type="number" min="1" step="1" inputmode="numeric" data-field="chapter" value="'+esc(f.chapter||'')+'"></div></div>';
 }else if(!reviewMode&&isMagazineTitle(t)){
  h+='<div class="english-magazine-main"><div class="field english-book"><label>書名</label><select data-field="title">'+bookOptions+'</select></div><div class="field english-version"><label>版本</label><select data-field="name"><option value="">請選擇</option><option'+selected('常春藤',f.name)+'>常春藤</option><option'+selected('CNN互動英語',f.name)+'>CNN互動英語</option></select></div></div>';
  h+='<div class="english-magazine-sub"><div class="field compact-number"><label>月份</label><div class="inline"><input type="number" min="1" max="12" data-field="month" value="'+esc(f.month||'')+'"><span>月號</span></div></div><div class="field compact-number"><label>Unit</label><input type="number" min="1" step="1" inputmode="numeric" data-field="unit" value="'+esc(f.unit||'')+'"></div></div>';
 }else if(!reviewMode&&t){
  h+='<div class="english-book-page-row"><div class="field"><label>書名</label><select data-field="title">'+bookOptions+'</select></div><div class="field compact-number"><label>起始頁</label><input type="number" min="1" data-field="start" value="'+esc(f.start||'')+'"></div><div class="field compact-number"><label>結束頁</label><input type="number" min="1" data-field="end" value="'+esc(f.end||'')+'"></div></div>';
  if(canonicalPageMappedBook(t))h+=bookPageAutoField(canonicalPageMappedBook(t),f.start,f.end);
 }else{
  h+='<div class="english-title-half"><div class="field english-book"><label>書名</label><select data-field="title">'+bookOptions+'</select></div></div>';
  if(reviewMode)h+=reasonField(f);
 }
 return h;
}
function renderChineseFields(x,reviewMode){
 var f=x.f;
 if(reviewMode&&f.kind==='writing')f.kind='reading';

 if(isCalendarGujin(x)){
  f.kind='reading';
  var ch='<div class="english-title-half"><div class="field english-book"><label>書名</label><div class="fixed-book-value">古今悅讀一百</div></div><div class="field compact-number"><label>回數</label><div class="fixed-book-value">第 '+esc(f.round||'—')+' 回</div></div></div>';
  if(!reviewMode)ch+='<div class="checkline" style="margin-top:10px"><label><input type="checkbox" data-check="progress"'+checked(f.progress)+'> 進度</label><label><input type="checkbox" data-check="graded"'+checked(f.graded)+'> 批改</label><label><input type="checkbox" data-check="corrected"'+checked(f.corrected)+'> 訂正</label></div>';
  if(reviewMode)ch+=reasonField(f);
  return ch;
 }

 if(f.kind==='book'&&isCalendarPageMappedBook(x)){
  var lockedBook=canonicalPageMappedBook(f.book),lockedStart=Number(f.calendarSourceStart||f.start),lockedEnd=Number(f.calendarSourceEnd||f.end);
  var lockedChinese='<div class="chinese-book-main-row"><div class="field chinese-book-item"><label>國文項目</label><div class="fixed-book-value">'+esc(lockedBook||f.book||'—')+'</div></div><div class="field compact-number"><label>起始頁</label><div class="fixed-book-value">'+esc(Number.isFinite(lockedStart)&&lockedStart>0?lockedStart:'—')+'</div></div><div class="field compact-number"><label>結束頁</label><div class="fixed-book-value">'+esc(Number.isFinite(lockedEnd)&&lockedEnd>0?lockedEnd:'—')+'</div></div></div>';
  if(lockedBook)lockedChinese+=bookPageAutoField(lockedBook,lockedStart,lockedEnd);
  if(reviewMode)lockedChinese+=reasonField(f);
  return lockedChinese;
 }

 var chineseSelection=f.kind==='book'&&canonicalPageMappedBook(f.book)?canonicalPageMappedBook(f.book):f.kind;
 var kindOptions='<option value="">請選擇</option><option value="reading"'+selected('reading',chineseSelection)+'>古今悅讀一百</option><option value="'+esc(DEEP_FIFTEEN_BOOK)+'"'+selected(DEEP_FIFTEEN_BOOK,chineseSelection)+'>'+esc(DEEP_FIFTEEN_BOOK)+'</option><option value="'+esc(CHINESE_TOPIC_BOOK)+'"'+selected(CHINESE_TOPIC_BOOK,chineseSelection)+'>'+esc(CHINESE_TOPIC_BOOK)+'</option>';
 if(!reviewMode)kindOptions+='<option value="writing"'+selected('writing',chineseSelection)+'>寫作</option>';
 var chineseItemField='<div class="field chinese-book-item"><label>國文項目</label><select data-chinese-kind>'+kindOptions+'</select></div>',h='<div class="chinese-book-main-row">'+chineseItemField+'</div>';
 if(f.kind==='reading'){
  h='<div class="chinese-book-main-row chinese-reading-row">'+chineseItemField+'<div class="field compact-number"><label>回數</label><div class="inline"><span>第</span><input type="number" min="1" max="100" step="1" inputmode="numeric" data-field="round" value="'+esc(f.round||'')+'"><span>回</span></div></div></div>';
 if(!reviewMode)h+='<div class="checkline" style="margin-top:10px"><label><input type="checkbox" data-check="progress"'+checked(f.progress)+'> 進度</label><label><input type="checkbox" data-check="graded"'+checked(f.graded)+'> 批改</label><label><input type="checkbox" data-check="corrected"'+checked(f.corrected)+'> 訂正</label></div>';
 }else if(f.kind==='book'){
  h='<div class="chinese-book-main-row">'+chineseItemField+'<div class="field compact-number"><label>起始頁</label><input type="number" min="1" data-field="start" value="'+esc(f.start||'')+'"></div><div class="field compact-number"><label>結束頁</label><input type="number" min="1" data-field="end" value="'+esc(f.end||'')+'"></div></div>';
  if(canonicalPageMappedBook(f.book))h+=bookPageAutoField(canonicalPageMappedBook(f.book),f.start,f.end);
 }else if(f.kind==='writing'&&!reviewMode){
  h='<div class="chinese-writing-layout"><div class="cw-item">'+chineseItemField+'</div><div class="field cw-topic"><label>題目</label><input data-field="topic" value="'+esc(f.topic||'')+'"></div><div class="field compact-number cw-score"><label>分數</label><input type="number" min="0" max="25" step="1" data-field="score" value="'+esc(f.score||'')+'"></div><div class="field cw-type"><label>題型</label><select data-field="writingType"><option value="">請選擇</option><option value="知性題"'+selected('知性題',f.writingType)+'>知性題</option><option value="感性題"'+selected('感性題',f.writingType)+'>感性題</option></select></div><div class="field cw-improvement"><label>改進方向</label><textarea rows="5" data-field="improvement">'+esc(f.improvement||'')+'</textarea></div></div>';
 }
 if(reviewMode)h+=reasonField(f);
 return h;
}
function isLockedEnglishMock(x){
 var k=effectiveTemplatePresetKey(x);
 return !!x&&x.type==='mock'&&(
  x.title==='英文歷屆／模考：批改與訂正'||
  x.title==='英文歷屆／模考：限時作答'||
  k==='sat_mock_correction'||
  k==='fri_mock_timed'||
  (x.f&&x.f.subjectLocked)
 );
}
function renderMockFields(x,reviewMode){
 var f=x.f,lockedEnglish=isLockedEnglishMock(x);
 if(lockedEnglish)f.subject='英文';
 var subjectField=lockedEnglish?'<div class="field"><label>科目</label><div class="fixed-book-value">英文</div></div>':'<div class="field"><label>科目</label><select data-field="subject"><option value="">請選擇</option>'+['國文','英文','數學A','自然'].map(function(s){return'<option'+selected(s,f.subject)+'>'+s+'</option>'}).join('')+'</select></div>';
 var h='<div class="field-grid">'+subjectField+'<div class="field"><label>年份</label><input data-field="year" value="'+esc(f.year||'')+'"></div><div class="field"><label>考試</label><select data-field="exam"><option value="">請選擇</option>'+['指考','分科','學測','模擬考','模考題本'].map(function(s){return'<option'+selected(s,f.exam)+'>'+s+'</option>'}).join('')+'</select></div><div class="field"><label>回次</label><input data-field="round" value="'+esc(f.round||'')+'"></div><div class="field"><label>狀態</label><select data-field="status"><option value="">未填</option>'+['已作答','已對答案','已完整訂正'].map(function(s){return'<option'+selected(s,f.status)+'>'+s+'</option>'}).join('')+'</select></div></div>';
 return h+reasonField(f);
}

function interactiveSubtypeOptions(v){
 var a=[
  ['mathOral','數 A 互動題：觀念題'],
  ['englishPractice','英文互動題：英聽及學測練習'],
  ['biologyInteractive','生物互動題']
 ];
 return'<option value="">請選擇</option>'+a.map(function(x){return'<option value="'+x[0]+'"'+selected(x[0],v)+'>'+x[1]+'</option>'}).join('');
}
function renderInteractiveFields(x){
 var f=x.f||(x.f={}),h='<div class="field"><label>互動題種類</label><select data-field="interactiveType">'+interactiveSubtypeOptions(f.interactiveType)+'</select></div>';
 if(f.interactiveType==='mathOral'){
  h+='<div class="grid-2" style="margin-top:10px"><div class="field"><label>主題／題組</label><input data-field="topic" value="'+esc(f.topic||'')+'"></div><div class="field"><label>結果／仍不熟處</label><input data-field="result" value="'+esc(f.result||'')+'"></div></div>';
 }else if(f.interactiveType==='englishPractice'){
  h+='<div class="checkline english-practice-checks" style="margin-top:10px"><label><input type="checkbox" data-check="listening"'+checked(f.listening)+'> 英聽</label><label><input type="checkbox" data-check="vocab"'+checked(f.vocab)+'> 單字</label><label><input type="checkbox" data-check="translation"'+checked(f.translation)+'> 中譯英</label><label><input type="checkbox" data-check="gsatPart1"'+checked(f.gsatPart1)+'> GSAT 第壹部分</label></div>';
 }else if(f.interactiveType==='biologyInteractive'){
  h+='<div class="field" style="margin-top:10px"><label>主題／範圍</label><input data-field="topic" value="'+esc(f.topic||'')+'" placeholder="例如：細胞膜運輸、細胞週期"></div>';
  h+='<div class="field" style="margin-top:10px"><label>錯因／不熟觀念</label><textarea rows="3" data-field="reason" placeholder="記錄本次互動題錯因或仍不熟的觀念">'+esc(f.reason||'')+'</textarea></div>';
 }
 return h;
}

function groupedWorkLabel(entry,index){
 var f=entry&&entry.f||{},s=Number(f.start),e=Number(f.end),round=String(f.round||'').trim();
 if(f.dailyWorkBlankTemplate)return'原訂項目';
 if(isAzarGrammar(f.title||f.book)&&f.azarSectionCode)return String(f.azarSectionCode)+String(f.azarSectionTitle||'');
 if(isEnglishPageMappedBook(f.title||f.book))return[String(f.topic||'').trim(),round].filter(Boolean).join('｜')||('子項目 '+(index+1));
 if(Number.isFinite(s)&&s>0&&Number.isFinite(e)&&e>=s)return s===e?'p.'+s:'p.'+s+'–'+e;
 if(round)return isListeningTestBook(f.title)?'Test '+round:'第 '+round+' 回';
 return itemTitle(entry)||('子項目 '+(index+1));
}
function canDeferItem(x){return !!x&&isDeferrableStudyItem(x)&&parseDate(data.date).getDay()!==0}
function renderDeferredControls(x){
 if(!canDeferItem(x))return'';
 var isDeferred=confirmedDeferred(x),pendingTarget=pendingDeferredTarget(x),futureTargets=futureDeferredDays(parseDate(data.date).getDay());
 if(pendingTarget!==null&&futureTargets.indexOf(pendingTarget)<0){
  pendingTarget=nextDeferredTargetDay(data.date,x);
  if(pendingTarget===null)clearPendingDeferred(x);else pendingDeferredTargets[x.id]=pendingTarget;
 }
 var deferDisabled=!isDeferred&&pendingTarget===null&&!futureTargets.length;
 var h='<div class="defer-controls"><label class="small" style="display:flex;align-items:center;gap:5px;white-space:nowrap"><input type="checkbox" data-deferred'+checked(isDeferred||pendingTarget!==null)+(deferDisabled?' disabled':'')+'> 延期</label>';
 if(pendingTarget!==null){
  h+='<label class="small defer-target-label">加入 <select data-deferred-target-pending>'+deferredTargetOptions(data.date,pendingTarget,x)+'</select></label><span class="small defer-capacity">'+deferredCapacityMarkup(data.date,pendingTarget)+'</span><button class="secondary defer-confirm" data-action="confirm-deferred">確認延期</button>';
 }else if(isDeferred){
  var confirmedTarget=deferredTargetDay(x);
  h+='<label class="small defer-target-label">加入 <select data-deferred-target>'+deferredTargetOptions(data.date,confirmedTarget,x)+'</select></label><span class="small defer-capacity">'+deferredCapacityMarkup(data.date,confirmedTarget)+'</span>';
 }
 h+='</div>';
 if(deferredLimitPrompt&&deferredLimitPrompt.itemId===x.id)h+='<div class="defer-limit-prompt"><span>該日延期項目已經超過限制，是否還要將延期項目新增至該日？</span><div class="defer-limit-actions"><button class="danger" data-action="defer-limit-yes">是</button><button class="secondary" data-action="defer-limit-no">否</button></div></div>';
 return h;
}
function renderGroupedWorkEntry(entry,index){
 entry.calendarGroupedChild=true;
 var h='<div class="item grouped-work-entry '+studyItemSubjectClass(entry)+(entry.done?' done':'')+(confirmedDeferred(entry)?' deferred':'')+'" data-item="'+esc(entry.id)+'"><div class="item-top">';
 h+='<input type="checkbox" data-done'+checked(entry.done)+'>';
 if(entry.f&&entry.f.calendarMakeup===true)h+='<div class="small">今日補做｜Google Calendar</div>';
 h+=completionDateMarkup(entry);
 h+=renderTimeControl(entry)+'</div>';
 var fields=renderItemFields(entry,false);
 if(fields)h+='<div class="inner">'+fields+'</div>';
 h+=renderDeferredControls(entry);
 return h+'</div>';
}
function renderGroupedWorkFields(x){
 var entries=groupedWorkEntries(x),h='';
 for(var i=0;i<entries.length;i++)h+=renderGroupedWorkEntry(entries[i],i);
 return h;
}

function renderItemFields(x,reviewMode){
 var f=x.f||(x.f={});
 if(isGroupedWork(x))return renderGroupedWorkFields(x);
 if(x.type==='mathStudy')return renderMathFields(x,false);
 if(x.type==='mathLecture')return renderMathFields(x,!!reviewMode);
 if(x.type==='mathPractice')return renderMathFields(x,false)+'<div class="field" style="margin-top:10px"><label>錯因／不熟觀念</label><textarea data-field="reason">'+esc(f.reason||'')+'</textarea></div><div class="checkline" style="margin-top:10px"><label><input type="checkbox" data-check="corrected"'+checked(f.corrected)+'> 已完成訂正</label><label><input type="checkbox" data-check="review"'+checked(f.review)+'> 需要再複習</label></div><div class="field" style="margin-top:10px"><label>若錯題少，延續做到</label><input data-field="extended" value="'+esc(f.extended||'')+'"></div>';
 if(x.type==='mathOral')return'<div class="grid-2"><div class="field"><label>主題／題組</label><input data-field="topic" value="'+esc(f.topic||'')+'"></div><div class="field"><label>結果／仍不熟處</label><input data-field="result" value="'+esc(f.result||'')+'"></div></div>';
 if(x.type==='interactive')return renderInteractiveFields(x);
 if(x.type==='englishMixedWriting')return'<div class="english-mixed-writing-layout"><div class="field compact-number emw-essay"><label>作文分數範圍</label><div class="inline"><span>約</span><input type="number" min="0" max="18" step="1" data-field="essayScore" value="'+esc(f.essayScore||'')+'"><span>到</span><span data-essay-upper>'+(f.essayScore!==''&&f.essayScore!=null?Number(f.essayScore)+2:'x+2')+' 分</span></div></div><div class="field compact-number emw-mixed"><label>混合題分數</label><input type="number" min="0" max="10" step="1" data-field="mixedScore" value="'+esc(f.mixedScore||'')+'"></div><div class="field emw-priority"><label>優先修改錯誤</label><textarea rows="5" data-field="priorityFix">'+esc(f.priorityFix||'')+'</textarea></div></div>';
 if(x.type==='magazine')return renderMagazineFields(x);
 if(x.type==='englishPractice')return'<div class="checkline english-practice-checks"><label><input type="checkbox" data-check="listening"'+checked(f.listening)+'> 英聽</label><label><input type="checkbox" data-check="vocab"'+checked(f.vocab)+'> 單字</label><label><input type="checkbox" data-check="translation"'+checked(f.translation)+'> 中譯英</label><label><input type="checkbox" data-check="gsatPart1"'+checked(f.gsatPart1)+'> GSAT 第壹部分</label></div><div class="grid-3" style="margin-top:10px"><div class="field compact-number"><label>答對題數</label><div class="inline"><input type="number" min="0" max="20" step="1" inputmode="numeric" data-field="correctCount" value="'+esc(f.correctCount||'')+'"><span>／20 題</span></div></div><div class="field compact-number"><label>中翻英 第一句</label><div class="inline"><input type="number" min="0" max="4" step="0.5" inputmode="decimal" data-field="translationScore1" value="'+esc(f.translationScore1||'')+'"><span>／4.0 分</span></div></div><div class="field compact-number"><label>中翻英 第二句</label><div class="inline"><input type="number" min="0" max="4" step="0.5" inputmode="decimal" data-field="translationScore2" value="'+esc(f.translationScore2||'')+'"><span>／4.0 分</span></div></div></div><div class="field" style="margin-top:10px"><label>錯誤觀念／文法</label><textarea rows="3" data-field="errorConceptGrammar" placeholder="記錄錯誤觀念、文法或需要再複習的內容">'+esc(f.errorConceptGrammar||'')+'</textarea></div>';
 if(x.type==='biologyInteractive')return'<div class="grid-2"><div class="field"><label>主題／題組</label><input data-field="topic" value="'+esc(f.topic||'')+'"></div><div class="field"><label>結果／仍不熟處</label><input data-field="result" value="'+esc(f.result||'')+'"></div></div>';
 if(x.type==='englishVocabInteractive')return renderEnglishReview(x);
 if(x.type==='interactiveDaily')return renderInteractiveDailyFields(x);
 if(x.type==='chineseReading')return renderChineseFields(x,!!reviewMode);
 if(x.type==='scienceReview')return renderScienceFields(x,!!reviewMode);
 if(x.type==='mock')return renderMockFields(x,!!reviewMode);
 if(x.type==='extra')return renderExtraFields(x,!!reviewMode);
 if(x.type==='general')return renderGeneralFields(x);
 return'';
}
function renderMagazineFields(x){
 var f=x.f;if(!isFixedMagazine(x)){initializeMagazineMonth(f,(data&&data.date)||'');return'<div class="grid-3"><div class="field"><label>雜誌</label><select data-field="name"><option value="">請選擇</option><option'+selected('常春藤',f.name)+'>常春藤</option><option'+selected('CNN互動英語',f.name)+'>CNN互動英語</option></select></div><div class="field compact-number"><label>月份</label><div class="inline"><input type="number" min="1" max="12" data-field="month" value="'+esc(f.month||'')+'"><span>月號</span></div></div><div class="field compact-number"><label>Unit</label><input type="number" min="1" step="1" inputmode="numeric" data-field="unit" value="'+esc(f.unit||'')+'"></div></div>'}
 var a=ensureMagazineEntries(x),h='';
 for(var i=0;i<a.length;i++){
  var r=a[i];
  h+='<div class="item subject-card subject-english" style="margin-top:8px"><div class="item-top">'+renderTimeControl(x,r)+'</div><div class="grid-3" style="margin-top:8px"><div class="field"><label>雜誌</label><select data-mag-field="name" data-index="'+i+'"><option value="">請選擇</option><option'+selected('常春藤',r.name)+'>常春藤</option><option'+selected('CNN互動英語',r.name)+'>CNN互動英語</option></select></div><div class="field compact-number"><label>月份</label><div class="inline"><input type="number" min="1" max="12" data-mag-field="month" data-index="'+i+'" value="'+esc(r.month||'')+'"><span>月號</span></div></div><div class="field compact-number"><label>Unit</label><input type="number" min="1" step="1" inputmode="numeric" data-mag-field="unit" data-index="'+i+'" value="'+esc(r.unit||'')+'"></div></div>';
  if(a.length>1)h+=renderItemDeleteFooter('mag-delete',i);
  h+='</div>';
 }
 return h+'<button class="secondary" data-action="mag-add" style="margin-top:8px">新增雜誌紀錄</button>';
}
function renderEnglishReview(x){
 var a=x.f.words;if(!Array.isArray(a))a=x.f.words=[];
 var h='<div><label>今日單字</label>';if(!a.length)h+='<div class="small">尚未新增今日單字。</div>';
 for(var i=0;i<a.length;i++){var w=typeof a[i]==='string'?{text:a[i]}:(a[i]||{});h+='<div class="field" style="margin-top:8px"><div class="inline"><input data-word-text data-index="'+i+'" value="'+esc(w.text||'')+'" placeholder="輸入今天整理的單字／搭配詞"><button class="delete" data-action="word-delete" data-index="'+i+'">刪除</button></div><div class="checkline" style="margin-top:8px">'+[['noun','Noun'],['verb','Verb'],['adjective','Adjective'],['adverb','Adverb'],['preposition','Preposition'],['conjunction','Conjunction'],['fixedCombination','Fixed combination'],['beautifulSentences','Beautiful sentences']].map(function(p){return'<label><input type="checkbox" data-word-pos="'+p[0]+'" data-index="'+i+'"'+checked(w[p[0]])+'> '+p[1]+'</label>'}).join('')+'</div></div>'}
 return h+'</div><button class="secondary" data-action="word-add" style="margin-top:8px">新增單字</button>';
}
function renderNestedEntry(x,kind){
 var review=kind==='review',h='<div class="item '+(review?'review-entry ':'makeup-entry ')+studyItemSubjectClass(x)+'" data-item="'+esc(x.id)+'"><div class="item-top">';
 if(!review)h+='<input type="checkbox" data-done'+checked(x.done)+'>';
 if(!review)h+=completionDateMarkup(x);
 h+='<div class="field" style="flex:1"><label>項目類型</label><select data-nested-type="'+kind+'">'+(review?reviewTypeOptions(x.type):nestedTypeOptions(x.type))+'</select></div>';
 if(!review)h+=renderTimeControl(x);
 h+='</div>';
 if(x.type){var fields=renderItemFields(x,review);if(fields)h+='<div class="inner">'+fields+'</div>'}
 h+=renderItemDeleteFooter(kind+'-delete');
 return h+'</div>';
}
function renderGeneralFields(x){
 var f=x.f;
 if(isSaturdayMakeup(x)){var a=ensureEntryArray(x,'makeupEntries'),h=a.length?'':'<div class="small">尚未新增回補項目。</div>';for(var i=0;i<a.length;i++)h+=renderNestedEntry(a[i],'makeup');return h+'<button class="secondary" data-action="makeup-add" style="margin-top:10px">新增回補項目</button>'}
 if(isSaturdayReview(x)){var b=ensureEntryArray(x,'reviewEntries'),r=b.length?'':'<div class="small">尚未新增整理項目。</div>';for(var j=0;j<b.length;j++)r+=renderNestedEntry(b[j],'review');return r+'<button class="secondary" data-action="review-add" style="margin-top:10px">新增整理項目</button>'}
 if(isEnglishReview(x))return renderEnglishReview(x);
 return'<div class="field"><label>進度／完成內容</label><input data-field="progress" value="'+esc(f.progress||'')+'"></div>';
}


function renderDailyInteractiveEntry(c){
 var h='<div class="item '+studyItemSubjectClass(c)+(c.done?' done':'')+'" data-item="'+esc(c.id)+'" style="margin-top:10px"><div class="item-top">';
 h+='<input type="checkbox" data-done'+checked(c.done)+'>';
 h+=completionDateMarkup(c);
 if(c.locked)h+='<div class="field" style="flex:1;min-width:240px"><label>互動題種類</label><div class="fixed-book-value">'+esc(itemTitle(c))+'</div>'+(c.description?'<div class="small" style="margin-top:5px">'+esc(c.description)+'</div>':'')+'</div>';
 else h+='<div class="field" style="flex:1;min-width:240px"><label>互動題種類</label><select data-interactive-type>'+interactiveDailyTypeOptions(c.type)+'</select></div>';
 h+=renderTimeControl(c)+'</div>';
 if(c.type){
  var fields=renderItemFields(c,false);
  if(fields)h+='<div class="inner">'+fields+'</div>';
 }
 if(!c.locked)h+=renderItemDeleteFooter('interactive-delete');
 return h+'</div>';
}
function renderInteractiveDailyFields(x){
 var a=ensureInteractiveEntries(x),h='';
 if(!a.length)h+='<div class="small">尚未新增互動題。</div>';
 for(var i=0;i<a.length;i++)h+=renderDailyInteractiveEntry(a[i]);
 h+='<button class="secondary" data-action="interactive-add" style="margin-top:10px">新增互動題</button>';
 return h;
}

function renderCard(x,canDelete){
 var isDeferred=confirmedDeferred(x);
 var calendarMeta=x.f&&x.f.dailyWorkGroup?(x.f.dailyWorkIncludesDeferred?'已合併當日排程與延期項目':'已合併同項目範圍'):(x.f&&x.f.calendarMerged?(x.f.calendarIncludesMakeup?'已合併 Google Calendar 同模板項目｜含補做':'已合併 Google Calendar 同模板項目'):'');
 var meta=x.deferredCarry?('補做｜沿用 '+(x.deferredOriginDate||'原日期')+' 的完整項目模板'):(isCalendarMakeup(x)?'今日補做｜Google Calendar':(calendarMeta||(isInteractiveDaily(x)?'':(x.source==='preset'?(x.required?(isDeferred?'已延期至'+deferredTargetLabel(x):''):'每日選做'):(x.required?'列入原定完成度':'')))));
 if(isInteractiveDaily(x))ensureInteractiveEntries(x);
 if(isCalendarNaturalIntegration(x))ensureCalendarNaturalIntegrationEntries(x,data.date);
 var noTopDone=isInteractiveDaily(x)||isCalendarNaturalIntegration(x)||isGroupedWork(x);
 var h='<div class="item '+studyItemSubjectClass(x)+(x.done?' done':'')+(isDeferred?' deferred':'')+'" data-item="'+esc(x.id)+'"><div class="item-top">'+(noTopDone?'':'<input type="checkbox" data-done'+checked(x.done)+'>')+'<div><div class="item-title">'+esc(itemTitle(x))+'</div>';
 if(x.description)h+='<div class="item-desc">'+esc(x.description)+'</div>';if(meta)h+='<div class="small">'+meta+'</div>';if(!noTopDone)h+=completionDateMarkup(x);h+='</div>';
 if(!hidesTopMinutes(x)&&!isGroupedWork(x))h+=renderTimeControl(x);
 h+='</div>';
 var fields=renderItemFields(x,false);
 if(fields)h+='<div class="inner">'+fields+'</div>';
 if(!isGroupedWork(x))h+=renderDeferredControls(x);
 if(canDelete)h+=renderItemDeleteFooter('delete-item');
 return h+'</div>';
}
function weeklyItemDisplayTitle(x){
 var title=itemTitle(x),book=x&&x.type==='extra'&&x.f&&x.f.title?String(x.f.title):'';
 if(isEssentialGrammar(book)){
  if(title.indexOf(book)>=0)return title;
  var start=x.f.unitStart||x.f.unit||'',end=x.f.unitEnd||start;
  return title+'｜'+book+(start?'｜Unit '+start+(end&&end!==start?'–'+end:''):'');
 }
 return book&&book!==title?title+'｜'+book:title;
}
function weeklyItemState(x){
 if(isGroupedWork(x))x.done=groupedWorkEntries(x).every(function(entry){return !!entry.done});
 if(x.done)return{label:'完成',kind:'done'};
 if(confirmedDeferred(x))return{label:'延期至'+deferredTargetLabel(x),kind:'deferred'};
 if(x.deferredCarry)return{label:'補做',kind:'makeup'};
 if(x.source==='custom')return{label:'今日補做',kind:'makeup'};
 if(!x.required)return{label:'選做',kind:'optional'};
 return{label:'未完成',kind:'pending'};
}
function studyRecordForOverview(date){
 // A summary must not regroup the live cards after their DOM has been rendered.
 // In particular, a partially typed range can temporarily overlap another task,
 // replacing its ID and leaving later input/change events with no matching item.
 if(data&&data.date===date)return cloneValue(data);
 var rec=loadData(date);if(!rec.storageIssue)ensureDailyPresets(rec,date);return rec;
}
function renderWeeklyItems(){
 var mon=mondayOf(parseDate(data.date)),html='',total=0;
 for(var i=0;i<7;i++){
  var dayDate=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+i,12),ds=dateString(dayDate);
  var rec=studyRecordForOverview(ds);
  var items=visibleItems(rec).filter(isWeeklyCalendarItem),accepted=0;
  if(!items.length)continue;
  items.forEach(function(x){if(x.done||confirmedDeferred(x))accepted++});
  total+=items.length;
  html+='<details class="weekly-day" open><summary><span><strong>'+weekdays[dayDate.getDay()]+'</strong><span class="weekly-date">'+esc(ds.slice(5).replace('-','／'))+'</span></span><span class="weekly-day-actions"><span class="small">'+accepted+'／'+items.length+'</span></span></summary>';
  html+='<div class="weekly-day-items">';
  items.forEach(function(x){var state=weeklyItemState(x),completionLabel=completionDateLabel(x);html+='<div class="weekly-item-row '+studyItemSubjectClass(x)+'"><span class="weekly-item-state" data-state="'+state.kind+'">'+esc(state.label)+'</span><label class="weekly-item-check"><input type="checkbox" data-week-done data-week-date="'+esc(ds)+'" data-week-item="'+esc(x.id)+'"'+checked(x.done)+'><span>'+esc(weeklyItemDisplayTitle(x))+(completionLabel?'<small class="completion-checked-on">'+esc(completionLabel)+'</small>':'')+'</span></label></div>'});
  html+='</div>';
  html+='</details>';
 }
 if(!html)html='<div class="small weekly-empty">本週尚無 Google Calendar 本週項目。請使用「本週項目｜項目名稱」指定；未加前綴或標示「補做｜」的項目會加入今日項目。</div>';
 id('weeklyItemList').innerHTML=html;
 id('weeklyItemBadge').textContent=total+' 項';
}
var studyItemsView='today',overviewMetricView='minutes';
function updateStudyItemsView(focusSelected){
 studyItemsView=normalizeStudyItemsView(studyItemsView);
 var today=studyItemsView==='today',tabs=id('studyItemsViewTabs'),index=studyItemsViewIndex(studyItemsView);tabs.dataset.active=String(index);
 tabs.querySelectorAll('[data-study-items-view]').forEach(function(button){var selected=button.getAttribute('data-study-items-view')===studyItemsView;button.setAttribute('aria-selected',selected?'true':'false');button.tabIndex=selected?0:-1;if(selected&&focusSelected)button.focus()});
 id('dailyItemsView').hidden=!today;id('weeklyItemsView').hidden=today;
 id('dailyPresetBadge').hidden=!today;id('weeklyItemBadge').hidden=today;
}
function updateOverviewMetricView(focusSelected){
 overviewMetricView=normalizeOverviewMetric(overviewMetricView);
 var tabs=id('overviewMetricTabs'),index=overviewMetricIndex(overviewMetricView);tabs.dataset.active=String(index);
 tabs.querySelectorAll('[data-overview-metric]').forEach(function(button){var selected=button.getAttribute('data-overview-metric')===overviewMetricView;button.setAttribute('aria-selected',selected?'true':'false');button.tabIndex=selected?0:-1;if(selected&&focusSelected)button.focus()});
 var card=tabs.closest('.overview-metric-stat');if(card)card.dataset.metricView=overviewMetricView;
 document.querySelectorAll('[data-metric-panel]').forEach(function(panel){var selected=panel.getAttribute('data-metric-panel')===overviewMetricView;panel.hidden=false;panel.classList.toggle('is-active',selected);panel.setAttribute('aria-hidden',selected?'false':'true');panel.inert=!selected});
}
function render(){
 deferredCapacityCache=null;
 var active=groupStudyItemsBySubject(visibleItems(data)),daily='',englishReview='',other='',dc=0,erc=0,oc=0;
 active.forEach(function(x){
  if(isWeeklyCalendarItem(x))return;
  if(x.source==='preset'){
   if(isEnglishReview(x)){englishReview+=renderCard(x,false);erc++}
   else{daily+=renderCard(x,false);dc++}
  }else{other+=renderCard(x,true);oc++}
 });
 id('dailyItemList').innerHTML=dc?daily:(isAway(data)?'<div class="small">今日狀態為「外出」，固定排程已全部取消。</div>':'<div class="small">今日沒有項目。</div>');
 id('englishReviewList').innerHTML=erc?englishReview:'<div class="small">今日尚未新增英文訂正與搭配詞整理。</div>';
 id('itemList').innerHTML=oc?other:'<div class="small">尚未新增其他項目。</div>';
 id('dailyPresetBadge').textContent=dc+' 項';
 id('englishReviewBadge').textContent=erc+' 項';
 id('itemCountBadge').textContent=oc+' 項';
 id('dailyNotice').textContent=isAway(data)?'今日外出：固定排程全部取消；自行新增項目仍可照常記錄。':(data.date>=DAILY_PRESET_START?dailyMessageForDate(data.date):'歷史日期：不自動改寫原有紀錄。');
 updateSummary();
 renderWeeklyItems();
 updateStudyItemsView();updateOverviewMetricView(false);
 refreshTimerUI();
}
function findRecursive(list,target){
 if(!Array.isArray(list))return null;
 for(var i=0;i<list.length;i++){var x=list[i];if(x&&x.id===target)return x;if(x&&x.f){var y=findRecursive(x.f.makeupEntries,target)||findRecursive(x.f.reviewEntries,target)||findRecursive(x.f.interactiveEntries,target)||findRecursive(x.f.calendarIntegrationEntries,target)||findRecursive(x.f.groupedWorkEntries,target);if(y)return y}}return null;
}
function findItem(target){return data?findRecursive(data.items,target):null}
function completionChildItems(x,includeSources){
 if(!x||!x.f)return[];
 var names=['groupedWorkEntries','interactiveEntries','calendarIntegrationEntries','makeupEntries'];if(includeSources)names.push('dailyWorkSourceItems');
 var out=[];names.forEach(function(name){if(Array.isArray(x.f[name]))out=out.concat(x.f[name])});return out;
}
function findCompletionRecursive(list,target,visited){
 if(!Array.isArray(list))return null;visited=visited||new Set();
 for(var i=0;i<list.length;i++){
  var x=list[i];if(!x||visited.has(x))continue;visited.add(x);if(x.id===target)return x;
  var found=findCompletionRecursive(completionChildItems(x,true),target,visited);if(found)return found;
 }
 return null;
}
function deferredCarrierAncestor(list,target){
 var visited=new Set();
 function visit(items,inherited){
  if(!Array.isArray(items))return null;
  for(var i=0;i<items.length;i++){
   var x=items[i];if(!x||visited.has(x))continue;visited.add(x);var carrier=x.deferredCarry?x:inherited;
   if(x===target)return{found:true,carrier:carrier||null};
   var nested=visit(completionChildItems(x,true),carrier);if(nested)return nested;
  }
  return null;
 }
 var result=visit(list,null);return result?result.carrier:null;
}
function applyManualCompletionMetadata(item,checked,recordDate,actionDate,rootItems){
 var requests=[],visited=new Set(),ancestor=deferredCarrierAncestor(rootItems,item);
 function visit(target,inheritedCarrier){
  if(!target||visited.has(target))return;visited.add(target);
  var carrier=target.deferredCarry?target:inheritedCarrier;
  var previous=target.deferredCompletedOn||deferredCompletionDate(target);
  var change=manualCompletionDateChange({checked:checked,recordDate:recordDate,actionDate:actionDate,deferredCarry:!!carrier,confirmedDeferred:confirmedDeferred(target),previousDeferredCompletedOn:previous});
  applyCompletionDateChange(target,change);
  var represented=[];
  if(target.f&&Array.isArray(target.f.dailyWorkSourceItems))represented=represented.concat(target.f.dailyWorkSourceItems);
  if(target.f&&Array.isArray(target.f.groupedWorkEntries))represented=represented.concat(target.f.groupedWorkEntries);
  if(change.syncDeferredOrigin&&carrier&&!represented.length)requests.push({carrier:carrier,target:target,change:change,previousDeferredCompletedOn:previous});
  represented.forEach(function(child){visit(child,carrier)});
 }
 visit(item,ancestor);return requests;
}
function completionIdentityMatch(candidate,target){
 if(!candidate||!target)return false;
 if(candidate.id&&candidate.id===target.id)return true;
 if(candidate.presetKey&&target.presetKey&&candidate.presetKey===target.presetKey)return true;
 if(groupedEntryMatch(candidate,target))return true;
 var af=candidate.f||{},bf=target.f||{};
 return candidate.type===target.type&&String(candidate.title||'')===String(target.title||'')&&String(af.subject||'')===String(bf.subject||'')&&String(af.round||'')===String(bf.round||'')&&String(af.start||'')===String(bf.start||'')&&String(af.end||'')===String(bf.end||'');
}
function completionTargetWithinOrigin(originRoot,target,carrier){
 if(!originRoot)return null;
 if(target===carrier||target.id===carrier.id)return originRoot;
 var exact=findCompletionRecursive([originRoot],target.id);if(exact&&exact!==originRoot)return exact;
 var originIds=deferredCarryOriginIds(target);for(var oi=0;oi<originIds.length;oi++){var byOrigin=findCompletionRecursive([originRoot],originIds[oi]);if(byOrigin)return byOrigin}
 var candidates=[],visited=new Set();
 (function collect(item){if(!item||visited.has(item))return;visited.add(item);candidates.push(item);completionChildItems(item,true).forEach(collect)})(originRoot);
 return candidates.find(function(candidate){return candidate!==originRoot&&completionIdentityMatch(candidate,target)})||null;
}
function refreshCompletionTree(item,visited){
 if(!item)return;visited=visited||new Set();if(visited.has(item))return;visited.add(item);
 var groups=[];
 if(item.f&&Array.isArray(item.f.dailyWorkSourceItems)&&item.f.dailyWorkSourceItems.length)groups=item.f.dailyWorkSourceItems;
 else if(item.f&&Array.isArray(item.f.groupedWorkEntries)&&item.f.groupedWorkEntries.length)groups=item.f.groupedWorkEntries;
 else if(item.f&&Array.isArray(item.f.calendarIntegrationEntries)&&item.f.calendarIntegrationEntries.length)groups=item.f.calendarIntegrationEntries;
 else if(item.f&&Array.isArray(item.f.interactiveEntries)&&item.f.interactiveEntries.length)groups=item.f.interactiveEntries;
 groups.forEach(function(child){refreshCompletionTree(child,visited)});if(groups.length)item.done=groups.every(function(child){return !!child.done});
}
function syncDeferredCompletionToOrigins(requests,checked,actionDate){
 if(!Array.isArray(requests)||!requests.length)return;
 var records={};
 requests.forEach(function(request){
  var carrier=request.carrier,target=request.target,dates=[];
  function addDate(value){value=String(value||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&dates.indexOf(value)<0)dates.push(value)}
  if(Array.isArray(carrier.deferredOriginDates))carrier.deferredOriginDates.forEach(addDate);addDate(carrier.deferredOriginDate);
  var ids=deferredCarryOriginIds(carrier);
  dates.forEach(function(originDate){
   var rec=records[originDate]||(records[originDate]=loadData(originDate)),originRoot=null;
   for(var i=0;i<ids.length&&!originRoot;i++)originRoot=findCompletionRecursive(rec.items,ids[i]);
   if(!originRoot)return;
   var originTarget=completionTargetWithinOrigin(originRoot,target,carrier);if(!originTarget)return;
   if(!checked&&originTarget.deferredCompletedOn&&request.previousDeferredCompletedOn&&originTarget.deferredCompletedOn!==request.previousDeferredCompletedOn)return;
   propagateDailyWorkDone(originTarget,checked);
   propagateDailyWorkCompletionDates(originTarget,checked?actionDate:undefined,checked?actionDate:undefined);
  });
 });
 Object.keys(records).forEach(function(originDate){
  var rec=records[originDate];rec.items.forEach(function(item){refreshCompletionTree(item)});rec.localDirty=true;rec.syncConflict=false;
  if(writeStoredRecord(rec))queueCloudSave(rec);
 });
}
function parentSpecial(target,arrayName){
 for(var i=0;i<data.items.length;i++){var p=data.items[i],a=p&&p.f&&p.f[arrayName];if(Array.isArray(a))for(var j=0;j<a.length;j++)if(a[j]&&a[j].id===target)return p}return null;
}
function removeNested(target,arrayName){
 var p=parentSpecial(target,arrayName);if(!p)return false;p.f[arrayName]=p.f[arrayName].filter(function(x){return x.id!==target});return true;
}
function refreshAuto(card,x){
 if(!card||!x)return;
 if(x.type==='mathStudy'||x.type==='mathLecture'||x.type==='mathPractice'){applyMathAuto(x.f);var m=card.querySelector('[data-math-auto]');if(m)m.textContent=mathAutoText(x.f)}
 if(x.type==='extra'&&isGrammarReview(x.f&&x.f.title)){var g=card.querySelector('[data-grammar-auto]');if(g)g.textContent=grammarReviewAutoText(x.f)}
 if(x.type==='extra'&&isAzarGrammar(x.f&&x.f.title)){var azar=card.querySelector('[data-azar-auto]');if(azar)azar.textContent=azarGrammarPageSummary(x.f.start,x.f.end)}
 if(x.type==='scienceReview'){
  normalizeScience(x.f);var s=card.querySelector('[data-science-auto]');
  if(x.f.material==='好考點'){applyGoodPoint(x.f);if(s)s.textContent=goodPointCombinedText(x.f.subject,x.f.start,x.f.end)}
  else if(x.f.material==='123日的淬鍊'){if(s)s.textContent=day123Text(x.f.subject,x.f.start,x.f.end)}
  else if(x.f.material==='領航'||x.f.material==='優勢'||x.f.material==='逆轉勝'){applyLectureNatural(x.f);if(s)s.textContent=lectureNaturalText(x.f.subject,x.f.material,x.f.start,x.f.end)}
  else if(x.f.subject==='混合'){applyNaturalReview(x);if(s)s.textContent=naturalReviewText(x)}
 }
 var mappedBook=x.type==='chineseReading'?canonicalPageMappedBook(x.f&&x.f.book):(x.type==='extra'?canonicalPageMappedBook(x.f&&x.f.title):null);
 if(mappedBook){
  var pageMap=card.querySelector('[data-book-page-auto]');if(pageMap)pageMap.textContent=bookPageText(mappedBook,x.f.start,x.f.end);
  var topicMap=card.querySelector('[data-book-topic-auto]');if(topicMap)topicMap.textContent=bookPageTopicText(mappedBook,x.f.start,x.f.end);
  var detailMap=card.querySelector('[data-book-detail-auto]');if(detailMap)detailMap.textContent=bookPageDetailText(mappedBook,x.f.start,x.f.end);
 }
}

function timerTargetFromControl(item,control){return currentTimerTarget(item,control&&control.getAttribute('data-timer-entry'))}
function selectTimerModeFromControl(item,control){
 var target=timerTargetFromControl(item,control);if(!target)return;
 var state=timerStateForTarget(target),pointer=readTimerPointer(),nextMode=control.getAttribute('data-time-mode')==='timer'?'timer':'manual';
 if(state.mode===nextMode)return;
 if(nextMode==='manual'){
  if(state.startedAt!==null)state=pauseStudyTimer(state);
  state.mode='manual';setTimerStateForTarget(target,state);
  if(sameTimerPointer(pointer,target.pointer))writeTimerPointer(null);
 }else{
  var manualMinutes=target.entry?target.entry.minutes:target.item.minutes;
  state=studyTimerFromManualMinutes(manualMinutes);setTimerStateForTarget(target,state)
 }
 persistTimerTarget(target);render();
}
function runTimerAction(item,control,action){
 var target=timerTargetFromControl(item,control);if(!target)return;
 var now=Date.now(),pointer=readTimerPointer(),state=timerStateForTarget(target);
 if(action==='timer-toggle'&&state.startedAt===null){
  if(pointer&&!sameTimerPointer(pointer,target.pointer)){
   var previous=activeTimerTarget();
   if(previous&&!confirm('「'+timerTargetTitle(previous)+'」正在計時。是否先暫停它，再開始此項目？'))return;
   pauseActiveTimer(now);
  }
  setTimerStateForTarget(target,startStudyTimer(state,now));writeTimerPointer(target.pointer);
 }else if(action==='timer-toggle'){
  setTimerStateForTarget(target,pauseStudyTimer(state,now));
  if(sameTimerPointer(pointer,target.pointer))writeTimerPointer(null);
 }else if(action==='timer-finish'){
  var completedTimer=finishStudyTimer(state,now);
  setTimerStateForTarget(target,completedTimer.state);setTimerMinutesForTarget(target,completedTimer.minutes);
  if(sameTimerPointer(pointer,target.pointer))writeTimerPointer(null);
 }else if(action==='timer-reset'){
  setTimerStateForTarget(target,resetStudyTimer());setTimerMinutesForTarget(target,'');
  if(sameTimerPointer(pointer,target.pointer))writeTimerPointer(null);
 }
 persistTimerTarget(target);render();
}

function updateEnglishReviewWordText(target,item){
 var words=item.f.words||(item.f.words=[]),index=Number(target.getAttribute('data-index'));
 if(!words[index]||typeof words[index]!=='object')words[index]={};
 words[index].text=target.value;
 propagateDailyWorkField(item,'words',words);
}
function updateMagazineField(target,item){
 var entries=ensureMagazineEntries(item),index=Number(target.getAttribute('data-index'));
 if(!entries[index])entries[index]={};
 entries[index][target.getAttribute('data-mag-field')]=target.value;
 propagateDailyWorkField(item,'entries',entries);
 updateSummary();
}
function handleInput(e){
 var t=e.target,card=t.closest('[data-item]'),x=card?findItem(card.getAttribute('data-item')):null;
 if(t.matches('[data-minutes]')&&x){propagateDailyWorkMinutes(x,t.value);updateSummary();return}
 if(t.matches('[data-field]')&&x){var k=t.getAttribute('data-field');if(isCalendarPageMappedBook(x)&&(k==='start'||k==='end'||k==='topic'||k==='round'||k==='title')){render();return}if(k==='start'||k==='end')propagateDailyWorkRangeField(x,k,t.value);else propagateDailyWorkField(x,k,t.value);if(x.type==='extra'&&isEssentialGrammar(x.f.title)&&(k==='unitStart'||k==='unitEnd')&&t.value!==''){var grammarUnit=Math.max(1,Math.min(115,Math.round(Number(t.value)||1)));x.f[k]=String(grammarUnit);t.value=String(grammarUnit);propagateDailyWorkField(x,k,x.f[k])}if(k==='start'||k==='end')refreshAuto(card,x);if(k==='essayScore'){var u=card.querySelector('[data-essay-upper]'),v=t.value===''?null:Number(t.value);if(u)u.textContent=(v!==null&&Number.isFinite(v)?v+2:'x+2')+' 分'}updateSummary();return}
 if(t.matches('[data-mag-field]')&&x){updateMagazineField(t,x);return}
 if(t.matches('[data-word-text]')&&x){updateEnglishReviewWordText(t,x);return}
}
var completionCelebrationTimer=null;
function currentWorkloadCompletionPercent(){
 return summarizeCompletionUnits(completionUnitsForRecord(data,data.date)).workloadPercent;
}
function showCompletionCelebration(kind){
 var previous=id('completionCelebration');
 if(previous)previous.remove();
 if(completionCelebrationTimer)clearTimeout(completionCelebrationTimer);
 var layer=document.createElement('div');
 layer.id='completionCelebration';
 layer.className='completion-celebration completion-celebration-'+kind;
 layer.setAttribute('role','status');
 layer.setAttribute('aria-live','polite');
 layer.setAttribute('aria-atomic','true');
 var particles=document.createElement('div');
 particles.className='celebration-particles';
 particles.setAttribute('aria-hidden','true');
 var count=kind==='complete'?42:14,colors=['#8da6c7','#b9958b','#a898bd','#8eaea1','#d3b783'];
 for(var i=0;i<count;i++){
  var particle=document.createElement('i');
  particle.style.setProperty('--particle-x',(((i*37)%101)-50)+'vw');
  particle.style.setProperty('--particle-delay',((i%9)*-0.055)+'s');
  particle.style.setProperty('--particle-color',colors[i%colors.length]);
  particle.style.setProperty('--particle-rotate',((i*71)%240-120)+'deg');
  particles.appendChild(particle);
 }
 var card=document.createElement('div');
 card.className='celebration-card';
 var icon=document.createElement('span');icon.className='celebration-check';icon.textContent='✓';icon.setAttribute('aria-hidden','true');
 var copy=document.createElement('div');copy.className='celebration-copy';
 var title=document.createElement('strong');title.textContent=kind==='complete'?'今日事今日畢！':'你已經完成一半了，繼續努力！';
 copy.appendChild(title);
 if(kind==='complete'){
  var detail=document.createElement('span');detail.textContent='今天的項目已全部完成';copy.appendChild(detail);
 }
 card.appendChild(icon);card.appendChild(copy);layer.appendChild(particles);layer.appendChild(card);document.body.appendChild(layer);
 completionCelebrationTimer=setTimeout(function(){layer.classList.add('is-leaving');setTimeout(function(){layer.remove()},360)},kind==='complete'?3000:2500);
}
function maybeCelebrateCompletion(previousPercent,completedByUser){
 var currentPercent=currentWorkloadCompletionPercent(),seen=data.completionCelebrations||(data.completionCelebrations={version:3,half:false,complete:false});
 var kind=completionCelebrationForChange(previousPercent,currentPercent,seen,completedByUser);
 if(!kind)return false;
 if(kind==='complete'){seen.complete=true;seen.half=true}else seen.half=true;
 showCompletionCelebration(kind);
 return true;
}
function handleChange(e){
 var t=e.target,card=t.closest('[data-item]'),x=card?findItem(card.getAttribute('data-item')):null;
 if(t.matches('[data-minutes]')&&x){propagateDailyWorkMinutes(x,t.value);updateSummary();persist(false);return}
 if(t.matches('[data-mag-field]')&&x){updateMagazineField(t,x);persist(false);return}
 if(t.matches('[data-word-text]')&&x){updateEnglishReviewWordText(t,x);persist(false);return}
 if(t.matches('[data-deferred]')&&x){
  var isDeferred=confirmedDeferred(x);
  if(t.checked&&!isDeferred){
   var nextTarget=pendingDeferredTarget(x);
   if(nextTarget===null)nextTarget=nextDeferredTargetDay(data.date,x);
   if(nextTarget===null){t.checked=false;alert('本週後續日期皆已達每個目標日 3 項的上限。');render();return}
   clearDeferredLimitPrompt(x);
   pendingDeferredTargets[x.id]=nextTarget;
   render();
   return
  }
  if(!t.checked&&!isDeferred){clearPendingDeferred(x);clearDeferredLimitPrompt(x);render();return}
  if(!t.checked&&isDeferred){propagateDailyWorkDeferred(x,false);clearPendingDeferred(x);clearDeferredLimitPrompt(x);persist(false);rebuildDeferredForWeek(data.date);render();return}
  render();return
 }
 if(t.matches('[data-deferred-target-pending]')&&x){
  var pendingTargetDay=Number(t.value);
  if(futureDeferredDays(parseDate(data.date).getDay()).indexOf(pendingTargetDay)<0){alert('只能延期到本週原日期之後的星期。');render();return}
  clearDeferredLimitPrompt(x);
  if(confirmedDeferred(x)&&pendingTargetDay===deferredTargetDay(x)){clearPendingDeferred(x);render();return}
  pendingDeferredTargets[x.id]=pendingTargetDay;
  render();
  return
 }
 if(t.matches('[data-deferred-target]')&&x){
  var targetDay=Number(t.value),currentTarget=deferredTargetDay(x);
  if(futureDeferredDays(parseDate(data.date).getDay()).indexOf(targetDay)<0){alert('只能延期到本週原日期之後的星期。');render();return}
  clearDeferredLimitPrompt(x);
  if(targetDay===currentTarget){clearPendingDeferred(x);render();return}
  pendingDeferredTargets[x.id]=targetDay;
  render();
  return
 }
 if(t.matches('[data-done]')&&x){
  var previousWorkloadPercent=currentWorkloadCompletionPercent();
   var completionActionDate=dateString(new Date()),deferredCompletionRequests=applyManualCompletionMetadata(x,t.checked,data.date,completionActionDate,data.items);
   if(x.type==='scienceReview'){
    markCalendarNaturalCompletionByUser(x,t.checked);
    propagateDailyWorkField(x,'calendarCompletionSetByUser',true);
    propagateDailyWorkField(x,'calendarCompletionUserValue',t.checked);
   }
   propagateDailyWorkDone(x,t.checked);
  syncDeferredCompletionToOrigins(deferredCompletionRequests,t.checked,completionActionDate);
  clearPendingDeferred(x);
  clearDeferredLimitPrompt(x);
    if(x.calendarIntegrationChild||x.calendarGroupedChild){
     if(x.calendarGroupedChild)updateGroupedParentDone(x);
     persist(false);updateSummary();maybeCelebrateCompletion(previousWorkloadPercent,t.checked);render();return
   }
  if(x.done&&confirmedDeferred(x)){propagateDailyWorkDeferred(x,false);persist(false);rebuildDeferredForWeek(data.date)}
  persist(false);updateSummary();maybeCelebrateCompletion(previousWorkloadPercent,t.checked);render();return
 }
 if(t.matches('[data-check]')&&x){var k=t.getAttribute('data-check');if(k==='progress'&&x.type==='scienceReview'){markCalendarNaturalProgressByUser(x,t.checked);propagateDailyWorkField(x,'calendarProgressSetByUser',true);propagateDailyWorkField(x,'calendarProgressUserValue',t.checked)}propagateDailyWorkField(x,k,t.checked);if(k==='corrected'&&(x.type==='mathLecture'||x.type==='scienceReview'||x.type==='extra')){render();persist(false);return}updateSummary();persist(false);return}
 if(t.matches('[data-chinese-kind]')&&x&&x.type==='chineseReading'){
  if(isCalendarPageMappedBook(x)){render();return}
  applyChineseItemSelection(x,t.value);render();persist(false);return
 }
 if((t.matches('[data-book-topic]')||t.matches('[data-book-round]'))&&x&&x.type==='extra'){
  if(isCalendarPageMappedBook(x)){render();return}
  applyEnglishPageBookSelection(x,t.matches('[data-book-topic]')?'topic':'round',t.value);render();persist(false);return
 }
 if(t.matches('[data-field]')&&x){
  var f=t.getAttribute('data-field');if(f==='material'&&isCalendarMathMaterialLocked(x)){render();return}if(isCalendarPageMappedBook(x)&&(f==='start'||f==='end'||f==='topic'||f==='round'||f==='title')){render();return}var changedFields=[f];if(f==='start'||f==='end')propagateDailyWorkRangeField(x,f,t.value);else propagateDailyWorkField(x,f,t.value);
 if((x.type==='mathStudy'||x.type==='mathLecture'||x.type==='mathPractice')&&(f==='material'||f==='book')){if(f==='material'){x.f.book='';changedFields.push('book')}x.f.unit='';x.f.chapter='';changedFields.push('unit','chapter')}
  if(x.type==='scienceReview'&&(f==='subject'||f==='material')){if(f==='subject'&&isCalendarNatural(x)){x.f.subject=calendarNaturalSubject(x.f.calendarTopic||x.description);propagateDailyWorkField(x,'subject',x.f.subject);render();persist(false);return}x.f.unit='';x.f.chapter='';changedFields.push('unit','chapter');normalizeScience(x.f);changedFields.push('material','subject')}
  if(x.type==='extra'&&f==='title'){x.f.level='';x.f.start='';x.f.end='';x.f.unitStart='';x.f.unitEnd='';x.f.unit='';x.f.round='';x.f.topic='';x.f.book='';x.f.warriorsBook='';x.f.chapter='';x.f.progress=false;x.f.graded=false;x.f.corrected=false;x.f.reason='';var selectedEnglishTopicBook=canonicalPageMappedBook(x.f.title);if(selectedEnglishTopicBook&&pageMappedBookSubject(selectedEnglishTopicBook)==='英文')x.f.book=selectedEnglishTopicBook;changedFields.push('level','start','end','unitStart','unitEnd','unit','round','topic','book','warriorsBook','chapter','progress','graded','corrected','reason');x.required=customCountsOriginal(x)}
  changedFields.forEach(function(field){if(field!=='start'&&field!=='end')propagateDailyWorkField(x,field,x.f[field])});
  if(x.type==='extra'&&f==='level')x.required=customCountsOriginal(x);
  if(f==='material'||f==='book'||f==='subject'||f==='kind'||f==='title'||f==='level'||f==='interactiveType'){render();persist(false);return}
  refreshAuto(card,x);updateSummary();persist(false);return
 }
 if(t.matches('[data-interactive-type]')&&x){
  var interactivePointer=readTimerPointer();if(interactivePointer&&interactivePointer.itemId===x.id)pauseActiveTimer();
  if(x.locked){render();return}
  x.type=t.value;x.done=false;x.minutes='';x.f={};x.source='dailyInteractive';x.required=true;
  render();persist(false);return
 }
 if(t.matches('[data-nested-type]')&&x){var nestedPointer=readTimerPointer();if(nestedPointer&&nestedPointer.itemId===x.id)pauseActiveTimer();x.type=t.value;x.done=false;x.minutes='';x.f={};x.source=t.getAttribute('data-nested-type');render();persist(false);return}
 if(t.matches('[data-word-pos]')&&x){var a=x.f.words||(x.f.words=[]),i=Number(t.getAttribute('data-index'));if(!a[i]||typeof a[i]!=='object')a[i]={};a[i][t.getAttribute('data-word-pos')]=t.checked;propagateDailyWorkField(x,'words',a);persist(false);return}
}
function hideDeleteUndo(){
 if(deleteUndoTimer){clearTimeout(deleteUndoTimer);deleteUndoTimer=null}
 deleteUndoState=null;var toast=id('deleteUndoToast');if(toast)toast.hidden=true;
}
function showDeleteUndo(message,restore){
 if(deleteUndoTimer)clearTimeout(deleteUndoTimer);
 deleteUndoState={restore:restore};
 var toast=id('deleteUndoToast'),copy=id('deleteUndoMessage');if(copy)copy.textContent=message||'已刪除小項目。';if(toast)toast.hidden=false;
 deleteUndoTimer=setTimeout(hideDeleteUndo,DELETE_UNDO_MS);
}
function removeSmallEntryWithUndo(parent,arrayName,index,label){
 if(!parent||!parent.f||!Array.isArray(parent.f[arrayName])||index<0||index>=parent.f[arrayName].length)return false;
 var removed=cloneRecord(parent.f[arrayName][index]),parentId=parent.id;
 parent.f[arrayName].splice(index,1);
 if(arrayName==='entries'||arrayName==='words')propagateDailyWorkField(parent,arrayName,parent.f[arrayName]);
 showDeleteUndo('已刪除'+label+'；8 秒內可復原。',function(){
  var currentParent=findItem(parentId);if(!currentParent)return false;
  if(!currentParent.f)currentParent.f={};if(!Array.isArray(currentParent.f[arrayName]))currentParent.f[arrayName]=[];
  var current=currentParent.f[arrayName],removedId=removed&&removed.id;
  if(removedId&&current.some(function(entry){return entry&&entry.id===removedId}))return false;
  current.splice(Math.min(index,current.length),0,removed);
  if(arrayName==='entries'||arrayName==='words')propagateDailyWorkField(currentParent,arrayName,current);
  render();persist(false);return true;
 });
 return true;
}
function undoLastSmallDelete(){
 var state=deleteUndoState;if(!state)return;
 hideDeleteUndo();state.restore();
}
function handleClick(e){
 var b=e.target.closest('[data-action]');if(!b)return;var card=b.closest('[data-item]'),x=card?findItem(card.getAttribute('data-item')):null,action=b.getAttribute('data-action');
 if(action==='timer-pause-active'){
  e.preventDefault();e.stopPropagation();var paused=pauseActiveTimer();if(paused&&paused.record===data)render();else refreshTimerUI();
 }
 else if(action==='time-mode-select'&&x){e.preventDefault();selectTimerModeFromControl(x,b)}
 else if((action==='timer-toggle'||action==='timer-finish'||action==='timer-reset')&&x){e.preventDefault();runTimerAction(x,b,action)}
 else if(action==='week-open'){
  var target=b.getAttribute('data-week-date');
  if(target){persist(false);id('studyDate').value=target;load();var panel=id('dailyItemList').closest('.panel');if(panel)panel.scrollIntoView({behavior:'smooth',block:'start'})}
 }
 else if(action==='defer-limit-yes'&&x&&deferredLimitPrompt&&deferredLimitPrompt.itemId===x.id){
  var approvedPrompt=deferredLimitPrompt;deferredLimitPrompt=null;
  if(approvedPrompt.mode==='confirm'){propagateDailyWorkDeferred(x,true,approvedPrompt.targetDay);clearPendingDeferred(x)}
  else if(approvedPrompt.mode==='move'){propagateDailyWorkDeferred(x,true,approvedPrompt.targetDay);clearPendingDeferred(x)}
  persist(false);rebuildDeferredForWeek(data.date);render();
 }
 else if(action==='defer-limit-no'&&x){clearDeferredLimitPrompt(x);render()}
 else if(action==='confirm-deferred'&&x){
  var targetDay=pendingDeferredTarget(x);
  if(targetDay===null){render();return}
  if(futureDeferredDays(parseDate(data.date).getDay()).indexOf(targetDay)<0){clearPendingDeferred(x);alert('只能延期到本週原日期之後的星期。');render();return}
  var confirmMode=confirmedDeferred(x)?'move':'confirm';
  if(requiresDeferredLimitConfirmation(deferredTargetCount(data.date,targetDay,x))){deferredLimitPrompt={itemId:x.id,targetDay:targetDay,mode:confirmMode};render();return}
  propagateDailyWorkDeferred(x,true,targetDay);clearPendingDeferred(x);
  persist(false);rebuildDeferredForWeek(data.date);render();
 }
 else if(action==='delete-item'&&x){if(!window.confirm('確定要刪除「'+itemTitle(x)+'」嗎？刪除後會同步到雲端。'))return;var deletingPointer=readTimerPointer();if(deletingPointer&&deletingPointer.itemId===x.id)pauseActiveTimer();clearPendingDeferred(x);clearDeferredLimitPrompt(x);data.items=data.items.filter(function(i){return i.id!==x.id});render();persist(false)}
 else if(action==='mag-add'&&x){var entries=ensureMagazineEntries(x);entries.push({id:uid('mag'),name:'',month:magazineMonthForDate(data.date),magazineMonthInitialized:true,unit:'',minutes:''});propagateDailyWorkField(x,'entries',entries);render();persist(false)}
 else if(action==='mag-delete'&&x){var a=ensureMagazineEntries(x),magIndex=Number(b.getAttribute('data-index')),removed=a[magIndex],pointer=readTimerPointer();if(removed&&pointer&&pointer.entryId===removed.id&&pointer.itemId===x.id)pauseActiveTimer();if(a.length>1&&removeSmallEntryWithUndo(x,'entries',magIndex,'雜誌列')){render();persist(false)}}
 else if(action==='word-add'&&x){var words=x.f.words||(x.f.words=[]);words.push({id:uid('word'),text:'',noun:false,verb:false,adjective:false,adverb:false,preposition:false,conjunction:false,fixedCombination:false,beautifulSentences:false});propagateDailyWorkField(x,'words',words);render();persist(false)}
 else if(action==='word-delete'&&x){if(removeSmallEntryWithUndo(x,'words',Number(b.getAttribute('data-index')),'單字列')){render();persist(false)}}
 else if(action==='makeup-add'&&x){ensureEntryArray(x,'makeupEntries').push(newItem('','makeup'));render();persist(false)}
 else if(action==='review-add'&&x){ensureEntryArray(x,'reviewEntries').push(newItem('','review'));render();persist(false)}
 else if(action==='makeup-delete'&&x){var makeupPointer=readTimerPointer(),makeupParent=parentSpecial(x.id,'makeupEntries');if(makeupPointer&&makeupPointer.itemId===x.id)pauseActiveTimer();if(makeupParent&&removeSmallEntryWithUndo(makeupParent,'makeupEntries',makeupParent.f.makeupEntries.indexOf(x),'補做子項目')){render();persist(false)}}
 else if(action==='review-delete'&&x){var reviewPointer=readTimerPointer(),reviewParent=parentSpecial(x.id,'reviewEntries');if(reviewPointer&&reviewPointer.itemId===x.id)pauseActiveTimer();if(reviewParent&&removeSmallEntryWithUndo(reviewParent,'reviewEntries',reviewParent.f.reviewEntries.indexOf(x),'訂正子項目')){render();persist(false)}}
 else if(action==='interactive-add'&&x&&isInteractiveDaily(x)){ensureInteractiveEntries(x).push(interactiveDailyChild(''));render();persist(false)}
 else if(action==='interactive-delete'&&x){if(x.locked){render();return}var deletingInteractivePointer=readTimerPointer(),interactiveParent=parentSpecial(x.id,'interactiveEntries');if(deletingInteractivePointer&&deletingInteractivePointer.itemId===x.id)pauseActiveTimer();if(interactiveParent&&removeSmallEntryWithUndo(interactiveParent,'interactiveEntries',interactiveParent.f.interactiveEntries.indexOf(x),'互動題子項目')){render();persist(false)}}
}
function handleWeeklyChange(e){
 var t=e.target;if(!t.matches('[data-week-done]'))return;
 var ds=t.getAttribute('data-week-date'),itemId=t.getAttribute('data-week-item');if(!ds||!itemId)return;
 var rec=ds===data.date?data:studyRecordForOverview(ds);
 var item=findRecursive(rec.items,itemId);if(!item){renderWeeklyItems();return}
 var completionActionDate=dateString(new Date()),deferredCompletionRequests=applyManualCompletionMetadata(item,t.checked,ds,completionActionDate,rec.items);
 if(item.type==='scienceReview')markCalendarNaturalCompletionByUser(item,t.checked);
 propagateDailyWorkDone(item,t.checked);
 syncDeferredCompletionToOrigins(deferredCompletionRequests,t.checked,completionActionDate);
 if(item.done){item.deferred=false;delete item.deferredTargetDay}
 if(ds===data.date){persist(false);render();return}
 rec.localDirty=true;rec.syncConflict=false;
 if(writeStoredRecord(rec))queueCloudSave(rec);
 renderWeeklyItems();
}

function completionUnitsForRecord(rec,date){
 var units=[];
 visibleItems(rec).forEach(function(x){
  if(!x)return;
  if(isWeeklyCalendarItem(x))return;
  if(isGroupedWork(x)){
   groupedWorkEntries(x).forEach(function(child){
    var childDeferred=confirmedDeferred(x)||confirmedDeferred(child);
    if(x.deferredCarry||child.deferredCarry||child.required===false)units=units.concat(groupedMakeupCompletionUnits([!!child.done],childDeferred));
    else units=units.concat(groupedOriginalCompletionUnits([!!child.done],childDeferred));
   });
   return;
  }
  if(x.deferredCarry){
   var carryCompleted=!!x.done;
   if(isInteractiveDaily(x)){
    var carryEntries=(x.f&&Array.isArray(x.f.interactiveEntries))?x.f.interactiveEntries:[];
    carryCompleted=carryEntries.length>0&&carryEntries.every(function(c){return !!c.done});
   }else if(isCalendarNaturalIntegration(x)){
    var carryChildren=ensureCalendarNaturalIntegrationEntries(x,date);
    carryCompleted=carryChildren.length>0&&carryChildren.every(function(c){return !!c.done});
   }
   units.push(makeupCompletionUnit(carryCompleted,confirmedDeferred(x)));
   return;
  }
  if(!x.required){
   if(((x.source==='custom'&&!isEnglishReview(x))||isCalendarMakeup(x)||hasMergedCalendarMakeup(x))&&x.type)units.push(makeupCompletionUnit(!!x.done,confirmedDeferred(x)));
   return;
  }
  if(isSaturdayMakeup(x)){
   units.push(originalCompletionUnit(!!x.done,confirmedDeferred(x)));
   var makeupEntries=x.f&&Array.isArray(x.f.makeupEntries)?x.f.makeupEntries:[];
   makeupEntries.forEach(function(m){
    if(m&&m.type)units.push(makeupCompletionUnit(!!m.done,confirmedDeferred(x)||confirmedDeferred(m)));
   });
   return;
  }
  if(isInteractiveDaily(x)){
   var entries=(rec===data)?ensureInteractiveEntries(x):((x.f&&Array.isArray(x.f.interactiveEntries))?x.f.interactiveEntries:[]);
   var completed=entries.length>0&&entries.every(function(c){return !!c.done});
   units.push(originalCompletionUnit(completed,confirmedDeferred(x)));
   if(hasMergedCalendarMakeup(x))units.push(makeupCompletionUnit(completed,confirmedDeferred(x)));
   return;
  }
  if(isCalendarNaturalIntegration(x)){
   var children=ensureCalendarNaturalIntegrationEntries(x,date);
   if(children.length){
    children.forEach(function(c){units.push({...originalCompletionUnit(!!c.done,confirmedDeferred(x)),workloadIncluded:false})});
    units.push(makeupCompletionUnit(children.every(function(c){return !!c.done}),confirmedDeferred(x)));
   }else units.push(originalCompletionUnit(!!x.done,confirmedDeferred(x)));
   return;
  }
  units.push(originalCompletionUnit(!!x.done,confirmedDeferred(x)));
  if(hasMergedCalendarMakeup(x))units.push(makeupCompletionUnit(!!x.done,confirmedDeferred(x)));
 });
 return units;
}
function completionMetricsForWeek(date,lastDayIndex){
 var mon=mondayOf(parseDate(date)),units=[];
 for(var i=0;i<=lastDayIndex;i++){
  var day=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+i,12),ds=dateString(day);
  var rec=studyRecordForOverview(ds);
  units=units.concat(completionUnitsForRecord(rec,ds));
 }
 return summarizeCompletionUnits(units);
}
function updateSettlementMetrics(date){
 var day=parseDate(date).getDay(),box=id('settlementMetrics'),comparison=id('settlementComparison');
 if(day!==5&&day!==0){box.hidden=true;comparison.hidden=true;return}
 box.hidden=false;
 if(day===5){
  var friday=completionMetricsForWeek(date,4);
  id('settlementLabel').textContent='週五結算完成率';
  id('settlementPercent').textContent=friday.settlementPercent+'%';
  comparison.hidden=true;return;
 }
 var week=completionMetricsForWeek(date,6),fridayBase=completionMetricsForWeek(date,4);
 id('settlementLabel').textContent='本週結算完成率';
 id('settlementPercent').textContent=week.settlementPercent+'%';
 id('settlementDelta').textContent=formatPercentagePointDelta(week.settlementPercent-fridayBase.settlementPercent);
 comparison.hidden=false;
}

function renderSubjectTimeDonut(summary){
 var chart=id('subjectTimeDonut');
 if(!chart)return;
 var center='<div class="subject-time-center"><strong><span id="doneMinutes" data-subject-time-value>'+summary.totalMinutes+'</span></strong><span data-subject-time-caption>分鐘</span><span class="subject-time-tooltip" data-subject-time-tooltip hidden></span></div>';
 if(!summary.slices.length){
  var emptyRing='<svg class="subject-time-ring" viewBox="0 0 160 160" aria-hidden="true"><circle class="subject-time-track" cx="80" cy="80" r="56" fill="none"></circle></svg>';
  chart.innerHTML='<div class="subject-time-chart is-empty" role="img" aria-label="今日完成時間 0 分鐘">'+emptyRing+center+'</div><div class="subject-time-empty">完成項目並填入時間後，這裡會顯示各科時間佔比。</div>';
  return;
 }
 var aria=summary.slices.map(function(slice){return slice.subject+' '+slice.minutes+' 分鐘，占 '+slice.percent+'%'}).join('；');
 var arcs=subjectTimeDonutSlices(summary),circles='',labels='';
 arcs.forEach(function(slice,index){
  var fontSize=(slice.endPercent-slice.startPercent)<6?10.5:13;
  circles+='<path class="subject-time-slice" data-subject-time-index="'+index+'" d="'+subjectTimeArcPath(slice)+'" fill="none" stroke="'+slice.color+'" stroke-width="30" tabindex="0" role="button" aria-label="'+esc(slice.subject)+' '+slice.minutes+' 分鐘，占 '+slice.percent+'%"></path>';
  labels+='<text class="subject-time-ring-label" x="'+slice.labelX+'" y="'+slice.labelY+'" font-size="'+fontSize+'">'+SUBJECT_TIME_SHORT_LABELS[slice.subject]+'</text>';
 });
 var svg='<svg class="subject-time-ring" viewBox="0 0 160 160"><circle class="subject-time-track" cx="80" cy="80" r="56" fill="none" stroke-width="30"></circle>'+circles+labels+'</svg>';
 chart.innerHTML='<div class="subject-time-chart" role="group" aria-label="今日各科完成時間佔比：'+esc(aria)+'">'+svg+center+'</div>';
 var tooltip=chart.querySelector('[data-subject-time-tooltip]'),nodes=Array.from(chart.querySelectorAll('[data-subject-time-index]'));
 function showSubject(index){
  var slice=summary.slices[index];if(!slice)return;
  tooltip.textContent=SUBJECT_TIME_SHORT_LABELS[slice.subject]+' '+slice.minutes+' 分鐘｜'+slice.percent+'%';tooltip.hidden=false;
  nodes.forEach(function(node,nodeIndex){node.classList.toggle('is-active',nodeIndex===index);node.classList.toggle('is-muted',nodeIndex!==index)});
 }
 function showTotal(){tooltip.hidden=true;tooltip.textContent='';nodes.forEach(function(node){node.classList.remove('is-active','is-muted')})}
 function showPinnedOrTotal(){var pinned=Number(chart.dataset.pinnedSubject);if(Number.isInteger(pinned)&&pinned>=0)showSubject(pinned);else showTotal()}
 nodes.forEach(function(node,index){
  node.addEventListener('mouseenter',function(){showSubject(index)});
  node.addEventListener('mouseleave',showPinnedOrTotal);
  node.addEventListener('focus',function(){showSubject(index)});
  node.addEventListener('blur',showPinnedOrTotal);
  node.addEventListener('click',function(event){event.stopPropagation();var same=chart.dataset.pinnedSubject===String(index);if(same)delete chart.dataset.pinnedSubject;else chart.dataset.pinnedSubject=String(index);showPinnedOrTotal()});
  node.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();node.click()}});
 });
 chart.addEventListener('click',function(){delete chart.dataset.pinnedSubject;showTotal()});
}

function updateSummary(){
 mathProgressIndex.upsert(data);
 var subjectMinuteEntries=[],active=visibleItems(data);
 function addSubjectMinutes(item,value){var minutes=Number(value||0);if(Number.isFinite(minutes)&&minutes>0)subjectMinuteEntries.push({subject:studyItemSubject(item),minutes:minutes})}
 function collectCompletedMinutes(x){
  if(!x)return;
  if(isGroupedWork(x)){
   var grouped=groupedWorkEntries(x);x.done=grouped.length>0&&grouped.every(function(child){return !!child.done});
   grouped.forEach(collectCompletedMinutes);
   return;
  }
  if(isInteractiveDaily(x)){
   var interactive=ensureInteractiveEntries(x);x.done=interactive.length>0&&interactive.every(function(child){return !!child.done});
   interactive.forEach(collectCompletedMinutes);
   return;
  }
  if(isCalendarNaturalIntegration(x)){
   var integration=ensureCalendarNaturalIntegrationEntries(x,data.date);x.done=integration.length>0&&integration.every(function(child){return !!child.done});
   integration.forEach(collectCompletedMinutes);
   return;
  }
  if(isSaturdayMakeup(x)){
   ensureEntryArray(x,'makeupEntries').forEach(collectCompletedMinutes);
   return;
  }
  if(!x.done)return;
  if(isFixedMagazine(x))addSubjectMinutes(x,fixedMagazineMinutes(x));
  else if(!isEnglishReview(x))addSubjectMinutes(x,x.minutes);
 }
 active.forEach(collectCompletedMinutes);
 var subjectTime=summarizeSubjectTime(subjectMinuteEntries);
 var completion=summarizeCompletionUnits(completionUnitsForRecord(data,data.date)),pct=completion.itemPercent;
 var math=calculateMathProgress(mathProgressIndex.view(),data.date,calendarWeekMathTarget(data.date));
 id('completionPercent').textContent=pct+'%';
 id('completionBar').style.width=pct+'%';
 id('completionText').textContent=completion.itemCompleted+'/'+completion.itemTotal+' 項';
 id('workloadCompletionPercent').textContent=completion.workloadPercent+'%';
 id('workloadCompletionBar').style.width=completion.workloadPercent+'%';
  id('workloadCompletionText').textContent=completion.workloadCompleted+'/'+completion.workloadTotal+' 項工作量';
  updateSettlementMetrics(data.date);
 renderSubjectTimeDonut(subjectTime);
 id('mathPagesTop').textContent=math.dailyNewPages;
 id('weekMathPages').textContent=math.weeklyNewPages;
 id('weekMathTarget').textContent=math.weeklyTarget;
 id('weekMathBar').style.width=math.weeklyPercent+'%';
 id('weekMathPercent').textContent=math.weeklyPercent+'%';
}
function wakeParts(s){var m=String(s||'').match(/^(\d{1,2}):(\d{1,2})$/);return m?{hour:m[1],minute:m[2]}:{hour:'',minute:''}}
function composeWake(){var h=id('wakeHour').value,m=id('wakeMinute').value;if(h===''||m==='')return'';h=Number(h);m=Number(m);if(!Number.isInteger(h)||!Number.isInteger(m)||h<0||h>23||m<0||m>59)return'';return pad(h)+':'+pad(m)}
function readHeader(){data.mood=id('mood').value;data.wakeTime=composeWake();data.biggestBlock=id('biggestBlock').value;data.firstThingTomorrow=id('firstThingTomorrow').value;data.notes=id('notes').value}
function writeHeader(){id('mood').value=data.mood||'';var w=wakeParts(data.wakeTime);id('wakeHour').value=w.hour;id('wakeMinute').value=w.minute;id('biggestBlock').value=data.biggestBlock||'';id('firstThingTomorrow').value=data.firstThingTomorrow||'';id('notes').value=data.notes||''}
function validate(){
 var ok=true,msg='';
 var wakeHour=id('wakeHour'),wakeMinute=id('wakeMinute'),wakeHourValue=wakeHour.value===''?null:Number(wakeHour.value),wakeMinuteValue=wakeMinute.value===''?null:Number(wakeMinute.value);
 var wakeHourValid=wakeHourValue===null||(Number.isInteger(wakeHourValue)&&wakeHourValue>=0&&wakeHourValue<=23),wakeMinuteValid=wakeMinuteValue===null||(Number.isInteger(wakeMinuteValue)&&wakeMinuteValue>=0&&wakeMinuteValue<=59);
 wakeHour.setCustomValidity(wakeHourValid?'':'小時請填 00～23。');wakeMinute.setCustomValidity(wakeMinuteValid?'':'分鐘請填 00～59。');if(!wakeHourValid||!wakeMinuteValid){ok=false;msg='起床時間格式不正確；小時請填 00～23，分鐘請填 00～59。'}
 document.querySelectorAll('[data-field="essayScore"]').forEach(function(el){var v=el.value===''?null:Number(el.value),x=v===null||(Number.isInteger(v)&&v>=0&&v<=18);el.setCustomValidity(x?'':'作文範圍起點請填 0～18。');if(!x){ok=false;msg='英文作文分數超出範圍。'}});
 document.querySelectorAll('[data-field="mixedScore"]').forEach(function(el){var v=el.value===''?null:Number(el.value),x=v===null||(Number.isInteger(v)&&v>=0&&v<=10);el.setCustomValidity(x?'':'混合題分數請填 0～10。');if(!x){ok=false;msg='英文混合題分數超出範圍。'}});
 document.querySelectorAll('[data-field="score"]').forEach(function(el){var v=el.value===''?null:Number(el.value),x=v===null||(Number.isInteger(v)&&v>=0&&v<=25);el.setCustomValidity(x?'':'國文寫作分數請填 0～25。');if(!x){ok=false;msg='國文寫作分數超出範圍。'}});
 document.querySelectorAll('[data-field="correctCount"]').forEach(function(el){var v=el.value===''?null:Number(el.value),x=v===null||(Number.isInteger(v)&&v>=0&&v<=20);el.setCustomValidity(x?'':'答對題數請填 0～20 的整數。');if(!x){ok=false;msg='英文互動題答對題數超出範圍。'}});
 document.querySelectorAll('[data-field="translationScore1"],[data-field="translationScore2"]').forEach(function(el){var v=el.value===''?null:Number(el.value),x=v===null||(v>=0&&v<=4&&Math.abs(v*2-Math.round(v*2))<1e-9);el.setCustomValidity(x?'':'中翻英分數請填 0～4.0，並以 0.5 為單位。');if(!x){ok=false;msg='中翻英分數格式不正確。'}});
 document.querySelectorAll('[data-field="round"][max="40"]').forEach(function(el){var v=el.value===''?null:Number(el.value),x=v===null||(Number.isInteger(v)&&v>=1&&v<=40);el.setCustomValidity(x?'':'英文寫作測驗回數請填 1～40。');if(!x){ok=false;msg='英文寫作測驗回數超出範圍。'}});
 document.querySelectorAll('[data-field="round"][max="60"]').forEach(function(el){var v=el.value===''?null:Number(el.value),x=v===null||(Number.isInteger(v)&&v>=1&&v<=60);el.setCustomValidity(x?'':'ACE Reading 回數請填 1～60。');if(!x){ok=false;msg='ACE Reading 回數超出範圍。'}});
 document.querySelectorAll('[data-round-book="listening-test"]').forEach(function(el){var v=el.value===''?null:Number(el.value),x=v===null||(Number.isInteger(v)&&v>=1&&v<=LISTENING_TEST_MAX);el.setCustomValidity(x?'':'大考英聽A攻略 Test 請填 1～10。');if(!x){ok=false;msg='大考英聽A攻略 Test 超出範圍。'}});
 document.querySelectorAll('[data-field="round"][max="100"]').forEach(function(el){var v=el.value===''?null:Number(el.value),x=v===null||(Number.isInteger(v)&&v>=1&&v<=100);el.setCustomValidity(x?'':'古今悅讀一百回數請填 1～100。');if(!x){ok=false;msg='古今悅讀一百回數超出範圍。'}});
 return{ok:ok,msg:msg};
}
function persist(show){
 if(!data)return false;
 if(data.storageIssue){updateStorageRecoveryUI();if(show)id('status').textContent=data.date+' 的原始紀錄無法讀取；為避免覆蓋，修復前不會儲存。';return false}
 ensureEnglishReviewWordEntryIds(data);readHeader();
 if(cloudVisibleRefreshPending){
  var newerStored=readStoredRecord(data.date);
  if(newerStored&&!sameStudyContent(data,newerStored)){
   var mergedDraft=mergeStudyRecordsForUpload(data,newerStored),draftConflicts=recordSyncConflicts(mergedDraft);
   if(draftConflicts.length)setCloudConflictRecord(mergedDraft.syncConflictLocal||data,newerStored,draftConflicts);
   else data=mergedDraft;
  }
 }
 var v=validate();if(!v.ok){if(show)id('status').textContent=v.msg;return false}
 var previous=readStoredRecord(data.date),changed=!sameStudyContent(previous,data);
 if(changed){
  data.localDirty=true;data.syncConflict=false;
  if(previous&&previous.serverRevision!==undefined)data.serverRevision=Number(previous.serverRevision||0);
  if(previous&&previous.serverUpdatedAt)data.serverUpdatedAt=previous.serverUpdatedAt;
 }else if(previous){
  data.serverRevision=Number(previous.serverRevision||0);data.serverUpdatedAt=previous.serverUpdatedAt||'';data.localDirty=!!previous.localDirty;data.syncConflict=!!previous.syncConflict;
 }
 var ok=false;
 try{ok=writeStoredRecord(data)&&sameStudyContent(readStoredRecord(data.date),data)}catch(e){}
 if(ok&&(changed||data.localDirty))queueCloudSave(data);
 if(ok)updateCloudStatusBadge();
 if(show)id('status').textContent=ok?(cloudUser?(data.syncConflict?'已儲存本機，但此日期有同步衝突；未覆蓋雲端。':(changed?'已儲存 '+data.date+'；正在同步雲端。':'紀錄未變更，不需重新同步。')):(storagePersistent?'已儲存 '+data.date+' 的本機紀錄。':'已暫存；目前環境可能無法永久保存。')):'儲存失敗，請先不要關閉頁面。';return ok;
}
function load(options){
 var opts=options||{},d=id('studyDate').value;pendingDeferredTargets={};deferredLimitPrompt=null;data=loadData(d);updateCloudConflictUI(data.syncConflict?d:'');updateStorageRecoveryUI();id('weekdayText').textContent=weekdays[parseDate(d).getDay()];
 if(data.storageIssue){writeHeader();render();id('status').textContent=d+' 的本機紀錄無法讀取；原始內容已保留，修復前不會覆蓋。';return}
 var changed=ensureDailyPresets(data,d);if(ensureEnglishReviewWordEntryIds(data))changed=true;writeHeader();render();if(changed&&!opts.cacheOnly)persist(false);
 if(cloudUser&&!cloudBootstrapPending&&!opts.skipCloudRead)cloudPullDate(d,false);
}

function itemDetails(x){
 var f=x.f||{},s='';
 if(isGroupedWork(x))return'｜子項目：'+groupedWorkEntries(x).map(function(child,index){return(child.done?'✓ ':'— ')+groupedWorkLabel(child,index)+itemDetails(child)}).join('；');
 if(x.type==='mathStudy'||x.type==='mathLecture'||x.type==='mathPractice'){applyMathAuto(f);s+='｜講義版本：'+line(f.material)+(f.material==='複習週記'?'':'｜冊數：'+line(f.book))+'｜頁數：第'+line(f.start)+'頁到第'+line(f.end)+'頁';if(f.material==='複習週記')s+='｜章節：'+line(f.chapter);else s+='｜單元：'+line(f.unit)+(f.chapter?'｜章節：'+line(f.chapter):'');if(x.type==='mathLecture'){s+='｜進度：'+(f.progress?'✓':'—')+'｜批改：'+(f.graded?'✓':'—')+'｜訂正：'+(f.corrected?'✓':'—');if(f.corrected)s+='｜錯因／不熟觀念：'+line(f.reason)}if(x.type==='mathPractice')s+='｜錯因／不熟觀念：'+line(f.reason)+'｜訂正：'+(f.corrected?'已完成':'未完成')+'｜再複習：'+(f.review?'是':'否')+'｜延續：'+line(f.extended)}
 else if(x.type==='mathOral')s+='｜主題：'+line(f.topic)+'｜結果：'+line(f.result);
 else if(x.type==='biologyInteractive')s+='｜主題：'+line(f.topic)+'｜結果：'+line(f.result);
 else if(x.type==='interactiveDaily'){var ia=ensureInteractiveEntries(x);s+='｜'+ia.map(function(c,i){return'第'+(i+1)+'筆：'+itemSummary(c)}).join('；')}
 else if(x.type==='englishMixedWriting'){var es=Number(f.essayScore),ms=Number(f.mixedScore);s+='｜優先修改錯誤：'+line(f.priorityFix)+'｜作文分數：'+(f.essayScore!==''&&Number.isInteger(es)?'約 '+es+' 到 '+(es+2)+' 分':'—')+'｜混合題分數：'+(f.mixedScore!==''&&Number.isInteger(ms)?ms:'—')}
 else if(x.type==='englishPractice'){var ep=[];if(f.listening)ep.push('英聽');if(f.vocab)ep.push('單字');if(f.translation)ep.push('中譯英');if(f.gsatPart1)ep.push('GSAT 第壹部分');s+='｜內容：'+(ep.length?ep.join('、'):'未勾選')+'｜答對題數：'+line(f.correctCount)+'／20 題｜中翻英第一句：'+line(f.translationScore1)+'／4.0 分｜中翻英第二句：'+line(f.translationScore2)+'／4.0 分｜錯誤觀念／文法：'+line(f.errorConceptGrammar)}
 else if(x.type==='interactive'){
  if(f.interactiveType==='mathOral')s+='｜數 A 互動題：觀念題｜主題：'+line(f.topic)+'｜結果：'+line(f.result);
  else if(f.interactiveType==='englishPractice'){var ie=[];if(f.listening)ie.push('英聽');if(f.vocab)ie.push('單字');if(f.translation)ie.push('中譯英');if(f.gsatPart1)ie.push('GSAT 第壹部分');s+='｜英文互動題：英聽及學測練習｜內容：'+(ie.length?ie.join('、'):'未勾選')+'｜答對題數：'+line(f.correctCount)+'／20 題｜中翻英第一句：'+line(f.translationScore1)+'／4.0 分｜中翻英第二句：'+line(f.translationScore2)+'／4.0 分｜錯誤觀念／文法：'+line(f.errorConceptGrammar)}
  else if(f.interactiveType==='biologyInteractive')s+='｜生物互動題｜主題／範圍：'+line(f.topic)+'｜錯因／不熟觀念：'+line(f.reason);
  else s+='｜互動題種類：未選擇';
 }
 else if(x.type==='magazine'){if(isFixedMagazine(x)){s+='｜'+ensureMagazineEntries(x).map(function(r,i){return'第'+(i+1)+'筆：'+line(r.name)+'｜'+line(r.month)+'月號｜Unit '+line(r.unit)+'｜'+line(r.minutes)+' 分鐘'}).join('；')}else s+='｜'+line(f.name)+'｜'+line(f.month)+'月號｜Unit '+line(f.unit)}
 else if(x.type==='chineseReading'){if(f.kind==='writing')s+='｜寫作｜題目：'+line(f.topic)+'｜分數：'+line(f.score)+'｜題型：'+line(f.writingType)+'｜改進方向：'+line(f.improvement);else if(f.kind==='reading')s+='｜古今悅讀一百｜第'+line(f.round)+'回｜進度：'+(f.progress?'✓':'—')+'｜批改：'+(f.graded?'✓':'—')+'｜訂正：'+(f.corrected?'✓':'—');else if(f.kind==='book')s+='｜'+line(f.book)+'｜頁碼：第'+line(f.start)+'頁～第'+line(f.end)+'頁｜對應：'+bookPageText(f.book,f.start,f.end);else s+='｜國文項目：未選擇'}
 else if(x.type==='scienceReview'){if(isCalendarNaturalIntegration(x)){var ce=ensureCalendarNaturalIntegrationEntries(x,(data&&data.date)||'');s+='｜Calendar主題：'+line(f.calendarTopic)+'｜分科項目：'+ce.map(function(c){return(c.done?'✓ ':'— ')+c.subject+'｜123日的淬鍊｜'+line(c.pageText)+'｜對應章節：'+line(c.chapterText)}).join('；')}else{normalizeScience(f);s+='｜科目：'+line(f.subject);if(isCalendarNatural(x)&&f.calendarTopic)s+='｜Calendar主題：'+line(f.calendarTopic);s+='｜講義：'+line(f.material)+'｜頁數：第'+line(f.start)+'頁到第'+line(f.end)+'頁';if(f.material==='好考點')s+='｜對應：'+goodPointCombinedText(f.subject,f.start,f.end);if(f.material==='123日的淬鍊'){var d123=day123Matches(f.subject,f.start,f.end);if(d123.length)s+='｜對應：'+day123Text(f.subject,f.start,f.end)}if(f.subject==='混合')s+='｜章節：'+line(f.chapter);s+='｜進度：'+(f.progress?'✓':'—')+'｜批改：'+(f.graded?'✓':'—')+'｜訂正：'+(f.corrected?'✓':'—');if(f.corrected)s+='｜錯因／不熟觀念：'+line(f.reason)}}
 else if(x.type==='mock')s+='｜科目：'+(isLockedEnglishMock(x)?'英文':line(f.subject))+'｜'+line(f.year)+' '+line(f.exam)+' '+line(f.round)+'｜狀態：'+line(f.status)+'｜錯因／不熟觀念：'+line(f.reason);
 else if(x.type==='englishVocabInteractive'){var vw=Array.isArray(f.words)?f.words:[];s+='｜今日單字：'+(vw.length?vw.map(function(z){return typeof z==='string'?z:(z.text||'')}).filter(Boolean).join('、'):'未填')}
 else if(x.type==='general'&&isEnglishReview(x)){var w=Array.isArray(f.words)?f.words:[];s+='｜今日單字：'+(w.length?w.map(function(z){return typeof z==='string'?z:(z.text||'')}).filter(Boolean).join('、'):'未填')}
 else if(x.type==='extra'){if(isMagazineTitle(f.title))s+='｜雜誌｜'+line(f.name)+'｜'+line(f.month)+'月號｜Unit '+line(f.unit);else if(isAce(f.title)){s+='｜ACE Reading｜第'+line(f.round)+'回｜進度：'+(f.progress?'✓':'—')+'｜批改：'+(f.graded?'✓':'—')+'｜訂正：'+(f.corrected?'✓':'—');if(f.corrected)s+='｜錯因／不熟觀念：'+line(f.reason)}else if(isEnglishPageMappedBook(f.title)){s+='｜'+line(f.title)+'｜主題：'+line(f.topic)+'｜回次：'+line(f.round)+'｜進度：'+(f.progress?'✓':'—')+'｜批改：'+(f.graded?'✓':'—')+'｜訂正：'+(f.corrected?'✓':'—');if(f.corrected)s+='｜錯因／不熟觀念：'+line(f.reason)}else if(isAzarGrammar(f.title)){s+='｜'+AZAR_GRAMMAR_BOOK_TITLE+(f.azarChapterLabel?'｜'+line(f.azarChapterLabel):'')+(f.azarSectionCode?'｜分項：'+line(f.azarSectionCode)+line(f.azarSectionTitle):'')+'｜頁碼：第'+line(f.start)+'頁～第'+line(f.end)+'頁'}else if(isListeningTestBook(f.title)){s+='｜'+LISTENING_TEST_BOOK_TITLE+'｜Test '+line(f.round)+'｜進度：'+(f.progress?'✓':'—')+'｜批改：'+(f.graded?'✓':'—')+'｜訂正：'+(f.corrected?'✓':'—');if(f.corrected)s+='｜錯因／不熟觀念：'+line(f.reason)}else if(isWritingTest(f.title)){s+='｜英文寫作測驗｜第'+line(f.round)+'回'+(f.calendarFocus?'｜重點：'+line(f.calendarFocus):'')+'｜進度：'+(f.progress?'✓':'—')+'｜批改：'+(f.graded?'✓':'—')+'｜訂正：'+(f.corrected?'✓':'—');if(f.corrected)s+='｜錯因／不熟觀念：'+line(f.reason)}else if(isGrammarReview(f.title)){s+='｜英文文法總複習講義'+(f.calendarGrammarTitle?'｜'+line(f.calendarGrammarTitle):'')+'｜實際頁數：第'+line(f.start)+'頁到第'+line(f.end)+'頁｜進度：'+(f.progress?'✓':'—')+'｜批改：'+(f.graded?'✓':'—')+'｜訂正：'+(f.corrected?'✓':'—');if(f.reason)s+='｜錯因／不熟觀念：'+line(f.reason)}else if(isPrism(f.title)){s+='｜Prism Reading '+line(prismLevel(f))+'｜頁碼：第'+line(f.start)+'頁～第'+line(f.end)+'頁｜進度：'+(f.progress?'✓':'—')+'｜批改：'+(f.graded?'✓':'—')+'｜訂正：'+(f.corrected?'✓':'—');if(f.corrected)s+='｜錯因／不熟觀念：'+line(f.reason)}else if(isEssentialGrammar(f.title))s+='｜Essential Grammar in Use｜Unit '+line(f.unitStart||f.unit)+'～'+line(f.unitEnd||f.unitStart||f.unit)+'（全書 115 Unit）';else{s+='｜'+line(f.title);if(isTraumaland(f.title))s+='｜Topic：'+line(f.topic||f.progress);else if(isWarriors(f.title))s+='｜冊別：'+warriorsBookLabel(f.warriorsBook)+'｜Chapter '+line(f.chapter);else s+='｜頁碼：第'+line(f.start)+'頁～第'+line(f.end)+'頁'}}
 return s;
}
function reviewEntrySummary(x){var d=itemDetails(x).replace(/｜進度：[✓—]｜批改：[✓—]｜訂正：[✓—]/g,'');var s=itemTitle(x)+d;if(x.type!=='mock')s+='｜錯因／不熟觀念：'+line(x.f&&x.f.reason);return s}
function itemSummary(x){
 var state=x.done?'[完成] ':(confirmedDeferred(x)?'[延期] ':'[未完成] ');
 var s=state+itemTitle(x)+(hidesTopMinutes(x)?'':'｜花費：'+line(x.minutes)+' 分鐘')+itemDetails(x);
 if(isSaturdayMakeup(x)){var a=ensureEntryArray(x,'makeupEntries');s+='｜回補項目：'+(a.length?a.map(function(m,i){return'第'+(i+1)+'筆：'+itemSummary(m)}).join('；'):'未新增')}
 if(isSaturdayReview(x)){var b=ensureEntryArray(x,'reviewEntries');s+='｜整理項目：'+(b.length?b.map(function(r,i){return'第'+(i+1)+'筆：'+reviewEntrySummary(r)}).join('；'):'未新增')}
 if(x.type==='general'&&!isEnglishReview(x)&&!isSaturdayMakeup(x)&&!isSaturdayReview(x))s+='｜進度：'+line(x.f&&x.f.progress);
 return s;
}
function daySummary(date){
 var rec=loadData(date);if(rec.storageIssue)return'【'+date+' '+weekdays[parseDate(date).getDay()]+'】\n本機紀錄無法讀取，原始資料已保留等待修復。';ensureDailyPresets(rec,date);var a=['【'+date+' '+weekdays[parseDate(date).getDay()]+'】','狀態：'+line(rec.mood),'起床時間：'+line(rec.wakeTime)];if(isAway(rec))a.push('固定排程：因外出取消');visibleItems(rec).forEach(function(x){a.push(itemSummary(x))});a.push('最大卡點：'+line(rec.biggestBlock));a.push('明天第一件事：'+line(rec.firstThingTomorrow));a.push('補充：'+line(rec.notes));return a.join('\n');
}
function buildWeekSummary(){persist(false);var mon=mondayOf(parseDate(data.date)),a=['本週讀書紀錄｜'+dateString(mon)+'～'+dateString(new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+6,12))];for(var i=0;i<7;i++){var d=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+i,12);a.push('\n'+daySummary(dateString(d)))}return a.join('\n')}
function importProgressItemKey(x){
 if(!x||typeof x!=='object')return'';
 return String(x.id||x.presetKey||((x.type||'')+'|'+(x.title||'')+'|'+((x.f&&x.f.title)||'')));
}
function mergeImportedProgressValue(dst,src){
 if(src===undefined||src===null||src==='')return dst;
 if(typeof src==='boolean')return src?true:!!dst;
 if(Array.isArray(src))return cloneObj(src);
 if(typeof src==='object'){
  var out=(dst&&typeof dst==='object'&&!Array.isArray(dst))?cloneObj(dst):{};
  for(var k in src)if(Object.prototype.hasOwnProperty.call(src,k))out[k]=mergeImportedProgressValue(out[k],src[k]);
  return out;
 }
 if(dst===undefined||dst===null||dst==='')return src;
 return dst;
}
function mergeImportedProgressItems(existing,incoming,date){
 var out=Array.isArray(existing)?existing.slice():[],index={};
 for(var i=0;i<out.length;i++){var k=importProgressItemKey(out[i]);if(k)index[k]=i}
 (Array.isArray(incoming)?incoming:[]).forEach(function(raw){
  var item=normalizeItem(cloneObj(raw),date);if(!item)return;
  var k=importProgressItemKey(item);
  if(k&&index[k]!==undefined){
   var pos=index[k],merged=mergeImportedProgressValue(out[pos],item);
   out[pos]=normalizeItem(merged,date)||out[pos];
  }else{
   out.push(item);if(k)index[k]=out.length-1;
  }
 });
 return out;
}
var importProgressPreview=null;
var importProgressBusy=false;
function importBackupKey(){return STORE_PREFIX+'__progress-import-backup__'}
function readProgressImportBackup(){
 try{
  var raw=store.getItem(importBackupKey()),parsed=raw?JSON.parse(raw):null;
  return parsed&&parsed.version===1&&Array.isArray(parsed.records)?parsed:null;
 }catch(e){return null}
}
function updateImportBackupButton(){var button=id('undoImportBtn');if(button)button.hidden=!readProgressImportBackup()}
function saveProgressImportBackup(entries){
 try{
  var records=entries.map(function(entry){return cloneObj(entry.before)});
  store.setItem(importBackupKey(),JSON.stringify(progressImportBackupPayload(records)));
  updateImportBackupButton();return true;
 }catch(e){return false}
}
function mergedImportedProgressRecord(current,incoming){
 var next=cloneObj(current),d=incoming.date;
 next.date=d;
 next.mood=mergeImportedProgressValue(next.mood,incoming.mood)||'';
 next.wakeTime=mergeImportedProgressValue(next.wakeTime,incoming.wakeTime)||'';
 next.biggestBlock=mergeImportedProgressValue(next.biggestBlock,incoming.biggestBlock)||'';
 next.firstThingTomorrow=mergeImportedProgressValue(next.firstThingTomorrow,incoming.firstThingTomorrow)||'';
 next.notes=mergeImportedProgressValue(next.notes,incoming.notes)||'';
 next.items=mergeImportedProgressItems(next.items,incoming.items,d);
 ensureDailyPresets(next,d);
 var changed=!sameStudyContent(current,next);
 next.serverRevision=Number(current.serverRevision||0);
 next.serverUpdatedAt=current.serverUpdatedAt||'';
 next.localDirty=changed?true:!!current.localDirty;
 // Importing is not conflict resolution. Never make an unresolved date writable.
 next.syncConflict=!!current.syncConflict;
 return next;
}
function createProgressImportPreview(records,text){
 var byDate={},order=[];
 records.forEach(function(incoming){
  var d=incoming.date,entry=byDate[d];
  if(!entry){
   var before=loadData(d),stored=readStoredRecord(d);ensureDailyPresets(before,d);
   entry=byDate[d]={date:d,before:cloneObj(before),after:cloneObj(before),existed:!!stored,hadConflict:!!before.syncConflict};order.push(d);
  }
  entry.after=mergedImportedProgressRecord(entry.after,incoming);
 });
 var entries=order.map(function(d){var entry=byDate[d];entry.changed=!sameStudyContent(entry.before,entry.after);return entry});
 return{sourceText:text,entries:entries};
}
function setImportButtons(options){
 var opts=options||{},preview=id('previewImportBtn'),confirm=id('confirmImportBtn'),cancel=id('cancelImportBtn'),undo=id('undoImportBtn'),field=id('importProgress');
 if(preview){preview.disabled=!!opts.busy;preview.textContent=opts.busy?'處理中…':'預覽匯入'}
 if(confirm){confirm.hidden=!opts.showConfirm;confirm.disabled=!!opts.busy||!!opts.disableConfirm}
 if(cancel){cancel.hidden=!opts.showCancel;cancel.disabled=!!opts.busy}
 if(undo)undo.disabled=!!opts.busy;
 if(field)field.disabled=!!opts.busy;
 importProgressBusy=!!opts.busy;
}
function showImportPanel(title,summary,lines,state){
 var panel=id('importPreviewPanel'),list=id('importPreviewList');
 panel.hidden=false;panel.dataset.state=state||'preview';id('importPreviewTitle').textContent=title;id('importPreviewSummary').textContent=summary||'';list.replaceChildren();
 (lines||[]).forEach(function(line){var li=document.createElement('li');li.textContent=line;list.appendChild(li)});
}
function hideImportPreview(clearText){
 importProgressPreview=null;id('importPreviewPanel').hidden=true;setImportButtons({showConfirm:false,showCancel:false});
 if(clearText)id('importProgress').value='';
}
function previewProgressImport(){
 if(importProgressBusy)return;
 var el=id('importProgress'),text=el.value.trim();
 if(!text){showImportPanel('無法預覽','請先貼上 JSON 進度資料。',[],'error');setImportButtons({showCancel:true});return}
 var parsed=parseProgressImportText(text);
 if(!parsed.ok){importProgressPreview=null;showImportPanel('資料格式有誤','尚未修改任何紀錄。',parsed.errors,'error');setImportButtons({showCancel:true});return}
 var plan=createProgressImportPreview(parsed.records,text),changed=plan.entries.filter(function(entry){return entry.changed}),added=changed.filter(function(entry){return !entry.existed}).length,updated=changed.length-added,unchanged=plan.entries.length-changed.length,conflicts=changed.filter(function(entry){return entry.hadConflict}).length;
 importProgressPreview=plan;
 var summary='共 '+plan.entries.length+' 個日期；新增 '+added+'、更新 '+updated+'、無變更 '+unchanged+(conflicts?'、既有衝突 '+conflicts:'')+'。尚未修改任何紀錄。';
 var lines=plan.entries.map(function(entry){var action=entry.changed?(entry.existed?'將更新':'將新增'):'無變更';return entry.date+'：'+action+(entry.hadConflict?'（保留同步衝突，不會覆蓋雲端）':'')});
 showImportPanel('匯入預覽',summary,lines,'preview');
 setImportButtons({showConfirm:true,disableConfirm:changed.length===0,showCancel:true});
 id('status').textContent=changed.length?'預覽完成；確認前不會修改資料。':'預覽完成；沒有可匯入的變更。';
}
function restoreLocalImportEntries(entries){
 var ok=true;
 for(var i=entries.length-1;i>=0;i--)if(!writeStoredRecord(cloneObj(entries[i].before)))ok=false;
 return ok;
}
async function syncImportedEntries(entries,summary,outcomes){
 if(!cloudClient||!cloudUser||!currentStorageIsUserScoped()){
  summary.cloudSkipped+=entries.length;entries.forEach(function(entry){outcomes[entry.date]='未登入，保留待同步'});return;
 }
 for(var i=0;i<entries.length;i++){
  var entry=entries[i],current=readStoredRecord(entry.date)||entry.after;
  if(current.syncConflict){summary.cloudConflicts++;outcomes[entry.date]='本機完成，雲端衝突待確認';continue}
  var saved=await withCloudDateLock(entry.date,function(){return cloudSaveRecord(readStoredRecord(entry.date)||entry.after)}),latest=readStoredRecord(entry.date);
  if(saved){summary.cloudSucceeded++;outcomes[entry.date]='本機與雲端完成'}
  else if(latest&&latest.syncConflict){summary.cloudConflicts++;outcomes[entry.date]='本機完成，雲端衝突待確認'}
  else{summary.cloudFailed++;outcomes[entry.date]='本機完成，雲端同步失敗，可稍後重試'}
 }
}
async function confirmProgressImport(){
 if(importProgressBusy)return;
 var el=id('importProgress'),plan=importProgressPreview;
 if(!plan||el.value.trim()!==plan.sourceText){previewProgressImport();return}
 var changed=plan.entries.filter(function(entry){return entry.changed});if(!changed.length)return;
 setImportButtons({busy:true,showConfirm:true,showCancel:true});id('status').textContent='正在匯入並逐日確認結果…';
 var summary={localSucceeded:0,localFailed:0,cloudSucceeded:0,cloudConflicts:0,cloudFailed:0,cloudSkipped:0},written=[],outcomes={};
 try{
  if(!saveProgressImportBackup(changed))throw new Error('無法建立匯入前備份，因此未修改資料。');
  for(var i=0;i<changed.length;i++){
   var entry=changed[i];
   if(!writeStoredRecord(cloneObj(entry.after))){summary.localFailed++;throw new Error(entry.date+' 無法寫入本機。')}
   written.push(entry);summary.localSucceeded++;outcomes[entry.date]='本機完成，等待雲端';
  }
  await syncImportedEntries(changed,summary,outcomes);
  el.value='';importProgressPreview=null;load({skipCloudRead:true});
  var message=progressImportResultText(summary),hasIssue=summary.localFailed||summary.cloudConflicts||summary.cloudFailed;
  showImportPanel(hasIssue?'匯入完成，但有項目待處理':'匯入完成',message,changed.map(function(entry){return entry.date+'：'+outcomes[entry.date]}),hasIssue?'error':'success');
  id('status').textContent=message;setImportButtons({showConfirm:false,showCancel:false});updateImportBackupButton();
 }catch(e){
  var rolledBack=restoreLocalImportEntries(written);rebuildMathProgressIndex();
  var detail=(e&&e.message?e.message:String(e))+(rolledBack?'；已復原本次本機變更。':'；本機復原不完整，請勿關閉頁面。');
  showImportPanel('匯入未完成',detail,[],'error');id('status').textContent=detail;setImportButtons({showConfirm:true,showCancel:true});
 }
}
async function undoLastProgressImport(){
 if(importProgressBusy)return;
 var backup=readProgressImportBackup();if(!backup)return;
 if(!window.confirm('要復原上次匯入前的紀錄嗎？匯入後對相同日期所做的修改也會被復原。'))return;
 setImportButtons({busy:true,showConfirm:false,showCancel:false});id('status').textContent='正在復原上次匯入…';
 var prior=[],restored=[],summary={localSucceeded:0,localFailed:0,cloudSucceeded:0,cloudConflicts:0,cloudFailed:0,cloudSkipped:0},outcomes={};
 try{
  for(var i=0;i<backup.records.length;i++){
   var savedBefore=cloneObj(backup.records[i]),current=readStoredRecord(savedBefore.date)||loadData(savedBefore.date);prior.push({before:cloneObj(current)});
   savedBefore.serverRevision=Number(current.serverRevision||0);savedBefore.serverUpdatedAt=current.serverUpdatedAt||'';savedBefore.localDirty=true;savedBefore.syncConflict=!!current.syncConflict;
   if(!writeStoredRecord(savedBefore)){summary.localFailed++;throw new Error(savedBefore.date+' 無法復原本機紀錄。')}
   var entry={date:savedBefore.date,before:current,after:savedBefore,changed:true};restored.push(entry);summary.localSucceeded++;outcomes[entry.date]='本機已復原，等待雲端';
  }
  await syncImportedEntries(restored,summary,outcomes);store.removeItem(importBackupKey());updateImportBackupButton();load({skipCloudRead:true});
  var message=progressImportResultText(summary),hasIssue=summary.localFailed||summary.cloudConflicts||summary.cloudFailed;
  showImportPanel(hasIssue?'已復原本機，但有項目待處理':'已復原上次匯入',message,restored.map(function(entry){return entry.date+'：'+outcomes[entry.date]}),hasIssue?'error':'success');id('status').textContent=message;
 }catch(e){
  restoreLocalImportEntries(prior);rebuildMathProgressIndex();var detail='復原失敗：'+(e&&e.message?e.message:String(e));showImportPanel('無法復原',detail,[],'error');id('status').textContent=detail;
 }finally{setImportButtons({showConfirm:false,showCancel:false});updateImportBackupButton()}
}

async function copyTextToClipboard(text){
 text=String(text==null?'':text);
 if(!text)return false;
 try{
  if(navigator.clipboard&&navigator.clipboard.writeText){
   await navigator.clipboard.writeText(text);return true;
  }
 }catch(e){}
 try{
  var ta=document.createElement('textarea');
  ta.value=text;
  ta.setAttribute('readonly','');
  ta.style.position='fixed';
  ta.style.left='-9999px';
  ta.style.top='0';
  document.body.appendChild(ta);
  ta.focus();ta.select();
  var ok=document.execCommand('copy');
  ta.remove();
  return !!ok;
 }catch(e2){return false}
}
async function buildAndCopyWeekSummary(){
 var text=buildWeekSummary();
 id('weekSummary').value=text;
 id('exportBox').hidden=false;
 var ok=await copyTextToClipboard(text);
 id('status').textContent=ok?'本週紀錄已整理並複製。':'本週紀錄已整理，但瀏覽器無法自動複製；請按「複製」或手動複製。';
 return ok;
}
async function copyCurrentWeekSummary(){
 var box=id('weekSummary');
 var text=box&&box.value?box.value:buildWeekSummary();
 if(box)box.value=text;
 id('exportBox').hidden=false;
 var ok=await copyTextToClipboard(text);
 id('status').textContent=ok?'已複製本週紀錄。':'瀏覽器無法自動複製；請手動選取內容複製。';
 return ok;
}

function addCustom(){var t=id('itemType').value;if(!t){id('status').textContent='請先選擇項目類型。';return}data.items.push(newItem(t,'custom'));id('itemType').value='';render();persist(false)}
function addEnglishReview(){
 var x=newItem('general','custom');
 x.title='英文訂正與搭配詞整理';
 x.required=false;
 x.f={words:[]};
 data.items.push(x);
 render();
 persist(false);
}
function periodicCloudSave(){
 if(periodicCloudSaveBusy||!data)return Promise.resolve(false);
 var savingDate=data.date;
 if(!persist(false))return Promise.resolve(false);
 if(!cloudUser||!cloudClient||!currentStorageIsUserScoped()||cloudLoading||cloudBootstrapPending)return Promise.resolve(false);
 var record=readStoredRecord(savingDate);
 if(!record||record.syncConflict)return Promise.resolve(false);
 periodicCloudSaveBusy=true;
 if(record.localDirty)queueCloudSave(record,true);
 return cloudSaveQueue.flush(savingDate).then(function(){
  var saved=readStoredRecord(savingDate);
  return !!saved&&!saved.localDirty&&!saved.syncConflict;
 }).catch(function(){return false}).finally(function(){periodicCloudSaveBusy=false});
}
function switchStudyDate(nextDate){
 var selector=id('studyDate'),currentDate=data&&data.date;
 if(!currentDate){selector.value=nextDate;load();return true}
 if(!nextDate||nextDate===currentDate){selector.value=currentDate;return true}
 if(data.storageIssue){selector.value=nextDate;load();id('status').textContent='已保留 '+currentDate+' 的損壞原始資料，並切換至 '+nextDate+'。';return true}
 selector.value=currentDate;setSaveButtonState('saving');id('status').textContent='正在儲存 '+currentDate+' 的進度…';
 if(!persist(false)){
  id('status').textContent='無法儲存 '+currentDate+'；已取消日期切換，請先修正欄位或確認瀏覽器儲存空間。';setSaveButtonState('error');return false
 }
 selector.value=nextDate;load();
 id('status').textContent='已存本機 '+currentDate+'，並切換至 '+nextDate+(cloudUser?'；雲端將在背景同步。':'。');setSaveButtonState('local');return true
}
function headerInput(){readHeader()}
function headerChange(){readHeader();persist(false)}
function notesInput(){data.notes=id('notes').value}
id('dailyItemList').addEventListener('input',handleInput);id('dailyItemList').addEventListener('change',handleChange);id('dailyItemList').addEventListener('click',handleClick);
id('studyItemsViewTabs').addEventListener('click',function(e){var button=e.target.closest('[data-study-items-view]');if(!button)return;studyItemsView=button.getAttribute('data-study-items-view');updateStudyItemsView(false)});
id('studyItemsViewTabs').addEventListener('keydown',function(e){if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'&&e.key!=='Home'&&e.key!=='End')return;e.preventDefault();if(e.key==='Home')studyItemsView='today';else if(e.key==='End')studyItemsView='week';else studyItemsView=adjacentStudyItemsView(studyItemsView,e.key==='ArrowRight'?1:-1);updateStudyItemsView(true)});
id('overviewMetricTabs').addEventListener('click',function(e){var button=e.target.closest('[data-overview-metric]');if(!button)return;overviewMetricView=button.getAttribute('data-overview-metric');updateOverviewMetricView(false)});
id('overviewMetricTabs').addEventListener('keydown',function(e){if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'&&e.key!=='Home'&&e.key!=='End')return;e.preventDefault();if(e.key==='Home')overviewMetricView='minutes';else if(e.key==='End')overviewMetricView='mathWeek';else overviewMetricView=adjacentOverviewMetric(overviewMetricView,e.key==='ArrowRight'?1:-1);updateOverviewMetricView(true)});
id('activeTimerSummary').addEventListener('click',handleClick);
id('weeklyItemList').addEventListener('click',handleClick);
id('weeklyItemList').addEventListener('change',handleWeeklyChange);
id('englishReviewList').addEventListener('input',handleInput);id('englishReviewList').addEventListener('change',handleChange);id('englishReviewList').addEventListener('click',handleClick);
id('itemList').addEventListener('input',handleInput);id('itemList').addEventListener('change',handleChange);id('itemList').addEventListener('click',handleClick);
id('studyDate').addEventListener('change',function(e){switchStudyDate(e.target.value)});
id('mood').addEventListener('change',function(){readHeader();render();persist(false)});
['wakeHour','wakeMinute','biggestBlock','firstThingTomorrow'].forEach(function(k){id(k).addEventListener('input',headerInput);id(k).addEventListener('change',headerChange)});
id('notes').addEventListener('input',notesInput);id('notes').addEventListener('change',headerChange);
id('addItemBtn').addEventListener('click',addCustom);
id('addEnglishReviewBtn').addEventListener('click',addEnglishReview);
var saveFeedbackTimer=null;
function setSaveButtonState(state){
 var button=id('saveBtn');if(!button)return;
 if(saveFeedbackTimer){clearTimeout(saveFeedbackTimer);saveFeedbackTimer=null}
 button.dataset.state=state||'idle';
 button.disabled=state==='saving';
 button.setAttribute('aria-busy',state==='saving'?'true':'false');
 button.textContent=state==='saving'?'儲存中…':state==='local'?'已存本機 ✓':state==='success'?'Cloud 已同步 ✓':state==='error'?'同步失敗':'儲存紀錄';
 if(state==='local'||state==='success'||state==='error')saveFeedbackTimer=setTimeout(function(){setSaveButtonState('idle')},state==='error'?4000:3000);
}
function saveCurrentRecord(){
 var button=id('saveBtn');if(button&&button.dataset.state==='saving')return;
 setSaveButtonState('saving');id('status').textContent='正在儲存…';
 setTimeout(async function(){
  var ok=persist(true),savingDate=data&&data.date;updateSummary();
  if(!ok){setSaveButtonState('error');return}
  if(cloudUser&&cloudClient&&currentStorageIsUserScoped()&&!cloudLoading&&!cloudBootstrapPending&&savingDate){
   id('status').textContent='已儲存本機；正在同步 '+savingDate+' 的完整紀錄到雲端…';
   await cloudSaveQueue.flush(savingDate);
   var saved=readStoredRecord(savingDate),synced=!!saved&&!saved.localDirty&&!saved.syncConflict;
   if(synced){id('status').textContent='已儲存 '+savingDate+'，並完成雲端同步。';setSaveButtonState('success')}
   else{if(saved&&saved.syncConflict)id('status').textContent='已儲存本機，但此日期有同步衝突；請重新讀取後確認。';else id('status').textContent='已儲存本機，但雲端同步尚未完成；請確認連線後再按一次儲存。';setSaveButtonState('error')}
   return
  }
  if(cloudUser&&(cloudLoading||cloudBootstrapPending))id('status').textContent='已存本機；雲端資料載入完成後會自動同步。';
  else if(!cloudUser)id('status').textContent=storagePersistent?'已存本機 '+savingDate+'；目前未登入 Cloud。':'已暫存；目前環境可能無法永久保存。';
  setSaveButtonState('local');
 },60);
}
id('saveBtn').addEventListener('click',function(e){e.preventDefault();e.stopPropagation();saveCurrentRecord()});
id('weekSummaryBtn').addEventListener('click',buildAndCopyWeekSummary);
id('copyWeekBtn').addEventListener('click',copyCurrentWeekSummary);
id('importProgress').addEventListener('input',function(){if(importProgressPreview)hideImportPreview(false)});
id('importProgress').addEventListener('keydown',function(e){if(e.key==='Enter'&&e.ctrlKey){e.preventDefault();previewProgressImport()}});
id('previewImportBtn').addEventListener('click',previewProgressImport);
id('confirmImportBtn').addEventListener('click',confirmProgressImport);
id('cancelImportBtn').addEventListener('click',function(){hideImportPreview(true);id('status').textContent='已取消匯入，紀錄沒有變更。'});
id('undoImportBtn').addEventListener('click',undoLastProgressImport);
id('downloadStorageRecoveryBtn').addEventListener('click',downloadStorageRecovery);
id('repairStorageFromCloudBtn').addEventListener('click',repairStorageIssueFromCloud);

id('cloudSignInBtn').addEventListener('click',cloudSignIn);
id('cloudSignUpBtn').addEventListener('click',cloudSignUp);
id('cloudForgotPasswordBtn').addEventListener('click',cloudRequestPasswordReset);
id('cloudResendVerificationBtn').addEventListener('click',cloudResendVerification);
id('cloudSignOutBtn').addEventListener('click',cloudSignOut);
id('cloudSyncLocalBtn').addEventListener('click',cloudMergeLocalMissing);
id('cloudRefreshBtn').addEventListener('click',cloudRefreshAllRecords);
id('cloudKeepLocalBtn').addEventListener('click',cloudKeepLocalConflict);
id('cloudUseCloudBtn').addEventListener('click',cloudUseCloudConflict);
id('cloudUndoConflictBtn').addEventListener('click',cloudUndoConflictResolution);
id('cloudApplyRefreshBtn').addEventListener('click',function(){setTimeout(applyPendingVisibleCloudRefresh,0)});
id('passwordRecoveryForm').addEventListener('submit',cloudUpdateRecoveredPassword);
id('cloudCancelPasswordBtn').addEventListener('click',closePasswordRecoveryDialog);
id('deleteUndoBtn').addEventListener('click',undoLastSmallDelete);
id('calendarConnectBtn').addEventListener('click',calendarConnect);
id('calendarSyncBtn').addEventListener('click',calendarSyncNow);
id('calendarDisconnectBtn').addEventListener('click',calendarDisconnect);
var connectionSettingsPanel=id('connectionSettings');
var connectionSettingsSummary=connectionSettingsPanel.querySelector(':scope > summary');
if(connectionSettingsSummary)connectionSettingsSummary.addEventListener('click',function(e){
 if(e.target&&e.target.closest&&e.target.closest('button,a,input,select,textarea'))return;
 var reduceConnectionMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 var narrowConnectionViewport=window.matchMedia('(max-width: 720px)').matches;
 if(connectionSettingsPanel.classList.contains('is-opening')||connectionSettingsPanel.classList.contains('is-closing')){e.preventDefault();return}
 if(!connectionSettingsPanel.open&&!reduceConnectionMotion&&!narrowConnectionViewport){
  e.preventDefault();
  var openingSummaryHeight=connectionSettingsSummary.getBoundingClientRect().height;
  connectionSettingsPanel.classList.add('is-opening');
  connectionSettingsPanel.style.setProperty('--connection-summary-height',openingSummaryHeight+'px');
  connectionSettingsPanel.style.height=openingSummaryHeight+'px';
  connectionSettingsPanel.open=true;
  var openingExpandedHeight=Math.max(openingSummaryHeight,connectionSettingsPanel.scrollHeight);
  connectionSettingsPanel.style.setProperty('--connection-expanded-height',openingExpandedHeight+'px');
  var opened=false;
  function connectionSettingsOpenTransitionEnd(event){
   if(event.target!==connectionSettingsPanel||event.propertyName!=='height')return;
   finishConnectionSettingsOpen();
  }
  function finishConnectionSettingsOpen(){
   if(opened)return;
   opened=true;
   connectionSettingsPanel.removeEventListener('transitionend',connectionSettingsOpenTransitionEnd);
   connectionSettingsPanel.classList.remove('is-opening');
   connectionSettingsPanel.style.removeProperty('height');
   connectionSettingsPanel.style.removeProperty('--connection-expanded-height');
   connectionSettingsPanel.style.removeProperty('--connection-summary-height');
  }
  connectionSettingsPanel.addEventListener('transitionend',connectionSettingsOpenTransitionEnd);
  requestAnimationFrame(function(){requestAnimationFrame(function(){connectionSettingsPanel.style.height=openingExpandedHeight+'px'})});
  setTimeout(finishConnectionSettingsOpen,520);
  return;
 }
 if(!connectionSettingsPanel.open||reduceConnectionMotion)return;
 e.preventDefault();
 var expandedHeight=connectionSettingsPanel.getBoundingClientRect().height;
 var summaryHeight=connectionSettingsSummary.getBoundingClientRect().height;
 connectionSettingsPanel.style.setProperty('--connection-expanded-height',expandedHeight+'px');
 connectionSettingsPanel.style.setProperty('--connection-summary-height',summaryHeight+'px');
 connectionSettingsPanel.classList.add('is-closing');
 var closed=false;
 function connectionSettingsCloseAnimationEnd(event){
  if(event.target!==connectionSettingsPanel)return;
  finishConnectionSettingsClose();
 }
 function finishConnectionSettingsClose(){
  if(closed)return;
  closed=true;
  connectionSettingsPanel.removeEventListener('animationend',connectionSettingsCloseAnimationEnd);
  connectionSettingsPanel.open=false;
  connectionSettingsPanel.classList.remove('is-closing');
  connectionSettingsPanel.style.removeProperty('--connection-expanded-height');
  connectionSettingsPanel.style.removeProperty('--connection-summary-height');
 }
 connectionSettingsPanel.addEventListener('animationend',connectionSettingsCloseAnimationEnd);
 setTimeout(finishConnectionSettingsClose,420);
});
connectionSettingsPanel.addEventListener('toggle',function(e){
 if(e.currentTarget.open&&!e.currentTarget.classList.contains('is-opening')){
  e.currentTarget.classList.remove('is-closing');
  e.currentTarget.style.removeProperty('--connection-expanded-height');
  e.currentTarget.style.removeProperty('--connection-summary-height');
 }
 document.body.classList.toggle('connection-sheet-open',!!e.currentTarget.open);
});
document.addEventListener('focusout',function(){setTimeout(applyPendingVisibleCloudRefresh,0)});
window.addEventListener('online',function(){retryDirtyCloudRecordsOnReconnect().catch(function(e){cloudSetMessage('網路恢復後重試失敗：'+(e&&e.message?e.message:String(e)),false)})});
window.addEventListener('offline',function(){cloudSetMessage('目前離線；新紀錄已保存在本機，恢復連線後會立即重試。',false)});
window.addEventListener('pagehide',function(){if(data)persist(false)});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'&&data)persist(false)});
id('studyDate').value=dateString(new Date());updateImportBackupButton();initCloud();
setInterval(periodicCloudSave,PERIODIC_CLOUD_SAVE_MS);
