# eBird Taiwan Tracker

本領域涵蓋 eBird Taiwan Tracker 提供的個人鳥類觀察搜尋與背景監測體驗。

## Language

**Tracker**:
針對單一鳥種建立的背景監測規則。每個鳥種最多存在一個 Tracker。
_Avoid_: Subscription, Watch

**Search Scope**:
一組可互相比較的手動搜尋條件，由鳥種與最近天數組成。
_Avoid_: Search Key, Query Scope

**Search Snapshot**:
特定 Search Scope 的一次成功搜尋所留下的 observation identity 集合。
_Avoid_: Search History, Seen List

**Search Baseline**:
同一 Search Scope 最近一次成功提交的 Search Snapshot；下一次搜尋以它作為比較基準。
_Avoid_: Previous Results, Search Cache

**Search Discovery**:
本次手動搜尋中存在、但 Search Baseline 中不存在的 checklist identity。它只描述相鄰兩次可比較搜尋的差異，與 Tracker 的背景通知事件無關。
_Avoid_: New Observation, Unseen Observation
