# 鳥點近期觀察 API

本契約實作 GitHub issue #30。Desktop 的本機 Node API 與 Search App Worker 提供相同的鳥點資料格式；收藏與畫面由後續 tickets 接入。

## 指定地點查詢

`GET /api/bird-spots/observations?locId=L11045618&days=14`

- `locId` 必須是 `L` 加數字。缺少或無效的 ID 回 400，不由名稱或經緯度猜測。
- `days` 省略時為 14，接受 1–30 的整數。重複或未列出的參數回 400。
- Node 在單一使用者 runtime 讀取已設定的 key。Worker 要求 `X-eBird-Api-Key` request header，只有上游 header 會轉為 `x-ebirdapitoken`；key 不在 URL、回應、資料檔或錯誤內容中。
- 上游固定為 `/v2/data/obs/{locId}/recent?back={days}&includeProvisional=true&sppLocale=zh`，timeout 為 15 秒。不呼叫附近查詢或 Hotspot Info，不要求 `detail=full`。

成功回應含 `locId`、`days`、`generatedAt` 與 `observations`。每筆 observation 有地點 ID、可缺失的地名與座標、`locationType`、鳥種資訊、觀察時間、該筆數量與 checklist ID。它代表各鳥種期間內最新一筆，依觀察時間由新到舊排列，不是完整歷史或鳥數加總。

地點類型為 `hotspot`、`personal` 或 `unknown`，來自上游的 `locationPrivate`。這不是敏感物種或 checklist 是否被隱藏的旗標。無名稱以 `null` 表示；缺失或超出範圍的座標將整對設為 `null`，不補猜座標。鳥種名稱缺失也保留 `null`。

頂層 `locId` 是請求的鳥點 ID，每筆 observation 的 `locId` 是原始觀察地點，兩者不保證相同。eBird 對部分鳥點的固定近期查詢會回傳不同地點的紀錄；合法紀錄保留原始 ID、地名、座標與 checklist，不過濾或改寫為請求 ID。程式不自行加查周邊或建立群組，也不從這些結果推定官方父子關係。

格式錯誤的個別 observation 或缺失、無效的地點 ID，會使請求回 502，不以過濾後的空陣列掩蓋上游錯誤。合法的上游空陣列則成功回 200。兩版都設 `Cache-Control: no-store`。

既有鳥種搜尋仍只顯示有座標的 observations，僅新增 `locId`。沒有有效 ID 的舊通知或快取記錄以 `null` 或舊資料缺欄位表達；後續畫面須要求重新搜尋，不能自動指認地點。

## 詳情與收藏的地點身分

兩版共用 `getBirdSpotRecentDetail`。只有頂層 ID 與目前詳情相符的回應可提供結果。請求鳥點缺少名稱、座標或類型時，只能用同 ID 紀錄補足；沒有同 ID 紀錄就保留缺值，不從其他觀察點借用。Desktop 地圖也只使用這份安全的鳥點資料，不再自行取第一筆紀錄的座標。

回傳含不同 ID 時，兩版詳情顯示 eBird 回傳範圍提示及各筆原始地名／ID。提示依未經鳥種篩選的結果判斷，不因切換鳥種而消失。收藏、別名、筆記與釘選仍屬於請求的鳥點，查看結果不會改寫收藏或新增其他地點。

## 可呈現的錯誤

| HTTP | code | 意義 |
| --- | --- | --- |
| 400 | `invalid_location_id` | 缺少或格式錯誤的地點 ID |
| 400 | `invalid_days` | 天數超出範圍或不是整數 |
| 400 | `unexpected_query` | 未允許或重複的參數 |
| 400 | `missing_api_key` | runtime 沒有提供 key |
| 405 | `method_not_allowed` | 請求不是 GET |
| 401、403 | `invalid_api_key` | 上游拒絕 key 或權限 |
| 410 | `location_unavailable` | 上游以 404 或 410 表示地點不可取得 |
| 429 | `rate_limited` | 上游限制請求 |
| 503 | `network_unavailable` | 連線失敗或 timeout |
| 503 | `upstream_unavailable` | 其他上游 HTTP 失敗 |
| 502 | `malformed_upstream_response` | JSON 或 observation 資料不符合契約 |

錯誤回應為 `{code, error}`，只傳回固定訊息，不轉送 eBird 的 response body。

## 真實 eBird 驗證

以下是歷史單點查詢快照，不能推論所有回應的觀察 ID 都等於請求 ID。

2026-11-11 使用本機既有 key，在 process 內安全注入，未把 key 寫入此文件、test fixtures 或 command arguments。先從台灣近 14 天公開觀察取得 hotspot 與 personal location ID，再透過 Worker handler 及兩版共用 transport 驗證。

| 類型 | locId | 最近天數 | HTTP | 鳥種數 | 缺地名 | 缺座標 |
| --- | --- | --- | --- | --- | --- | --- |
| hotspot | L11045618 | 1 | 200 | 1 | 0 | 0 |
| hotspot | L11045618 | 14 | 200 | 1 | 0 | 0 |
| hotspot | L11045618 | 30 | 200 | 1 | 0 | 0 |
| personal | L41756014 | 1 | 200 | 6 | 0 | 0 |
| personal | L41756014 | 14 | 200 | 11 | 0 | 0 |
| personal | L41756014 | 30 | 200 | 16 | 0 | 0 |

所有回傳紀錄的 `locId` 與請求一致，各鳥種僅一筆。這次樣本有地名與座標，不表示所有個人地點永遠提供完整資料，也不保證座標精度。

另查詢不存在的測試 ID `L999999999999`，上游仍回 200 和空陣列。因此空結果無法區分「沒有近期公開資料」與「上游未辨識或不公開地點」，不能因此宣稱鳥點不存在，也不能刪除收藏。`location_unavailable` 只用於明確的上游 404／410；不能偽造這項資訊。

這些 ID 與筆數是當次查詢證據，不作為將來測試的固定預期。缺失欄位、上游錯誤和成功空結果另由確定性的 Node／Worker contract tests 驗證。

## 重跑方式

`npm run check:all` 執行型別、單元、Worker、bundle 和 browser 回歸。

`npm run test:integration` 額外執行真實 eBird 測試。新鳥點測試只在 process 已安全提供 `EBIRD_API_KEY` 時執行，否則明確 skip。`npm run test:integration:required` 沒有 key 時失敗。新測試動態選用當時可取得的公共熱點及個人地點，檢查 1／14／30 天與每鳥種一筆，僅輸出 ID、狀態與筆數，不輸出名稱或座標。

官方依據：[eBird API 2.0](https://documenter.getpostman.com/view/3897235/S1ENwy59)。真實驗證比文件範例多確認了當前個人地點可查，以及無效但格式正確的 ID 可能成功回空結果。


## #57 回歸驗證

Node 與 Worker 的受控回應涵蓋混合 ID、只有其他 ID、單一 ID、空結果及格式錯誤。純函式測試涵蓋同 ID 紀錄不在第一筆、沒有同 ID 紀錄、既有 metadata、錯誤頂層 ID 和不改動輸入。兩版 headless browser 驗證原始來源、鳥種篩選、HTML 字串安全顯示、收藏資料保存，以及缺少請求鳥點座標時不建立其他地點 marker。

Opt-in integration 額外查詢 `L2236115` 的近 1／3 天，逐筆比對這次上游的鳥種、原始地點及 checklist 身分，不硬編碼鳥種數或要求每次都有混合 ID。圖磚在自動化 browser 中均使用本機 fixture；真實 eBird 查詢由 root 另外執行，不將 key 或原始整份回應寫入 Git。
