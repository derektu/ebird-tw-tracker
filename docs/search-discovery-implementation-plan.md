# Search Discovery 實作計劃

## 文件角色

[手動搜尋 Search Discovery 規格](./manual-search-new-observations-plan.md) 定義產品行為並具有優先權。本文件只描述如何把該行為接入目前程式；scope、identity、失敗語意與驗收案例不在此重複定義。

第一個交付目標是 Desktop App 與本機 Web runtime。Cloudflare Search App 使用相同的 domain 函式，並在其建置階段接入 IndexedDB adapter。

距離排序不屬於本次實作，另見 [距離排序提案](./distance-sorting-proposal.md)。

## 現有接點

- `server/services/observation-service.mjs` 正規化 observation，並依 `obsDt` 由新到舊排序。
- `src/features/search/SearchToolbar.tsx` 發出 API request 與搜尋事件。
- `src/features/search/types.ts` 定義 search request、result 與 API response 型別。
- `src/features/map/MapWorkspace.tsx` 使用同一份 observation 陣列渲染 markers、清單與摘要。
- `server/application.mjs` 組裝本機 JSON stores 與 HTTP API。
- `electron/main.mjs` 以隨機 localhost port 啟動本機 application；Desktop baseline 不可依賴以該 port 為 origin 的 IndexedDB 持久存在。

## Domain 模組

共用 domain 位於不依賴 React、Node、Electron、IndexedDB 或 Cloudflare runtime 的模組：

```text
src/domain/
  observation-identity.ts
  search-scope.ts
  search-discovery.ts
```

純函式負責：

- 正規化 `speciesCode` 與 `days`。
- 產生確定性的 Search Scope key。
- 由 `speciesCode` 與 `subId` 產生 checklist identity。
- 以目前 identity 集合與可選 baseline 計算 Search Discovery。
- 將 discovery 穩定移到一般結果之前，並維持兩組各自的輸入順序。

## Comparison 狀態

`SearchResult` 包含單一 comparison 狀態，讓摘要、清單與地圖使用同一份判定：

```ts
type SearchComparison =
  | {
      status: "baseline-created";
      baselineAt: null;
      discoveryIds: [];
    }
  | {
      status: "compared";
      baselineAt: string;
      discoveryIds: string[];
      snapshotCommit: "saved" | "save-failed";
    }
  | {
      status: "unavailable";
      baselineAt: null;
      discoveryIds: [];
      reason: "baseline-read-failed" | "initial-save-failed";
    };
```

`compared` 的 `save-failed` 狀態保留已由舊 baseline 算出的 discovery。`baseline-created` 只在首次 snapshot 保存成功後成立。

## Snapshot store 邊界

前端依賴 runtime-neutral interface：

```ts
interface SearchSnapshotStore {
  read(scope: SearchScope): Promise<SearchSnapshot | null>;
  commit(scope: SearchScope, snapshot: SearchSnapshot, token: SearchCommitToken): Promise<void>;
}
```

### Desktop 與本機 Web

本機 Node application 提供 snapshot HTTP API，資料保存於 application data directory 的 `search-snapshots.json`。該檔案與 trackers、seen observations 及 events 分開，由 server composition root 注入專用 store。

瀏覽器端 Desktop adapter 只透過同源 HTTP API 讀寫 snapshot。這個邊界讓 Electron 的隨機 localhost port 不影響跨啟動持久性，也不把檔案能力加入 Electron renderer 或 preload。

### Cloudflare Search App

Search App adapter 使用目前 origin 的 IndexedDB，每個 Search Scope 只保存一份 snapshot。IndexedDB 不可用時不退回 `localStorage` 保存 identity 集合。

兩個 adapter 不同步資料，也不提供匯入、匯出或管理 UI。

## Search controller

搜尋 controller 擁有全域單調遞增 generation，並明確區分 baseline-eligible search 與 notification-focus search。

baseline-eligible 成功路徑：

1. 建立 generation 與正規化 Search Scope。
2. 呼叫 observations API 並驗證 response shape。
3. 確認 generation 仍具有全畫面提交資格。
4. 讀取 Search Baseline。
5. 計算 comparison 與 stable grouping。
6. 再次確認提交資格，並以同一 commit token 嘗試保存 snapshot。
7. 依保存結果發布 `baseline-created`、`compared` 或 `unavailable`。
8. 只有目前 generation 可以更新畫面、busy 與錯誤狀態。

snapshot store 與 controller 必須提供等價於 conditional commit 的保護。較新的搜尋開始後，舊 generation 的未完成 transaction 會被取消、拒絕或判定為不可提交，不能留下使用者沒有看見的 baseline。

notification-focus search 使用相同的 global freshness 規則，但跳過 baseline read、comparison 與 snapshot commit。通知選取對 raw observations 所做的清單投影發生在 comparison 之外，不改寫 identity 集合。

## UI 接入

`SearchResult` 攜帶排序後 observations 與 comparison。`MapWorkspace` 只消費結果，不重算 discovery。

marker 樣式由互相獨立的 class 或資料屬性組成：

- 公開／自訂地點控制底色。
- Search Discovery 控制額外 halo 與可讀標記。
- active 控制尺寸、外框或陰影。
- marker 內容保留鳥隻數量或未知值。

active 樣式不得覆蓋自訂地點的橙色底色；discovery、active 與 private 可以同時存在。清單一律保留文字 `新增` badge。

## 測試範圍

Domain tests：

- scope key 只由正規化的 `speciesCode` 與 `days` 決定。
- identity 只由 `speciesCode` 與 `subId` 決定。
- 沒有 baseline、零 discovery、有 discovery、欄位改變與 identity 再出現案例符合產品規格。
- stable grouping 不改變兩組內部順序。

Store tests：

- 本機 JSON store 可依 scope 讀寫並覆寫最近 snapshot。
- 不同 scope 互不覆蓋，identity 在保存前去重。
- Electron 重啟後可透過不同 localhost port 讀到同一份 app data snapshot。
- IndexedDB adapter 在 Search App 階段測試 upgrade、scope 隔離與 transaction failure。

Controller integration tests：

- startup 與 explicit search 可以建立和推進 baseline。
- notification-focus search 不讀寫 baseline。
- API、解析與 baseline read failure 不提交 snapshot。
- 已完成比較但 commit failure 仍發布 discovery 與警告。
- initial commit failure 發布 unavailable，不宣稱 baseline 已建立。
- successful empty response 提交空 snapshot。
- stale response 不覆寫畫面、busy 或任一 scope snapshot。
- 手動搜尋不改變 Tracker 的 seen 與 events。

UI tests：

- 五種摘要狀態可區分。
- discovery badge 與 marker halo 使用同一 comparison。
- discovery、active、private 與 count 狀態可以同時呈現。
- notification selection 不改變 comparison。

## Desktop 交付順序

1. 建立 scope、identity、comparison 與 stable grouping 純函式及測試。
2. 建立本機 JSON snapshot store、HTTP API 與 browser adapter。
3. 將 global freshness、搜尋來源與 snapshot commit 接入 search controller。
4. 將 comparison 接入 result types、摘要、清單與 markers。
5. 確保 active marker 不覆蓋地點底色。
6. 補齊失敗、競態、重啟持久性與 Tracker 隔離測試。
7. 執行 `npm run check` 與 production build，檢查完整 diff。

## 完成條件

- [手動搜尋 Search Discovery 規格](./manual-search-new-observations-plan.md) 的所有驗收案例通過。
- Desktop snapshot 在 Electron 重啟及 localhost port 改變後保持可用。
- Search Discovery 與 Tracker 資料完全分離。
- `npm run check` 與 production build 通過。
