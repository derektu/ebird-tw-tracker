# Cloudflare Search App 部署指南

Search App 是 personal hobby project 的自行部署工具。它由一個 Cloudflare Workers Static Assets deployment 同時提供靜態前端和同源 `/api/*`；不需要 Node server、資料庫或 eBird Cloudflare Secret。Desktop App 與此 deployment 是不同產品入口，Desktop 的 Tracker、通知、設定與 Electron 不會進入 Search bundle。

部署者負責自己的 Cloudflare 帳號、網域、流量用量與可能費用。公開網址被掃描仍可能消耗 Cloudflare request quota；本產品沒有帳號、Cloudflare Access 或複雜 rate limiting。請先確認 Cloudflare 當前方案、用量和計費規則符合你的接受範圍。

## 事前準備

- Node.js 22 或以上與 npm。
- 可登入、可建立 Worker 的 Cloudflare 帳號。
- eBird 帳號。每位使用者自行從 [eBird API key 申請頁](https://ebird.org/api/keygen) 取得自己的 key；部署者不應收集或提供共用 key。

取得程式碼後安裝相依套件：

```bash
git clone https://github.com/derektu/ebird-tw-tracker.git
cd ebird-tw-tracker
npm ci
```

登入部署用的 Cloudflare 帳號並確認身分：

```bash
npx wrangler login
npx wrangler whoami
```

`wrangler.jsonc` 是唯一需要納入 repository 的 deployment 設定。不要在它、Cloudflare Secret、環境檔或 CI 中設定 eBird API key。

## 本機 production-like preview

先建立 Search App 的 production assets，再讓本機 Worker 以和部署時相同的 single Worker + static assets 組合提供服務：

```bash
npm run build:search
npm run dev:cloudflare
```

在 <http://127.0.0.1:7082/> 開啟 Search App。HTTP 僅限本機 preview；實際 deployment 的 key request 必須走 HTTPS。以一個自行取得的 eBird key 完成下列檢查：

1. 驗證 key，確認首次進入 API key gate、成功後才進入搜尋介面。
2. 搜尋一個鳥種，確認最近觀察、地圖、結果清單、Pin 選取、Checklist 與 Google Maps 連結。
3. 以相同 Search Scope 再搜尋一次，確認 Search Discovery 摘要和 `新增` 標記；確認 recent species 仍可選取。
4. 在手機與桌面 viewport 各檢查一次。手機確認 Bottom Sheet 的半屏、展開、收合和「顯示 N 筆結果」重新開啟流程。
5. 選擇「忘記 API key」，確認只回到 gate；recent species 與 Search Baseline 不會因此清除。

這些手動步驟使用真實 key。不要把 key 放入 shell history、畫面錄影、問題回報或 CI log。

## 自動驗證

提交前，執行完整的本機驗證：

```bash
npm run check:all
```

它依序執行 Desktop typecheck、Node tests、Desktop production build、Worker request-to-response tests、Search production build 與 bundle boundary test，最後以 Cloudflare local preview 執行 Search App 的瀏覽器流程。所有測試 key 都是受控假值；這個 workflow 不需要 eBird credential。

若需要另外證明真實 eBird key 的 upstream 行為，參考 README 的 opt-in `npm run test:integration` 與 `npm run test:integration:required` 說明。這兩個命令不屬於 deterministic `check:all`。

## 部署與更新

首次部署與每次更新都使用相同命令：

```bash
npm run deploy:cloudflare
```

此命令先建立 `dist-search/`，再由 Wrangler 把 `worker/index.mjs` 和 `dist-search/` 發布成一個 Workers Static Assets deployment。Wrangler 的輸出會顯示 deployment URL；在綁定自訂網域前，先以該 URL 完成上一節的桌面與手機驗證。

更新時先拉取或合併已審查的版本，執行 `npm ci`（lockfile 有變更時）、`npm run check:all` 和 `npm run deploy:cloudflare`。發佈後重新檢查 API key gate、搜尋、地圖／清單選取、Search Discovery、recent species 和手機 Bottom Sheet。Cloudflare 可回復 deployment 的能力與保留時間依帳號方案而異；在更新前自行確認可接受的回復方式。

## 營運界線

- Worker 只代理產品定義的 allowlisted eBird routes；它不是 public eBird proxy。
- 每個 browser origin 的使用者 key 只在該瀏覽器 localStorage 保存；Search Snapshot 則只在該 origin 的 IndexedDB 保存。資料不會同步至 Desktop、其他 browser 或裝置。
- Cloudflare deployment 不保存使用者 key，也不包含 eBird Cloudflare Secret、KV、D1、Durable Object 或資料庫。
- 若你不信任 deployment owner 或目前部署的 Worker code，請不要輸入 eBird key。完整風險與處理方式見 [API key security](./api-key-security.md)。
