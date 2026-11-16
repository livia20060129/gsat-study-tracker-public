# 公開版 Google 帳號登入

適用 public.59。公開版專案為 `xcpnxkkixsxzgbqsiuud`，網站為 https://gsat-study-tracker.liviayeh.dev 。

本版依照「已完成 Google 綁定」的狀態，僅提供 Google 登入。沒有 Email／密碼、註冊、密碼復原或綁定入口；既有 Google 身分沿用原 Supabase UUID，不刪除帳號、不搬移資料，也不重設每月 5,000 字元翻譯額度。

## 已有設定的核對項目

1. Supabase Authentication 的 Google provider 已啟用，使用公開版的登入用 Client ID／Secret。
2. Google Cloud 此登入用 OAuth Client 的 redirect URI 為 `https://xcpnxkkixsxzgbqsiuud.supabase.co/auth/v1/callback`。
3. Supabase 的 Site URL 為 `https://gsat-study-tracker.liviayeh.dev/`；Redirect URLs 至少保留網站根目錄、`/index.html` 與 `/index.html?google_auth=1` 的完整網址。
4. 使用原本已綁定的 Google 帳號登入，確認登入前後為原 UUID，並可取得原讀書紀錄、Calendar 連線與翻譯額度。
5. 若 Email provider 仍開啟，前端移除密碼欄位不會自行關閉它；如需連直接 Auth API 呼叫也僅限 Google，請在 Supabase 的 Providers 關閉 Email provider。此操作不包含刪除既有使用者或身分，也不應刪除任何讀書資料。

本次只交付檔案，不更動正式 provider、OAuth 或網域設定。既有 Google 身分可直接登入，網站不再發起 Manual Linking。

## 與 Calendar 授權分開

Google 基本登入使用 `openid email profile`，由 Supabase Auth 處理；登入不會自動取得 Calendar 權限。

Calendar 按鈕仍使用已驗證的 `calendar.events.readonly`、既有 `VITE_GOOGLE_CLIENT_ID` 與 Edge Function Secrets。Calendar 的 callback 保持 `https://xcpnxkkixsxzgbqsiuud.supabase.co/functions/v1/google-calendar-callback`，不要換成 Auth callback，也不要以登入用 Client Secret 覆蓋 Calendar Secret。

## 套用與驗收

以 public.61 為基準，整批覆蓋 public.62 的必要檔案並使用既有 GitHub Actions 部署。這次沒有新套件、migration 或 Edge Function。

驗收 Google 登入、取消後重試、重新整理、手機及各頁往返；再登出並以同一 Google 帳號登入，確認原紀錄仍在。切換另一個 Google 帳號時，應使用各自獨立的資料空間，不自行合併兩個帳號。

若需要更換 Google 帳號，先登出再選另一個帳號；帳號無法登入時依 Google 的帳號復原流程處理，網站沒有自有密碼重設入口。

## public.62 登入前出現錯誤時

- 「登入前請先修正」：依提示修正欄位。起床／就寢時間的小時與分鐘需一起填寫，或兩欄一起留空；完成後重新按 Google 登入。
- 「登入前無法保存當日讀書紀錄」：先按儲存查看原因。若為本機空間不足或資料無法讀取，保留目前頁面及草稿，先備份／修復原紀錄。
- 「無法保存登入驗證資料」：這才是驗證用儲存讀寫失敗；確認瀏覽器允許該網站使用儲存空間，再重新嘗試。網站不會略過 PKCE 保存，也不會假裝登入成功。

不必先清除所有網站資料或刪除帳號；既有帳號、紀錄、登入狀態及登出標記仍保留。本版只交付程式檔案，不更動正式瀏覽器權限、Google 或 Supabase 後台設定。
