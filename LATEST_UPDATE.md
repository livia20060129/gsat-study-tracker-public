# 最新更新

版本：公開版 v171.6.0-public.7

## GitHub Pages 重新部署修復

- Pages artifact 改用 GitHub 官方固定名稱 `github-pages`，不再把名稱綁定 `github.run_attempt`。
- 修正按「Re-run failed jobs」後，部署步驟找不到先前成功 build 所上傳 artifact 的問題。
- Node 20 與 `punycode` 訊息皆為 Action 相依套件警告，不是本次部署失敗原因。

## Supabase Project Ref 單一來源

- 移除 GitHub Environment／Repository 中重複的 `SUPABASE_PROJECT_ID` override，避免舊 Variable 或 Secret 持續覆蓋正確設定。
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

`fix(ci): keep the Pages artifact name stable across reruns`
