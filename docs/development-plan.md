# eBird Taiwan Tracker 開發計畫

## 產品目標

eBird Taiwan Tracker 是可直接在瀏覽器使用的鳥種觀察與追蹤工具。使用者可以搜尋台灣近期的鳥種紀錄、在地圖與清單間切換位置、建立定期追蹤規則，並從通知快速回到新紀錄。

網站與桌面應用共用相同的前端及 HTTP API。Electron 負責桌面視窗、Menu Bar 常駐入口、作業系統通知與安全憑證儲存，不承擔另一套業務邏輯。

## 系統邊界

- 前端負責搜尋、地圖、追蹤管理、通知中心與設定介面。
- 後端負責 eBird API 代理、鳥種解析、追蹤排程、去重、事件保存與 API key 管理。
- eBird API key 不傳送到瀏覽器查詢邏輯，也不出現在網址、前端 bundle 或瀏覽器儲存空間。
- 網頁版的背景追蹤由持續執行的後端負責；關閉瀏覽器不會中斷排程。
- Electron 版啟動同一套本機服務，並使用同一個網頁入口。

## API key 管理

API key 依下列優先序解析：

1. 執行環境中的 `EBIRD_API_KEY`。
2. 專案 `.env` 中的 `EBIRD_API_KEY`。
3. 使用者從設定介面提交的本機設定。

環境變數名稱使用大寫英文字母與底線，統一為 `EBIRD_API_KEY`。

設定 API 只回傳是否已設定、設定來源及是否可編輯。使用者提交的 key 必須先通過 eBird API 驗證才可保存。本機設定檔不納入版本控制，檔案權限限制為目前使用者。Electron 封裝階段將本機 key 儲存改由 macOS Keychain 等系統憑證庫承擔。

## 階段一：核心網頁功能

目標是形成可持續使用的完整網頁產品。

- 完成鳥種名稱與 eBird species code 解析。
- 完成日期範圍搜尋、台灣全圖、marker 與紀錄清單同步。
- 完成單一鳥種單一追蹤規則、檢查間隔、啟用狀態及夜間排除時段。
- 完成背景檢查、已見紀錄去重、通知事件與最新位置跳轉。
- 完成 API key 設定狀態、驗證、保存與移除流程。
- 補齊 API 輸入驗證、可理解的錯誤訊息及關鍵流程測試。

完成條件：使用者可在全新的本機環境設定 key、搜尋鳥種、建立追蹤、重新啟動服務，並保留追蹤規則與通知狀態。

## 階段二：TypeScript 與 React 前端

前端採用 Vite、TypeScript 與 React。遷移以功能區域為單位，現有 HTTP API 保持穩定，使每一個階段都能獨立驗證。

建議模組如下：

```text
src/
  api/             HTTP client 與回應型別
  components/      共用表單、Drawer、按鈕與狀態元件
  features/search/ 鳥種搜尋與查詢工具列
  features/map/    Leaflet 地圖、marker 與選取狀態
  features/tracking/追蹤編輯器與追蹤清單
  features/events/ 通知中心與事件跳轉
  features/settings/API key 設定
  hooks/           輪詢與畫面生命週期
  types/           Species、Observation、Tracker、Event
```

遷移順序為設定、通知、追蹤管理、搜尋工具列、地圖。Leaflet 地圖由單一 React 元件管理實例生命週期，避免重新 render 時重建地圖或遺失 marker 狀態。

完成條件：`npm run build` 產生可由現有 Node server 提供的靜態檔案；主要互動具有型別檢查及自動化測試；`public/app.js` 不再承擔應用狀態。

## 階段三：後端模組化

Node server 依責任拆分為設定、eBird client、鳥種、觀察紀錄、追蹤排程、事件儲存及 HTTP routes。資料存取介面與業務規則分離，讓排程檢查可以在不啟動 HTTP server 的情況下測試。

完成條件：路由層不直接操作資料檔案；追蹤到期、夜間排除與新紀錄去重具有單元測試；伺服器可優雅停止並等待執行中的檢查完成。

## 階段四：Electron 桌面外殼

Electron 主程序負責：

- 啟動及停止本機 Node 服務。
- 開啟指向本機服務的 `BrowserWindow`。
- 建立 macOS Menu Bar 圖示與未讀狀態。
- 將後端事件轉成原生通知。
- 將使用者 API key 保存於系統憑證庫。
- 確保應用程式只執行一個實例。

renderer 使用標準網站執行環境，不啟用 Node integration。桌面專屬能力經由小型、明確的橋接介面提供，網站在沒有該介面時維持完整的搜尋與管理功能。

完成條件：網站與 Electron 使用同一個 production build；關閉視窗後 Menu Bar 程序可繼續追蹤；點擊原生通知會開啟對應鳥種與位置。

## 階段五：部署與同步

公開網站需要持續運作的後端與每位使用者獨立的設定空間。部署前必須加入帳號或其他隔離機制，避免不同使用者共用 API key、追蹤清單與通知。

後續能力包括 Web Push、多裝置同步、Google Maps 導航、資料庫儲存、匯出與追蹤歷史。這些能力建立在穩定的使用者資料模型之上，不阻塞本機網頁版與 Electron 版交付。

## 驗證策略

- 單元測試涵蓋時間區間、追蹤到期、資料正規化與事件去重。
- API 測試涵蓋設定來源優先序、敏感資料不回傳、追蹤 CRUD 與錯誤狀態。
- 瀏覽器測試涵蓋搜尋、marker/list 同步、追蹤新增與編輯、Drawer 切換及通知跳轉。
- 桌面測試涵蓋單一實例、Menu Bar、原生通知、憑證庫及重啟後資料保存。
