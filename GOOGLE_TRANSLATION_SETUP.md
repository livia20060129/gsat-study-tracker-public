# 公開版 Google Cloud Translation 設定

適用：v171.6.0-public.56。公開 Supabase 專案仍為 `xcpnxkkixsxzgbqsiuud`。

## Google Cloud 與 Secret

已有 public.53 翻譯服務者，沿用原本 `GOOGLE_TRANSLATION_API_KEY` 即可；本版沒有新增必填金鑰，也不改 Calendar OAuth。

首次啟用者：

1. 在 Google Cloud 專案啟用帳單與 Cloud Translation API（`translate.googleapis.com`）。使用 Basic v2、純文字 NMT，英文翻成繁體中文。
2. 建立 API key，API restrictions 只允許 Cloud Translation API。由 Supabase 伺服器呼叫，不設定瀏覽器 HTTP referrer 限制；沒有固定出口 IP 時不要臆測 IP。
3. 將 key 放在公開 Supabase 專案 **Edge Functions → Secrets → `GOOGLE_TRANSLATION_API_KEY`**，不放入 GitHub、追蹤的環境範本或任何 `VITE_` 變數。Calendar OAuth Client ID／Client Secret 不是翻譯 key。
4. 在 Google Cloud 設定合適的 API 配額及帳單預算通知。通知本身不會停止扣款，本站限制也不能管控其他地方直接使用相同 key 的流量。

官方資料：[啟用服務](https://docs.cloud.google.com/translate/docs/setup)、[Basic 驗證](https://docs.cloud.google.com/translate/docs/authentication)、[REST v2](https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate)、[API key 限制](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys)。

## 登入與每月 5,000 字元上限

- Google 翻譯必須登入 Tracker。伺服器再次驗證登入，拒絕未登入與匿名帳號；本機 ECDICT 與外部辭典連結仍可獨立使用。
- 每帳號每月最多 **5,000 字元**，台灣時間每月 1 日 00:00 重設。以實際送出的英文 Unicode 字元計數，包含內部空格、標點及換行，並非單字數、UTF-8 位元組數或中文譯文字數。
- 每次最多 2,000 字元。原本全站每天 200,000 字元與 2,000 次的保護仍保留；帳號不再以舊版每日 100 次限制；全站每日限制依 UTC 日期重設。
- 月額度依帳號保存在資料庫。重新整理、登出、換裝置或重新部署不會重設；SQL 本身也禁止把每帳號上限提高到 5,000 以上。
- 額度先以交易鎖原子預留；超額時不呼叫 Google，也不多扣額度。Google 服務失敗或逾時後不退預留額度，避免不明結果及重試造成超額。

可選設定（同樣放在 Supabase Secrets）：

| 名稱 | 預設 | 可設定範圍 |
| --- | ---: | --- |
| `GOOGLE_TRANSLATION_USER_MONTHLY_CHAR_LIMIT` | 5000 | 0～5000，僅可降低／暫停 |
| `GOOGLE_TRANSLATION_GLOBAL_DAILY_CHAR_LIMIT` | 200000 | 0～5000000 |

舊的 `GOOGLE_TRANSLATION_USER_DAILY_CHAR_LIMIT` 不再使用；無須為本版新增上述可選設定。既有必填 key 沿用。

## 覆蓋與部署

必要檔案依相同路徑覆蓋 public.54／public.55，執行 `npm ci`、`npm test`、`npm run build`。

本版新增 `20261105222021_cloud_translation_request_quota.sql`（沿用先前月額度 migration），必須先套用，再重新部署 `cloud-translate`，最後發布完整 `dist`。只換前端不會讓正式後端改成每月額度。原有 GitHub Actions 已按此順序部署，不需要修改工作流程或新增 GitHub secret。

手動部署時，先安全設定既有 Supabase CLI 登入憑證及資料庫密碼，再於專案根目錄執行：

```powershell
npx --yes supabase@2.116.0 link --project-ref xcpnxkkixsxzgbqsiuud
npx --yes supabase@2.116.0 db push --dry-run
npx --yes supabase@2.116.0 db push
npx --yes supabase@2.116.0 functions deploy cloud-translate --project-ref xcpnxkkixsxzgbqsiuud
```

先確認 dry-run 列出的全部待套用遷移，再執行 push。沒有修改舊遷移或讀書紀錄；新增私有扣額收據表與限額 RPC，原月額度及既有用量保留。升級時保留本月已預留用量。由於舊版只保存 UTC 每日彙總，升級採保守方式納入台灣月初前一個 UTC 日期，避免跨時區漏算；新用量直接按台灣月份記錄。

## 上線驗證

1. 登入 Tracker → 英文單字複習 → 字卡「編輯」→「Google 翻譯」。頁首顯示支援標誌及月字元上限。這會真的呼叫 Google，可能計費。
2. 單一已勾選詞性自動帶入；有多個時由使用者指定；尚未勾選時可參考同拼法本機詞性，沒有單一可靠結果時仍由使用者指定。組合／句子不加詞性。Google 只翻譯，不推測詞性或學測級數。
3. 確認之前不應改寫紀錄。按「填入 Google 翻譯」後保留舊中文、星號、級數及跨日來源；重新整理後仍存在。
4. 已存到未分詞性的翻譯可在字卡編輯區刪除，最後一筆也能刪除；重新整理不應復原。
5. 查詢辭典切換劍橋英漢辭典／牛津辭典，確認英文連結與選擇保存正確。只有點擊英文連結才開啟外部網站，不擷取其釋義。
6. 登出後 Google 按鈕停用，不能產生付費翻譯請求。額度耗盡顯示每月限制；其餘手動編輯與 ECDICT 繼續可用。
7. 有翻譯 PDF／Word／列印檔保留 Google 來源標示，無翻譯練習檔不含答案。

## 資料與驗證範圍

額度表只保存帳號、月份／UTC 日期、次數與字元數，不保存原文或譯文。後續請求清理過去月份的月額度，以及超過 35 天的每日紀錄；帳號刪除連帶刪除個別用量。只有伺服器角色能讀寫額度或呼叫限額函式。

既有翻譯 key、安全邊界與 Google 官方來源圖沿用；本次更新的是 UI、分類保存與資料庫額度。[Google 標示規則](https://docs.cloud.google.com/translate/attribution)。

本次以替代 Google 回應及本機 PostgreSQL 相容環境驗證詞性、刪除、登入、每月上限、跨日不重設、台灣月界線與安全權限。未修改正式資料庫或部署 public.56；正式啟用須完成上述部署步驟。

## 快取與扣額重試

- 快取只在各瀏覽器／伺服器執行個體記憶體中保留，最多 256 筆成功結果，依帳號及原英文隔離，不保證跨裝置或重新部署仍命中。命中不扣額，同時相同查詢合併執行。
- 扣額 RPC 的兩次傳輸嘗試沿用同一伺服器產生的 UUID；新私有收據保證同一預留不重複扣。它不是不同 HTTP 查詢或重新按下按鈕的免費重試保證；Google 已送出的失敗仍依原規則計數。
- 額度拒絕可顯示已用、剩餘及重設日期；不顯示上游原始錯誤或憑證。
- 仍只在使用者按下 Google 按鈕時呼叫付費服務。自動單字查詢、背景接續及 ECDICT 下載不發出 Google 請求。
