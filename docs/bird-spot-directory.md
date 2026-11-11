# 台灣公共鳥點目錄與共用搜尋

Ticket #33 提供服務與純函式，Desktop 畫面由 #34 接入，Search App 畫面由後續票接入。

兩個 runtime 的 `GET /api/bird-spots/directory` 不接受 query；請求不需 body，若提供則忽略，回應為：

```json
{"spots":[{"locId":"L123","locName":null,"lat":null,"lng":null,"locationType":"hotspot","countryCode":"TW","subnational1Code":null,"subnational2Code":null}],"updatedAt":"2026-11-11T00:00:00.000Z","status":"fresh","error":null}
```

`status` 是 `fresh`、`stale` 或 `unavailable`。刷新失敗時，保留曾成功下載的資料及原本 `updatedAt`，狀態為 `stale`，並帶安全的 `error: {code,message}`。沒有可用目錄則為 `unavailable`、空 `spots`、`updatedAt:null`。這些狀態回 HTTP 200，讓收藏仍可使用；不支援的方法回 405，不支援的 query 回 400。回應不供瀏覽器 HTTP cache 保存。

上游固定為 `https://api.ebird.org/v2/ref/hotspot/TW?fmt=json`，不帶 `back`，因此不以近期觀察排除熱點。只接受陣列、有效 `L` 加數字 ID，以及未提供國家或 `TW` 國家的資料。名稱缺值為 null；缺少或越界的座標整組為 null。輸出只保留明確 allowlist 的公共欄位；同 ID 去重，同名不同 ID 保留。地區只回傳目錄可提供的 country/subnational codes，沒有額外假設中文縣市名，沒有地址或同義詞搜尋。目錄全體為公共 hotspot；不代表包含全部個人地點，也不推論 Hotspot Groups。

每個 Node application / Worker isolate 合併同時刷新，只在使用且目錄滿 24 小時時更新，沒有背景排程。成功取得資料後計算 `updatedAt`。同時使用不同 key 的請求可以共用公共成功結果；若刷新因另一個 key 的認證失敗，等待者改用自己的 key 重試。key 只存在當次呼叫／進行中的刷新，沒有寫入 cache、URL 或 log。所有上游錯誤都轉成固定訊息，不回傳上游 body。

Node 保存公共快取於 data directory 的 `bird-spot-directory.json`，使用同目錄暫存檔及原子 rename；跨重啟重讀並驗證。cache 讀寫失敗不破壞收藏；成功下載但 cache 寫入失敗仍在本 runtime 使用新資料。Node cache 無額外保留期限，舊資料會明確標記 stale。

Worker 在真實 default export 保留同一個 service instance，使用固定且不含 credential 的 synthetic cache key：`https://ebird-tw-search-cache.internal/hotspots/TW-v1`。edge cache 的 `max-age` 是 30 天，與 app 的 24 小時 freshness 分開，允許新 isolate 在 freshness 到期後讀取舊資料。edge cache 可被提前清除、且不保證跨機房一致；超過 retention 或遭 eviction、又沒有本 isolate 的快取時，刷新失敗會是 unavailable。現存 isolate 可繼續回傳其明確標記的 stale memory snapshot。合併刷新不承諾跨 isolate / process 的分散式鎖。

Node `GET /api/bird-spots/search?q=...` 使用服務持有的 key 並合併本機收藏；只接受單一 `q`，最多 200 字，空字串回全部結果。沒有 key 或上游失敗仍可回收藏命中及目錄狀態。目錄輸出不含收藏欄位。Search App Worker 沒有 `/search` 或收藏端點：client 必須以 origin-local IndexedDB 收藏和公共目錄呼叫 `searchBirdSpots(directory.spots,saved,query)`，不得將私人筆記／alias 放進 Worker 請求。

共用函式位於 `src/domain/bird-spot-directory.mjs`。它以 locId 合併、同 ID 只出現一次，收藏 metadata 優先，公共 metadata 可補缺值；比對公開名稱、收藏原名、alias、note、ID 與可用地區 code。正規化為 NFKC、臺轉台、英文小寫後部分字串比對。別名不會改寫 eBird 的公共名稱；搜尋仍可命中目前公共名稱。私人筆記僅在 local combiner／單人 Node runtime 記憶體與私人收藏檔中使用，從不寫入公共目錄快取。

驗證：`test/bird-spot-directory.test.mjs` 使用 fake clock 測 TTL 邊界、並發、認證隔離、舊資料及恢復；真實 Node HTTP 與 Worker Request/Response 測 allowlist 和快取；檔案重啟測持久化；具實際 expiry 行為的 edge fake 測 30 天 retention；default Worker export 測跨 fetch 的合併。這些測試不需真實 key，也不向 eBird 發出流量。
