import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { searchBirdSpots } from "../../domain/bird-spot-directory.mjs";
import { sortSavedBirdSpots } from "../../domain/saved-bird-spots.mjs";
import { Dialog } from "../../features/bird-spots/Dialog";
import type { SavedBirdSpot, SavedBirdSpotSort } from "../../types/domain";
import type { ManagerView, SearchBirdSpots } from "./useSearchBirdSpots";
import type { SpotEditor } from "./useSpotEditor";

export function SpotLeaveDialog({ editor, error }: { editor: SpotEditor; error: string }) {
  if (editor.leave.kind === "idle") return null;
  const saving = editor.leave.kind === "saving";
  return <Dialog titleId="spot-leave-title" className="search-leave" onClose={() => void editor.resolveLeave("continue")}>
    <h2 id="spot-leave-title">儲存變更？</h2>
    {error && <p role="alert">{error}</p>}
    <div className="spot-leave-actions">
      <button className="search-app-primary" disabled={saving} onClick={() => void editor.resolveLeave("save")}>儲存</button>
      <button className="search-app-secondary" disabled={saving} onClick={() => void editor.resolveLeave("discard")}>捨棄</button>
      <button className="search-app-secondary" disabled={saving} onClick={() => void editor.resolveLeave("continue")}>繼續編輯</button>
    </div>
  </Dialog>;
}

export function SearchSpotManager({ model, editor, view, hidden, onClose, onRecent, headerRef }: {
  model: SearchBirdSpots;
  editor: SpotEditor;
  view: ManagerView;
  hidden: boolean;
  onClose(): void;
  onRecent(spot: SavedBirdSpot, origin: ManagerView, opener: HTMLElement): void;
  headerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SavedBirdSpotSort>("pinned");
  const [selected, setSelected] = useState("");
  const [menu, setMenu] = useState(false);
  const lastEditButton = useRef<HTMLButtonElement | null>(null);
  const fieldScroll = useRef(new Map<string, number>());
  const fieldsNode = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLElement>(null);
  const aliasInput = useRef<HTMLInputElement | null>(null);
  const spots = model.collection.kind === "ready" ? model.collection.spots : [];
  const matches = new Set(searchBirdSpots([], spots, query).map(spot => spot.locId));
  const rows = sortSavedBirdSpots(spots.filter(spot => matches.has(spot.locId)), sort);
  const editing = view.kind === "saved-edit";
  const draft = editor.draft?.kind === "metadata" ? editor.draft : null;
  const editingId = draft?.spot.locId;
  useLayoutEffect(() => {
    if (!editingId) return;
    if (fieldsNode.current) fieldsNode.current.scrollTop = fieldScroll.current.get(editingId) ?? 0;
    aliasInput.current?.focus({ preventScroll: true });
  }, [editingId]);
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const workspace = region.current?.parentElement;
    if (!viewport || !workspace || hidden) return;
    let frame = 0;
    const revealField = () => {
      const fields = fieldsNode.current;
      const focused = document.activeElement;
      if (!fields || !(focused instanceof HTMLElement) || !fields.contains(focused)) return;
      const area = fields.getBoundingClientRect();
      const field = focused.getBoundingClientRect();
      if (field.bottom > area.bottom) fields.scrollTop += field.bottom - area.bottom + 8;
      if (field.top < area.top) fields.scrollTop -= area.top - field.top + 8;
    };
    const fitViewport = () => {
      workspace.style.setProperty("--spot-viewport-height", viewport.height + "px");
      workspace.toggleAttribute("data-compact-viewport", viewport.height < 480);
      workspace.style.setProperty("--spot-viewport-top", viewport.offsetTop + "px");
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(revealField);
    };
    fitViewport();
    viewport.addEventListener("resize", fitViewport);
    viewport.addEventListener("scroll", fitViewport);
    workspace.addEventListener("focusin", fitViewport);
    return () => {
      viewport.removeEventListener("resize", fitViewport);
      viewport.removeEventListener("scroll", fitViewport);
      workspace.removeEventListener("focusin", fitViewport);
      cancelAnimationFrame(frame);
      workspace.removeAttribute("data-compact-viewport");
      workspace.style.removeProperty("--spot-viewport-height");
      workspace.style.removeProperty("--spot-viewport-top");
    };
  }, [hidden]);
  const list = () => {
    model.navigate({ kind: "saved-list" });
    requestAnimationFrame(() => (lastEditButton.current?.isConnected ? lastEditButton.current : headerRef.current)?.focus({ preventScroll: true }));
  };
  const edit = (spot: SavedBirdSpot, button: HTMLButtonElement) => editor.request("select", () => {
    lastEditButton.current = button;
    setSelected(spot.locId);
    setMenu(false);
    editor.begin("metadata", spot);
    model.navigate({ kind: "saved-edit", locId: spot.locId });
  });
  return <section ref={region} className="spot-manager" aria-label="收藏管理" hidden={hidden} data-editing={editing}>
    <header className="search-form-card spot-manager-heading">
      <button ref={headerRef} className="spot-icon-button" aria-label="返回工作區" onClick={() => editor.request("close-manager", onClose)}>←</button>
      {editing && <button className="spot-icon-button spot-mobile-list-back" aria-label="返回收藏清單" onClick={() => editor.request("back", list)}>←</button>}
      <h1><span>我的鳥點</span>{editing && <span className="spot-edit-title">編輯收藏</span>}</h1>
      <button className="spot-icon-button" aria-label="保存位置說明" aria-expanded={menu} onClick={() => setMenu(!menu)}>⋯</button>
      {menu && <p className="spot-storage-info">收藏儲存在這個瀏覽器的網站資料中，不會自動同步到其他裝置或瀏覽器。</p>}
    </header>
    <div className="spot-manager-panes">
      <section className="spot-manager-list" aria-label="收藏清單">
        <div className="spot-manager-tools">
          <input type="search" aria-label="搜尋收藏" placeholder="搜尋收藏" value={query} onChange={e => setQuery(e.target.value)} />
          <select aria-label="收藏排序" value={sort} onChange={e => {
            const value = e.target.value;
            if (value === "name" || value === "pinned" || value === "recent") setSort(value);
          }}><option value="pinned">釘選優先</option><option value="recent">最近收藏</option><option value="name">名稱</option></select>
        </div>
        <div className="spot-manager-rows">
          {model.collection.kind === "loading" && <p role="status">正在讀取收藏…</p>}
          {model.collection.kind === "ready" && !rows.length && <p>{spots.length ? "沒有符合條件的收藏。" : "尚未收藏鳥點。"}</p>}
          {rows.map(spot => <div className="spot-list-row" key={spot.locId} data-selected={selected === spot.locId}>
            <div className="spot-saved-heading">
              <button className="spot-row-name" title={spot.alias || spot.locName || spot.locId} onClick={e => {
                const opener = e.currentTarget;
                editor.request("detail", () => {
                  if (view.kind === "saved-list") setSelected(spot.locId);
                  onRecent(spot, view, opener);
                });
              }}><strong>{spot.alias || spot.locName || spot.locId}</strong></button>
              <button className="spot-icon-button" aria-label={`${spot.pinned ? "取消釘選" : "釘選"} ${spot.alias || spot.locName || spot.locId}`} aria-pressed={spot.pinned} disabled={model.pending.has(spot.locId)} onClick={() => void model.update(spot.locId, { pinned: !spot.pinned })}>{spot.pinned ? "★" : "☆"}</button>
              <button className="spot-saved-action" aria-label={`編輯 ${spot.alias || spot.locName || spot.locId}`} onClick={e => edit(spot, e.currentTarget)}>編輯</button>
              <button className="spot-saved-action" aria-label={`移除 ${spot.alias || spot.locName || spot.locId}`} disabled={model.pending.has(spot.locId)} onClick={() => void model.toggle(spot, true)}>移除</button>
            </div>
            <small>{spot.alias && spot.locName ? spot.locName + " · " : ""}{spot.locId}</small>
          </div>)}
        </div>
      </section>
      <section className="spot-manager-editor" aria-label="編輯收藏">
        {draft ? <form onSubmit={e => { e.preventDefault(); void editor.submit(list); }}>
          <div className="spot-editor-fields" key={draft.spot.locId} onScroll={e => fieldScroll.current.set(draft.spot.locId, e.currentTarget.scrollTop)} ref={fieldsNode}>
            <label>原始地名<input readOnly value={draft.spot.locName || draft.spot.locId} /></label>
            <label>別名<input ref={aliasInput} value={draft.fields.alias} onChange={e => editor.change({ alias: e.target.value })} /></label>
            <label>筆記<textarea value={draft.fields.note} onChange={e => editor.change({ note: e.target.value })} /></label>
            <label className="spot-pin"><input type="checkbox" checked={draft.fields.pinned} onChange={e => editor.change({ pinned: e.target.checked })} />釘選</label>
          </div>
          <footer className="spot-editor-actions">
            <button className="search-app-primary" disabled={model.pending.has(draft.spot.locId)}>儲存</button>
            <button type="button" className="search-app-secondary" onClick={() => editor.request("cancel-edit", list)}>取消</button>
            <button type="button" className="search-app-secondary spot-remove" disabled={model.pending.has(draft.spot.locId)} onClick={() => editor.request("remove", () => {
              list();
              void model.toggle(draft.spot, true);
            })}>取消收藏</button>
          </footer>
        </form> : <p>選擇收藏旁的「編輯」修改別名、筆記與釘選。</p>}
      </section>
    </div>
  </section>;
}
