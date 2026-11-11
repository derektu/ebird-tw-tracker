import { useCallback, useEffect, useRef, useState } from "react";
import type { BirdSpot, BirdSpotRecentResponse, Observation, SavedBirdSpot, Species } from "../../types/domain";
import { BIRD_SPOT_LEAVE_EVENT } from "./navigation";
import { fetchJson } from "../../api/client";
import { sortSavedBirdSpots } from "../../domain/saved-bird-spots.mjs";
import { normalizeBirdSpot } from "../../domain/bird-spots.mjs";
import { createDesktopSavedBirdSpotStore } from "../map/desktop-saved-bird-spots.mjs";

const store = createDesktopSavedBirdSpotStore({ request: fetchJson });
type View = { kind: "results" } | { kind: "saved" } | { kind: "detail"; spot: BirdSpot; origin: "results" | "saved"; species: Species | null };
type Collection = { kind: "loading" } | { kind: "ready"; spots: SavedBirdSpot[] } | { kind: "error"; message: string };
type Recent = { kind: "loading" } | { kind: "ready"; response: BirdSpotRecentResponse } | { kind: "error"; message: string };
const messageFor = (error: unknown) => error instanceof Error ? error.message : "目前無法完成操作，請稍後重試";

export function useDesktopBirdSpots() {
  const [view, setView] = useState<View>({ kind: "results" });
  const [collection, setCollection] = useState<Collection>({ kind: "loading" });
  const [pending, setPending] = useState<Set<string>>(new Set());
  const busy = useRef(new Set<string>());
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [undo, setUndo] = useState<SavedBirdSpot | null>(null);
  const [recent, setRecent] = useState<Recent>({ kind: "loading" });
  const [days, setDays] = useState(14);
  const [onlySpecies, setOnlySpecies] = useState(false);
  const [reload, setReload] = useState(0);
  const beforeLeave = useRef<() => boolean>(() => true);
  const beforeDetailOpen = useRef(() => {});
  const beforeResultsReplace = useRef(() => {});
  const generation = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  const loadCollection = useCallback(async () => {
    setCollection({ kind: "loading" });
    try { setCollection({ kind: "ready", spots: await store.list() }); }
    catch (error) { setCollection({ kind: "error", message: messageFor(error) }); }
  }, []);
  useEffect(() => { void loadCollection(); }, [loadCollection]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 8000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const showResults = useCallback(() => { if (!beforeLeave.current()) return; generation.current++; setView({ kind: "results" }); }, []);
  const resetForSearch = useCallback(() => { beforeResultsReplace.current(); generation.current++; setView({ kind: "results" }); }, []);
  const showSaved = useCallback(() => { if (!beforeLeave.current()) return; generation.current++; setView({ kind: "saved" }); }, []);
  const open = useCallback((spot: BirdSpot, species: Species | null = null, origin: "results" | "saved" = "results") => {
    if (!beforeLeave.current()) return;
    beforeDetailOpen.current();
    generation.current++;
    setDays(14); setOnlySpecies(false); setRecent({ kind: "loading" }); setActionError("");
    setView({ kind: "detail", spot, origin, species });
  }, []);
  const back = useCallback(() => {
    if (!beforeLeave.current()) return;
    generation.current++;
    setView({ kind: viewRef.current.kind === "detail" ? viewRef.current.origin : "results" });
  }, []);
  useEffect(() => {
    const guard = (event: Event) => { if (!beforeLeave.current()) event.preventDefault(); };
    window.addEventListener(BIRD_SPOT_LEAVE_EVENT, guard);
    return () => window.removeEventListener(BIRD_SPOT_LEAVE_EVENT, guard);
  }, []);
  const legacyHint = useCallback(() => setActionError("這筆舊紀錄沒有鳥點 ID，請重新搜尋鳥種後再查看或收藏鳥點。"), []);
  const openObservation = useCallback((observation: Observation, species: Species | null) => {
    const spot = normalizeBirdSpot(observation);
    if (!spot) { legacyHint(); return; }
    open(spot, species);
  }, [legacyHint, open]);

  useEffect(() => {
    if (view.kind !== "detail") return;
    const token = ++generation.current;
    const controller = new AbortController();
    setRecent({ kind: "loading" });
    void fetchJson<BirdSpotRecentResponse>(`/api/bird-spots/observations?locId=${encodeURIComponent(view.spot.locId)}&days=${days}`, { signal: controller.signal })
      .then(response => { if (token === generation.current) setRecent({ kind: "ready", response }); })
      .catch(error => { if (token === generation.current && !controller.signal.aborted) setRecent({ kind: "error", message: messageFor(error) }); });
    return () => controller.abort();
  }, [view, days, reload]);

  const replace = (spot: SavedBirdSpot) => setCollection(previous => previous.kind === "ready"
    ? { kind: "ready", spots: [...previous.spots.filter(s => s.locId !== spot.locId), spot] }
    : previous);
  const act = async (locId: string, operation: () => Promise<void>) => {
    if (busy.current.has(locId)) return;
    busy.current.add(locId); setPending(new Set(busy.current)); setActionError("");
    try { await operation(); }
    catch (error) { setActionError(messageFor(error)); }
    finally { busy.current.delete(locId); setPending(new Set(busy.current)); }
  };
  const toggle = async (spot: BirdSpot) => {
    if (collection.kind !== "ready") return;
    const saved = collection.spots.some(s => s.locId === spot.locId);
    await act(spot.locId, async () => {
      if (saved) {
        const removed = await store.remove(spot.locId);
        setCollection(previous => previous.kind === "ready" ? { kind: "ready", spots: previous.spots.filter(s => s.locId !== spot.locId) } : previous);
        setUndo(removed); setNotice("已取消收藏");
      } else { replace(await store.save(spot)); setNotice("已收藏鳥點"); }
    });
  };
  const toggleObservation = async (observation: Observation) => {
    const spot = normalizeBirdSpot(observation);
    if (!spot) { legacyHint(); return; }
    await toggle(spot);
  };
  const restore = async () => {
    if (!undo) return;
    await act(undo.locId, async () => { replace(await store.restore(undo)); setUndo(null); setNotice("已復原收藏"); });
  };
  const saveNote = async (spot: BirdSpot, note: string): Promise<boolean> => {
    if (collection.kind !== "ready" || busy.current.has(spot.locId)) return false;
    let succeeded = false;
    await act(spot.locId, async () => {
      if (!collection.spots.some(s => s.locId === spot.locId)) replace(await store.save(spot));
      replace(await store.update(spot.locId, { note }));
      succeeded = true; setNotice("已儲存筆記");
    });
    return succeeded;
  };
  const spots = collection.kind === "ready" ? sortSavedBirdSpots(collection.spots) : [];
  const metadata = view.kind === "detail" && recent.kind === "ready" && recent.response.locId === view.spot.locId ? recent.response.observations : [];
  const coordinates = metadata.find(o => o.lat !== null && o.lng !== null);
  const detailSpot: BirdSpot | null = view.kind === "detail" ? {
    ...view.spot,
    locName: view.spot.locName ?? metadata.find(o => o.locName)?.locName ?? null,
    lat: view.spot.lat ?? coordinates?.lat ?? null,
    lng: view.spot.lng ?? coordinates?.lng ?? null,
    locationType: view.spot.locationType === "unknown" ? metadata.find(o => o.locationType !== "unknown")?.locationType ?? "unknown" : view.spot.locationType,
  } : null;
  const saved = (locId: string) => spots.find(s => s.locId === locId);
  const available = collection.kind === "ready";
  return { view, detailSpot, recent, days, setDays, onlySpecies, setOnlySpecies, collection, spots, pending, available, saved,
    notice, actionError, dismissError: () => setActionError(""), undo, restore, toggle, toggleObservation, saveNote,
    beforeLeave, beforeDetailOpen, beforeResultsReplace, resetForSearch, showResults, showSaved, open, back, openObservation, legacyHint, loadCollection, refresh: () => setReload(n => n + 1) };
}
export type DesktopBirdSpots = ReturnType<typeof useDesktopBirdSpots>;
