# 最新更新

版本：公開版 v171.6.0-public.2

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

`fix(public): point deployment and calendar sync to public Supabase project`
