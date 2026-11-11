import { useEffect, useRef, useState } from "react";
import type { BirdSpot } from "../../types/domain";
import type { DesktopBirdSpots } from "./useDesktopBirdSpots";
import { Dialog } from "./Dialog";

export const spotName = (spot: BirdSpot) => spot.locName || spot.locId;
const locationType = (spot: BirdSpot) => spot.locationType === "hotspot" ? "公共熱點" : spot.locationType === "personal" ? "個人地點" : "地點類型未知";
export function BirdSpotPanel({ model }: { model: DesktopBirdSpots }) {
  const [drafts, setDrafts] = useState<Record<string, { value: string; baseline: string; generation: number }>>({});
  const draftRef = useRef(drafts);
  draftRef.current = drafts;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editRevision = useRef(0);
  const { view, recent } = model;
  const locId = view.kind === "detail" ? view.spot.locId : null;
  const editor = locId ? drafts[locId] : undefined;
  const editing = editor !== undefined;
  useEffect(() => {
    if (!editing) return;
    textareaRef.current?.focus({ preventScroll: true });
    textareaRef.current?.scrollIntoView({ block: "nearest" });
  }, [editing, locId]);
  if (view.kind !== "detail") return null;
  const spot = model.detailSpot || view.spot, favorite = model.saved(spot.locId);
  const rows = recent.kind === "ready" ? recent.response.observations.filter(o => !model.onlySpecies || o.speciesCode === view.species?.speciesCode) : [];
  const beginEditing = () => {
    if (!editor) {
      const generation = ++editRevision.current;
      setDrafts(previous => ({ ...previous, [spot.locId]: { value: favorite?.note || "", baseline: favorite?.note || "", generation } }));
    }
    else { textareaRef.current?.focus({ preventScroll: true }); textareaRef.current?.scrollIntoView({ block: "nearest" }); }
  };
  const saveDraft = async (): Promise<boolean> => {
    if (!editor) return true;
    const submitted = { ...editor }, id = spot.locId;
    const ok = await model.saveNote(spot, submitted.value);
    if (!ok) return false;
    const unchanged = draftRef.current[spot.locId]?.generation === submitted.generation;
      setDrafts(previous => {
        const current = previous[id];
        if (!current) return previous;
        const next = { ...previous };
        if (current.generation === submitted.generation) delete next[id];
        else next[id] = { ...current, baseline: submitted.value };
        return next;
      });
    return unchanged;
  };
  const discard = () => setDrafts(previous => { const next = { ...previous }; delete next[spot.locId]; return next; });
  model.editor.current = { key: `detail:${spot.locId}`, dirty: Boolean(editor && editor.value !== editor.baseline), save: saveDraft, discard };
  return <aside className="side bird-spot-panel" aria-label="鳥點詳情">
    <header className="bird-spot-heading">
      <button className="text-btn bird-spot-back" onClick={model.back}>← {view.origin === "saved" ? "返回我的鳥點" : "返回搜尋結果"}</button>
      <p className="bird-spot-eyebrow">鳥點詳情</p>
      <h2>{favorite?.alias || spotName(spot)}</h2>
      {favorite?.alias && <p className="bird-spot-meta">{spotName(spot)}</p>}
      <p className="bird-spot-meta">{locationType(spot)} · {spot.locId}</p>
      <div className="bird-spot-actions">
        <button className="primary" disabled={!model.available || model.pending.has(spot.locId)} onClick={() => model.requestLeave({ kind: "remove", run: () => { void model.toggle(spot); } })}>{favorite ? "★ 已收藏" : "☆ 收藏鳥點"}</button>
        <button className="secondary" disabled={!model.available} onClick={beginEditing}>編輯筆記</button>
        {spot.lat !== null && spot.lng !== null && <a className="selected-link" href={`https://www.google.com/maps?q=${spot.lat},${spot.lng}`} target="_blank" rel="noreferrer">Google Maps ↗</a>}
      </div>
    </header>
    <section className="bird-spot-controls">
      <div className="bird-spot-query-row"><strong>近期鳥種</strong><label>最近 <input aria-label="鳥點最近天數" type="number" min={1} max={30} value={model.days} onChange={e => { const days = Number(e.target.value); if (Number.isInteger(days) && days >= 1 && days <= 30) model.setDays(days); }} /> 天</label><button className="secondary" onClick={model.refresh}>更新</button></div>
      {view.species && <div className="bird-spot-filter" role="group" aria-label="鳥點鳥種篩選"><button className="secondary" aria-pressed={!model.onlySpecies} onClick={() => model.setOnlySpecies(false)}>全部鳥種</button><button className="secondary" aria-pressed={model.onlySpecies} onClick={() => model.setOnlySpecies(true)}>只看{view.species.comName}</button></div>}
      <p className="bird-spot-meta">各鳥種顯示期間內最新一筆，數量為該筆觀察數量。</p>
      {recent.kind === "ready" && <p className="bird-spot-meta">{rows.length} 個鳥種 · 更新於 {new Date(recent.response.generatedAt).toLocaleString("zh-TW")}</p>}
    </section>
    <div className="bird-spot-scroll">
      {recent.kind === "loading" && <p className="empty">正在取得鳥點近期紀錄…</p>}
      {recent.kind === "error" && <div className="bird-spot-error" role="alert"><p>{recent.message}</p><button className="secondary" onClick={model.refresh}>重試查詢</button></div>}
      {recent.kind === "ready" && !rows.length && <div className="empty">最近 {model.days} 天沒有可取得的公開紀錄。這不代表此地沒有鳥；收藏與筆記仍會保留。</div>}
      {rows.map(o => <article className="bird-spot-observation" key={`${o.speciesCode}:${o.subId}`}><div><strong><a href={`https://ebird.org/species/${encodeURIComponent(o.speciesCode)}`} target="_blank" rel="noreferrer">{o.comName || o.sciName || o.speciesCode} ↗</a></strong><span>{o.howMany === null ? "數量未知" : `${o.howMany} 隻`}</span></div><div className="bird-spot-meta"><span>{o.obsDt}</span><a href={`https://ebird.org/checklist/${encodeURIComponent(o.subId)}`} target="_blank" rel="noreferrer">Checklist ↗</a></div></article>)}
      <section className="bird-spot-notes"><strong>我的筆記</strong>{editing ? <form onSubmit={e => { e.preventDefault(); saveDraft(); }}><label className="screen-reader-status" htmlFor="bird-spot-note">鳥點筆記</label><textarea id="bird-spot-note" ref={textareaRef} value={editor.value} onChange={e => { const value = e.target.value, generation = ++editRevision.current; setDrafts(previous => { const current = previous[spot.locId]; return current ? { ...previous, [spot.locId]: { ...current, value, generation } } : previous; }); }} /><div className="bird-spot-actions"><button className="primary" disabled={model.pending.has(spot.locId)}>儲存筆記{favorite ? "" : "並收藏"}</button><button type="button" className="secondary" onClick={() => model.requestLeave({ kind: "cancel-edit", run: discard })}>取消編輯</button></div></form> : <p>{favorite?.note || "尚未加入筆記"}</p>}</section>
    </div>
  </aside>;
}

export function BirdSpotLeaveDialog({ model }: { model: DesktopBirdSpots }) {
  if (model.leave.kind === "idle") return null;
  const saving = model.leave.kind === "saving";
  return <Dialog titleId="bird-spot-leave-title" className="bird-spots-leave" onClose={() => { if (!saving) void model.resolveLeave("continue"); }}><header><h2 id="bird-spot-leave-title">尚未儲存的修改</h2></header><div className="bird-spots-leave-body"><p>先儲存修改、捨棄修改，或繼續編輯。</p>{model.actionError && <p role="alert">{model.actionError}</p>}<div className="bird-spot-actions"><button className="primary" disabled={saving} onClick={() => void model.resolveLeave("save")}>{saving ? "儲存中…" : "儲存並繼續"}</button><button className="secondary" disabled={saving} onClick={() => void model.resolveLeave("discard")}>捨棄修改</button><button className="secondary" disabled={saving} onClick={() => void model.resolveLeave("continue")}>繼續編輯</button></div></div></Dialog>;
}

export function BirdSpotMessages({ model }: { model: DesktopBirdSpots }) {
  return <>{model.collection.kind === "error" && <div className="bird-spot-storage-error" role="alert">{model.collection.message} <button className="secondary" onClick={() => void model.loadCollection()}>重試讀取收藏</button></div>}{model.actionError && <div className="bird-spot-action-error" role="alert">{model.actionError}<button className="text-btn" onClick={model.dismissError}>關閉訊息</button></div>}{(model.notice || model.undo) && <div className="bird-spot-toast"><span role="status">{model.notice || "已取消收藏"}</span>{model.undo && <button className="secondary" disabled={model.pending.has(model.undo.locId)} onClick={() => void model.restore()}>復原收藏</button>}</div>}</>;
}
