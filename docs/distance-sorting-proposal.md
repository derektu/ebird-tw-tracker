# 依目前位置排序提案

## 提案狀態

距離排序是 Search Discovery 交付完成後獨立評估的功能，不屬於目前實作範圍。它只改變結果呈現順序，不改變 observations API 的結果集合、Search Scope 或 Search Snapshot。

## 體驗

搜尋結果提供兩種排序模式：

- `最新時間`：預設模式，依 observation time 由新到舊。
- `離我最近`：依使用者目前位置的直線距離由近到遠。

Search Discovery 永遠先於一般紀錄分組；所選排序只作用於兩組內部。切換排序不重新搜尋、不重新比較，也不推進 baseline。

距離相同時依 observation time 由新到舊，再依 checklist identity 產生確定性順序。清單可顯示直線距離，但不得把它描述為道路距離、交通時間或路線長度。

## 位置與隱私

只有使用者主動選擇 `離我最近` 時，app 才呼叫一次 `navigator.geolocation.getCurrentPosition`。位置只存在目前頁面的 memory：

- 不送到 server、Worker 或第三方服務。
- 不保存至 IndexedDB、`localStorage` 或本機資料檔。
- 不持續監聽背景位置。
- 重新載入後需要再次取得位置。

拒絕、逾時或無法定位是非阻斷狀態。app 保留搜尋結果並使用 `最新時間` 排序。

## 計算邊界

兩點直線距離由前端純函式以 Haversine formula 計算。無效或缺少座標的 observation 不得產生 `NaN` 或破壞穩定排序。

本提案不包含：

- 持續或背景定位。
- 距離半徑篩選。
- 路線規劃或交通時間。
- 將位置加入 Search Scope。
- 專用的「我的位置」marker。

排序控制、距離文字格式與定位失敗訊息應在功能進入實作前以小型 prototype 驗證。
