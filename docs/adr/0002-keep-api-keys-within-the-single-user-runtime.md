# API key 留在單一使用者的執行環境

eBird Taiwan Tracker 是 personal、single-user application：原始碼 repository 可以公開，但執行中的 instance 不是託管的多人服務。本機 Node server 負責呼叫 eBird API；瀏覽器介面不會讀回或持久保存已設定的 key；環境設定優先於使用者設定，而 Electron 透過作業系統的安全儲存保存使用者提供的 key。共享帳號、租戶隔離與公開託管服務不在本專案範圍內。
