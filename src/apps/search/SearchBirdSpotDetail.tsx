import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { SearchBirdSpots } from "./useSearchBirdSpots";

import type { SpotEditor } from "./useSpotEditor";

export type SheetState = "half" | "expanded" | "collapsed";
export function SearchBirdSpotDetail({ model, editor, sheetState, onBack, onToggleSheet, onCollapse, headingRef, listRef }: {
  model: SearchBirdSpots;
  editor: SpotEditor;
  sheetState: SheetState;
  onBack(): void;
  onToggleSheet(): void;
  onCollapse(): void;
  listRef: RefObject<HTMLDivElement | null>;
  headingRef: RefObject<HTMLButtonElement | null>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryFormRef = useRef<HTMLFormElement>(null);
  const [daysDraft, setDaysDraft] = useState(String(model.days));
  useEffect(() => setDaysDraft(String(model.days)), [model.days, model.view]);
  const refresh = () => {
    if (queryFormRef.current?.reportValidity()) model.refresh();
  };
  if (model.view.kind !== "detail" || !model.detailSpot) return null;
  const { view, recent } = model;
  const spot = model.detailSpot, favorite = model.saved(spot.locId);
  const draft = editor.draft?.kind === "note" && editor.draft.spot.locId === spot.locId ? editor.draft : null;
  const rows = recent.kind === "ready" ? recent.response.observations.filter(row => !model.onlySpecies || row.speciesCode === view.species?.speciesCode) : [];
  return <aside className="side search-spot-detail" data-sheet-state={sheetState} aria-label="鳥點詳情">
    <header className="search-spot-heading">
      <button ref={headingRef} className="spot-icon-button" aria-label={view.origin.kind.startsWith("saved") ? "返回我的鳥點" : "返回搜尋結果"} onClick={onBack}>←</button>
      <strong title={favorite?.alias || spot.locName || spot.locId}>{favorite?.alias || spot.locName || spot.locId}</strong>
      <button className="spot-icon-button" aria-label={favorite ? "取消收藏鳥點" : "收藏鳥點"} aria-pressed={Boolean(favorite)} disabled={!model.available || model.pending.has(spot.locId)} onClick={() => editor.request("remove", () => void model.toggle(spot, Boolean(favorite)))}>{favorite ? "★" : "☆"}</button>
      <button className="spot-icon-button mobile-spot-sheet-control" aria-label={sheetState === "expanded" ? "縮小鳥點詳情" : "展開鳥點詳情"} aria-pressed={sheetState === "expanded"} onClick={onToggleSheet}>{sheetState === "expanded" ? "↙" : "↗"}</button>
      <button className="spot-icon-button mobile-spot-sheet-control" aria-label="收合鳥點詳情" onClick={onCollapse}>×</button>
    </header>
    <div className="search-spot-context">{spot.locationType === "hotspot" ? "公共熱點" : spot.locationType === "personal" ? "個人地點" : "地點類型未知"} · {spot.locId}{spot.lat === null && " · 無座標"}</div>
    <form className="search-spot-query" ref={queryFormRef} onSubmit={event => { event.preventDefault(); refresh(); }}>
      <label>近 <input aria-label="鳥點最近天數" type="number" min={1} max={30} step={1} required value={daysDraft} onChange={event => {
        setDaysDraft(event.target.value);
        if (event.target.validity.valid) model.setDays(event.target.valueAsNumber);
      }} /> 天</label>
      {view.species && <select aria-label="鳥點鳥種篩選" value={model.onlySpecies ? "original" : "all"} onChange={event => model.setOnlySpecies(event.target.value === "original")}><option value="all">全部鳥種</option><option value="original">只看{view.species.comName}</option></select>}
      <button className="search-app-secondary" type="submit">更新</button>
    </form>
    <p className="search-spot-hint">各鳥種最新一筆{recent.kind === "ready" && ` · ${new Date(recent.response.generatedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })} 更新`}</p>
    <div className="search-spot-scroll" ref={listRef}>
      {recent.kind === "loading" && <p role="status">正在取得鳥點近期紀錄…</p>}
      {recent.kind === "error" && <div role="alert"><p>{recent.message}</p><button className="search-app-secondary" onClick={refresh}>重試查詢</button></div>}
      {recent.kind === "ready" && !rows.length && <p>最近 {model.days} 天沒有可取得的公開紀錄。這不代表此地沒有鳥；收藏與筆記仍會保留。</p>}
      {rows.map(row => <article className="search-spot-row" key={`${row.speciesCode}:${row.subId}`}>
        <a className="search-spot-species-link" href={`https://ebird.org/species/${encodeURIComponent(row.speciesCode)}`} target="_blank" rel="noreferrer"><strong>{row.comName || row.sciName || row.speciesCode} ↗</strong><span>{row.obsDt}</span></a>
        <a className="search-spot-checklist-link" href={`https://ebird.org/checklist/${encodeURIComponent(row.subId)}`} target="_blank" rel="noreferrer"><span>{row.howMany === null ? "數量未知" : `${row.howMany} 隻`}</span><span>Checklist ↗</span></a>
      </article>)}
      <section className="search-spot-notes"><strong>我的筆記</strong>
        {draft ? <form onSubmit={event => { event.preventDefault(); void editor.submit(() => {}); }}>
          <label htmlFor="search-spot-note" className="screen-reader-status">鳥點筆記</label>
          <textarea id="search-spot-note" ref={textareaRef} value={draft.fields.note} onChange={event => editor.change({ note: event.target.value })} />
          <div className="search-spot-note-actions"><button className="search-app-primary" disabled={!model.available || model.pending.has(spot.locId)}>儲存筆記{favorite ? "" : "並收藏"}</button><button type="button" className="search-app-secondary" onClick={() => editor.request("cancel-edit", () => {})}>取消編輯</button></div>
        </form> : <p>{favorite?.note || "尚未加入筆記"}</p>}
        <div className="search-spot-note-actions">
          {!draft && <button className="search-app-secondary" disabled={!model.available} onClick={() => { editor.begin("note", spot); window.requestAnimationFrame(() => textareaRef.current?.focus()); }}>編輯筆記</button>}
          {spot.lat !== null && spot.lng !== null && <a className="search-app-secondary" href={`https://www.google.com/maps?q=${spot.lat},${spot.lng}`} target="_blank" rel="noreferrer">Google Maps ↗</a>}
        </div>
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
