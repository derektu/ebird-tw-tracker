# 鳥點整體驗收紀錄

本紀錄對應 #38。2026-11-12 的自動驗證以 `5bbdefa52beaae7e1c93790f1c603dbe491612de` 為程式基準。此輪沒有修改產品程式。#37 已取消，匯入、匯出和跨裝置搬移不在驗收範圍。

## 環境與結果

本輪使用 macOS Darwin 25.5.0、Node v26.7.0、Playwright 1.62.1 與 headless Chromium。Search App 測試使用隔離 Worker 7309，Desktop Web 測試使用 Node 7079。使用者原本的 7082 預覽未被測試取代。每個 browser test 使用隔離 context，公共 OSM 圖磚由本機 PNG fixture 取代。

| 檢查 | 結果 | 執行方式 |
| --- | --- | --- |
| 型別、Node 行為、Desktop build | 通過，121 tests | `npm run check` |
| Worker 行為 | 通過，16 tests | `npm run test:worker` |
| Search App build | 通過 | `npm run build:search` |
| Search bundle 安全界線 | 通過，4 tests | `npm run test:search-bundle` |
| Search App browser | 通過，70 tests | `./node_modules/.bin/playwright test --config /tmp/ebird-38-playwright.config.mjs` |
| Desktop Web browser | 通過，54 tests | `./node_modules/.bin/playwright test --config playwright.desktop.config.mjs --output .local/issue-38/desktop-results` |
| 本輪畫面擷取 | 通過，2 個擷取案例 | 隔離 context 的 Search App 與 Desktop Web fixture 操作 |

以上逐項執行 `npm run check:all` 的全部階段。未直接使用該總指令，因為預設 Search browser config 使用 7082，會與使用者現有預覽衝突。暫存 config 只改絕對 `testDir`、`outputDir`、Worker command 的 cwd、連線 URL 和 port，保留 `headless: true`。第一次暫存 config 啟動因 cwd 在 `/tmp` 找不到 Wrangler，尚未執行測試即停止。補上 cwd 後，完整 Search 與 Desktop suites 均通過。

Search 覆寫 config 的關鍵設定如下。`testIgnore`、browserName 與其餘設定沿用 repo 的 `playwright.config.mjs`。

```js
import base from "/Users/derektu/projects/personal/ebird-tracker-worktrees/ticket-38/playwright.config.mjs";
export default {
  ...base,
  testDir: "/Users/derektu/projects/personal/ebird-tracker-worktrees/ticket-38/e2e",
  outputDir: "/Users/derektu/projects/personal/ebird-tracker-worktrees/ticket-38/.local/issue-38/search-results",
  use: { ...base.use, headless: true, baseURL: "http://127.0.0.1:7309" },
  webServer: {
    ...base.webServer,
    cwd: "/Users/derektu/projects/personal/ebird-tracker-worktrees/ticket-38",
    command: "XDG_CONFIG_HOME=.wrangler-config WRANGLER_WRITE_LOGS=false ./node_modules/.bin/wrangler dev --local --port 7309",
    url: "http://127.0.0.1:7309",
  },
};
```

本機完整命令與 logs 位於 ticket-38 worktree 的 `.local/issue-38/`，包括 `check.log`、`worker.log`、`build-search.log`、`bundle.log`、`search-browser.log`、`desktop-browser.log`。Search 暫存 config 為 `/tmp/ebird-38-playwright.config.mjs`。這些是本機執行紀錄，未包含 API key，未將它們當作公開儲存庫檔案。

## 完成條件與證據

| #38 條件 | 自動驗證結果 | 證據與界線 |
| --- | --- | --- |
| 紀錄、收藏、我的鳥點、近期鳥種及返回 | 通過兩版 browser 流程 | `e2e/desktop-bird-spots.spec.mjs`、`e2e/search-bird-spot-detail.spec.mjs`、`e2e/search-spot-manager.spec.mjs`。使用受控 API 回應，Search App 收藏實際寫入 IndexedDB。 |
| 公共目錄與本機收藏搜尋，管理個人欄位、排序及復原 | 通過 | Desktop bird-spots 與 Search spot-manager suites 涵蓋別名、筆記、釘選、同名不同 ID、三種排序、取消及失敗重試。 |
| 真實公共熱點與公開紀錄個人地點 | 真實 integration 通過 | 本輪安全注入 key 的 required integration 3 tests 通過，沒有 skip。公共熱點 `L15612113` 與公開紀錄個人地點 `L13441089` 的 1、14、30 天查詢均回應 200。這不是任意個人地點的目錄搜尋。root 的 `.local/issue-38/integration.log` 保存當次結果。 |
| 1–30 天與空結果、失效地點、缺值、上游失敗 | 通過 | `test/bird-spot-api.test.mjs` 驗證 1、14、30 天及界外值、缺值與各錯誤分類。兩版 browser suites 驗證呈現及重試。介面預設 3 天。 |
| 保存失敗與過時請求 | 通過 | Node 與 IndexedDB transaction tests 及兩版 browser suites 涵蓋保存失敗保留草稿、晚到請求、保存期間新輸入及不同編輯 session。 |
| 重啟、reload 與忘記 key 後保留收藏 | 自動範圍通過，原生重啟本輪未重跑 | `test/saved-bird-spots-api.test.mjs` 實際重建 Node 服務並更換 port，驗證資料及移除 key 後保存。Search browser suites 使用實際 IndexedDB 驗證 reload 與忘記 key。原生 Electron 的歷史重啟證據見 [Desktop 鳥點功能](desktop-bird-spots.md)，本輪未啟動 Electron；歷史證據不代替目前版本原生重啟驗收。 |
| 320、390、402px 手機佈局與 44px 操作 | headless viewport 通過 | 搜尋收合列維持 70px、詳情預設半屏、多鳥種可見、主要操作至少 44px、無水平溢出。另驗證縮小的 viewport 及 visualViewport 模擬。這些不是實機鍵盤證據。 |
| Checklist、Maps、地名、星號及回程狀態 | 通過 | 兩版 browser suites 驗證連結、收藏及地圖、選取、篩選和捲動位置返回。 |
| iOS 鍵盤、safe area、捲動及返回 | 待使用者實機確認 | 本輪未開啟可見瀏覽器、原生 Electron、手機或模擬器。見 [手機驗收清單](mobile-bird-spots-checklist.md)。 |
| Desktop 對齊、寬螢幕及 API key gate | 通過自動範圍 | Desktop 900px 與寬螢幕對齊、管理清單獨立捲動及固定操作列通過。Search App 1440px 管理及 API key gate suites 通過。 |
| Search Scope、Search Baseline 與既有 Tracker | 現有自動測試通過 | browser suites 驗證鳥點返回及切換不寫入原鳥種 baseline，Search Discovery suites 與 Node tracking-domain tests 通過。未聲稱本輪實測原生背景通知。 |
| 畫面及手動驗收紀錄 | 自動畫面已擷取，實機紀錄待補 | 以下為執行中 app 的 fixture 畫面。真正手機環境、鍵盤與 safe area 結果待使用者填入。 |

## 本輪執行畫面

以下畫面由 2026-11-12 的 headless Chromium 執行擷取。Search App 手機畫面為 390 × 844 viewport，寬螢幕為 1440 × 950。Desktop 畫面是同一 React 介面的 Node Web runtime，不是本輪原生 Electron 截圖。所有 API 回應與地點文字均為驗收 fixtures，底圖為本機替代 PNG，不能當成實際地圖或 eBird 上游成功證據。

| 狀態 | 畫面 |
| --- | --- |
| 手機初始收合搜尋 | [初始畫面](screenshots/acceptance-38-mobile-initial.png) |
| 展開搜尋條件 | [搜尋條件](screenshots/acceptance-38-mobile-conditions.png) |
| 鳥點文字搜尋結果 | [鳥點結果](screenshots/acceptance-38-mobile-name-results.png) |
| 鳥點半屏詳情 | [半屏詳情](screenshots/acceptance-38-mobile-detail-half.png) |
| 鳥點展開詳情 | [展開詳情](screenshots/acceptance-38-mobile-detail-expanded.png) |
| 我的鳥點清單 | [收藏管理](screenshots/acceptance-38-mobile-manager.png) |
| 收藏編輯頁 | [編輯畫面](screenshots/acceptance-38-mobile-editor.png) |
| Search App 寬螢幕管理 | [左右欄管理](screenshots/acceptance-38-search-wide-manager.png) |
| Desktop Web 鳥點詳情 | [Desktop Web 詳情](screenshots/acceptance-38-desktop-web-detail.png) |
| Desktop Web 收藏管理 | [Desktop Web 管理](screenshots/acceptance-38-desktop-web-manager.png) |

## 本輪真實 API 與手機測試網址

root 的真實 integration 與以下 live 驗證使用 Node v22.23.2，與上述 suite 的 Node v26.7.0 分開記錄。root 另以 headless Chromium 在 `https://192.168.81.98:7310/search` 驗證同一 Search App。API 回應未攔截，只有公共 OSM 圖磚由本機 PNG 取代。公共熱點 `L3471455` 明確查近 3 天，當次取得 41 個鳥種。別名、筆記及釘選在 reload 後保留，取消收藏復原保留個人欄位，未儲存提示的繼續編輯與捨棄均通過。本機筆記搜尋沒有將筆記或查詢字串送往 Worker。數量只代表當次 eBird 回應。

[390px 真實 API 收藏管理](screenshots/acceptance-38-live-manager-390.png)、[390px 真實 API 編輯](screenshots/acceptance-38-live-editor-390.png)、[1440px 真實 API 收藏管理](screenshots/acceptance-38-live-manager-1440.png)中的別名與筆記均為隔離 context 的驗收示範。root 的 `.local/issue-38/live-38-proof.json` 保存結果。這些仍是 headless viewport，不是實際手機。

手機測試服務只提供 Search Worker 與靜態 assets，不提供專案目錄或 `.env`。LAN HTTP 網址會被既有 HTTPS key 驗證要求拒絕，因此另用 7 天效期的測試自簽憑證提供 HTTPS。root 在 Mac 的 headless Chromium 以 `ignoreHTTPSErrors: true` 明確允許這張測試憑證後驗證成功；未將這項設定當成實際手機信任結果。手機是否能穿過同 Wi-Fi 網路與防火牆、接受憑證並完成鍵盤操作，仍待實機確認。

## 尚待確認

#38 保留開啟，等待實際手機鍵盤、safe area、捲動和返回的環境與結果。目前版本的原生 Electron 重啟也未重新驗證，因為啟動流程會顯示視窗及取得焦點。這項限制不以 Node 重啟或 Desktop Web 測試代替。#36 對應的實機項目也保留未完成。自動測試沒有代替手機驗收，也沒有把先前的原生 Electron 證據記成本輪執行結果。

本輪未部署、公開發版、建立 tag 或發布 installer。
