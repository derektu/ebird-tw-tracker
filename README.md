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

瀏覽器不會直接持有 eBird API key。Node server 負責呼叫 eBird API、解析鳥種、保存追蹤規則、執行排程及產生通知。Electron 只提供桌面視窗、Menu Bar、原生通知與安全設定儲存，不另外實作業務邏輯。

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

## Production web build

```bash
npm run build
npm start
```

前端產物位於 `dist/`。Node server 同時提供 production 靜態檔案與 `/api`。

## Electron build

所有 Electron 產物位於 `release/`。

### macOS 未簽章開發目錄

```bash
npm run electron:pack
```

這個指令建立 unpacked `.app`，並停用 certificate auto-discovery，適合本機功能驗證。

### macOS ad-hoc 簽章

```bash
npm run electron:build:mac:adhoc
```

ad-hoc 簽章不需要 Apple Developer 帳號。它使用本機臨時身分簽署並套用 Electron 執行所需的 entitlement，適合本機測試或內部開發。

ad-hoc 簽章不是受信任的公開發佈簽章：

- 沒有 Apple Team ID。
- 不能送交 Apple notarization。
- 其他 Mac 仍可能顯示 Gatekeeper 警告或要求使用者手動允許。
- 自建 root certificate 或一般 self-signed certificate 不會被 macOS Gatekeeper 視為 Developer ID。

### macOS 正式 DMG

```bash
npm run electron:build:mac
```

對外散佈需要 Apple Developer Program 的 `Developer ID Application` certificate，以及 Apple notarization。

1. 加入 [Apple Developer Program](https://developer.apple.com/programs/)。
2. 從 Xcode 或 Apple Developer 的 Certificates, Identifiers & Profiles 建立 `Developer ID Application` certificate。
3. 將 certificate 安裝到登入 Keychain，並確認系統可找到簽章身分：

   ```bash
   security find-identity -v -p codesigning
   ```

4. 設定 notarization credentials。electron-builder 支援 App Store Connect API key：

   ```bash
   export APPLE_API_KEY=/absolute/path/to/AuthKey_XXXXXXXXXX.p8
   export APPLE_API_KEY_ID=XXXXXXXXXX
   export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   npm run electron:build:mac
   ```

   CI 也可以使用匯出的 `.p12` certificate：

   ```bash
   export CSC_LINK=/absolute/path/to/developer-id-application.p12
   export CSC_KEY_PASSWORD='certificate-password'
   ```

5. 驗證產物：

   ```bash
   codesign --verify --deep --strict --verbose=2 "release/mac-arm64/eBird Taiwan Tracker.app"
   spctl --assess --type execute --verbose=4 "release/mac-arm64/eBird Taiwan Tracker.app"
   ```

Certificate、`.p12`、`.p8` 及密碼只能放在 Keychain 或 CI secrets，不可提交到 Git。

更多細節請參考 [Apple Developer ID](https://developer.apple.com/developer-id/)、[Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) 與 [electron-builder macOS code signing](https://www.electron.build/docs/features/code-signing/code-signing-mac/)。

### Windows x64 NSIS installer

```bash
npm run electron:build:win
```

這個指令建立 Windows x64 NSIS installer。未提供 certificate 時仍可產生 installer，但 Windows 會顯示 Unknown publisher，SmartScreen 也可能阻擋或警告。

Windows 正式簽章可使用 CA 核發的 OV／EV code-signing certificate，或 Azure Trusted Signing。使用可匯出的 `.pfx` certificate 時設定：

```powershell
$env:WIN_CSC_LINK = "C:\secrets\windows-code-signing.pfx"
$env:WIN_CSC_KEY_PASSWORD = "certificate-password"
npm run electron:build:win
```

Windows installer 最可靠的建置環境是 Windows 本機或 GitHub Actions `windows-latest`。未包含 native Node module 時，electron-builder 通常也能從 macOS cross-build Windows 產物，但正式簽章與安裝測試應在 Windows 執行。

Windows build 設定使用 assisted NSIS installer，允許使用者選擇安裝目錄，並建立桌面及 Start Menu 捷徑。相關選項請參考 [electron-builder Windows](https://www.electron.build/docs/win/) 與 [NSIS 文件](https://www.electron.build/docs/nsis/)。

## 資料與安全

- `.env`、API key、追蹤規則、通知與 taxonomy cache 不納入 Git。
- Electron 使用作業系統的 user-data 目錄保存追蹤資料。
- Electron renderer 啟用 context isolation、停用 Node integration，並透過最小化 preload bridge 接收桌面通知事件。
- eBird API key 不會放入查詢 URL、前端 bundle 或 localStorage。
- 使用本專案時應遵守 eBird API 與資料使用條款，並避免過度頻繁查詢。

## 專案結構

```text
electron/   Electron main process、preload、安全設定儲存
server/     HTTP API、eBird client、追蹤服務、domain 與 JSON storage
src/        React／TypeScript 前端
test/       Node test runner 自動化測試
build/      Electron build entitlement 與後續 build resources
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
| `npm run electron:pack` | 建立 macOS 未簽章 unpacked app |
| `npm run electron:build:mac:adhoc` | 建立 macOS ad-hoc DMG |
| `npm run electron:build:mac` | 建立 macOS 正式 DMG；有憑證時簽章與 notarize |
| `npm run electron:build:win` | 建立 Windows x64 NSIS installer |

## 授權

本專案採用 [MIT License](LICENSE)。
