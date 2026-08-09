# 搜尋比較與距離排序實作計劃

## 文件用途

本文件定義鳥種手動搜尋的兩階段交付內容：

1. 相同搜尋條件之間的新增 observation 比較。
2. 依使用者目前位置排列 observation。

兩個階段各自具有完整的行為邊界、測試與驗收條件。第一階段通過 `npm run check` 並完成 diff review 後，第二階段才開始實作。

手動搜尋比較的產品定義亦見 [手動搜尋新增紀錄計劃](./manual-search-new-observations-plan.md)。若兩份文件的描述有歧義，本文件的階段邊界、marker 狀態組合與距離排序規則是實作依據。

## 系統邊界

搜尋增強功能位於前端搜尋流程。共用 domain 與 storage 模組不依賴 React、Node、Electron 或 Cloudflare runtime，讓 Desktop App 與未來的 Search App 使用同一份比較、identity、距離及排序規則。

手動搜尋不讀寫背景追蹤資料：

- `trackers.json`
- `seen-observations.json`
- `events.json`

手動搜尋不建立 notification event，也不將搜尋結果加入背景追蹤的 seen 集合。背景追蹤的 `observationKey` 與手動搜尋的 identity 是不同用途的資料模型，彼此不共用儲存內容。

## 現有程式接點

- `server/services/observation-service.mjs` 正規化 observation，並依 `obsDt` 由新到舊排序。
- `src/features/search/SearchToolbar.tsx` 負責發出 API request 與發布搜尋事件。
- `src/features/search/types.ts` 定義 `SearchRequest`、`SearchResult` 與 API response 型別。
- `src/features/map/MapWorkspace.tsx` 使用同一份 observation 陣列渲染 Leaflet markers、右側清單與摘要。
- `public/styles.css` 定義 marker、清單項目、tag 與摘要樣式。

工作區可能包含 observer popup 與 notification selection 的既有未提交修改。實作必須保留這些內容，並以局部修改整合搜尋比較與排序。

## 共用顯示規則

### Marker 的獨立狀態

每個 marker 同時具有三個互相獨立的狀態維度：

| 維度 | 狀態 | 呈現 |
| --- | --- | --- |
| 地點類型 | 公開地點 | 綠色底色 |
| 地點類型 | 自訂／私人地點 | 橙色底色 |
| 搜尋比較 | 一般紀錄 | 不顯示新增標記 |
| 搜尋比較 | 新增紀錄 | marker 外框或 halo 加強，並附加可讀的「新」標記 |
| 選取狀態 | 未選取 | 一般尺寸 |
| 選取狀態 | 已選取 | 放大並加強外框或陰影 |

選取樣式不得覆蓋地點類型的底色。自訂地點 marker 被選取後維持橙色；公開地點 marker 被選取後維持綠色。active 樣式只負責尺寸、外框與陰影，不設定會蓋過地點類型的底色。

新增狀態與選取狀態可以同時存在。marker 中央保留鳥隻數量或 `?`；「新」標記不能取代數量。右側清單一律保留文字 badge，因此顏色不是辨認新增紀錄的唯一方式。

### 排序層級

搜尋結果的最高排序層級是搜尋比較狀態：

1. 新增紀錄。
2. 一般紀錄。

每一組內部使用目前選定的排序模式：

- `time`：觀察時間由新到舊。
- `distance`：與使用者位置的距離由近到遠；距離相同時以時間由新到舊排列。

首次建立基準或比較功能不可用時，所有 observation 都屬於一般組，整份結果直接使用目前選定的排序模式。

## 第一階段：手動搜尋新增紀錄比較

### 目標

相同 scope 的每次完整成功搜尋，會與該 scope 最近一次成功搜尋的 snapshot 比較。新增 checklist 排在清單前方，具有清單文字 badge 與 marker 新增樣式。首次搜尋建立基準，不將現有紀錄標示為新增。

### 搜尋 scope 與 identity

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
```

scope 正規化遵守以下規則：

- `speciesCode` 去除前後空白並正規化大小寫。
- `days` 是 1 至 30 的整數。
- `region` 固定為 `TW`。
- scope key 由三個正規化欄位確定性產生。

一筆手動搜尋 observation 的 identity 是：

```ts
function observationIdentity(observation: Observation): string {
  return `${observation.speciesCode}|${observation.subId}`;
}
```

同一鳥種、同一份 checklist 在兩次搜尋中是同一筆紀錄。數量、時間、地點、座標或 review 狀態改變不產生新增標記。

### 比較結果

比較結果使用可區分儲存失敗的狀態模型：

```ts
type SearchComparison =
  | {
      status: "baseline-created";
      baselineAt: null;
      newObservationIds: [];
    }
  | {
      status: "compared";
      baselineAt: string;
      newObservationIds: string[];
    }
  | {
      status: "unavailable";
      baselineAt: null;
      newObservationIds: [];
    };
```

`SearchResult` 包含 `comparison`，讓摘要、清單與地圖使用同一份判定。UI 不自行重算新增狀態。

### IndexedDB snapshot store

前端提供以下模組：

```text
src/
  domain/
    observation-identity.ts
    search-comparison.ts
  storage/
    search-snapshot-store.ts
    indexeddb-search-snapshot-store.ts
```

`search-snapshot-store.ts` 定義依 scope 讀取與覆寫 snapshot 的介面。IndexedDB 實作負責 database version、object store 建立、transaction 完成與錯誤轉換。

儲存規則如下：

- 每個 scope 只保留最近一份 snapshot。
- snapshot 只保存去重後的 identity，不保存完整 observation。
- API key、使用者位置與背景追蹤資料不進入 snapshot。
- IndexedDB 不可用時不使用 `localStorage` fallback。
- IndexedDB 讀取或寫入失敗不阻止一般搜尋結果顯示。

### 搜尋生命週期與競態

每次搜尋具有內部單調遞增 sequence。外部提供的 `requestId` 只用於事件關聯，不能作為新舊順序的唯一依據。

成功路徑如下：

1. 建立正規化 scope 與內部 sequence。
2. 呼叫 observations API 並驗證 response shape。
3. 確認 request 仍具有畫面提交資格。
4. 讀取該 scope 的 snapshot。
5. 計算 comparison 與 stable grouping。
6. 再次確認 request freshness。
7. 只讓仍具有提交資格的 request 覆寫該 scope snapshot。
8. snapshot 寫入成功後，發布包含 comparison 的 `SearchResult`。
9. snapshot 讀取或寫入失敗時，發布 `unavailable` comparison 與未套用新增分組的一般搜尋結果。

競態規則如下：

- 較舊 response 不覆寫較新搜尋的畫面、頂部狀態或 busy 狀態。
- 同一 scope 的較舊 response 不覆寫 snapshot。
- API 或資料解析失敗不寫入 snapshot。
- IndexedDB 失敗發布 `unavailable` comparison，顯示一般搜尋結果且不標示新增。
- `busy` 由目前有效 request 控制；較舊 request 的 `finally` 不得提前解除較新搜尋的 busy 狀態。

同一 scope 的 snapshot 操作需要序列化或具有等價的提交保護，確保 transaction 完成順序不會讓舊 snapshot 成為最終值。

`baseline-created` 只在首次 snapshot 寫入成功後發布。若寫入失敗，畫面不得先顯示「已建立比較基準」；該次結果使用 `unavailable`，且所有 observation 以一般紀錄呈現。

### 比較與排序

純函式接受本次 observations 與可選 baseline identity 集合，產生 comparison。沒有 baseline 時回傳 `baseline-created` 且新增集合為空。

stable grouping 只把新增 observation 搬到一般 observation 前方，不重新排列組內資料。因此第一階段的預設順序是：

```text
新增 observation：obsDt 由新到舊
一般 observation：obsDt 由新到舊
```

### UI 狀態

搜尋摘要清楚區分以下狀態：

- `baseline-created`：`已建立比較基準`
- `compared` 且有新增：`新增 N 筆`
- `compared` 且沒有新增：`沒有新增紀錄`
- `unavailable`：`無法使用搜尋比較；已顯示一般搜尋結果`

IndexedDB 錯誤是非阻斷狀態。API 錯誤仍使用搜尋失敗狀態，不發布成功結果。

每筆新增 observation 的清單項目顯示文字 `新增` badge。marker 使用共用顯示規則中的新增樣式。

### Notification selection 相容性

背景通知選取可以暫時將指定 observation 移到清單前方以協助定位，但不得改變 `SearchComparison` 或 IndexedDB snapshot。marker 與清單的新增狀態始終由 identity 是否存在於 `newObservationIds` 決定。

通知導向搜尋亦受 request freshness 保護。通知定位使用的 observation 優先行為不得讓過期搜尋覆寫較新的手動搜尋畫面。

### 第一階段測試

Domain tests：

- identity 只由 `speciesCode` 與 `subId` 決定。
- 沒有 baseline 時建立基準且沒有新增 identity。
- 相同 identity 集合回傳零筆新增。
- 本次多出的 identity 被標示為新增。
- 同一 identity 的其他欄位改變不算新增。
- 本次缺少的舊 identity 不產生使用者狀態。
- 不同鳥種、天數或地區產生不同 scope key。
- stable grouping 維持兩組各自的輸入順序。

Storage tests：

- database upgrade 建立預期 object store。
- snapshot 可依 scope 讀寫。
- 同 scope 寫入取代舊 snapshot。
- 不同 scope 互不覆蓋。
- identity 在保存前去重。
- transaction failure 以 rejected Promise 回報。

Search integration tests：

- 首次搜尋顯示 `已建立比較基準`，不顯示新增 badge。
- 第二次搜尋將新增 observation 排前並顯示 badge。
- API 失敗不覆寫 snapshot。
- 過期 response 不覆寫畫面或 snapshot。
- 較舊 request 不清除較新 request 的 busy 狀態。
- IndexedDB 失敗仍顯示一般搜尋結果。
- 手動搜尋不改變背景追蹤的 seen 與 events。

Marker tests：

- 公開 marker 是綠色。
- 自訂地點 marker 是橙色。
- active 公開 marker 維持綠色。
- active 自訂地點 marker 維持橙色。
- new、active 與 private class 可以同時存在。
- 新增清單項目具有可讀的文字 badge。

### 第一階段完成條件

- 相同 scope 的第二次成功搜尋能正確辨識新增 checklist。
- 新增 observation 排在一般 observation 前方。
- 首次建立、零新增、有新增及儲存不可用具有不同訊息。
- 橙色 marker 在 active 狀態維持橙色。
- API 錯誤與過期 response 不改變搜尋基準。
- IndexedDB 每個 scope 只保留最近一份 snapshot。
- 背景追蹤與通知資料保持獨立。
- `npm run check` 通過。
- 主 agent 完成完整 diff review 後，第二階段才開始。

## 第二階段：依目前位置排序

### 目標

搜尋結果提供 `最新時間` 與 `離我最近` 兩種排序模式。距離排序只改變呈現順序，不改變 API response 集合、搜尋 scope 或 IndexedDB snapshot。

預設排序模式是 `time`。使用者主動選擇 `distance` 時，應用程式才要求瀏覽器定位權限。

### 位置生命週期與隱私

應用程式使用 `navigator.geolocation.getCurrentPosition` 取得一次性位置。位置保存在目前頁面的記憶體中：

- 不送到伺服器或第三方服務。
- 不保存到 IndexedDB、`localStorage` 或背景追蹤檔案。
- 不持續監聽位置。
- 重新載入應用程式後需要重新取得位置。

定位流程處理以下狀態：

- 等待使用者授權。
- 使用者拒絕權限。
- 瀏覽器或裝置無法定位。
- 定位逾時。
- 成功取得座標。

定位失敗是非阻斷錯誤。應用程式維持或返回 `time` 排序，保留目前搜尋結果並顯示清楚訊息。

### 距離 domain

前端提供不依賴瀏覽器 API 的純函式模組：

```text
src/domain/geo-distance.ts
src/domain/observation-sort.ts
```

```ts
interface Coordinates {
  lat: number;
  lng: number;
}

function distanceInKilometers(
  origin: Coordinates,
  destination: Coordinates,
): number;
```

兩點距離使用 Haversine formula 計算。輸入座標必須是有限數字，latitude 位於 `-90...90`，longitude 位於 `-180...180`。無效座標以明確錯誤或不可排序結果處理，不得產生 `NaN` 破壞排序。

### 排序模式

```ts
type ObservationSortMode = "time" | "distance";
```

`time` 模式依 `obsDt` 由新到舊排列。`distance` 模式依公里距離由小到大排列，並依下列 tie-breakers 產生確定性順序：

1. 距離由近到遠。
2. `obsDt` 由新到舊。
3. observation identity 字典順序。

排序函式不修改 API response 的原始陣列。搜尋比較先分成新增與一般兩組，再對各組套用相同排序模式。

切換排序模式不發出 observations API request、不建立 comparison，也不更新 snapshot。使用者座標及排序模式不屬於 `SearchScope`，因為它們不改變結果集合。

若產品未來提供「只顯示距離內的 observation」，半徑或座標範圍會改變結果集合，必須另行納入 scope。第二階段不包含距離篩選。

### React 與 Leaflet 狀態

搜尋工具列或共用搜尋控制元件提供排序選項：

- `最新時間`
- `離我最近`

workspace 由原始搜尋 observations、comparison、sort mode 與可選使用者座標推導顯示陣列。marker 與清單使用同一份推導結果，確保兩者 index 一致。

目前選取項目以 observation identity 保存，或在重新排序後依 identity 重算 index。切換排序模式不得讓 active 狀態跳到另一筆 observation。

通知選取可以暫時聚焦指定 observation；使用者後續切換排序模式時，清單回到正式的新增分組與組內排序，但選取 identity 保持不變。

### 距離顯示

右側清單顯示每筆 observation 與使用者的直線距離。popup 可使用相同 formatter 顯示距離。

格式規則如下：

- 小於 1 公里時以公尺顯示，例如 `850 公尺`。
- 1 公里以上以公里顯示，例如 `3.2 公里`。
- 沒有可用位置時不顯示距離 placeholder。

距離代表兩組座標之間的直線距離，不代表道路距離、步行距離或預估交通時間。

### 第二階段不包含的功能

- 持續位置追蹤。
- 背景定位。
- 將位置保存到瀏覽器或伺服器。
- 依半徑篩選 observation。
- 路線規劃或交通時間。
- 自動調整搜尋天數。
- 專用的「我的位置」地圖 marker。此 marker 可作為後續獨立功能評估。

### 第二階段測試

Domain tests：

- 已知座標組合的 Haversine 距離在合理誤差內。
- 同一座標距離為零。
- 無效座標不產生不穩定排序。
- `time` 模式由新到舊排列。
- `distance` 模式由近到遠排列。
- 距離相同時依時間與 identity 穩定排序。
- 排序不修改輸入陣列。
- 新增分組優先於距離排序。

UI tests：

- 預設為 `最新時間`。
- 選擇 `離我最近` 才要求定位。
- 定位成功後清單與 marker 使用相同排序。
- 切換排序後保留 active observation identity。
- 拒絕、逾時或無法定位時保留搜尋結果並返回時間排序。
- 切換排序不呼叫 observations API，也不寫入 snapshot。
- 公尺與公里格式符合規則。

### 第二階段完成條件

- 使用者可以在時間與距離排序之間切換。
- 距離排序由近到遠，tie-breakers 具有確定性。
- 新增 observation 在兩種排序模式下都優先於一般 observation。
- 使用者位置只存在記憶體，不進入 request 或儲存。
- 定位失敗不破壞搜尋結果或比較基準。
- 重新排序不改變目前選取的 observation。
- `npm run check` 通過。
- 主 agent 完成第二階段完整 diff review。

## 建議交付順序

### 第一階段

1. 建立 identity、scope、comparison 與 stable grouping 純函式及測試。
2. 建立 snapshot store interface 與 IndexedDB 實作及測試。
3. 將 comparison、request freshness 與 snapshot commit 接入搜尋流程。
4. 將 comparison 接入 map、list 與摘要。
5. 實作互不覆蓋的 marker 狀態組合及新增 badge／marker 樣式。
6. 補齊競態、IndexedDB failure 與背景追蹤隔離測試。
7. 執行 `npm run check`，交由主 agent review。

### 第二階段

1. 建立座標驗證、Haversine 距離與 formatter 測試。
2. 建立 observation 排序策略與確定性 tie-breakers。
3. 加入 sort mode 與一次性 geolocation 流程。
4. 讓 map 與 list 使用同一份推導後陣列。
5. 顯示距離並保留 active observation identity。
6. 補齊權限失敗、不寫 snapshot 與不重新搜尋測試。
7. 執行 `npm run check`，交由主 agent review。

## Luna Max 下一個 session 指令

下一個 session 可使用以下指令啟動第一階段：

```text
使用專案 custom agent `luna-max` 實作
`docs/search-comparison-distance-implementation-plan.md` 的第一階段。

完整閱讀該文件與 `docs/manual-search-new-observations-plan.md`，只實作第一階段，
不要開始距離排序。保留工作區既有未提交修改，不要建立其他 subagent。
完成後執行 npm run check，回報修改檔案、測試結果與需要主 agent 審查的風險。
主 agent 必須檢查完整 diff 並驗收後，才能開始第二階段。
```

第一階段驗收後，第二階段使用：

```text
使用專案 custom agent `luna-max` 實作
`docs/search-comparison-distance-implementation-plan.md` 的第二階段。

先確認第一階段與 npm run check 都通過，只實作距離排序、定位與距離顯示。
保留搜尋比較的 scope、snapshot 與新增分組語意，不要加入距離篩選、背景定位或位置持久化。
完成後執行 npm run check，回報修改檔案、測試結果與需要主 agent 審查的風險。
```
