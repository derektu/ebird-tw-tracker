import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBirdSpotRecent } from "../../api/search-app-client.mjs";
import { normalizeBirdSpot } from "../../domain/bird-spots.mjs";
import { readBrowserApiKey } from "../../storage/browser-api-key";
import type { BirdSpot, BirdSpotRecentResponse, Observation, SavedBirdSpot, SavedBirdSpotStore, Species } from "../../types/domain";
import { createIndexedDbSavedBirdSpotStore } from "./browser-saved-bird-spots.mjs";

type View = { kind: "results" } | { kind: "detail"; spot: BirdSpot; species: Species | null };
type Collection = { kind: "loading" } | { kind: "ready"; spots: SavedBirdSpot[] } | { kind: "error"; message: string };
type Recent = { kind: "loading" } | { kind: "ready"; response: BirdSpotRecentResponse } | { kind: "error"; message: string };
interface Dependencies {
  store: SavedBirdSpotStore;
  fetchRecent(request: { locId: string; days: number }, signal: AbortSignal): Promise<BirdSpotRecentResponse>;
}
const browserDependencies: Dependencies = {
  store: createIndexedDbSavedBirdSpotStore(),
  fetchRecent: (request, signal) => fetchBirdSpotRecent(request, { apiKey: readBrowserApiKey() ?? "", signal }),
};
const messageFor = (error: unknown) => error instanceof Error ? error.message : "目前無法完成操作，請稍後重試";

export function useSearchBirdSpots({ store, fetchRecent } = browserDependencies) {
  const [view, setView] = useState<View>({ kind: "results" });
  const [collection, setCollection] = useState<Collection>({ kind: "loading" });
  const [recent, setRecent] = useState<Recent>({ kind: "loading" });
  const [days, setDays] = useState(3);
  const [onlySpecies, setOnlySpecies] = useState(false);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(new Set<string>());
  const locks = useRef(new Set<string>());
  const generation = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<SavedBirdSpot | null>(null);
  const loadCollection = useCallback(async () => {
    setCollection({ kind: "loading" });
    try { setCollection({ kind: "ready", spots: await store.list() }); }
    catch (error) { setCollection({ kind: "error", message: messageFor(error) }); }
  }, [store]);
  useEffect(() => { void loadCollection(); }, [loadCollection]);
  const invalidate = useCallback(() => { generation.current++; requestRef.current?.abort(); }, []);
  useEffect(() => {
    if (view.kind !== "detail") return;
    const token = ++generation.current;
    const controller = new AbortController();
    requestRef.current = controller;
    setRecent({ kind: "loading" });
    void fetchRecent({ locId: view.spot.locId, days }, controller.signal).then(
      response => { if (token === generation.current && !controller.signal.aborted) setRecent({ kind: "ready", response }); },
      error => { if (token === generation.current && !controller.signal.aborted) setRecent({ kind: "error", message: messageFor(error) }); },
    );
    return () => controller.abort();
  }, [view, days, revision, fetchRecent]);
  useEffect(() => () => invalidate(), [invalidate]);
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
  const close = useCallback(() => { invalidate(); setView({ kind: "results" }); }, [invalidate]);
  const openObservation = (observation: Observation, species: Species | null) => {
    const spot = normalizeBirdSpot(observation);
    if (!spot) { setActionError("這筆舊紀錄沒有鳥點 ID，請重新搜尋後再查看或收藏。"); return false; }
    invalidate(); setDays(3); setOnlySpecies(false); setRecent({ kind: "loading" }); setActionError("");
    setView({ kind: "detail", spot, species });
    return true;
  };
  const replace = (spot: SavedBirdSpot) => setCollection(previous => previous.kind === "ready"
    ? { kind: "ready", spots: [...previous.spots.filter(item => item.locId !== spot.locId), spot] } : previous);
  const act = async (locId: string, operation: () => Promise<void>) => {
    if (locks.current.has(locId) || collection.kind !== "ready") return false;
    locks.current.add(locId); setPending(new Set(locks.current)); setActionError("");
    try { await operation(); return true; }
    catch (error) { setActionError(messageFor(error)); return false; }
    finally { locks.current.delete(locId); setPending(new Set(locks.current)); }
  };
  const saved = (locId: string) => collection.kind === "ready" ? collection.spots.find(item => item.locId === locId) : undefined;
  const toggle = (spot: BirdSpot) => act(spot.locId, async () => {
    if (saved(spot.locId)) {
      const removed = await store.remove(spot.locId);
      setCollection(previous => previous.kind === "ready" ? { kind: "ready", spots: previous.spots.filter(item => item.locId !== spot.locId) } : previous);
      setUndo(removed); setNotice("已取消收藏");
    } else { replace(await store.save(spot)); setNotice("已收藏鳥點"); }
  });
  const toggleObservation = (observation: Observation) => {
    const spot = normalizeBirdSpot(observation);
    if (spot) void toggle(spot);
    else setActionError("這筆舊紀錄沒有鳥點 ID，請重新搜尋後再收藏。");
  };
  const restore = async () => {
    if (!undo) return;
    const removed = undo;
    await act(removed.locId, async () => { replace(await store.restore(removed)); setUndo(null); setNotice("已復原收藏"); });
  };
  const saveNote = (spot: BirdSpot, note: string) => act(spot.locId, async () => {
    replace(await store.save(spot));
    replace(await store.update(spot.locId, { note }));
    setNotice("已儲存筆記");
  });
  const rows = view.kind === "detail" && recent.kind === "ready" ? recent.response.observations : [];
  const coordinates = rows.find(row => row.lat !== null && row.lng !== null);
  const detailSpot = view.kind === "detail" ? {
    ...view.spot,
    locName: view.spot.locName ?? rows.find(row => row.locName)?.locName ?? null,
    lat: view.spot.lat ?? coordinates?.lat ?? null,
    lng: view.spot.lng ?? coordinates?.lng ?? null,
    locationType: view.spot.locationType === "unknown" ? rows.find(row => row.locationType !== "unknown")?.locationType ?? "unknown" : view.spot.locationType,
  } : null;
  return { view, collection, recent, detailSpot, days, setDays: (value: number) => { if (value !== days) { invalidate(); setDays(value); } }, onlySpecies, setOnlySpecies, pending, saved,
    available: collection.kind === "ready", actionError, notice, undo, restore, toggle, toggleObservation,
    saveNote, loadCollection, dismissError: () => setActionError(""), close, openObservation, refresh: () => { invalidate(); setRevision(value => value + 1); } };
}
export type SearchBirdSpots = ReturnType<typeof useSearchBirdSpots>;
