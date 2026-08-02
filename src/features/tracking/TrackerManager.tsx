import { ListChecks, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchJson } from "../../api/client";
import type { Species } from "../../types/domain";
import type {
  AddTrackerRequest,
  SpeciesResolveResponse,
  SpeciesSearchResponse,
  Tracker,
  TrackerCheckResponse,
  TrackingResponse,
} from "./types";

type EditorMode = "idle" | "add" | "edit";

function publishStatus(message: string, isError = false) {
  window.dispatchEvent(new CustomEvent("app:status", { detail: { message, isError } }));
}

function publishTrackers(trackers: Tracker[]) {
  window.dispatchEvent(new CustomEvent("tracking:updated", { detail: { trackers } }));
}

function formatClock(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return value;
  const [hoursText, minutes] = value.split(":");
  const hours = Number.parseInt(hoursText, 10);
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "尚未檢查";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")];
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${parts.join("-")} ${time}`;
}

export function TrackerManager() {
  const [open, setOpen] = useState(false);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [mode, setMode] = useState<EditorMode>("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftSpecies, setDraftSpecies] = useState<Species | null>(null);
  const [speciesQuery, setSpeciesQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Species[]>([]);
  const [days, setDays] = useState(3);
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [enabled, setEnabled] = useState(true);
  const [quietEnabled, setQuietEnabled] = useState(true);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("06:00");
  const [busy, setBusy] = useState(false);
  const speciesFieldRef = useRef<HTMLLabelElement>(null);

  const applyTrackers = useCallback((next: Tracker[]) => {
    setTrackers(next);
    publishTrackers(next);
  }, []);

  const loadTrackers = useCallback(async () => {
    try {
      const payload = await fetchJson<TrackingResponse>("/api/tracking");
      applyTrackers(payload.trackers);
    } catch (error) {
      publishStatus(error instanceof Error ? error.message : "追蹤清單讀取失敗", true);
    }
  }, [applyTrackers]);

  function resetEditor() {
    setMode("idle");
    setEditingId(null);
    setDraftSpecies(null);
    setSpeciesQuery("");
    setSuggestions([]);
  }

  function openDrawer() {
    window.dispatchEvent(new Event("tracker:opening"));
    setOpen(true);
    resetEditor();
  }

  function closeDrawer() {
    setOpen(false);
    resetEditor();
  }

  function startEdit(tracker: Tracker) {
    setMode("edit");
    setEditingId(tracker.id);
    setDraftSpecies(tracker.species);
    setSpeciesQuery(tracker.species.comName);
    setSuggestions([]);
    setDays(tracker.days);
    setIntervalMinutes(tracker.intervalMinutes);
    setEnabled(tracker.enabled);
    setQuietEnabled(tracker.quietHours.enabled);
    setQuietStart(tracker.quietHours.start);
    setQuietEnd(tracker.quietHours.end);
  }

  function startAdd(request?: AddTrackerRequest) {
    const species = request?.species ?? null;
    const existing = species ? trackers.find((tracker) => tracker.id === species.speciesCode) : null;
    if (existing) {
      startEdit(existing);
      publishStatus(`${existing.species.comName} 已在追蹤清單中`);
      return;
    }
    setMode("add");
    setEditingId(null);
    setDraftSpecies(species);
    setSpeciesQuery(species?.comName ?? "");
    setSuggestions([]);
    setDays(request?.days ?? 3);
    setIntervalMinutes(30);
    setEnabled(true);
    setQuietEnabled(true);
    setQuietStart("22:00");
    setQuietEnd("06:00");
  }

  const checkTrackers = useCallback(async () => {
    setBusy(true);
    publishStatus("檢查追蹤清單...");
    try {
      const payload = await fetchJson<TrackerCheckResponse>("/api/tracking/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      applyTrackers(payload.trackers);
      const newCount = payload.results.reduce((sum, result) => sum + result.newObservations.length, 0);
      window.dispatchEvent(new Event("notifications:refresh"));
      publishStatus(`追蹤檢查完成：${newCount} 筆新紀錄`);
    } catch (error) {
      publishStatus(error instanceof Error ? error.message : "追蹤檢查失敗", true);
    } finally {
      setBusy(false);
    }
  }, [applyTrackers]);

  const pauseAll = useCallback(async () => {
    setBusy(true);
    try {
      let next = trackers;
      for (const tracker of trackers.filter((item) => item.enabled)) {
        const payload = await fetchJson<TrackingResponse>(`/api/tracking/${encodeURIComponent(tracker.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        });
        next = payload.trackers;
      }
      applyTrackers(next);
      publishStatus("已暫停全部追蹤");
    } catch (error) {
      publishStatus(error instanceof Error ? error.message : "暫停追蹤失敗", true);
    } finally {
      setBusy(false);
    }
  }, [applyTrackers, trackers]);

  useEffect(() => {
    void loadTrackers();
  }, [loadTrackers]);

  useEffect(() => {
    const openFromMenu = () => openDrawer();
    const addCurrent = (event: Event) => {
      const request = (event as CustomEvent<AddTrackerRequest>).detail;
      window.dispatchEvent(new Event("tracker:opening"));
      setOpen(true);
      startAdd(request);
    };
    const runCheck = () => void checkTrackers();
    const runPauseAll = () => void pauseAll();
    const close = () => closeDrawer();
    window.addEventListener("tracking:open", openFromMenu);
    window.addEventListener("tracking:add-current", addCurrent);
    window.addEventListener("tracking:check", runCheck);
    window.addEventListener("tracking:pause-all", runPauseAll);
    window.addEventListener("settings:opening", close);
    window.addEventListener("notification:opening", close);
    return () => {
      window.removeEventListener("tracking:open", openFromMenu);
      window.removeEventListener("tracking:add-current", addCurrent);
      window.removeEventListener("tracking:check", runCheck);
      window.removeEventListener("tracking:pause-all", runPauseAll);
      window.removeEventListener("settings:opening", close);
      window.removeEventListener("notification:opening", close);
    };
  });

  useEffect(() => {
    if (mode !== "add" || !speciesQuery.trim() || speciesQuery === draftSpecies?.comName) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const payload = await fetchJson<SpeciesSearchResponse>(`/api/species/search?q=${encodeURIComponent(speciesQuery.trim())}`);
        setSuggestions(payload.results);
      } catch (error) {
        publishStatus(error instanceof Error ? error.message : "鳥種搜尋失敗", true);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [draftSpecies?.comName, mode, speciesQuery]);

  useEffect(() => {
    if (!suggestions.length) return;
    const close = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || speciesFieldRef.current?.contains(event.target)) return;
      setSuggestions([]);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [suggestions.length]);

  function chooseSpecies(species: Species) {
    const existing = trackers.find((tracker) => tracker.id === species.speciesCode);
    if (existing) {
      startEdit(existing);
      publishStatus(`${species.comName} 已在追蹤清單中`);
      return;
    }
    setDraftSpecies(species);
    setSpeciesQuery(species.comName);
    setSuggestions([]);
  }

  async function resolveDraftSpecies() {
    if (draftSpecies && speciesQuery === draftSpecies.comName) return draftSpecies;
    const query = speciesQuery.trim();
    if (!query) throw new Error("請輸入要追蹤的鳥種");
    const payload = await fetchJson<SpeciesResolveResponse>(`/api/species/resolve?q=${encodeURIComponent(query)}`);
    if (!payload.species) throw new Error(`找不到 eBird 鳥種：${query}`);
    return payload.species;
  }

  async function saveTracker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const species = mode === "edit" ? trackers.find((tracker) => tracker.id === editingId)?.species : await resolveDraftSpecies();
      if (!species) throw new Error("請先選擇鳥種");
      const existing = mode === "add" ? trackers.find((tracker) => tracker.id === species.speciesCode) : null;
      publishStatus(`儲存 ${species.comName} 追蹤...`);
      const payload = await fetchJson<TrackingResponse>("/api/tracking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          species,
          days: Math.max(1, Math.min(days, 30)),
          intervalMinutes: Math.max(1, Math.min(intervalMinutes, 1440)),
          enabled,
          quietHours: { enabled: quietEnabled, start: quietStart, end: quietEnd },
        }),
      });
      applyTrackers(payload.trackers);
      if (mode === "edit") {
        const saved = payload.trackers.find((tracker) => tracker.id === species.speciesCode);
        if (saved) startEdit(saved);
      } else {
        resetEditor();
      }
      publishStatus(existing ? `${species.comName} 已更新既有追蹤` : `${mode === "edit" ? "已儲存" : "已建立"} ${species.comName} 追蹤`);
    } catch (error) {
      publishStatus(error instanceof Error ? error.message : "追蹤儲存失敗", true);
    } finally {
      setBusy(false);
    }
  }

  async function updateTracker(tracker: Tracker, changes: Partial<Tracker>) {
    try {
      const payload = await fetchJson<TrackingResponse>(`/api/tracking/${encodeURIComponent(tracker.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(changes),
      });
      applyTrackers(payload.trackers);
    } catch (error) {
      publishStatus(error instanceof Error ? error.message : "追蹤更新失敗", true);
    }
  }

  async function removeTracker(tracker: Tracker) {
    try {
      const payload = await fetchJson<TrackingResponse>(`/api/tracking/${encodeURIComponent(tracker.id)}`, { method: "DELETE" });
      applyTrackers(payload.trackers);
      if (editingId === tracker.id) resetEditor();
      publishStatus(`已移除 ${tracker.species.comName} 追蹤`);
    } catch (error) {
      publishStatus(error instanceof Error ? error.message : "追蹤移除失敗", true);
    }
  }

  const shell = document.querySelector(".app-shell");

  return (
    <>
      <button className={`icon-btn${open ? " active" : ""}`} type="button" aria-label="追蹤管理" title="追蹤管理" onClick={openDrawer}>
        <ListChecks size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {shell &&
        createPortal(
          <>
            <aside className={`drawer${open ? "" : " closed"}`} aria-label="追蹤管理" aria-hidden={!open}>
              <div className="drawer-head">
                <strong>追蹤管理</strong>
                <div className="drawer-head-actions">
                  <button className="secondary" type="button" onClick={() => startAdd()} disabled={busy}>新增追蹤</button>
                  <button className="secondary" type="button" onClick={() => void checkTrackers()} disabled={busy}>立即檢查全部</button>
                  <button className="icon-btn" type="button" aria-label="關閉追蹤管理" onClick={closeDrawer}>
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="drawer-body">
                {mode !== "idle" && (
                  <form className="tracker-editor" data-mode={mode} onSubmit={saveTracker}>
                    <div className="editor-mode">
                      <strong>{mode === "edit" ? `編輯追蹤：${draftSpecies?.comName ?? ""}` : "新增追蹤"}</strong>
                    </div>
                    <div className="editor-grid">
                      {mode === "add" && (
                        <label className="field tracker-species-search" ref={speciesFieldRef}>
                          <span>鳥種</span>
                          <input
                            type="text"
                            value={speciesQuery}
                            autoComplete="off"
                            placeholder="鳥名或代碼"
                            onChange={(event) => {
                              setSpeciesQuery(event.target.value);
                              setDraftSpecies(null);
                            }}
                          />
                          {suggestions.length > 0 && (
                            <div className="suggestions drawer-suggestions">
                              {suggestions.map((species) => (
                                <button className="suggestion" type="button" key={species.speciesCode} onClick={() => chooseSpecies(species)}>
                                  <strong>{species.comName}</strong>
                                  <span>{species.sciName} / {species.speciesCode}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </label>
                      )}
                      <label className="field">
                        <span>最近天數</span>
                        <input type="number" min="1" max="30" value={days} onChange={(event) => setDays(Number(event.target.value))} />
                      </label>
                      <label className="field">
                        <span>檢查間隔（分）</span>
                        <input type="number" min="1" max="1440" value={intervalMinutes} onChange={(event) => setIntervalMinutes(Number(event.target.value))} />
                      </label>
                      <label className="switch-row">
                        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                        <span>啟用</span>
                      </label>
                    </div>
                    <div className="quiet-hours">
                      <label className="switch-row quiet-toggle">
                        <input type="checkbox" checked={quietEnabled} onChange={(event) => setQuietEnabled(event.target.checked)} />
                        <span>排除夜間：在下列時段內不自動檢查</span>
                      </label>
                      <label className="field time-field">
                        <span>開始</span>
                        <input type="time" value={quietStart} disabled={!quietEnabled} onChange={(event) => setQuietStart(event.target.value)} />
                      </label>
                      <label className="field time-field">
                        <span>結束</span>
                        <input type="time" value={quietEnd} disabled={!quietEnabled} onChange={(event) => setQuietEnd(event.target.value)} />
                      </label>
                    </div>
                    <div className="drawer-actions">
                      <button className="primary" type="submit" disabled={busy}>{mode === "edit" ? "儲存變更" : "建立追蹤"}</button>
                      <button className="secondary" type="button" onClick={resetEditor}>取消</button>
                    </div>
                  </form>
                )}
                <section className={`tracker-list${mode === "add" ? " is-adding" : ""}${mode === "edit" ? " is-editing" : ""}`}>
                  {!trackers.length && <div className="empty">尚未追蹤任何鳥種。</div>}
                  {trackers.map((tracker) => (
                    <article className={`tracker-row ${tracker.enabled ? "active" : "paused"}${editingId === tracker.id ? " editing" : ""}`} key={tracker.id}>
                      <div className="tracker-main">
                        <div className="tracker-title">
                          <strong>{tracker.species.comName}</strong>
                          <span className="tracker-code">{tracker.species.sciName} / {tracker.species.speciesCode}</span>
                        </div>
                        <div className="tracker-meta">最近 {tracker.days} 天 / 每 {tracker.intervalMinutes} 分鐘</div>
                        <div className="tracker-meta">{tracker.quietHours.enabled ? `排除 ${formatClock(tracker.quietHours.start)}-${formatClock(tracker.quietHours.end)}` : "不排除時段"}</div>
                        <div className="tracker-meta">上次檢查：{formatDateTime(tracker.lastCheckedAt)}</div>
                      </div>
                      <div className="tracker-side-actions">
                        <div className="tracker-status-row">
                          <span className={`pill${tracker.enabled ? "" : " muted"}`}>{tracker.enabled ? "啟用" : "暫停"}</span>
                          <button type="button" onClick={() => startEdit(tracker)}>編輯</button>
                        </div>
                        <div className="tracker-actions">
                          <button type="button" onClick={() => void updateTracker(tracker, { enabled: !tracker.enabled })}>{tracker.enabled ? "暫停" : "啟用"}</button>
                          <button type="button" onClick={() => void removeTracker(tracker)}>移除</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </section>
              </div>
            </aside>
            {open && <div className="scrim" onClick={closeDrawer} />}
          </>,
          shell,
        )}
    </>
  );
}
