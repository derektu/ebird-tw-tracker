# 手動搜尋 Search Discovery 規格

## 目的

鳥種搜尋會將本次完整成功的結果與相同 Search Scope 的 Search Baseline 比較。只出現在本次結果中的 checklist 會成為 Search Discovery，讓使用者在主動重新查詢時看見自上一次可比較搜尋以來出現的紀錄。

Search Discovery 屬於手動搜尋流程。它不代表使用者一生中第一次看見某份 checklist，也不參與 Tracker 的背景監測、seen 集合或通知事件。

本文件是 Search Discovery 的產品行為來源。實作安排不得重新定義本文件的 scope、identity、競態或失敗語意。

## Search Scope

Search Scope 由下列搜尋條件組成：

- `speciesCode`
- `days`

不同鳥種或不同最近天數各自擁有 Search Baseline。台灣是產品固定範圍，不屬於目前的 scope identity；只有在產品實際支援多地區、座標範圍或其他會改變結果集合的條件時，該條件才加入 Search Scope。

## 觸發來源

下列搜尋可以比較並推進 Search Baseline：

- 應用程式啟動後的正常自動搜尋。
- 使用者明確送出的鳥種搜尋。

背景通知為了定位 observation 而觸發的搜尋只負責顯示與選取，不比較或推進手動搜尋的 Search Baseline。這項隔離避免使用者尚未主動查看結果時，通知導向流程先消耗 Search Discovery。

## Checklist identity

一筆搜尋結果以 `speciesCode` 與 `subId` 的組合識別。同一鳥種、同一份 checklist 在兩次搜尋中視為同一筆紀錄。

數量、觀察時間、地點、座標、observer 或 review 狀態的變化不產生 Search Discovery。本次不存在的舊 identity 不顯示刪除或離開結果集的狀態；它日後重新出現在搜尋結果時，可以再次成為 Search Discovery。

## 比較行為

每個 Search Scope 只保留最近一次成功提交的 Search Snapshot：

- 沒有 Search Baseline 時，成功保存本次 snapshot。所有結果以一般紀錄呈現，並依顯示規則提供比較基準已建立的回饋。
- 存在 Search Baseline 時，本次存在而 baseline 不存在的 identity 是 Search Discovery。
- 合法且完整的空結果是一次成功搜尋，會成為下一次的 Search Baseline。
- 每次成功提交以完整的本次 identity 集合取代該 scope 的舊 snapshot，不累積 lifetime seen 集合，也不保留歷史版本。

API 錯誤、資料 shape 或解析錯誤，以及失去畫面提交資格的 request 都不改變 Search Baseline。

## Request freshness

整個搜尋畫面採 global latest-request-wins。較新的搜尋開始後，較舊 request 的 response 不得：

- 覆寫地圖、清單、摘要或錯誤狀態。
- 提前清除較新 request 的 busy 狀態。
- 寫入任何 Search Scope 的 snapshot。

畫面與 snapshot 使用相同的提交資格，因此使用者沒有看到的過期結果不會在背景推進 baseline。

## 儲存與失敗語意

Desktop App 與本機 Web runtime 將 Search Snapshot 保存於本機 Node application 的專用資料檔。Cloudflare Search App 將 snapshot 保存於目前 browser origin 的 IndexedDB。兩種 runtime 不同步、匯入或匯出 baseline。

snapshot 只包含 Search Scope、搜尋時間與去重後的 observation identity，不包含完整 observation、API key、使用者位置或 Tracker 資料。

儲存失敗不得阻止一般搜尋結果顯示：

- 已讀取 Search Baseline 並完成比較，但新 snapshot 寫入失敗時，畫面保留本次 Search Discovery，並顯示「比較基準未更新；下次可能重複顯示新增紀錄。」。
- 沒有 Search Baseline 且首次 snapshot 寫入失敗時，畫面顯示一般搜尋結果與「無法建立搜尋比較基準；已顯示一般搜尋結果。」。
- baseline 讀取失敗時，畫面顯示一般搜尋結果與「無法使用搜尋比較；已顯示一般搜尋結果。」，不把本次結果寫成推測性的替代 baseline。

應用程式不提供查看、重設、刪除、匯出或同步 baseline 的管理介面。使用者刪除對應 app 或網站資料後，下一次搜尋會重新建立 baseline。

## 顯示規則

結果清單依下列順序排列：

1. Search Discovery。
2. 其餘本次紀錄。

每一組內部維持 observation service 回傳的時間順序。清單項目以文字 `新增` badge 標示 Search Discovery；對應 marker 使用額外的外框或 halo。新增、地點類型、目前選取與鳥隻數量是互相獨立的視覺維度，任一狀態不得覆蓋其他狀態。

搜尋摘要具有五種可區分狀態，Desktop 與 Search App 使用相同的文字與嚴重程度：

1. **首次保存成功**：結果正常顯示，不保留可見的比較訊息。`role="status"` 的 polite 回饋為「已建立搜尋比較基準」。
2. **完成比較且有 Search Discovery**：以強調的行內文字「新增 N 筆」緊鄰結果筆數。Desktop 放在摘要的紀錄筆數旁；Search App 寬版放在搜尋結果摘要內，手機版放在 Bottom Sheet 結果控制列。
3. **完成比較且沒有 Search Discovery**：以低調的行內文字「沒有新增」放在相同結果摘要位置。
4. **完成比較但保存失敗**：保留第 2 或第 3 種狀態的行內文字，並以獨立、可見且具有 `role="alert"` 的警告顯示「比較基準未更新；下次可能重複顯示新增紀錄。」。
5. **比較無法使用**：一般結果照常顯示，並以獨立、可見且具有 `role="alert"` 的警告說明失敗原因。首次保存失敗為「無法建立搜尋比較基準；已顯示一般搜尋結果。」；baseline 讀取失敗為「無法使用搜尋比較；已顯示一般搜尋結果。」。

成功比較的回饋使用 `role="status"` 的 polite 公告；警告以單一 alert 公告，避免同一結果同時發出成功與失敗的重複提示。手機版 Bottom Sheet 收合時，結果控制的 accessible name 包含總筆數與 Search Discovery 狀態，例如「顯示 N 筆結果，新增 N 筆」。

地圖與清單使用同一份 comparison 結果，不各自重新判定 identity。通知導向的選取可以改變畫面聚焦與清單投影，但不得改變 comparison 或 snapshot。

## 與 Tracker 的邊界

手動搜尋比較不讀寫：

- `trackers.json`
- `seen-observations.json`
- `events.json`

手動搜尋不建立 notification event，也不把搜尋結果加入 Tracker 的 seen 集合。Tracker 使用自己的 observation identity 與累積 seen 語意，確保手動搜尋不會抑制後續系統通知。

## 驗收案例

- 同一 Search Scope 的首次成功搜尋建立 baseline，不標示既有結果為新增。
- 第二次成功搜尋只將 baseline 沒有的 checklist 標示為新增。
- 同一 identity 的其他欄位改變不產生新增標記。
- 一筆 checklist 離開結果集後再次出現，可以再次成為 Search Discovery。
- 不同鳥種或不同天數不共用 baseline。
- 合法空結果會取代舊 baseline。
- 較舊 response 不覆寫畫面、busy 狀態或 snapshot。
- 已完成比較但 snapshot 保存失敗時，新增結果仍可見，並顯示可能重複的警告。
- 首次 snapshot 保存失敗時，不顯示「已建立比較基準」。
- 通知導向搜尋不讀寫 Search Baseline。
- Desktop 與 Search App 的 baseline 彼此獨立。
- 手動搜尋不改變 Tracker 的 seen 與 events 資料。
