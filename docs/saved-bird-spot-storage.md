# 鳥點收藏保存契約

本文件對應 GitHub issue #31。收藏與近期觀察查詢分開；本票交付資料規則、Node API 及兩種 persistence adapter，畫面由後續票接入。

## 收藏資料與操作

`SavedBirdSpot` 保留 `BirdSpot` 的 `locId`、原始 `locName`、可缺失的座標及 `locationType`，另有 `alias`、`note`、`pinned`、`savedAt` 和 `updatedAt`。座標必須整對存在或整對為 `null`。地點類型是 `hotspot`、`personal` 或 `unknown`。

收藏以 `locId` 唯一識別，同名同座標的不同 ID 不合併。`save` 更新上游地名與已知位置資訊，保留既有別名、筆記、釘選及首次收藏時間；缺失的上游資訊不抹除已知資料。輸入中其他欄位不會被寫入收藏。

兩種 adapter 使用同一組方法：

| 方法 | 結果 |
| --- | --- |
| `list({sort})` | 收藏陣列；`sort` 為 `pinned`、`recent` 或 `name`，預設釘選優先 |
| `save(spot)` | 新增或更新該 ID 的地點資料，回傳已提交收藏 |
| `update(locId, changes)` | 只更新別名、筆記與釘選；找不到 ID 回報錯誤 |
| `remove(locId)` | 刪除後回傳原收藏快照，原本不存在則回傳 `null` |
| `restore(snapshot)` | 復原原收藏及首次收藏時間；如果同 ID 已被重新收藏或修改，保留現有資料，不覆寫較新的筆記 |

資料變更在完整寫入後才 resolve。呼叫失敗時 UI 必須保留草稿或原收藏狀態，不能顯示儲存成功。復原快照由呼叫端保留，短暫復原按鈕的顯示時限由 UI 票決定。

## Desktop 與本機 Web

`createFileSavedBirdSpotStore` 保存 `{version: 1, spots: [...]}` 到 application data directory 的 `saved-bird-spots.json`。Electron 現有 composition root 將 data directory 指向 user-data，因此 HTTP port 改變不改變檔案位置。

同一 process、同一檔案路徑的 adapter 共用修改佇列。每次從磁碟讀取已提交資料，套用共用規則，再寫入隨機 temporary file。檔案以 `0600` 建立，寫入及同步完成後才 rename 取代正式檔案；失敗刪除本次 temporary file，不用失敗內容覆蓋既有檔案。

此佇列保證同一 Node runtime 的修改不互相遺失；它不是跨 process 的分散式鎖。Electron 本身維持既有單一 instance 規則。

Node API 不需要 eBird key 即可讀取自己的本機收藏：

| 請求 | Request body | 成功結果 |
| --- | --- | --- |
| `GET /api/bird-spots/saved?sort=pinned` | 無 | `{spots}` |
| `POST /api/bird-spots/saved` | `{spot}` | `{spot}` |
| `PATCH /api/bird-spots/saved/L123` | `{alias?, note?, pinned?}` | `{spot}` |
| `DELETE /api/bird-spots/saved/L123` | 無 | `{removed}` |
| `POST /api/bird-spots/saved/restore` | `{spot: removedSnapshot}` | `{spot}` |

`createDesktopSavedBirdSpotStore({request})` 將上述 HTTP API 接成相同的 store interface，供 Desktop UI 使用。

## Search App

`createIndexedDbSavedBirdSpotStore` 使用目前 origin 的 IndexedDB database `ebird-saved-bird-spots`，version 1、object store `saved-bird-spots`。它與 API key、最近鳥種、Search Snapshot 使用不同保存空間。

每次修改在單一 readwrite transaction 內讀取、套用規則及寫入整份收藏，transaction complete 後才 resolve。因此同 origin 的兩個 tab 也不會由舊陣列覆蓋彼此的變更。transaction abort 不會提交部分內容。每次操作完成後關閉 connection，不保留全域可變的記憶體收藏副本。

Worker 不新增收藏路由或保存使用者資料。關閉網路仍可讀取已保存收藏；最新觀察紀錄仍需連網。忘記 API key 只修改既有 key storage，不修改這個 database。更換 origin、裝置或清除網站資料不會自動同步或復原收藏。

## 錯誤與損壞資料

- `invalid_saved_bird_spot`（400）：無效欄位、位置、timestamp、排序或修改內容。
- `saved_bird_spot_not_found`（404）：更新的收藏已不存在。
- `storage_unavailable`（503）：無法讀寫檔案、IndexedDB 不可用或 transaction 失敗。
- `storage_corrupt`（503）：既有文件版本、結構、欄位或重複 ID 不合法。

錯誤只包含固定訊息，不回傳私人檔案路徑或底層 exception。檔案缺少或尚未建立 collection 時才視為空收藏；損壞資料不以空陣列取代，也不允許後續 save 靜默覆蓋。收藏不包含 API key、Tracker、通知或 Search Snapshot。

## 驗證證據與界線

2026-11-11 的確定性測試涵蓋兩個 adapter 相同的新增、metadata 更新、註記保留、去重、排序、刪除、復原與並行修改行為；另驗證檔案 permissions、替換失敗保留原檔、損壞資料拒絕，以及 IndexedDB abort rollback。

Node HTTP 測試在同一 data directory 關閉 `createApplication` 後，以新 instance 和新 ephemeral port 啟動，確認收藏及筆記保留。測試也經過真正的 API-key DELETE route。這驗證 Electron 共用 application 的保存邊界。

另由 root 透過 Playwright Electron launcher 真正啟動原生 app、保存一筆隔離的測試收藏及筆記、關閉後再啟動。第一次服務為 `127.0.0.1:64198`，第二次為 `127.0.0.1:64231`，筆記、別名及釘選均保留。測試只使用這個 worktree 的 `.electron-user-data` 與假 key；驗證後刪除測試收藏並關閉兩次啟動的程序，未使用主目錄的私人資料。原生 Electron 重啟與 port 改變的驗收已完成；鳥點介面仍由 #32 交付。

兩個 Chromium browser tests 使用實際 IndexedDB：先保存收藏，重新載入正式 Search App，再操作既有「忘記 API key」與重新驗證流程，最後離線讀回筆記；另一個測試從兩個 tab 同時寫入及編輯，確認無遺失。這些測試使用新的 browser context 與假 key，並只攔截測試模組和驗證回應，不接觸使用者現有收藏或憑證。

fake-indexeddb 僅為 dev dependency，供同一組 Node 測試契約驗證 IndexedDB adapter；真實瀏覽器測試另行覆蓋瀏覽器 transaction 行為。

重跑：`node --test test/saved-bird-spots*.test.mjs`、`npx playwright test e2e/search-saved-bird-spots.spec.mjs`，或執行 `npm run check:all`。
