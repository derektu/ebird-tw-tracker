import { useRef, useState } from "react";
import type { RefObject } from "react";
import type { SearchBirdSpots } from "./useSearchBirdSpots";

export type SheetState = "half" | "expanded" | "collapsed";
export function SearchBirdSpotDetail({ model, sheetState, onBack, onToggleSheet, onCollapse, headingRef }: {
  model: SearchBirdSpots;
  sheetState: SheetState;
  onBack(): void;
  onToggleSheet(): void;
  onCollapse(): void;
  headingRef: RefObject<HTMLButtonElement | null>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  if (model.view.kind !== "detail" || !model.detailSpot) return null;
  const { view, recent } = model;
  const spot = model.detailSpot, favorite = model.saved(spot.locId);
  const editing = drafts[spot.locId] !== undefined;
  const rows = recent.kind === "ready" ? recent.response.observations.filter(row => !model.onlySpecies || row.speciesCode === view.species?.speciesCode) : [];
  const save = async () => {
    const submitted = drafts[spot.locId];
    if (submitted === undefined || !(await model.saveNote(spot, submitted))) return;
    if (draftsRef.current[spot.locId] === submitted) setDrafts(previous => { const next = { ...previous }; delete next[spot.locId]; return next; });
  };
  return <aside className="side search-spot-detail" data-sheet-state={sheetState} aria-label="鳥點詳情">
    <header className="search-spot-heading">
      <button ref={headingRef} className="spot-icon-button" aria-label="返回搜尋結果" onClick={onBack}>←</button>
      <strong title={favorite?.alias || spot.locName || spot.locId}>{favorite?.alias || spot.locName || spot.locId}</strong>
      <button className="spot-icon-button" aria-label={favorite ? "取消收藏鳥點" : "收藏鳥點"} aria-pressed={Boolean(favorite)} disabled={!model.available || model.pending.has(spot.locId)} onClick={() => void model.toggle(spot)}>{favorite ? "★" : "☆"}</button>
      <button className="spot-icon-button mobile-spot-sheet-control" aria-label={sheetState === "expanded" ? "縮小鳥點詳情" : "展開鳥點詳情"} aria-pressed={sheetState === "expanded"} onClick={onToggleSheet}>{sheetState === "expanded" ? "↙" : "↗"}</button>
      <button className="spot-icon-button mobile-spot-sheet-control" aria-label="收合鳥點詳情" onClick={onCollapse}>×</button>
    </header>
    <div className="search-spot-context">{spot.locationType === "hotspot" ? "公共熱點" : spot.locationType === "personal" ? "個人地點" : "地點類型未知"} · {spot.locId}{spot.lat === null && " · 無座標"}</div>
    <div className="search-spot-query">
      <label>近 <input aria-label="鳥點最近天數" type="number" min={1} max={30} value={model.days} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 30) model.setDays(value); }} /> 天</label>
      {view.species && <select aria-label="鳥點鳥種篩選" value={model.onlySpecies ? "original" : "all"} onChange={event => model.setOnlySpecies(event.target.value === "original")}><option value="all">全部鳥種</option><option value="original">只看{view.species.comName}</option></select>}
      <button className="search-app-secondary" onClick={model.refresh}>更新</button>
    </div>
    <p className="search-spot-hint">各鳥種最新一筆{recent.kind === "ready" && ` · ${new Date(recent.response.generatedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })} 更新`}</p>
    <div className="search-spot-scroll">
      {recent.kind === "loading" && <p role="status">正在取得鳥點近期紀錄…</p>}
      {recent.kind === "error" && <div role="alert"><p>{recent.message}</p><button className="search-app-secondary" onClick={model.refresh}>重試查詢</button></div>}
      {recent.kind === "ready" && !rows.length && <p>最近 {model.days} 天沒有可取得的公開紀錄。這不代表此地沒有鳥；收藏與筆記仍會保留。</p>}
      {rows.map(row => <article className="search-spot-row" key={`${row.speciesCode}:${row.subId}`}>
        <a className="search-spot-species-link" href={`https://ebird.org/species/${encodeURIComponent(row.speciesCode)}`} target="_blank" rel="noreferrer"><strong>{row.comName || row.sciName || row.speciesCode} ↗</strong><span>{row.obsDt}</span></a>
        <a className="search-spot-checklist-link" href={`https://ebird.org/checklist/${encodeURIComponent(row.subId)}`} target="_blank" rel="noreferrer"><span>{row.howMany === null ? "數量未知" : `${row.howMany} 隻`}</span><span>Checklist ↗</span></a>
      </article>)}
      <section className="search-spot-notes"><strong>我的筆記</strong>
        {editing ? <form onSubmit={event => { event.preventDefault(); void save(); }}>
          <label htmlFor="search-spot-note" className="screen-reader-status">鳥點筆記</label>
          <textarea id="search-spot-note" ref={textareaRef} value={drafts[spot.locId]} onChange={event => { const value = event.target.value; setDrafts(previous => ({ ...previous, [spot.locId]: value })); }} />
          <p className="search-spot-hint">返回後保留未儲存的筆記，重新整理網頁前請儲存。</p>
          <div className="search-spot-note-actions"><button className="search-app-primary" disabled={!model.available || model.pending.has(spot.locId)}>儲存筆記{favorite ? "" : "並收藏"}</button><button type="button" className="search-app-secondary" onClick={() => setDrafts(previous => { const next = { ...previous }; delete next[spot.locId]; return next; })}>取消編輯</button></div>
        </form> : <><p>{favorite?.note || "尚未加入筆記"}</p><button className="search-app-secondary" disabled={!model.available} onClick={() => { setDrafts(previous => ({ ...previous, [spot.locId]: favorite?.note || "" })); window.requestAnimationFrame(() => textareaRef.current?.focus()); }}>編輯筆記</button></>}
        {spot.lat !== null && spot.lng !== null && <a className="search-app-secondary spot-maps-link" href={`https://www.google.com/maps?q=${spot.lat},${spot.lng}`} target="_blank" rel="noreferrer">Google Maps ↗</a>}
      </section>
    </div>
  </aside>;
}

export function SearchBirdSpotMessages({ model }: { model: SearchBirdSpots }) {
  return <div className="search-spot-messages">
    {model.collection.kind === "error" && <div role="alert">{model.collection.message} <button className="search-app-secondary" onClick={() => void model.loadCollection()}>重試讀取收藏</button></div>}
    {model.actionError && <div role="alert">{model.actionError} <button className="search-app-secondary" onClick={model.dismissError}>關閉訊息</button></div>}
    {(model.notice || model.undo) && <div><span role="status">{model.notice || "已取消收藏"}</span>{model.undo && <button className="search-app-secondary" disabled={model.pending.has(model.undo.locId)} onClick={() => void model.restore()}>復原收藏</button>}</div>}
  </div>;
}
