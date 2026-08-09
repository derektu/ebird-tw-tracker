# 手動搜尋新增紀錄計劃

## 目標

鳥種搜尋會將本次成功取得的觀察紀錄與相同搜尋條件的上一次成功結果比較。首次出現在本次結果中的紀錄會獲得明確的「新增」標記，並排列在結果清單前方，讓使用者在主動重新查詢時立即看見新發現。

這項能力屬於搜尋流程，不依賴背景排程、追蹤規則或通知事件。Desktop App 與 Search App 共用相同的比較邏輯，各自在目前瀏覽器環境的 IndexedDB 保存搜尋基準。

## 產品行為

### 搜尋基準

每組搜尋條件擁有一份最近成功結果，稱為搜尋基準。搜尋條件由以下欄位識別：

- `speciesCode`
- `days`
- `region`，目前固定為 `TW`

不同鳥種或不同最近天數各自維護搜尋基準。未來若搜尋加入地區、座標範圍或其他會改變結果集合的條件，該條件也必須納入搜尋基準的識別資料。

首次成功搜尋只建立搜尋基準，所有紀錄都以一般紀錄呈現。後續相同條件的成功搜尋才會標示新增紀錄。

### 新增紀錄

一筆紀錄以 `speciesCode` 與 `subId` 的組合識別。同一鳥種、同一份 checklist 在兩次搜尋中視為同一筆紀錄。

本次結果存在、搜尋基準不存在的 identity 屬於新增紀錄。欄位內容的改變不產生新增標記；搜尋流程不呈現更新或刪除狀態，也不向使用者解釋未出現在本次結果中的舊紀錄。

### 排序與標記

右側結果清單依下列順序排列：

1. 新增紀錄。
2. 其餘本次紀錄。

每一組內部維持 observation service 回傳的時間排序。新增紀錄在清單項目上顯示文字 badge，地圖上的對應 marker 使用一致且可辨識的新增樣式。顏色不是唯一提示，badge 或其他文字標示必須保留。

搜尋摘要顯示本次新增數量。沒有新增紀錄時，摘要顯示「沒有新增紀錄」；首次建立基準時，摘要顯示「已建立比較基準」，不使用零筆新增的語句暗示已完成比較。

### 基準更新

搜尋基準只在完整搜尋成功後更新。API 錯誤、資料解析錯誤或已被較新 request 取代的結果不得覆寫基準。

本次結果完成比較並交付畫面後，整份本次結果成為下一次搜尋的基準。每個搜尋條件只保存一份基準，不保存歷史版本。

瀏覽器儲存由應用程式自行維護，不提供查看、匯出、重設或刪除基準的介面。使用者清除網站資料時，IndexedDB 會一併清除，下一次搜尋會重新建立基準。

## 資料模型

共用型別位於前端可引用、且不依賴 React、Node 或 Cloudflare runtime 的模組。

```ts
interface SearchScope {
  speciesCode: string;
  days: number;
  region: "TW";
}

interface SearchSnapshot {
  scope: SearchScope;
  searchedAt: string;
  observationIds: string[];
}

interface SearchComparison {
  baselineAt: string | null;
  baselineCreated: boolean;
  newObservationIds: string[];
}
```

搜尋基準只需要保存 observation identity，不保存完整 observation。搜尋畫面使用本次 API response 取得所有顯示欄位，因此 identity 集合足以判定新增紀錄，並能控制 IndexedDB 的容量。

identity 由純函式產生：

```ts
function observationIdentity(observation: Observation): string {
  return `${observation.speciesCode}|${observation.subId}`;
}
```

`SearchResult` 包含比較結果，讓地圖、清單與狀態顯示使用同一份判定：

```ts
interface SearchResult {
  requestId: string;
  species: Species;
  days: number;
  payload: ObservationsResponse;
  comparison: SearchComparison;
}
```

## 模組安排

```text
src/
  domain/
    observation-identity.ts
    search-comparison.ts
  storage/
    search-snapshot-store.ts
    indexeddb-search-snapshot-store.ts
  features/
    search/
      SearchToolbar.tsx
      types.ts
    map/
      MapWorkspace.tsx
```

`search-comparison.ts` 接受本次 observations 與可選的上次 identity 集合，回傳 `SearchComparison`。模組是純函式，單元測試不需要瀏覽器或 HTTP server。

`search-snapshot-store.ts` 定義儲存介面，IndexedDB 實作負責 database version、object store 與 transaction。儲存 key 由正規化後的 `SearchScope` 產生，避免不同條件互相覆蓋。

## 搜尋流程

`SearchToolbar` 的成功路徑依序執行：

1. 取得並正規化最新 observations。
2. 依 `SearchScope` 載入 IndexedDB 搜尋基準。
3. 計算 `SearchComparison`。
4. 將 observations 依新增狀態分組並保持組內時間順序。
5. 發布包含 comparison 的搜尋結果。
6. 確認 request 仍是該 scope 最新的成功 request。
7. 將本次 identity 集合寫入 IndexedDB。

同一 scope 的並行搜尋以 request sequence 控制提交順序。較舊 response 可以被忽略，但不得覆寫畫面或 IndexedDB 中較新的結果。

IndexedDB 無法使用時，搜尋本身仍可運作。應用程式顯示一般搜尋結果與非阻斷錯誤狀態，不標示新增紀錄，也不退回使用 `localStorage` 保存大量搜尋基準。

## 與背景追蹤的邊界

手動搜尋比較不讀寫下列資料：

- `trackers.json`
- `seen-observations.json`
- `events.json`

手動搜尋不建立 notification event，也不把使用者看過的搜尋結果標記為背景追蹤已見紀錄。背景追蹤仍使用自己的累積 seen 集合，確保手動搜尋不會抑制後續系統通知。

## 測試

### Domain tests

- 沒有搜尋基準時建立 baseline，且沒有新增 identity。
- 相同 identity 集合回傳零筆新增。
- 本次多出的 identity 被標示為新增。
- 同一 identity 的其他欄位改變不被標示為新增。
- 不再出現的 identity 不產生任何使用者狀態。
- 不同 `days` 或 `speciesCode` 產生不同 scope key。

### Storage tests

- IndexedDB 可依 scope 讀寫最近一份 snapshot。
- 同一 scope 的寫入會取代該 scope 的舊 snapshot。
- 不同 scope 的 snapshot 互不覆蓋。
- database upgrade 能建立預期 object store。

### Search integration tests

- 首次搜尋顯示「已建立比較基準」。
- 第二次搜尋將新增紀錄排在清單前方並顯示 badge。
- API 失敗不覆寫 snapshot。
- 過期 response 不覆寫較新的 snapshot。
- IndexedDB 失敗不阻止一般搜尋結果顯示。
- 背景追蹤的 seen 與 events 檔案不因手動搜尋改變。

## 交付順序

1. 建立 identity、scope 與 comparison 純函式及單元測試。
2. 建立 snapshot store 介面與 IndexedDB 實作。
3. 將 comparison 接入搜尋成功流程與 `SearchResult`。
4. 調整清單排序、badge、marker 與摘要狀態。
5. 補齊並行 request、儲存失敗及背景追蹤隔離測試。
6. 執行 typecheck、完整測試與 production build。

## 完成條件

- 相同搜尋條件的第二次成功搜尋能正確辨識新 checklist。
- 新增紀錄在右側清單最前方，並具有文字與視覺標記。
- 第一次搜尋、沒有新增、儲存失敗三種狀態可清楚區分。
- API 失敗與過期 response 不改變搜尋基準。
- 搜尋基準存在 IndexedDB，且每個 scope 只保留最近一份。
- Desktop 的背景追蹤與通知行為維持獨立。
- `npm run check` 通過。
