# Vocabulary reference data

自用版 v171.6.117，更新日期 2026-11-02。中文翻譯與自動勾選詞性使用 ECDICT；大考中心資料只用來帶入學測 Level。保留手動修改，不將字典翻譯標為大考中心提供。

## 1. 大考中心：學測 Level

- 著作：財團法人大學入學考試中心基金會《高中英文參考詞彙表》（111 學年度起適用），109 年 7 月。
- [官方公布頁](https://www.ceec.edu.tw/xmdoc?xsmsid=0K213553204833715309)。使用使用者提供的 PDF，SHA-256：`27b010f8230b2e8763653ddb35783fe9e0140c143b0040f13839046aebb2a126`。
- 印刷頁 53–103（PDF 第 65–115 頁）共 6,012 筆詞條，每級 1,002 筆；展開原表明列的別名及變化形式後有 6,191 個查詢鍵。同字跨級保留全部級數，預設較低級並顯示提示；表外拼法不猜填 Level。
- `src/data/ceecVocabulary.ts` 仍保留原表的詞性、詞條及印刷頁碼供追查，但不再以官方詞性限制 ECDICT 查詢結果。
- 原檔聲明僅供非營利目的使用，轉載須註明出處，營利用途需事前書面同意；官方資料不適用 ECDICT 的 MIT 授權。PDF 本身沒有中文釋義。

## 2. ECDICT：中文與詞性

- [ECDICT 原始資料庫](https://github.com/skywind3000/ECDICT)，使用 [ecdict.csv](https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv)，非 mini 範例詞庫。
- 本次 CSV SHA-256：`d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc`。
- [原版 MIT LICENSE](https://github.com/skywind3000/ECDICT/blob/master/LICENSE)，`Copyright (c) 2025 Linwei`；完整授權位於 `public/licenses/ECDICT-MIT.txt`，有翻譯 PDF 也附全文。
- 依同拼法中文行中的詞性標記分組，n／v／vt／vi／a／adj／ad／adv／prep／conj／pron／art／aux 對應既有詞性選項，不跨詞性挪用中文。只有無法對應既有詞性的中文時保留未分詞性；已能分詞性的詞條不再重列額外領域附註。
- 排除人名行及不安全文字，依括號外標點分列意思，再使用 OpenCC `s2twp` 轉為繁體。這些是規則轉換的參考資料，不是逐字人工審訂；使用者可自行修改。
- 6,182 個官方表內拼法的 ECDICT 資料置於 `src/data/ceecTranslations.ts`，可直接使用。ECDICT 詞性與官方表可能不同，例如 abandon 的名詞／動詞及 may 的名詞／助動詞，均依字典實際列出的中文分組。
- 擴充索引有 723,781 個含中文的查詢鍵，位於 `public/dictionaries/ecdict-v1/`，分成 256 份。靜態 JSON 共 47,680,711 bytes，單份最多 195,781 bytes。瀏覽器只按需下載對應一份，記憶體最多保留 8 份，不將全詞庫加入 JavaScript 或 LocalStorage。
- 網站只向本站取得詞庫檔，在瀏覽器精確比對拼法，不傳送輸入內容至外部字典，不使用爬蟲或生成式翻譯。首次載入擴充詞庫需要連線，已保存的翻譯可離線查看及手動編輯。

## 3. 重建

需要 Python、pypdf 及 `opencc-python-reimplemented==0.1.7`（Apache-2.0）。工具只在建置時執行，不加入網站執行期依賴。原始 PDF、CSV 與暫存工具不放入部署包。

若更新官方表，先依原 PDF 重新建立官方索引：

```powershell
python scripts/build_vocabulary_reference.py --pdf "完整路徑/高中英文參考詞彙表(111學年度起適用).pdf" --dictionary "完整路徑/ecdict.csv" --output src/data
```

接著必須執行新的 ECDICT 產生器，產生不受官方詞性限制的核心資料及擴充詞庫；只更新 ECDICT 時直接執行這一步：

```powershell
python scripts/build_ecdict_lookup.py --dictionary "完整路徑/ecdict.csv" --project .
```

兩支腳本都可用 `--vendor "套件目錄"` 指定獨立建置套件。詞庫產生器不下載來源、不更動 PDF／CSV；輸出固定 hash 分桶、核心翻譯與 manifest。更新來源時一併核對 LICENSE、SHA-256、資料筆數、欄位、來源頁及測試，不只更新版本號。

## 4. 輸入、修改及保存

- Tracker 輸入完整單字並離開欄位，或於英文單字複習頁修改英文後，自動帶入 ECDICT 中文與詞性，不需先按「取得翻譯」或確認。組合／句子維持手動整理。
- 先保存英文，再完成按需查詢。回應時重新比對資料空間、日期及單字；延遲回應不替換已改掉的英文，切換日期後只更新原紀錄。載入失敗不刪除輸入，仍可手動填寫與稍後重試。
- `vocabularyAutoFill` 追蹤自動填值；`vocabularyManualFields` 的各欄位布林標記保護手動修改、取消及刻意清空，也避免兩台裝置修改不同欄位時只因標記產生衝突。
- 使用既有詞性、`translation`、`translationsByPartOfSpeech`、`gsatLevel`、`showGsatLevel` 與 JSON 儲存格式，沿用匯出／匯入、合併及帳號同步。不新增資料庫欄位或字典 API，不在唯讀載入時批次重寫舊紀錄。
- 編輯模式的字典預覽仍可勾選意思再追加，保留既有中文。來源集中於單字複習頁標題下方；舊紀錄中的歷史來源繼續保留，不將其他字典釋義改標為 ECDICT。

執行完整單元、型別、正式建置與 Chromium／WebKit 測試，涵蓋表外字、詞性差異、手動優先、延遲回應、載入失敗重試、範圍／日期跳轉、JSON round-trip、合併與 PDF 授權。資料版本見 `public/vocabulary-reference-manifest.json` 及詞庫目錄內的 manifest。
