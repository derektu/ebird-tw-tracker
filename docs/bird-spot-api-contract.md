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

格式錯誤的個別 observation、缺失地點 ID 或不同地點 ID，會使請求回 502，不以過濾後的空陣列掩蓋上游錯誤。合法的上游空陣列則成功回 200。兩版都設 `Cache-Control: no-store`。

既有鳥種搜尋仍只顯示有座標的 observations，僅新增 `locId`。沒有有效 ID 的舊通知或快取記錄以 `null` 或舊資料缺欄位表達；後續畫面須要求重新搜尋，不能自動指認地點。

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
