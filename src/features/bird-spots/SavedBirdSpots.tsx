import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SavedBirdSpot, SavedBirdSpotSort } from "../../types/domain";
import { sortSavedBirdSpots } from "../../domain/saved-bird-spots.mjs";
import type { DesktopBirdSpots } from "./useDesktopBirdSpots";
import { Dialog } from "./Dialog";
import { spotName } from "./BirdSpotPanel";

type Fields = Pick<SavedBirdSpot, "alias" | "note" | "pinned">;
type Draft = { fields: Fields; baseline: Fields; revision: number };
const fieldsOf = ({ alias, note, pinned }: SavedBirdSpot): Fields => ({
  alias,
  note,
  pinned,
});
const equal = (a: Fields, b: Fields) =>
  a.alias === b.alias && a.note === b.note && a.pinned === b.pinned;
const normalize = (text: string) =>
  text.normalize("NFKC").replaceAll("臺", "台").toLocaleLowerCase();
export function SavedBirdSpots({ model }: { model: DesktopBirdSpots }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SavedBirdSpotSort>("pinned");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const revision = useRef(0);
  const scroll = useRef({ list: 0, editor: 0 });
  const listRef = useRef<HTMLDivElement>(null),
    editorRef = useRef<HTMLDivElement>(null);
  const visible = model.view.kind === "saved";
  useEffect(() => {
    if (visible && !model.spots.some((spot) => spot.locId === selectedId))
      setSelectedId(model.spots[0]?.locId ?? null);
  }, [visible, selectedId, model.spots]);
  useLayoutEffect(() => {
    if (!visible) return;
    if (listRef.current) listRef.current.scrollTop = scroll.current.list;
    if (editorRef.current) editorRef.current.scrollTop = scroll.current.editor;
  }, [visible]);
  if (!visible) return null;
  const spots = sortSavedBirdSpots(model.spots, sort).filter((spot) =>
    normalize(
      [spotName(spot), spot.alias, spot.note, spot.locId].join(" "),
    ).includes(normalize(query)),
  );
  const selected =
    model.spots.find((spot) => spot.locId === selectedId) ?? spots[0];
  const draft = selected ? drafts[selected.locId] : undefined;
  const fields = draft?.fields ?? (selected ? fieldsOf(selected) : null);
  const change = (changes: Partial<Fields>) => {
    if (!selected) return;
    const id = selected.locId,
      version = ++revision.current;
    setDrafts((previous) => {
      const current = previous[id] ?? {
        fields: fieldsOf(selected),
        baseline: fieldsOf(selected),
        revision: version,
      };
      return {
        ...previous,
        [id]: {
          ...current,
          fields: { ...current.fields, ...changes },
          revision: version,
        },
      };
    });
  };
  const discard = () => {
    if (!selected) return;
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[selected.locId];
      return next;
    });
  };
  const save = async () => {
    if (!selected || !fields) return true;
    const id = selected.locId,
      submitted = { ...fields },
      submittedRevision = draft?.revision;
    if (!(await model.updateMetadata(selected, submitted))) return false;
    const unchanged = draftsRef.current[id]?.revision === submittedRevision;
    setDrafts((previous) => {
      const current = previous[id];
      if (!current) return previous;
      const next = { ...previous };
      if (current.revision === submittedRevision) delete next[id];
      else next[id] = { ...current, baseline: submitted };
      return next;
    });
    return unchanged;
  };
  const dirty = Boolean(draft && !equal(draft.fields, draft.baseline));
  model.editor.current = { key: "saved", dirty, save, discard };
  const choose = (spot: SavedBirdSpot) => {
    if (spot.locId === selected?.locId) return;
    model.requestLeave({
      kind: "select",
      run: () => {
        setSelectedId(spot.locId);
        scroll.current.editor = 0;
        if (editorRef.current) editorRef.current.scrollTop = 0;
      },
    });
  };
  return (
    <div
      className="bird-spots-manager-host"
      aria-hidden={model.leave.kind !== "idle" || undefined}
    >
      <Dialog
        titleId="saved-bird-spots-title"
        onClose={model.showResults}
        className="bird-spots-manager"
      >
        <header>
          <div>
            <h2 id="saved-bird-spots-title">我的鳥點</h2>
            <p className="bird-spot-meta">
              {model.available ? `${model.spots.length} 個收藏 · ` : ""}
              保存在這台電腦
            </p>
          </div>
          <button className="secondary" onClick={model.showResults}>
            關閉
          </button>
        </header>
        {model.collection.kind === "loading" ? (
          <p className="empty">正在讀取收藏…</p>
        ) : model.collection.kind === "error" ? (
          <div className="bird-spot-error" role="alert">
            <p>{model.collection.message}</p>
            <button
              className="secondary"
              onClick={() => void model.loadCollection()}
            >
              重試讀取收藏
            </button>
          </div>
        ) : (
          <div className="bird-spots-manager-columns">
            <section className="bird-spots-manager-sidebar">
              <div className="bird-spots-manager-filters">
                <label className="field">
                  <span>搜尋收藏</span>
                  <input
                    value={query}
                    placeholder="名稱、別名或筆記"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>排序</span>
                  <select
                    aria-label="排序"
                    value={sort}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (
                        value !== "pinned" &&
                        value !== "recent" &&
                        value !== "name"
                      )
                        return;
                      setSort(value);
                    }}
                  >
                    <option value="pinned">釘選優先</option>
                    <option value="recent">最近收藏</option>
                    <option value="name">名稱</option>
                  </select>
                </label>
              </div>
              <div
                className="bird-spots-saved-list"
                ref={listRef}
                onScroll={(event) => {
                  scroll.current.list = event.currentTarget.scrollTop;
                }}
              >
                {spots.length ? (
                  spots.map((spot) => (
                    <button
                      key={spot.locId}
                      className="bird-spots-saved-item"
                      aria-pressed={spot.locId === selected?.locId}
                      onClick={() => choose(spot)}
                    >
                      <strong>
                        {spot.pinned ? "📌 " : ""}
                        {spot.alias || spotName(spot)}
                      </strong>
                      <span className="bird-spot-meta">
                        {spotName(spot)} · {spot.locId}
                      </span>
                      <span className="bird-spot-meta">
                        {spot.locationType === "personal"
                          ? "個人地點"
                          : spot.locationType === "hotspot"
                            ? "公共熱點"
                            : "地點類型未知"}
                      </span>
                      {spot.note && (
                        <span className="bird-spots-note-preview">
                          {spot.note}
                        </span>
                      )}
                    </button>
                  ))
                ) : (
                  <p className="empty">
                    {model.spots.length
                      ? "沒有符合條件的收藏"
                      : "尚未收藏鳥點。從搜尋結果收藏後即可在這裡管理。"}
                  </p>
                )}
              </div>
            </section>
            <div className="bird-spots-manager-editor">
              {selected && fields ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                  }}
                >
                  <div
                    className="bird-spots-manager-fields"
                    ref={editorRef}
                    onScroll={(event) => {
                      scroll.current.editor = event.currentTarget.scrollTop;
                    }}
                  >
                    <p className="bird-spot-eyebrow">收藏管理</p>
                    <h3>{selected.alias || spotName(selected)}</h3>
                    <label className="field">
                      <span>eBird 原始名稱（唯讀）</span>
                      <input readOnly value={spotName(selected)} />
                    </label>
                    <p className="bird-spot-meta">
                      {selected.locId} · 原始名稱不受個人編輯影響
                    </p>
                    <label className="field">
                      <span>我的別名</span>
                      <input
                        maxLength={200}
                        value={fields.alias}
                        onChange={(event) =>
                          change({ alias: event.target.value })
                        }
                      />
                    </label>
                    <label className="field bird-spots-note-field">
                      <span>我的筆記</span>
                      <textarea
                        aria-label="我的筆記"
                        maxLength={10000}
                        value={fields.note}
                        onChange={(event) =>
                          change({ note: event.target.value })
                        }
                      />
                    </label>
                    <label className="bird-spots-pin">
                      <input
                        type="checkbox"
                        checked={fields.pinned}
                        onChange={(event) =>
                          change({ pinned: event.target.checked })
                        }
                      />
                      釘選此鳥點
                    </label>
                  </div>
                  <footer className="bird-spots-manager-footer">
                    <div className="bird-spot-actions">
                      <button
                        className="primary"
                        disabled={!dirty || model.pending.has(selected.locId)}
                      >
                        {model.pending.has(selected.locId)
                          ? "儲存中…"
                          : "儲存修改"}
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        disabled={!dirty}
                        onClick={() =>
                          model.requestLeave({
                            kind: "cancel-edit",
                            run: discard,
                          })
                        }
                      >
                        取消編輯
                      </button>
                    </div>
                    <div className="bird-spots-manager-secondary">
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => model.open(selected, null, "saved")}
                      >
                        查看近期鳥種
                      </button>
                      <button
                        className="danger"
                        type="button"
                        disabled={model.pending.has(selected.locId)}
                        onClick={() =>
                          model.requestLeave({
                            kind: "remove",
                            run: () => {
                              discard();
                              void model.toggle(selected);
                            },
                          })
                        }
                      >
                        取消收藏
                      </button>
                    </div>
                  </footer>
                </form>
              ) : (
                <p className="empty">選擇一個收藏鳥點開始管理。</p>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
