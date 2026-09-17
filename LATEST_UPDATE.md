# 最新更新

版本：公開版 v171.6.0-public.10

## 主頁分頁名稱修正

- 主頁瀏覽器分頁名稱移除「v171」，統一顯示「每日讀書完成度紀錄卡」。
- 教材進度頁維持相同分頁名稱。
- 新增 Playwright 驗收，防止主頁分頁名稱再次混入版本代號。

## 我的教材收合與自然分組

- 「我的教材」面板預設收合；點擊標題可展開或再次收合，並加入與連線設定一致的高度、透明度與位移過渡。
- 自然教材依「物理、化學、地科、生物」顯示小標與各自教材。
- 自然教材選項只顯示書名，不再重複「自然｜科目」。
- 既有教材 ID 與儲存鍵未變更，原本勾選的教材會繼續保留。
- 教材進度頁的瀏覽器分頁名稱改為「每日讀書完成度紀錄卡」。
- 新增 Playwright 驗收，檢查收合完成時機、四科順序及物理教材內容。

## 公開版 Google OAuth 設定對齊

- Calendar OAuth 改用權限較小的 `calendar.events.readonly`，與 Google Cloud 公開版專案設定一致。
- 隱私權政策同步說明實際申請的權限與讀取內容。
- Supabase 新連線的 scope 預設值改為 `calendar.events.readonly`。
- README 全面改用公開網域 `gsat-study-tracker.liviayeh.dev`，並補上 Cloudflare 建置變數設定。
- 新增公開版 OAuth scope 與正式網域防回歸測試。

## 線上 OAuth 設定套用

- Google Cloud 公開版專案已建立獨立 Web OAuth Client。
- Google OAuth 應用程式名稱已統一為「每日讀書完成度紀錄卡」，服務條款已改用公開版 `/terms`。
- Supabase Edge Function 已更新 `GOOGLE_CLIENT_ID` 與 `GOOGLE_CLIENT_SECRET`。
- GitHub Actions 與 Cloudflare Builds 已改用同一組公開版 `VITE_GOOGLE_CLIENT_ID`。
- Cloudflare 已重新建置並成功部署；公開網址已可正常顯示「連接 Google Calendar」。

## GitHub Pages 重新部署修復

- Pages artifact 改用 GitHub 官方固定名稱 `github-pages`，不再把名稱綁定 `github.run_attempt`。
- 修正按「Re-run failed jobs」後，部署步驟找不到先前成功 build 所上傳 artifact 的問題。
- Node 20 與 `punycode` 訊息皆為 Action 相依套件警告，不是本次部署失敗原因。

## Supabase Project Ref 單一來源

- GitHub Environment／Repository 兩處 `SUPABASE_PROJECT_ID` 已統一為公開版 Project Ref，避免舊的自用版設定被誤用。
- 發布流程只從通過一致性測試的 `supabase/config.toml` 取得 Public Project Ref。

## Public Supabase 指向修復

- 修復更新資料夾漏帶 `supabase/config.toml`，導致 GitHub `SUPABASE_PROJECT_ID` 與 repository 設定不一致。
- 新增 Public 專案綁定測試，統一核對 Supabase CLI、前端、每小時 Calendar workflow 與 OAuth callback 文件。

## CI 混合版本修復

- 修復 GitHub 上 `package.json` 仍為 `public.2`、但 runtime 誤混入個人版固定排程邏輯的版本不一致問題。
- 修復包同時收錄正確的 Public runtime、兩項最新功能及 Public 專屬防回歸測試，避免只覆蓋單一檔案後再次帶回內建排程。

## 同步個人版最新功能

- 學習總結的「身體不適／較疲累／外出」狀態色，會依當日學習時間調整透明度，並與完成率外圈分離。
- Cloud／Calendar 設定面板新增平順的展開高度過渡；收合、手機底部面板與減少動態效果設定維持原有行為。

## 公開版 Supabase 分離

- 公開版已改用獨立 Supabase 專案 `xcpnxkkixsxzgbqsiuud`。
- 前端 API、Supabase CLI、每小時 Calendar 同步與 OAuth callback 文件已統一指向公開版專案。
- 部署 workflow 會比對 GitHub `SUPABASE_PROJECT_ID` 與 `supabase/config.toml`，避免誤部署到自用版後端。

## 公開版分流

- 建立獨立的 `gsat-study-tracker-public` 專案，自用版未修改。
- Cloudflare Worker 名稱改為 `gsat-study-tracker-public`，避免部署時覆蓋自用版。
- 清除星期別、固定日期及硬編碼 Calendar fallback；只有已連線並完成同步的 Google Calendar 可辨識項目會自動加入。
- 手動新增項目仍然保留。

## 我的教材

- 教材進度頁新增「我的教材」。
- 使用國文／英文／數學／自然滑塊查看既有教材，並以勾選決定要追蹤的教材。
- 教材選擇依訪客或登入帳號分開保存。
- 教材進度圖只顯示已勾選的教材；未選擇時顯示空白提示。

## 驗證

- TypeScript 型別檢查通過。
- 365 項單元／回歸測試通過。
- 10 項 Playwright 真實瀏覽器測試通過，包含公開版空白起始狀態與教材勾選保存。

## Commit 建議

`feat(materials): add collapsible selection and natural subject groups`
