# Vocabulary reference data

自用版 v171.6.80，整理日期 2026-10-24。官方詞性／級數與中文翻譯是兩份不同來源，不能把字典中文標為大考中心提供。本次沒有擷取 Oxford、WikDict 或其他網站釋義。

## 1. 大考中心：詞性與 Level

- 著作：財團法人大學入學考試中心基金會《高中英文參考詞彙表》（111 學年度起適用），109 年 7 月。
- [官方公布頁](https://www.ceec.edu.tw/xmdoc?xsmsid=0K213553204833715309)。實際使用的是使用者提供的同名 PDF，未用線上不同版本取代。
- 原始 PDF SHA-256：`27b010f8230b2e8763653ddb35783fe9e0140c143b0040f13839046aebb2a126`。
- 來源為印刷頁 53-103（PDF 第 65-115 頁）的字母排序表，共 6,012 筆，每級 1,002 筆；附錄未分級項目不推斷 Level。
- 展開原表明列的斜線別名、衍生名詞、複數與代名詞形式，合併同拼法後共 6,191 個查詢鍵；不自行做 stemming 或添加未列變化形。同字跨級保留全部級數並預設較低級，UI 顯示提示。
- 產物：`src/data/ceecVocabulary.ts`；保留原詞條及印刷頁碼，便於追查。

原檔聲明著作權屬財團法人大學入學考試中心基金會，僅供非營利目的使用，轉載須註明出處；營利用途需事前書面同意。本資料只依此條件用於本自用版，並非 MIT 或公共領域資料。要改作商業產品，須另行取得適當授權。原始 PDF 不含中文釋義。

## 2. ECDICT：中文參考翻譯

- [原作者資料庫](https://github.com/skywind3000/ECDICT)。使用 `ecdict.csv`，不是僅供示例的 `ecdict.mini.csv`。
- [CSV 來源](https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv)。此次下載 SHA-256：`1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf`。
- [原版 LICENSE](https://github.com/skywind3000/ECDICT/blob/master/LICENSE)：MIT，`Copyright (c) 2025 Linwei`。完整原文隨部署附於 `public/licenses/ECDICT-MIT.txt`，PDF 有翻譯版也附全文。MIT 允許使用、修改與散布，須保留著作權及授權聲明；本專案不宣稱來源保證釋義正確。
- 僅選官方查詢鍵及官方列出的對應詞性，排除人名補充行，依括號外的逗號／頓號／分號拆分多意思，再以 OpenCC `s2twp` 轉為繁體。
- 產物：`src/data/ceecTranslations.ts`。6,155 種拼法至少有一項中文；其餘 36 種沒有可對應的中文，已有中文者也可能缺少部分詞性。缺少資料留空，不跨詞性挪用、不自由生成釋義。例：alternate 有官方名詞詞性，但本次字典沒有對應名詞中文，保留空欄。
- 這是經規則篩選的字典參考，並非逐字人工審訂，使用者可自行修改。來源標註不表示原作者認可使用者修改後的內容。

## 3. 重建與驗證

建置腳本：`scripts/build_vocabulary_reference.py`。僅供開發者更新資料，不在使用者瀏覽器執行；開啟網站不會下載原始 PDF／CSV、呼叫外部字典或傳送輸入文字。原始來源不打包進覆蓋資料夾。

建置工具為 Python、pypdf、[opencc-python-reimplemented 0.1.7](https://github.com/yichen0831/opencc-python)（Apache-2.0；`s2twp` 字形／用詞轉換），非新增網站執行期套件。先在自己的 Python 建置環境安裝 pypdf 及該版 OpenCC，再於專案根目錄執行：

```powershell
python scripts/build_vocabulary_reference.py --pdf "完整路徑/高中英文參考詞彙表(111學年度起適用).pdf" --dictionary "完整路徑/ecdict.csv" --output src/data
```

若 OpenCC 安裝在獨立建置目錄，可加 `--vendor "套件目錄"`。腳本只讀原始來源，輸出 UTF-8 TypeScript；有無法解析的官方文字或各級筆數不符會停止。更新來源時須核對新版本的完整授權、SHA-256、別名規則與翻譯對照，並同步更新 manifest、授權檔及測試期望值。不要把本機原始字典、暫存套件或使用者 PDF 放入發布包。

執行 `npm test`、`npm run build`、`npx playwright test --workers=2`，檢查多詞性、跨級、手動優先、未知詞、儲存／匯入／合併、來源頁、PDF 和手機排版。公開版本識別資訊見 `public/vocabulary-reference-manifest.json`；生成資料與來源授權保持分離，不將官方資料一併標成 MIT。

## 4. 保存與相容

使用既有 word JSON 的詞性、`translation`、`translationsByPartOfSpeech`、`gsatLevel`、`showGsatLevel`，新增 `vocabularyAutoFill` 快照追蹤哪些值仍屬自動來源，並保留字典出處。手動修改與刻意清空不回填；英文改字時只更新尚未手動變更的自動欄位。未知欄位沿用既有 codec、匯出／匯入、合併及 Cloud JSON 往返，不新增資料庫欄位或後端 API。不在唯讀彙整時改寫舊資料。

## 5. v171.6.95 本機 ECDICT 預覽與確認填入

自動帶入與預覽皆重用上述 ECDICT 子集，沒有加入完整 ECDICT 或其他字典資料集。不需網路、登入或 API 金鑰；未收錄的詞保留手動輸入。劍橋選項、連結與網路呼叫已移除，舊端點改為固定 410 停用回應，部署方式見 `supabase/functions/dictionary-lookup/README.md`。

候選釋義只暫存在頁面，勾選後仍不寫入；確認才逐詞性追加所選意思、啟用所選詞性並去重。既有意思與手動學測級數不變。`dictionarySources` 記錄來源、查詢詞及來源網址，沿用既有 JSON 往返；不保存字典 HTML、API 金鑰、登入 token 或完整查詢快取。查詢不傳送任何內容至外部字典。

來源連結集中於「英文單字複習」頁面標題下方，卡片不再重複列出。若既有資料包含 Cambridge Dictionary 來源，保留原中文、原來源與歷史提示，不改標為 ECDICT；其內容不適用 ECDICT 的 MIT 授權。有翻譯 PDF 保留實際來源與 ECDICT MIT 全文；未翻譯 PDF 不嵌入中文答案。這次沒有改動官方詞彙表、ECDICT 產物或 manifest。
