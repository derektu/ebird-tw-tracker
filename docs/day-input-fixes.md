# Search App 天數輸入修正

#54 對應 2026-11-13 的手機回報。鳥種搜尋與鳥點詳情都可用 Backspace 清空天數，再輸入新值。天數欄位、鳥種篩選與更新按鈕維持相同 44px 高度。

## 編輯值與查詢值

鳥種搜尋原本立即將輸入文字轉成數字，因此空字串變成 0。現在編輯值保留文字，搜尋表單以 required、1–30 範圍及整數 step 驗證，通過後才轉成數字交給搜尋流程。無效輸入不建立 Search Snapshot 或改變已提交的搜尋摘要。

鳥點詳情原本拒絕空字串，造成刪除後立即恢復原值。現在保留獨立的文字草稿；只有合法整數才更新既有數字模型，保留原本合法天數變動時的查詢行為。空白、0、31 或小數留在欄位中供修正，更新和重試都先檢查表單，不會用舊值悄悄送出。空結果文字仍使用數字模型的天數。

一般 API 回應不重設草稿。返回、開啟另一個鳥點及恢復原詳情時，依詳情身分與模型天數同步；新開鳥點仍預設 3 天。收藏保存、API key、上游 API 與 Search Baseline 契約不變。

WebKit 的原生 select 原本只有 21px，即使設定 min-height。篩選列現在明確使用 44px height 與 border-box，保留原生選單箭頭及操作。

## 驗證

新增 6 個 headless browser 回歸。Backspace、空白與無效值不送出、重試驗證、待處理回應不清掉空白草稿、不同地點恢復預設，以及 320、390、402px 篩選列幾何均有涵蓋。修正前 Chromium 的兩個 Backspace 測試失敗，實際值分別為 0 和 3；WebKit 的前五項測試全部失敗，三個控制的高度為 44、21、44。修正後相關回歸通過。

完整檢查各階段使用隔離 Worker 7309 執行，保留原本 7082 與手機 7310 預覽。型別、兩版 build、121 Node、16 Worker、4 bundle、81 Search browser 及 54 Desktop Web tests 通過。額外 6 項 headless WebKit 回歸通過。所有自動圖磚均使用本機 PNG，API 使用受控回應，沒有啟動 Electron 或可見視窗。

額外嘗試整份鳥點詳情 WebKit suite 時，既有「返回後 opener 按鈕保持焦點」斷言失敗；在修正前的 `7558b5e` 也重現同一失敗。此項另由 [#55](https://github.com/derektu/ebird-tw-tracker/issues/55) 追蹤，尚未判定為實機產品缺陷。本票沒有修改返回焦點行為，也不將整份 WebKit suite 記為通過。執行 logs 位於 ticket-54 的 `.local/issue-54/`。

這些是 Chromium 與 WebKit 的 headless 證據，實際 iPhone 鍵盤與原生選單仍需使用者於更新後複驗。
