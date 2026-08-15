# eBird Taiwan Tracker

eBird Taiwan Tracker 是台灣鳥種近期觀察紀錄的搜尋與背景追蹤工具。程式可作為本機網站執行，也可封裝成 macOS 或 Windows Electron 應用程式；兩種執行方式共用同一套 React 前端、HTTP API 與追蹤邏輯。

## 功能

- 以中文名、英文名或 eBird species code 搜尋鳥種。
- 查詢台灣最近 1 至 30 天的公開觀察紀錄。
- 在可縮放的台灣地圖顯示觀察位置，並同步 marker、清單與目前選取項目。
- 從紀錄開啟 eBird checklist 或 Google Maps。
- 為每個鳥種建立一個背景追蹤規則。
- 設定查詢天數、檢查間隔、啟用狀態與夜間排除時段。
- 對新紀錄去重並建立通知事件。
- Electron 版提供 Menu Bar 常駐入口及作業系統原生通知。
- API key 優先使用環境設定；Electron 使用者設定由作業系統安全儲存機制加密。

## 技術架構

- React 19、TypeScript、Vite
- Leaflet、OpenStreetMap
- Node.js HTTP server
- Electron
- electron-builder
- eBird API 2.0

Desktop App 的瀏覽器介面不會直接持有 eBird API key。Node server 負責呼叫 eBird API、解析鳥種、保存追蹤規則、執行排程及產生通知。Electron 只提供桌面視窗、Menu Bar、原生通知與安全設定儲存，不另外實作業務邏輯。

## 環境需求

- Node.js 22 或以上
- npm
- eBird 帳號及個人 API key
- macOS build：macOS 與 Xcode Command Line Tools
- Windows build：建議使用 Windows x64 或 `windows-latest` CI runner

eBird API key 可從 [eBird API key 申請頁](https://ebird.org/api/keygen) 取得；API 欄位與限制請參考 [eBird API 2.0 文件](https://documenter.getpostman.com/view/3897235/S1ENwy59)。

## 安裝

```bash
npm install
```

API key 有兩種設定方式。

### 環境設定

複製 `.env.example` 為 `.env`，填入自己的 key：

```dotenv
EBIRD_API_KEY=your-ebird-api-key
```

程式也會讀取 process environment 中的 `EBIRD_API_KEY`。環境設定的優先權高於應用程式內的使用者設定。

`.env` 不會納入版本控制，也不應放入 Electron 安裝檔或公開部署產物。

### 應用程式設定

沒有環境設定時，可以從右上角「設定」輸入 API key。程式會先向 eBird 驗證 key，再保存設定。

Electron 版使用 `safeStorage`：macOS 使用 Keychain，Windows 使用 DPAPI。網站版的設定只適合單一使用者的本機服務；公開部署前必須加入使用者帳號及資料隔離。

## 開發

啟動網站開發服務：

```bash
npm run dev
```

預設網址為 <http://127.0.0.1:7079/>。

啟動 Electron 開發版：

```bash
npm run electron:dev
```

執行完整檢查：

```bash
npm run check
```

`check` 依序執行 TypeScript 型別檢查、自動化測試及 Vite production build。

### Search App API key gate preview

Search App 是獨立的 Cloudflare Workers Static Assets 入口。目前可預覽 API key gate；它不啟動 Node server、不使用資料庫，也不包含 Desktop 的 Tracker、通知或設定介面。

```bash
npm run build:search
npm run dev:cloudflare
```

在 <http://127.0.0.1:7082/> 開啟預覽。這個本機 port 已為本專案的 Cloudflare preview 保留。預覽使用 HTTP 只限本機開發；Cloudflare deployment 的同源 API key request 必須使用 HTTPS。

首次使用時，輸入 key 後會以同源 `POST /api/key/validate` 的 `X-eBird-Api-Key` header 驗證；成功後 key 才保存至目前 browser origin 的 `localStorage`。每次回到 App 都會重新驗證。401/403 會清除已保存 key；暫時性的網路、rate-limit 或 upstream 錯誤會保留 key；「忘記 API key」只清除 key。

Search App 的 key 會短暫通過自行部署的 Worker，因此只應在自己的或完全信任的 deployment 輸入。這是與 Desktop App 不同、由 [ADR 0003](docs/adr/0003-browser-owned-key-for-the-search-app.md) 定義的信任邊界。

驗證 Worker 與瀏覽器可見流程：

```bash
npm run test:worker
npx playwright install chromium
npm run test:browser
```

`npm run check:all` 執行既有 Desktop check、Worker tests 與 Search App browser tests。

完整的自行部署、production-like preview、更新、桌面／手機驗證與 Cloudflare 用量責任，見 [Cloudflare Search App 部署指南](docs/cloudflare-deployment.md)。使用 browser-owned key 前，請先閱讀 [Search App API key 安全說明](docs/api-key-security.md)。

### Search App real eBird integration tests

一般 `npm test` 只執行 `test/` 中不連網的測試；它不會執行 `integration/`。Search App 的 Worker 以 eBird 的 [Recent observations in a region](https://documenter.getpostman.com/view/3897235/S1ENwy59) 作為 API key probe，請求固定為 `GET /v2/data/obs/TW/recent?back=1&maxResults=1`。eBird 文件將此 endpoint 標記為需要 `X-eBirdApiToken`。

```bash
npm run test:integration
```

這個 opt-in command 一律使用明顯無效的 test key 驗證真實 eBird endpoint 會回傳 authentication failure，因此需要網路；網路或 eBird 暫時不可用時它會失敗，而不是把外部驗證誤報成通過。若目前 shell 已安全地提供 `EBIRD_API_KEY`，同一個 command 也會驗證 valid path，且不輸出、保存或回傳 key。沒有該環境變數時 valid-path test 會明確標記為 `SKIP`。

若本機或受控環境要求 valid-path evidence，使用：

```bash
npm run test:integration:required
```

這個 variant 在沒有 `EBIRD_API_KEY` 時會失敗，避免把 skipped valid-path test 誤當成已驗證。CI 只執行一般 `npm run check`，不執行有網路與憑證依賴的 integration tests。

## Production web build

```bash
npm run build
npm start
```

前端產物位於 `dist/`。Node server 同時提供 production 靜態檔案與 `/api`。

## Electron build

所有 Electron 產物位於 `release/`。

### macOS ad-hoc app 目錄

```bash
npm run electron:pack
```

這個指令建立 unpacked `.app`，並套用專案的 ad-hoc 簽章設定，適合本機功能驗證。

### macOS ad-hoc 簽章

```bash
npm run electron:build:mac
```

這是本專案採用的 macOS release 方式。ad-hoc 簽章不需要 Apple Developer 帳號；它使用臨時身分簽署並套用 Electron 執行所需的 entitlement，適合自行下載、測試或小範圍分享。

ad-hoc 簽章不是受信任的公開發佈簽章：

- 沒有 Apple Team ID。
- 不能送交 Apple notarization。
- 其他 Mac 仍可能顯示 Gatekeeper 警告或要求使用者手動允許。
- 自建 root certificate 或一般 self-signed certificate 不會被 macOS Gatekeeper 視為 Developer ID。

可以用以下指令驗證 ad-hoc 簽章：

```bash
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/eBird Taiwan Tracker.app"
codesign -dv --verbose=4 "release/mac-arm64/eBird Taiwan Tracker.app"
```

`Signature=adhoc` 代表 ad-hoc 簽章已套用。更多細節請參考 [electron-builder macOS code signing](https://www.electron.build/docs/features/code-signing/code-signing-mac/)。

### Windows x64 NSIS installer

```bash
npm run electron:build:win
```

這個指令建立 Windows x64 NSIS installer。目前專案不提供 Windows signing certificate，因此 installer 會顯示 Unknown publisher，SmartScreen 也可能阻擋或警告。一般 self-signed certificate 不會被其他使用者的 Windows 信任；除非先在每台機器安裝並信任該 certificate，否則無法解決 publisher 警告，因此 release 維持 unsigned。

Windows installer 最可靠的建置環境是 Windows 本機或 GitHub Actions `windows-latest`。未包含 native Node module 時，electron-builder 通常也能從 macOS cross-build Windows 產物，但正式簽章與安裝測試應在 Windows 執行。

Windows build 設定使用 assisted NSIS installer，允許使用者選擇安裝目錄，並建立桌面及 Start Menu 捷徑。相關選項請參考 [electron-builder Windows](https://www.electron.build/docs/win/) 與 [NSIS 文件](https://www.electron.build/docs/nsis/)。

## GitHub Actions

專案有兩條互相獨立的 workflow：

- `CI`：每次 push 或 pull request 到 `main` 時，在 Ubuntu 執行 `npm ci` 與 `npm run check`。它會檢查 TypeScript、執行自動化測試並確認 Vite production build 成功，不會打包 Electron installer。
- `Build desktop installers`：手動執行，或 push `v*` tag 時啟動。macOS runner 產生 x64 與 arm64 ad-hoc signed DMG；Windows runner 產生 unsigned x64 NSIS installer。產物保留在該次 Actions run 的 Artifacts 14 天，不會自動建立 GitHub Release。

Build workflow 不需要 eBird API key，也不會保存 application data。它沒有 Developer ID、notarization 或 Windows publisher certificate，因此 GitHub Actions 能完成打包，但不會讓作業系統把 installer 視為受信任的 publisher。

## 資料與安全

- `.env`、API key、追蹤規則、通知與 taxonomy cache 不納入 Git。
- Electron 使用作業系統的 user-data 目錄保存追蹤資料。
- Electron renderer 啟用 context isolation、停用 Node integration，並透過最小化 preload bridge 接收桌面通知事件。
- Desktop App 的 eBird API key 不會放入查詢 URL、前端 bundle 或 localStorage。Search App 的 browser-owned key 只會在驗證成功後保存於目前 origin 的 localStorage，且不會進入 URL、bundle、response 或 Worker log。
- 使用本專案時應遵守 eBird API 與資料使用條款，並避免過度頻繁查詢。

## 專案結構

```text
electron/   Electron main process、preload、安全設定儲存
server/     HTTP API、eBird client、追蹤服務、domain 與 JSON storage
src/        React／TypeScript 前端
test/       Node test runner 自動化測試
integration/ 真實 eBird API 的 opt-in integration tests
build/      Electron app icon、entitlement 與 build resources
docs/       開發與架構文件
```

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動網站開發服務 |
| `npm run electron:dev` | 啟動 Electron 開發版 |
| `npm run typecheck` | TypeScript 型別檢查 |
| `npm test` | 執行自動化測試 |
| `npm run check` | 型別、測試及 production build |
| `npm run build:search` | 建置 Cloudflare Search App 靜態資產 |
| `npm run dev:cloudflare` | 在 port 7082 啟動本機 Cloudflare Search App preview |
| `npm run deploy:cloudflare` | 建置並發佈單一 Cloudflare Workers Static Assets deployment |
| `npm run test:worker` | 驗證 Search App Worker 的 request-to-response contract |
| `npm run test:search-bundle` | 確認 Search production bundle 不含 Desktop-only runtime code |
| `npm run test:integration` | 使用 fake key 驗證真實 eBird API 的拒絕路徑；沒有本機 key 時略過 valid path |
| `npm run test:integration:required` | 要求 `EBIRD_API_KEY` 的真實 eBird valid-path verification |
| `npm run test:browser` | 驗證 Search App API key gate 的瀏覽器可見流程 |
| `npm run check:all` | Desktop、Worker 與 Search App 完整檢查 |
| `npm run electron:pack` | 建立 macOS ad-hoc signed unpacked app |
| `npm run electron:build:mac` | 建立目前架構的 macOS ad-hoc signed DMG |
| `npm run electron:build:mac:all` | 建立 x64 與 arm64 macOS ad-hoc signed DMG |
| `npm run electron:build:win` | 建立 Windows x64 NSIS installer |

## 授權

本專案採用 [MIT License](LICENSE)。
