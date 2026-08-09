# Cloudflare Search App 架構計劃

## 產品定位

Search App 是可在手機、平板與桌面瀏覽器執行的 responsive web app。它提供台灣鳥種搜尋、近期觀察地圖、結果清單與手動新增紀錄比較，不提供背景追蹤、通知、排程或伺服器端使用者資料。

專案採自行部署模式。每位部署者將程式部署至自己的 Cloudflare 帳號，每位使用者使用自己的 eBird API key。Cloudflare deployment 不持有部署者共用的 eBird key，也不提供公共 eBird proxy service。

Desktop App 與 Search App 位於同一個 repository。兩個 app 共用搜尋 domain、資料型別、地圖元件及新增紀錄比較，各自擁有入口、API client、憑證流程與外層版面。

## 系統架構

```text
Search App browser
  ├─ React static assets
  ├─ API key in memory
  │    └─ optional localStorage persistence
  ├─ search snapshots in IndexedDB
  └─ same-origin /api requests
          │
          ▼
Cloudflare Worker
  ├─ validates route and parameters
  ├─ forwards the request API key transiently
  └─ calls an allowlisted eBird API endpoint
```

Worker 與 static assets 由同一個 Cloudflare Worker deployment 提供。瀏覽器只連線到同源 `/api`，Worker 將應用程式 header 轉為 eBird 所需的 `x-ebirdapitoken` header。

## Repository 邊界

```text
src/
  apps/
    desktop/
      main.tsx
      DesktopApp.tsx
    search/
      main.tsx
      SearchApp.tsx
      ApiKeyGate.tsx
  api/
    types.ts
    desktop-client.ts
    worker-client.ts
  domain/
    observation-identity.ts
    search-comparison.ts
  features/
    search/
    map/
    tracking/
    events/
    settings/
  storage/
    browser-api-key.ts
    search-snapshot-store.ts
    indexeddb-search-snapshot-store.ts
  types/
    domain.ts
worker/
  index.ts
  ebird-client.ts
  validation.ts
  routes/
    validate-key.ts
    species.ts
    observations.ts
search.html
wrangler.jsonc
docs/
  manual-search-new-observations-plan.md
  cloudflare-search-app-plan.md
  cloudflare-deployment.md
  api-key-security.md
```

Desktop entry 只打包本機 Node API、追蹤、事件、設定及 Electron bridge 所需功能。Search entry 不 import tracking、events、settings 或 Electron modules，避免桌面專屬程式出現在 Cloudflare bundle。

## 共用搜尋核心

共用搜尋核心包含：

- `Species`、`Observation` 與 API response types。
- 鳥種與 observation 資料正規化。
- 搜尋條件與 request lifecycle。
- Leaflet 地圖、marker、結果清單與目前選取項目。
- IndexedDB 搜尋基準。
- 新增紀錄判定、排序與標記。

新增紀錄行為遵循 [手動搜尋新增紀錄計劃](./manual-search-new-observations-plan.md)。Search App 只呈現本次新增的 checklist，不比較欄位更新，也不顯示不再出現的紀錄。

共用元件不直接讀取 Desktop 或 Search App 的憑證來源。兩個 app 透過明確的 API client interface 注入請求行為。

## 前端應用程式

### Search App 功能

Search App 包含：

- eBird API key 啟動畫面。
- 中文名、英文名及 species code 搜尋。
- 最近 1 至 30 天選擇。
- 台灣觀察位置地圖。
- observation 清單。
- Checklist 與 Google Maps 連結。
- 新增 observation badge、marker 樣式與優先排序。
- 最近一次相同條件搜尋的 IndexedDB 基準。

Search App 不包含：

- 加入追蹤。
- 追蹤規則管理。
- 通知中心。
- Menu Bar preview。
- API key 伺服器設定頁。
- background timer、Cron 或 push notification。
- 搜尋基準管理介面。

### Responsive layout

桌面 layout 使用地圖與結果清單並排：

```text
search controls
────────────────────────────────
map                    result list
```

窄螢幕 layout 使用垂直排列：

```text
search controls
───────────────
map
───────────────
result list
```

手機輸入欄位字級至少 16px，主要觸控目標至少 44px，layout 支援 safe-area inset。地圖在窄螢幕使用約 `45–55dvh` 的可視高度，結果清單由正常頁面捲動承擔，不要求第一階段提供 bottom sheet。

## API key lifecycle

API key 的預設生命週期是目前分頁：

1. 使用者輸入 key。
2. Search App 將 key 保存在 React memory。
3. Search App 呼叫驗證 endpoint。
4. 驗證成功後開放搜尋。
5. 關閉或重新載入未記憶的分頁後，key 消失。

「記住這台裝置」是明確的選配。啟用時，key 保存至 `localStorage`；啟動時讀取並重新驗證。介面提供「忘記 API key」，清除 memory 與 `localStorage` 中的值。

驗證只確認 key 當下可用，不把 `localStorage` 視為安全憑證庫。安全說明必須告知使用者，網頁 JavaScript、XSS 或具有頁面權限的瀏覽器 extension 可能讀取 localStorage。

key 必須符合以下傳輸規則：

- 只放在 HTTPS request header。
- 不放在 URL、query string、HTML、前端 bundle 或錯誤訊息。
- 不送往 analytics 或第三方服務。
- 不寫入 Search App 或 Worker application log。
- 不成為 Cache API key 或 cached response 的一部分。

## Worker API

Worker 提供以下同源 API：

```http
POST /api/key/validate
X-eBird-Api-Key: <user key>

GET /api/species/search?q=<query>
X-eBird-Api-Key: <user key>

GET /api/species/resolve?q=<query>
X-eBird-Api-Key: <user key>

GET /api/observations?speciesCode=<code>&days=<1-30>
X-eBird-Api-Key: <user key>
```

Worker 將通過驗證的 key 以 `x-ebirdapitoken` 傳送至 eBird。Worker 不將 key 寫入 Cloudflare Secret、KV、D1、Durable Object 或 filesystem。

每一條 route 擁有固定的 upstream pathname 與 query allowlist。使用者不能提供 upstream URL、hostname 或任意 eBird pathname，因此 Worker 不能作為 general-purpose proxy。

輸入限制至少包含：

- `q` 去除前後空白並限制長度。
- `speciesCode` 只接受預期字元與長度。
- `days` 限制為 1 至 30 的整數。
- 非預期 method、content type 及 route 回傳明確的 4xx。
- eBird authentication error 轉為前端可辨識的 401 或 403。
- upstream error body 經過裁切與清理，不回傳敏感 header。

## Taxonomy 與快取

鳥種搜尋需要 eBird taxonomy。Worker 以固定 locale `zh` 取得 taxonomy，並以部署範圍的 edge cache 降低重複 upstream request。

taxonomy cache key 只包含固定 endpoint、locale 與資料版本，不包含使用者 API key。cache miss 需要有效的使用者 key 才能呼叫 upstream。cache hit 可提供相同公開 taxonomy，但 Search App 啟動時仍會獨立驗證使用者 key。

Observation response 的第一階段採保守快取策略：Worker 不保存帶有使用者 key 的 request，並對瀏覽器回傳 `Cache-Control: no-store`。若後續加入 observation edge cache，cache key 必須由正規化後的公開搜尋條件組成，且安全測試需確認 key 不會進入 cache metadata。

## 瀏覽器資料

Browser storage 分為兩類：

| 資料 | 儲存位置 | 行為 |
| --- | --- | --- |
| eBird API key | memory；選配 localStorage | 使用者主動選擇是否跨 reload 保存 |
| 搜尋基準 | IndexedDB | 每個 scope 只保存最近一次 identity 集合 |

搜尋基準不含 API key，也不送至 Worker。使用者清除網站資料後，Search App 對每一個 scope 的下一次搜尋會建立新的比較基準。

## 安全模型

Search App 的主要信任邊界是 deployment owner。API key 會暫時經過 deployment 的 Worker，因此使用者只應在自己部署或完全信任的 deployment 輸入 key。README 與安全文件需清楚揭露此行為。

HTTP response 使用 Content Security Policy 限制：

- script 與 style 來源以 self-hosted asset 為主。
- `connect-src` 只允許同源 API。
- `img-src` 只額外允許必要的 OpenStreetMap tile host、`data:` 與本機 asset。
- 不載入第三方 analytics 或任意 runtime script。
- frame embedding 預設禁止。

Worker 對 API route 採 fail-closed 行為。錯誤處理不輸出完整 upstream request、request headers 或 stack 中的憑證值。

## Cloudflare deployment

Cloudflare deployment 使用 Workers Static Assets 與 Worker API 的單一專案：

- Vite 產生 Search App static assets。
- Wrangler 發布 static assets 與 Worker code。
- `/api/*` 先由 Worker 處理。
- 其他已建置 route 由 static assets 提供。
- deployment 不需要 Node server、database 或 eBird Cloudflare secret。

建議 scripts：

```json
{
  "dev:search": "vite --config vite.search.config.ts",
  "build:search": "vite build --config vite.search.config.ts",
  "test:worker": "...",
  "dev:cloudflare": "wrangler dev",
  "deploy:cloudflare": "npm run build:search && wrangler deploy",
  "check:all": "npm run check && npm run test:worker && npm run build:search"
}
```

`wrangler.jsonc` 保存非敏感 deployment configuration，不含 API key。CI 使用 mock upstream 執行 Worker tests，不需要真實 eBird key。

## 文件

`docs/cloudflare-deployment.md` 包含：

1. 環境需求與 Cloudflare 帳號準備。
2. repository fork 或 clone。
3. Wrangler login。
4. 本機 Search App 與 Worker 預覽。
5. production deploy。
6. deployment 更新流程。
7. 手機與桌面驗證步驟。
8. 每位使用者自行申請 eBird API key 的說明。
9. Cloudflare 用量、rate limit 與可能費用的責任邊界。

`docs/api-key-security.md` 包含：

- browser memory 與 localStorage 的差異。
- key 經過 Worker 的信任模型。
- 只使用自己部署或可信 deployment 的要求。
- key 不應提交至 Git、issue、screenshot 或 log。
- key 洩漏後的撤銷與更換流程。

## 測試策略

### Shared search tests

- Desktop App 與 Search App 使用相同的新增紀錄 identity 與 comparison 規則。
- 新增紀錄位於清單前方並具有文字 badge。
- 不產生 updated 或 removed 狀態。
- IndexedDB 儲存失敗不阻止一般搜尋。

### Worker tests

- 缺少、空白及無效 key 會被拒絕。
- key 不出現在 URL、response body、cache key 或 application log。
- route、method 與 query allowlist 正確運作。
- 任意 upstream URL 與非 allowlisted pathname 無法轉送。
- eBird authentication、rate-limit 與 server error 被正確轉換。
- taxonomy cache 不以使用者 key 分區或保存 key。

### Build and browser tests

- Search bundle 不包含 tracking、events、settings 或 Electron code。
- Search production build 可由 Wrangler local preview 提供。
- 手機與桌面 viewport 均能完成 key 驗證、搜尋、地圖選取及 checklist 跳轉。
- 真實 key 不進入 source map、build artifact 或 CI output。
- Desktop 的 typecheck、tests、production build 與 Electron 行為維持通過。

## 交付階段

### 階段一：共用搜尋核心

- 完成手動新增紀錄比較及 IndexedDB 儲存。
- 將搜尋、地圖與 tracking/event coordination 的責任分開。
- 建立可由兩個 app 注入的 API client interface。

### 階段二：Search App shell

- 建立獨立 Vite entry 與 responsive layout。
- 建立 API key gate、memory/localStorage lifecycle。
- 只組裝搜尋、地圖與結果清單。

### 階段三：Cloudflare Worker

- 實作 allowlisted routes、upstream client 與輸入驗證。
- 實作 taxonomy cache 與敏感資料清理。
- 使用 mock upstream 完成 Worker tests。

### 階段四：部署與安全收斂

- 建立 Wrangler configuration 與 npm scripts。
- 套用 CSP 與 production headers。
- 完成部署、安全與維護文件。
- 以自行部署環境完成手機與桌面驗收。

## 完成條件

- Desktop App 與 Search App 由獨立入口建置，並共用搜尋核心。
- Search App 可在手機與桌面瀏覽器完成完整搜尋流程。
- 使用者 key 預設只存在 memory，並可選擇保存於 localStorage。
- Worker 不持有部署者共用 key，也不保存使用者 key。
- Worker 只能代理 allowlisted eBird operations。
- 搜尋基準只存在瀏覽器 IndexedDB。
- 新增 checklist 具有明確標記並排列在結果清單前方。
- Search App 不包含背景追蹤、通知或設定 API。
- Cloudflare deployment 可由 repository 文件獨立完成。
- Desktop 與 Search App 的完整檢查均通過。
