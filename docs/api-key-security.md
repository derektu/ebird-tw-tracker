# Search App API key 安全說明

Search App 使用 browser-owned eBird API key。這個選擇由 [ADR 0003](./adr/0003-browser-owned-key-for-the-search-app.md) 定義：它避免把部署者共用 key 放到公開 deployment，但不把自行部署的 Worker 變成零信任服務。

## 信任與儲存邊界

- 使用者只應在自己部署或完全信任的 deployment 輸入 key。
- key 驗證成功後，Search App 將它保存於目前 browser profile 與 origin 的 `localStorage`。同源 JavaScript、XSS，或具有該頁面權限的 browser extension 可能讀取它；localStorage 不是安全憑證庫。
- 每次啟動都會重新驗證保存的 key。401 或 403 會清除它；網路、逾時、rate-limit 和暫時性 upstream error 不會清除它，避免暫時故障造成不必要的遺失。
- Worker 只在一個同源 API request 中接收 key，並暫時轉成 eBird upstream 的 `x-ebirdapitoken` header。Worker 不把 key 保存到 Cloudflare Secret、KV、D1、Durable Object、資料庫或檔案。
- recent species 也在 localStorage；Search Snapshot 在 IndexedDB。兩者都不包含 API key。「忘記 API key」只清除 key，不清除這兩類資料。

## 傳輸與部署保護

在 production，key 只經 HTTPS request header `X-eBird-Api-Key` 傳到同源 `/api/*`。它不得出現在 URL、query string、HTML、response、錯誤訊息、cache metadata、source map、build artifact、analytics、application log 或 CI output。

Worker 採 fail-closed route allowlist，固定 upstream hostname、pathname 與 query shape；使用者不能讓它轉送任意 URL。taxonomy edge cache 使用固定、不含 key 的 cache key；observation API response 使用 `Cache-Control: no-store`。Worker error 只回傳裁切過的產品錯誤，不回傳 upstream body、request headers 或 stack trace。

所有 Worker 和 static-asset response 都帶有 restrictive Content Security Policy：script 只允許 self-hosted assets、API connection 只允許同源、圖片只允許 self、`data:` 和 OpenStreetMap tile host，並禁止 frame embedding 與第三方 analytics/runtime script。Leaflet 需要 DOM inline positioning styles，因此 `style-src` 例外允許 `'unsafe-inline'`；它不允許第三方 stylesheet host。其他 headers 包含 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer` 和禁止 camera、geolocation、microphone 的 Permissions Policy。

## 使用與處理規則

- 不要把 key 寫入 `.env`、`wrangler.jsonc`、Cloudflare Secret、Git repository、issue、pull request、chat、screenshot、錄影或 log。
- 不要把 key 放入 browser address bar、curl URL 或 query string。使用 Search App UI，或只在可控測試環境中使用 request header。
- 在 shared computer 使用後，選擇「忘記 API key」並視需要清除該網站資料；這不會撤銷已外洩的 key。
- 若懷疑 key 已外洩，立即到 eBird 的 key 管理頁撤銷或更換它，再在 Search App 使用新 key 驗證。不要在公開 issue 貼出舊 key 作為證據。
- 報告安全問題時，依 [Security Policy](../SECURITY.md) 的私密管道處理，且不要包含 key、私有觀察資料或完整 exploit 細節。
