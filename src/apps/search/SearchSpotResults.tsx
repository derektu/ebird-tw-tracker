import { useMemo, type RefObject } from "react";
import { searchBirdSpots } from "../../domain/bird-spot-directory.mjs";
import type { BirdSpot } from "../../types/domain";
import type { SheetState } from "./SearchBirdSpotDetail";
import type { SearchBirdSpots } from "./useSearchBirdSpots";
import type { SpotDirectory } from "./useSpotDirectory";

export function SearchSpotResults({ directory, model, hidden, sheet, onOpen, onToggleSheet, onCollapse, handleRef, listRef }: {
  directory: SpotDirectory;
  model: SearchBirdSpots;
  hidden: boolean;
  sheet: SheetState;
  onOpen(spot: BirdSpot): void;
  onToggleSheet(): void;
  onCollapse(): void;
  handleRef: RefObject<HTMLButtonElement | null>;
  listRef: RefObject<HTMLDivElement | null>;
}) {
  const { result } = directory;
  const snapshot = result.kind === "ready" ? result.directory : null;
  const query = result.kind === "idle" ? "" : result.query;
  const rows = useMemo(() => searchBirdSpots(snapshot?.spots ?? [], model.collection.kind === "ready" ? model.collection.spots : [], query), [snapshot, model.collection, query]);
  if (result.kind === "idle") return null;
  return <aside className="side spot-name-results" aria-label="鳥點搜尋結果" data-sheet-state={sheet} hidden={hidden}>
    <div className="bottom-sheet-controls">
      <span className="bottom-sheet-result-summary">鳥點 {rows.length} 筆</span>
      <button className="sheet-handle" ref={handleRef} aria-pressed={sheet === "expanded"} onClick={onToggleSheet}>{sheet === "expanded" ? "縮小結果清單" : "展開結果清單"}</button>
      <button className="sheet-collapse-button" aria-label="收合結果清單" onClick={onCollapse}>×</button>
    </div>
    <div className="spot-name-rows" ref={listRef}>
      <p className="spot-directory-status" role="status">
        {result.kind === "loading" ? "正在讀取公共熱點目錄，目前顯示本機收藏。" :
          snapshot?.status === "unavailable" ? "公共熱點目錄無法取得，目前只搜尋本機收藏。" :
          snapshot?.status === "stale" ? "公共熱點目錄更新失敗，搜尋範圍為上次目錄與本機收藏。" : "搜尋範圍為公共熱點與本機收藏。"}
        {snapshot?.updatedAt && <time dateTime={snapshot.updatedAt}>目錄更新於 {new Date(snapshot.updatedAt).toLocaleString("zh-TW")}</time>}
      </p>
      {!rows.length && result.kind === "ready" && <p>沒有符合條件的鳥點。</p>}
      {rows.map(spot => <div className="spot-list-row" key={spot.locId}>
        <button className="spot-row-name" onClick={() => onOpen(spot)}>
          <strong>{spot.alias || spot.locName || spot.locId}</strong>
          <small>{[spot.alias && spot.locName, spot.subnational2Code || spot.subnational1Code || spot.countryCode, spot.locationType === "hotspot" ? "公共熱點" : spot.locationType === "personal" ? "個人地點" : "地點類型未知", spot.locId].filter(Boolean).join(" · ")}</small>
        </button>
        <button className="spot-icon-button" aria-label={`${spot.saved ? "取消收藏" : "收藏"} ${spot.locName || spot.locId}`} aria-pressed={spot.saved} disabled={!model.available || model.pending.has(spot.locId)} onClick={() => void model.toggle(spot)}>{spot.saved ? "★" : "☆"}</button>
      </div>)}
    </div>
  </aside>;
}
