import L, { type Map as LeafletMap, type Marker } from "leaflet";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchObservations, resolveSpecies, searchSpecies } from "../../api/search-app-client.mjs";
import { readBrowserApiKey } from "../../storage/browser-api-key";
import { createMarkerClassName } from "../../features/map/marker-presentation.mjs";
import type { Observation, Species } from "../../types/domain";
import type { SearchWorkflowEvent } from "../../features/search/types";
import { createChecklistIdentity, type SearchComparison } from "../../domain/search-discovery.mjs";
import { createSearchAppRuntime } from "./search-app-runtime.mjs";
import { createIndexedDbSearchSnapshotStore } from "./browser-search-snapshot-store.mjs";
import { createSearchWorkflow } from "../../features/search/search-workflow.mjs";
import { readRecentSpecies, recordRecentSpecies } from "./recent-species-store.mjs";

const TAIWAN_BOUNDS = L.latLngBounds([21.75, 119.25], [25.45, 122.35]);
const MAP_LIMITS = L.latLngBounds([20.9, 118.2], [26.4, 123.4]);

interface MapEntry {
  marker: Marker;
  observation: Observation;
  discovery: boolean;
}

function createMarkerIcon(observation: Observation, active: boolean, discovery = false) {
  const size = active ? 34 : 28;
  const marker = document.createElement("div");
  marker.className = createMarkerClassName({ locationPrivate: observation.locationPrivate, discovery, active });
  marker.textContent = observation.howMany == null ? "?" : String(observation.howMany);
  return L.divIcon({
    className: "",
    html: marker,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  });
}

function createPopup(observation: Observation) {
  const popup = document.createElement("div");
  popup.className = "popup";

  const title = document.createElement("strong");
  title.textContent = observation.locName;
  popup.append(title);

  const details = document.createElement("div");
  details.textContent = `${observation.obsDt} / ${observation.howMany ?? "?"} 隻`;
  popup.append(details);

  const locationType = document.createElement("div");
  locationType.textContent = observation.locationPrivate ? "自訂地點" : "公開熱點或公開地點";
  popup.append(locationType);

  const checklistLine = document.createElement("div");
  const checklist = document.createElement("a");
  checklist.href = `https://ebird.org/checklist/${encodeURIComponent(observation.subId)}`;
  checklist.target = "_blank";
  checklist.rel = "noreferrer";
  checklist.textContent = `開啟 checklist ${observation.subId}`;
  checklistLine.append(checklist);
  popup.append(checklistLine);

  const mapsLine = document.createElement("div");
  const maps = document.createElement("a");
  maps.href = `https://www.google.com/maps?q=${observation.lat},${observation.lng}`;
  maps.target = "_blank";
  maps.rel = "noreferrer";
  maps.textContent = "Google Maps";
  mapsLine.append(maps);
  popup.append(mapsLine);

  return popup;
}

function comparisonMessage(comparison: SearchComparison | null) {
  if (!comparison) return null;
  if (comparison.status === "baseline-created") return "已建立搜尋比較基準";
  if (comparison.status === "unavailable") return "搜尋比較暫時無法使用";
  const message = comparison.discoveryIds.length
    ? `新增 ${comparison.discoveryIds.length} 筆紀錄`
    : "沒有新增紀錄";
  return comparison.snapshotCommit === "save-failed" ? `${message}；基準未更新` : message;
}

function comparisonHasWarning(comparison: SearchComparison | null) {
  return comparison?.status === "unavailable" || (comparison?.status === "compared" && comparison.snapshotCommit === "save-failed");
}

export function SearchWorkspace() {
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(3);
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);
  const [suggestions, setSuggestions] = useState<Species[]>([]);
  const [recentSpecies, setRecentSpecies] = useState<Species[]>(() => readRecentSpecies());
  const [showRecent, setShowRecent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [species, setSpecies] = useState<Species | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [comparison, setComparison] = useState<SearchComparison | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searched, setSearched] = useState(false);
  const [sheetState, setSheetState] = useState<"half" | "expanded" | "collapsed">("half");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fieldRef = useRef<HTMLLabelElement>(null);
  const workflowRef = useRef<ReturnType<typeof createSearchWorkflow> | null>(null);
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const entriesRef = useRef<MapEntry[]>([]);
  const listRef = useRef<HTMLUListElement>(null);
  const listItemsRef = useRef<Array<HTMLLIElement | null>>([]);

  if (!workflowRef.current) {
    const runtime = createSearchAppRuntime({
      resolveSpecies: (term) => resolveSpecies(term, { apiKey: readBrowserApiKey() ?? "" }),
      fetchObservations: ({ species: requestSpecies, days: requestDays }) =>
        fetchObservations(
          { speciesCode: requestSpecies.speciesCode, days: requestDays },
          { apiKey: readBrowserApiKey() ?? "" },
        ),
    });
    workflowRef.current = createSearchWorkflow({
      runtime,
      snapshots: createIndexedDbSearchSnapshotStore(),
      publish(event: SearchWorkflowEvent) {
        if (event.type === "busy") {
          setBusy(event.busy);
          if (event.busy) setErrorMessage(null);
          return;
        }
        if (event.type === "completed") {
          const { result } = event;
          setSpecies(result.species);
          setSelectedSpecies(result.species);
          setQuery(result.species.comName);
          setObservations(result.observations);
          setComparison(result.comparison ?? null);
          setActiveIndex(result.observations.length ? 0 : -1);
          setSearched(true);
          setSheetState("half");
          setSuggestions([]);
          setRecentSpecies(recordRecentSpecies(result.species));
          return;
        }
        setErrorMessage(event.error.message);
      },
    });
  }
  const workflow = workflowRef.current;
  const discoveryIds = useMemo(() => new Set(comparison?.discoveryIds ?? []), [comparison]);

  useEffect(() => {
    if (!mapNodeRef.current) return;
    const map = L.map(mapNodeRef.current, {
      scrollWheelZoom: true,
      zoomControl: true,
      minZoom: 6,
      maxBounds: MAP_LIMITS,
      maxBoundsViscosity: 0.35,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    map.fitBounds(TAIWAN_BOUNDS, { padding: [18, 18] });
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      entriesRef.current = [];
      mapRef.current = null;
      map.remove();
    };
  }, []);

  const activate = useCallback((index: number, zoomToPoint = false) => {
    const entries = entriesRef.current;
    if (index < 0 || index >= entries.length) return;
    entries.forEach((entry, entryIndex) => entry.marker.setIcon(createMarkerIcon(entry.observation, entryIndex === index, entry.discovery)));
    setActiveIndex(index);
    const entry = entries[index];
    if (zoomToPoint) {
      const map = mapRef.current;
      // Activating from the result list can happen right after the map's
      // container changed size or visibility, so invalidateSize() keeps
      // Leaflet's tile grid in sync before panning to the pin.
      map?.invalidateSize();
      map?.setView([entry.observation.lat, entry.observation.lng], 13, { animate: true });
    }
    entry.marker.openPopup();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    entriesRef.current.forEach(({ marker }) => marker.remove());
    entriesRef.current = observations.map((observation, index) => {
      const discovery = discoveryIds.has(createChecklistIdentity(observation.speciesCode, observation.subId));
      const marker = L.marker([observation.lat, observation.lng], { icon: createMarkerIcon(observation, index === activeIndex, discovery) })
        .addTo(map)
        .bindPopup(createPopup(observation));
      marker.on("click", () => {
        setSheetState("half");
        activate(index);
      });
      return { marker, observation, discovery };
    });
    listItemsRef.current = [];
    if (observations.length) {
      // The workspace grows from search-form-only to showing the map and
      // result list here, so the container's on-screen size can change
      // right before this fit. Leaflet only recalculates tile positions
      // when told to, so nudge it before panning to the new bounds.
      map.invalidateSize();
      map.fitBounds(TAIWAN_BOUNDS, { padding: [18, 18] });
    }
    map.closePopup();
    // Selection changes update the active marker's icon directly through
    // activate(); this effect only rebuilds markers when the collection changes.
  }, [observations, comparison, activate]);

  useEffect(() => {
    if (!mapRef.current) return;
    const frame = window.requestAnimationFrame(() => mapRef.current?.invalidateSize());
    return () => window.cancelAnimationFrame(frame);
  }, [sheetState]);

  useEffect(() => {
    if (sheetState === "collapsed" || activeIndex < 0) return;
    const list = listRef.current;
    const item = listItemsRef.current[activeIndex];
    if (!list || !item) return;
    const frame = window.requestAnimationFrame(() => {
      list.scrollTo({
        top: Math.max(0, item.offsetTop - (list.clientHeight - item.offsetHeight) / 2),
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, sheetState]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery === selectedSpecies?.comName) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchSpecies(normalizedQuery, { apiKey: readBrowserApiKey() ?? "" });
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, selectedSpecies?.comName]);

  useEffect(() => {
    if (!suggestions.length && !showRecent) return;
    const close = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || fieldRef.current?.contains(event.target)) return;
      setSuggestions([]);
      setShowRecent(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [suggestions.length, showRecent]);

  const chooseSpecies = useCallback((chosen: Species) => {
    setSelectedSpecies(chosen);
    setQuery(chosen.comName);
    setSuggestions([]);
    setShowRecent(false);
  }, []);

  const submitSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const normalizedQuery = query.trim();
      const species =
        selectedSpecies && (normalizedQuery === selectedSpecies.comName || normalizedQuery === selectedSpecies.speciesCode)
          ? selectedSpecies
          : undefined;
      if (!species && !normalizedQuery) {
        setErrorMessage("請輸入鳥種名稱、英文名或 species code");
        return;
      }
      void workflow.run({ source: "explicit", species, query: species ? undefined : normalizedQuery, days });
    },
    [days, query, selectedSpecies, workflow],
  );

  const showingRecent = showRecent && !suggestions.length && !query.trim() && recentSpecies.length > 0;
  const visibleComparisonMessage = comparisonMessage(comparison);

  return (
    <main className="search-workspace">
      <section className="search-form-card" aria-labelledby="search-workspace-title">
        <p className="search-app-eyebrow">eBird Taiwan Search</p>
        <h1 id="search-workspace-title">搜尋台灣鳥種觀察紀錄</h1>
        <form className="search-form" onSubmit={submitSearch}>
          <label className="field species-field" ref={fieldRef}>
            <span>鳥種</span>
            <input
              type="text"
              value={query}
              autoComplete="off"
              placeholder="輸入中文名、英文名或 species code"
              disabled={busy}
              onFocus={() => setShowRecent(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedSpecies(null);
              }}
            />
            {suggestions.length > 0 && (
              <div className="suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    className="suggestion"
                    type="button"
                    key={suggestion.speciesCode}
                    onClick={() => chooseSpecies(suggestion)}
                  >
                    <strong>{suggestion.comName}</strong>
                    <span>{suggestion.sciName} / {suggestion.speciesCode}</span>
                  </button>
                ))}
              </div>
            )}
            {showingRecent && (
              <div className="suggestions" aria-label="最近搜尋鳥種">
                {recentSpecies.map((recent) => (
                  <button
                    className="suggestion"
                    type="button"
                    key={recent.speciesCode}
                    onClick={() => chooseSpecies(recent)}
                  >
                    <strong>{recent.comName}</strong>
                    <span>{recent.sciName} / {recent.speciesCode}</span>
                  </button>
                ))}
              </div>
            )}
          </label>
          <label className="field days-field">
            <span>最近天數</span>
            <input
              type="number"
              min={1}
              max={30}
              value={days}
              disabled={busy}
              onChange={(event) => setDays(Number(event.target.value))}
            />
          </label>
          <button className="search-app-primary" type="submit" disabled={busy}>
            {busy ? "搜尋中…" : "搜尋"}
          </button>
        </form>
        {errorMessage && <p className="api-key-error" role="alert">{errorMessage}</p>}
        {species && (
          <p className="search-results-summary">
            {species.comName}（{species.speciesCode}）最近 {days} 天：{observations.length} 筆有座標紀錄
          </p>
        )}
        {visibleComparisonMessage && (
          <p className={`search-comparison${comparisonHasWarning(comparison) ? " warning" : ""}`}>{visibleComparisonMessage}</p>
        )}
        {searched && observations.length === 0 && (
          <p className="search-results-empty">這個條件沒有找到有座標的公開紀錄。</p>
        )}
      </section>

      <section className="workspace" aria-label="觀察紀錄地圖與列表">
        <div className="map-shell">
          <div ref={mapNodeRef} id="map" aria-label="鳥種觀察位置地圖" />
          <button
            className="map-button"
            type="button"
            onClick={() => mapRef.current?.fitBounds(TAIWAN_BOUNDS, { padding: [18, 18] })}
          >
            顯示全台
          </button>
          {observations.length > 0 && sheetState === "collapsed" && (
            <button
              className="reopen-results-button"
              type="button"
              onClick={() => setSheetState("half")}
            >
              顯示 {observations.length} 筆結果
            </button>
          )}
        </div>
        <aside className="side" data-sheet-state={sheetState} aria-label="搜尋結果">
          <div className="bottom-sheet-controls">
            <button
              className="sheet-handle"
              type="button"
              aria-expanded={sheetState !== "collapsed"}
              onClick={() => setSheetState((state) => state === "expanded" ? "half" : "expanded")}
            >
              {sheetState === "expanded" ? "縮小結果清單" : "展開結果清單"}
            </button>
            <button
              className="sheet-collapse-button"
              type="button"
              aria-label="收合結果清單"
              onClick={() => setSheetState("collapsed")}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <ul className="observation-list" ref={listRef}>
            {observations.map((observation, index) => {
              const selected = activeIndex === index;
              return (
                <li
                  className={`observation-card${selected ? " active" : ""}`}
                  key={`${observation.subId}-${observation.obsDt}`}
                  ref={(node) => { listItemsRef.current[index] = node; }}
                >
                  <button
                    className="observation-select"
                    type="button"
                    aria-pressed={selected}
                    onClick={() => activate(index, true)}
                  >
                    <span className="observation-title">
                      <span className="observation-loc-name">{observation.locName}</span>
                      <span className="observation-count">{observation.howMany ?? "數量未知"}</span>
                    </span>
                    <span className="observation-meta">
                      <span>{observation.obsDt}</span>
                      <span>{observation.locationPrivate ? "自訂地點" : "公開熱點或公開地點"}</span>
                      <span>Checklist {observation.subId}</span>
                    </span>
                    {discoveryIds.has(createChecklistIdentity(observation.speciesCode, observation.subId)) && <span className="search-discovery-tag">新增</span>}
                  </button>
                  {selected && (
                    <div className="observation-actions" aria-label={`${observation.locName} 的外部操作`}>
                      <a
                        className="search-app-secondary"
                        href={`https://ebird.org/checklist/${encodeURIComponent(observation.subId)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        開啟 Checklist
                      </a>
                      <a
                        className="search-app-secondary"
                        href={`https://www.google.com/maps?q=${observation.lat},${observation.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Google Maps
                      </a>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
      </section>
    </main>
  );
}
