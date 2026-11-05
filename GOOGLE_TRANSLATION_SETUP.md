# 公開版 Google Cloud Translation 設定

適用：v171.6.0-public.53，Supabase 專案 `xcpnxkkixsxzgbqsiuud`。

## Google Cloud

1. 在要支付翻譯費用的 Google Cloud 專案啟用帳單。
2. 啟用 Cloud Translation API（`translate.googleapis.com`）。本功能使用 Basic v2，英文翻成繁體中文，純文字 NMT。
3. 建立 API key，API restrictions 只允許 Cloud Translation API。key 由 Supabase 伺服器呼叫，不使用瀏覽器 HTTP referrer 限制；沒有固定出口 IP 時不要填入臆測的 IP。
4. 設定適當的 Google API 配額與帳單預算通知。通知本身不會停止扣款；本站用量表不能限制其他地方直接使用相同 key 的流量，因此不要與不受控服務共用 key。

官方資料：[啟用服務](https://docs.cloud.google.com/translate/docs/setup)、[Basic 驗證](https://docs.cloud.google.com/translate/docs/authentication)、[REST v2](https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate)、[API key 限制](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys)。

## Supabase Secrets

在公開專案 **Edge Functions → Secrets** 新增 `GOOGLE_TRANSLATION_API_KEY`，值為上述 API key。

只放在 Supabase Secrets；不放進 GitHub、`.env.example` 或任何 `VITE_` 變數。本功能不需要新增 GitHub secret。`GOOGLE_CLIENT_ID`／`GOOGLE_CLIENT_SECRET` 是 Calendar OAuth 設定，不能當成翻譯 key。不修改既有 Calendar 的 `calendar.events.readonly` 權限。

可選限制（同樣放在 Supabase Secrets）：

| 名稱 | 預設 |
| --- | ---: |
| `GOOGLE_TRANSLATION_USER_DAILY_CHAR_LIMIT` | 20000 |
| `GOOGLE_TRANSLATION_GLOBAL_DAILY_CHAR_LIMIT` | 200000 |

接受 0～5000000 的整數；0 可暫停服務。每次最多 2000 字元；另固定限制每帳號每天 100 次、全站每天 2000 次。依 UTC 日期計算，台灣時間每天 08:00 重設。Google 實際費用仍依專案與 Google 計價設定。

## 覆蓋與部署

必要檔案依原路徑覆蓋 public.52，執行 `npm ci`、`npm test`、`npm run build`。

GitHub Actions 原有 release 流程已加入：資料庫遷移 → 部署 `cloud-translate` → 無 Google 呼叫的 GET 檢查 → 網站部署。沿用原有 `SUPABASE_ACCESS_TOKEN`、`SUPABASE_DB_PASSWORD` 與 Pages 設定。沒有升級已釘選的 Supabase CLI。

若手動部署，先安全設定既有 CLI 登入憑證及資料庫密碼，再於專案根目錄執行：

```powershell
npx --yes supabase@2.116.0 link --project-ref xcpnxkkixsxzgbqsiuud
npx --yes supabase@2.116.0 db push --dry-run
npx --yes supabase@2.116.0 db push
npx --yes supabase@2.116.0 functions deploy cloud-translate --project-ref xcpnxkkixsxzgbqsiuud
```

先確認 dry-run 顯示的全部待套用遷移再 push。本次新增 `20261105130048_cloud_translation_usage.sql`，只建立翻譯用量表與限額函式，不修改讀書紀錄。前端須發布完整 `dist`，包括新模組及標示圖片。

## 上線驗證

1. 登入 Tracker → 英文單字複習 → 編輯單字 →「使用 Google 翻譯」。這一步真的呼叫 Google，可能計費。
2. 確認出現繁體中文及 Google 標示；確認之前不應改寫紀錄。
3. 按「填入 Google 翻譯」，確認保留原有中文；重新整理後翻譯與來源仍在。組合、句子也能翻譯。
4. 有翻譯 PDF／Word 要有 Google 來源標示；無翻譯練習檔不含答案。
5. 登出後，Google 按鈕只提示登入，不產生翻譯請求；原本 ECDICT 仍可使用。

「尚未啟用」請確認 secret 名稱與公開專案。服務失敗請查同一 Google 專案的帳單、API、key 限制與配額；前端刻意不顯示原始供應商錯誤或 key。Calendar OAuth Client Secret 不需更換。

## 保存與驗證範圍

額度用 PostgreSQL 交易鎖原子預留；預留後即使 Google 失敗也不退額度，避免逾時或不明結果造成無限制重試。額度表只存帳號、UTC 日期、次數及字元數，不存原文或譯文；後續請求清理超過 35 天的資料。刪除帳號時連帶刪除其用量。RLS 與角色權限限制只有伺服器能預留額度。

翻譯及獨立來源欄位由使用者確認後才進入既有紀錄與同步。頁面、Word、PDF 與列印檔使用 Google 官方未修改的標示圖，並更新中英文隱私政策及支援頁：[Google 標示規則](https://docs.cloud.google.com/translate/attribution)。

本次以替代 Google 回應驗證流程，另在本機 PostgreSQL 相容環境套用真實 SQL 檢查 RLS、權限、交易與限額。沒有使用真實 Google key、修改正式資料庫或部署；完成上述設定後仍須進行一次真實上線驗證。
