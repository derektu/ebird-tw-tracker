# Search App 使用瀏覽器擁有的 API key

自行部署的 Cloudflare Search App 要求每個瀏覽器在首次使用時提供自己的 eBird API key，驗證成功後保存在該 origin 的 `localStorage`；無狀態 Worker 只在 allowlisted request 中暫時轉送 key，不保存部署者共用 key 或使用者 key。這個邊界避免公開 deployment 被掃描後消耗部署者的 eBird 憑證，代價是 key 可能被同源 JavaScript、XSS 或具有頁面權限的 extension 讀取，而且使用者必須信任 deployment 的 Worker；因此 Search App 只適合自行部署或完全可信的 deployment。
