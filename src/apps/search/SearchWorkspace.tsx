import L, { type Map as LeafletMap, type Marker } from "leaflet";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchObservations, resolveSpecies, searchSpecies } from "../../api/search-app-client.mjs";
import { readBrowserApiKey } from "../../storage/browser-api-key";
import { createMarkerClassName } from "../../features/map/marker-presentation.mjs";
import type { Observation, Species } from "../../types/domain";
import type { SearchWorkflowEvent } from "../../features/search/types";
import { createChecklistIdentity, type SearchComparison } from "../../domain/search-discovery.mjs";
import { presentSearchComparison } from "../../domain/search-comparison-presentation.mjs";
import { createSearchAppRuntime } from "./search-app-runtime.mjs";
import { createIndexedDbSearchSnapshotStore } from "./browser-search-snapshot-store.mjs";
import { createSearchWorkflow } from "../../features/search/search-workflow.mjs";
import { readRecentSpecies, recordRecentSpecies } from "./recent-species-store.mjs";

import { useSearchBirdSpots } from "./useSearchBirdSpots";
import { SearchBirdSpotDetail, SearchBirdSpotMessages, type SheetState } from "./SearchBirdSpotDetail";

import { useSpotDirectory } from "./useSpotDirectory";
import { useSpotEditor } from "./useSpotEditor";
import { SearchSpotManager, SpotLeaveDialog } from "./SearchSpotManager";
import { SearchSpotResults } from "./SearchSpotResults";
import { useSpotWorkspaceNavigation } from "./useSpotWorkspaceNavigation";
import { SearchNavigation, SearchNavigationOverlay, SearchFormPanel, type SearchDestination, type SearchOverlay } from "./SearchNavigation";

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

export function SearchWorkspace({ onForgetKey }: { onForgetKey(): void }) {
  const birdSpots = useSearchBirdSpots();
  const editor = useSpotEditor(birdSpots);
  const directory = useSpotDirectory();
  const [mode, setMode] = useState<"species" | "spots">("species");
  const showingNames = birdSpots.view.kind === "spot-results";
  const showingDetail = birdSpots.view.kind === "detail";

  const [query, setQuery] = useState("");
  const [days, setDays] = useState("3");
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
  const [sheetState, setSheetState] = useState<SheetState>("half");
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 720px)").matches);
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [overlay, setOverlay] = useState<SearchOverlay>({ kind: "none" });
  const committed = useRef<{ query: string; days: string; selected: Species | null; spotQuery: string }>({ query: "", days: "3", selected: null, spotQuery: "" });
  const [publishedDays, setPublishedDays] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fieldRef = useRef<HTMLLabelElement>(null);
  const workflowRef = useRef<ReturnType<typeof createSearchWorkflow> | null>(null);
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const entriesRef = useRef<MapEntry[]>([]);
  const sheetHandleRef = useRef<HTMLButtonElement>(null);
  const reopenResultsRef = useRef<HTMLButtonElement>(null);
  const listItemsRef = useRef<Array<HTMLLIElement | null>>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const focusExpandedForm = useRef(false);
  const compactSearchRef = useRef<HTMLButtonElement>(null);
  const hiddenManagerHeaderRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (controlsExpanded && focusExpandedForm.current) searchInputRef.current?.focus();
    focusExpandedForm.current = false;
  }, [controlsExpanded]);

  const detailMarkerRef = useRef<Marker | null>(null);
  const nameHandleRef = useRef<HTMLButtonElement>(null);
  const navigation = useSpotWorkspaceNavigation({
    model: birdSpots, editor, map: mapRef, sheet: sheetState, setSheet: setSheetState,
    expanded: controlsExpanded, setExpanded: setControlsExpanded, cancelSpecies: () => workflowRef.current?.invalidate(),
  });
  const { resultList: resultListRef, resultsSide: resultsSideRef, detailHeading: detailHeadingRef, restoring: restoringResults } = navigation;

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
          setPublishedDays(result.days);
          committed.current = { ...committed.current, query: result.species.comName, days: String(result.days), selected: result.species };
          setSearched(true);
          setSheetState("half");
          setControlsExpanded(false);
          window.requestAnimationFrame(() => {
            if (window.matchMedia("(max-width: 720px)").matches) compactSearchRef.current?.focus();
          });
          setSuggestions([]);
          setRecentSpecies(recordRecentSpecies(result.species));
          return;
        }
        setErrorMessage(event.error.message);
        if (event.error.source === "explicit" && event.error.phase === "species-resolution") {
          setSpecies(null);
          setSelectedSpecies(null);
          setObservations([]);
          setComparison(null);
          setActiveIndex(-1);
          setSearched(false);
          setSheetState("half");
          setPublishedDays(null);
        }
        setControlsExpanded(true);
        window.requestAnimationFrame(() => {
          if (window.matchMedia("(max-width: 720px)").matches) searchInputRef.current?.focus();
        });
      },
    });
  }
  const workflow = workflowRef.current;
  useEffect(() => () => workflow.invalidate(), [workflow]);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 720px)");
    const resize = () => { setMobile(mobile.matches); if (!mobile.matches) setSheetState("half"); };
    mobile.addEventListener("change", resize);
    return () => mobile.removeEventListener("change", resize);
  }, []);
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
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
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

  useLayoutEffect(() => {
    if (!navigation.managerVisible) mapRef.current?.invalidateSize({ animate: false });
  }, [sheetState, birdSpots.view.kind, controlsExpanded, navigation.managerVisible]);

  useEffect(() => {
    if (birdSpots.view.kind !== "results" || restoringResults.current || sheetState === "collapsed" || activeIndex < 0) return;
    const item = listItemsRef.current[activeIndex];
    if (!item) return;
    const frame = window.requestAnimationFrame(() => item.scrollIntoView({ block: "nearest" }));
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, sheetState, birdSpots.view.kind, restoringResults]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (mode !== "species" || !normalizedQuery || normalizedQuery === selectedSpecies?.comName) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchSpecies(normalizedQuery, { apiKey: readBrowserApiKey() ?? "", signal: controller.signal });
        if (!controller.signal.aborted) setSuggestions(results);
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [mode, query, selectedSpecies?.comName]);

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

  const detailSpot = birdSpots.detailSpot;
  const detailLat = detailSpot?.lat, detailLng = detailSpot?.lng;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    entriesRef.current.forEach(({ marker }) => { if (birdSpots.view.kind === "results") marker.addTo(map); else marker.remove(); });
    map.closePopup();
    if (showingDetail && detailLat != null && detailLng != null) {
      const element = document.createElement("div"); element.className = "bird-marker active"; element.textContent = "●";
      const marker = L.marker([detailLat, detailLng], { icon: L.divIcon({ className: "", html: element, iconSize: [34, 34], iconAnchor: [17, 17] }), title: "開啟鳥點詳情" }).addTo(map);
      marker.on("click", () => { setSheetState("half"); window.requestAnimationFrame(() => detailHeadingRef.current?.focus({ preventScroll: true })); });
      marker.getElement()?.setAttribute("aria-label", "開啟鳥點詳情");
      detailMarkerRef.current = marker;
      map.setView([detailLat, detailLng], 13, { animate: false });
    }
    return () => { detailMarkerRef.current?.remove(); detailMarkerRef.current = null; };
  }, [birdSpots.view.kind, showingDetail, detailLat, detailLng, observations]);

  useEffect(() => {
    const map = mapRef.current;
    const heading = detailHeadingRef.current;
    if (!map || !showingDetail || !heading || detailLat == null || detailLng == null) return;
    const container = map.getContainer();
    const sheet = heading.closest("aside");
    let frame = 0;
    const positionMarker = () => {
      if (!window.matchMedia("(max-width: 720px)").matches) return;
      map.invalidateSize({ animate: false, pan: false });
      const bounds = container.getBoundingClientRect();
      const visibleHeight = sheetState === "collapsed" || !sheet ? bounds.height : Math.min(bounds.height, sheet.getBoundingClientRect().top - bounds.top);
      if (visibleHeight < 64) return;
      const marker = map.latLngToContainerPoint([detailLat, detailLng]);
      map.panBy([marker.x - bounds.width / 2, marker.y - visibleHeight / 2], { animate: false });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(positionMarker);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    if (sheet) observer.observe(sheet);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [showingDetail, detailLat, detailLng, sheetState, controlsExpanded, detailHeadingRef]);

  useEffect(() => {
    if (directory.result.kind === "ready") committed.current.spotQuery = directory.result.query;
  }, [directory.result]);

  const chooseSpecies = useCallback((chosen: Species) => {
    setSelectedSpecies(chosen);
    setQuery(chosen.comName);
    setSuggestions([]);
    setShowRecent(false);
  }, []);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    editor.request("search", () => {
      if (mode === "spots") {
        workflow.invalidate();
        navigation.search("spot-results");
        void directory.search();
        setSheetState("half");
        setControlsExpanded(false);
        requestAnimationFrame(() => {
          if (window.matchMedia("(max-width: 720px)").matches) compactSearchRef.current?.focus();
        });
        return;
      }
      const normalizedQuery = query.trim();
      const chosen = selectedSpecies && (normalizedQuery === selectedSpecies.comName || normalizedQuery === selectedSpecies.speciesCode) ? selectedSpecies : undefined;
      if (!chosen && !normalizedQuery) {
        setControlsExpanded(true);
        setErrorMessage("請輸入鳥種名稱、英文名或 species code");
        return;
      }
      directory.cancel();
      navigation.search("results");
      void workflow.run({ source: "explicit", species: chosen, query: chosen ? undefined : normalizedQuery, days: Number(days) });
    });
  };
  const cancelForm = () => {
    workflow.invalidate();
    directory.cancel();
    setQuery(committed.current.query);
    setDays(committed.current.days);
    setSelectedSpecies(committed.current.selected);
    directory.setQuery(committed.current.spotQuery);
    setSuggestions([]);
    setShowRecent(false);
    setErrorMessage(null);
    setControlsExpanded(false);
    requestAnimationFrame(() => compactSearchRef.current?.focus({ preventScroll: true }));
  };
  const openForm = () => {
    setQuery(committed.current.query);
    setDays(committed.current.days);
    setSelectedSpecies(committed.current.selected);
    directory.setQuery(committed.current.spotQuery);
    setOverlay({ kind: "none" });
    focusExpandedForm.current = true;
    setControlsExpanded(true);
  };
  const chooseDestination = (destination: SearchDestination) => {
    setOverlay({ kind: "none" });
    editor.request("mode", () => {
      setControlsExpanded(false);
      workflow.invalidate();
      directory.cancel();
      setOverlay({ kind: "none" });
      if (destination === "settings") {
        setOverlay({ kind: "settings", confirmingRemoval: false });
        return;
      }
      if (destination === "saved") {
        if (!navigation.managerVisible) navigation.openManager(compactSearchRef.current ?? document.body);
        return;
      }
      if (navigation.manager) navigation.closeManager();
      setMode(destination);
      setErrorMessage(null);
      openForm();
    });
  };
  const closeOverlay = () => {
    setOverlay({ kind: "none" });
    requestAnimationFrame(() => (navigation.managerVisible ? navigation.managerHeader.current : compactSearchRef.current)?.focus({ preventScroll: true }));
  };
  const showingRecent = showRecent && !suggestions.length && !query.trim() && recentSpecies.length > 0;

  const comparisonPresentation = presentSearchComparison(comparison);

  const nameSummary = directory.result.kind !== "idle" && (showingNames || (birdSpots.view.kind === "detail" && birdSpots.view.origin.kind === "spot-results"))
    ? directory.result.query || "所有鳥點" : null;
  const toggleSheet = () => setSheetState(state => state === "expanded" ? "half" : "expanded");
  const collapse = () => { setSheetState("collapsed"); requestAnimationFrame(() => reopenResultsRef.current?.focus()); };
  const managerEditing = navigation.managerVisible && navigation.manager?.kind === "saved-edit";
  const obstructed = editor.leave.kind !== "idle" || (controlsExpanded && mobile) || overlay.kind !== "none";
  const formPanel = controlsExpanded && <SearchFormPanel inline={!mobile} title={mode === "species" ? "搜尋台灣鳥種觀察紀錄" : "搜尋鳥點"} onCancel={cancelForm}>
        <form className="search-form" onSubmit={submitSearch}>
          {mode === "spots" ? <label className="field species-field"><span>鳥點名稱</span>
            <input ref={searchInputRef} value={directory.query} onChange={event => directory.setQuery(event.target.value)} placeholder="地名、地區、收藏別名或筆記" />
          </label> : <><label className="field species-field" ref={fieldRef}>
            <span>鳥種</span>
            <input
              type="text"
              aria-label="鳥種"
              value={query}
              autoComplete="off"
              placeholder="輸入中文名、英文名或 species code"
              ref={searchInputRef}
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
              step={1}
              required
              value={days}
              disabled={busy}
              onChange={(event) => setDays(event.target.value)}
            />
          </label>
          </>}
          <button className="search-app-primary" type="submit" disabled={mode === "species" && busy}>
            {mode === "species" && busy ? "搜尋中…" : "搜尋"}
          </button>
        </form>
        <div className="search-panel-actions"><button type="button" className="search-app-secondary" onClick={cancelForm}>取消</button></div>
        {errorMessage && <p className="api-key-error" role="alert">{errorMessage}</p>}
    </SearchFormPanel>;
  return (<>
    <main className="search-workspace" inert={obstructed}>
      {!managerEditing && <SearchNavigation
        title={navigation.managerVisible ? "我的鳥點" : nameSummary ?? species?.comName ?? (mode === "spots" ? "搜尋鳥點" : "搜尋鳥種")}
        subtitle={navigation.managerVisible ? "" : nameSummary ? "鳥點" : publishedDays == null ? "" : `最近 ${publishedDays} 天`}
        saved={navigation.managerVisible} formOpen={controlsExpanded} searchRef={navigation.managerVisible ? navigation.managerHeader : compactSearchRef}
        onMenu={() => { cancelForm(); setOverlay({ kind: "menu" }); }} onDestination={chooseDestination} onSearch={() => editor.request("search", openForm)}
        onMap={() => navigation.closeManager()} />}
        {!nameSummary && species && (
          <p className="search-results-summary screen-reader-status">
            {species.comName}（{species.speciesCode}）最近 {publishedDays} 天：{observations.length} 筆有座標紀錄
            {comparisonPresentation.compactText && (
              <span className={`comparison-summary ${comparisonPresentation.compactTone}`}>
                {" · "}{comparisonPresentation.compactText}
              </span>
            )}
          </p>
        )}
        {!nameSummary && comparisonPresentation.assistiveStatus && (
          <p className="screen-reader-status" role="status">{comparisonPresentation.assistiveStatus}</p>
        )}
      {!mobile && formPanel}
      {!navigation.manager && birdSpots.view.kind === "results" && searched && observations.length === 0 && <p className="search-results-empty">這個條件沒有找到有座標的公開紀錄。</p>}


        {!nameSummary && !navigation.manager && comparisonPresentation.warningText && (
          <p className="search-comparison warning" role="alert">{comparisonPresentation.warningText}</p>
        )}
      <SearchBirdSpotMessages model={birdSpots} />
      {navigation.manager && <SearchSpotManager model={birdSpots} editor={editor} view={navigation.manager} hidden={!navigation.managerVisible}
        headerRef={managerEditing ? navigation.managerHeader : hiddenManagerHeaderRef} onClose={navigation.closeManager} onRecent={navigation.open} />}
      <section hidden={navigation.managerVisible} className="workspace" aria-label="觀察紀錄地圖與列表">
        <div className="map-shell">
          <div ref={mapNodeRef} id="map" aria-label="鳥種觀察位置地圖" />
          <button
            className="map-button"
            type="button"
            onClick={() => mapRef.current?.fitBounds(TAIWAN_BOUNDS, { padding: [18, 18] })}
          >
            顯示全台
          </button>
          {(observations.length > 0 || showingDetail || showingNames) && sheetState === "collapsed" && (
            <button
              className="reopen-results-button"
              type="button"
              ref={reopenResultsRef}
              aria-label={showingDetail ? "重開鳥點詳情" : showingNames ? "顯示鳥點搜尋結果" : `顯示 ${observations.length} 筆結果${comparisonPresentation.compactText ? `，${comparisonPresentation.compactText}` : ""}`}
              onClick={() => {
                setSheetState("half");
                window.requestAnimationFrame(() => (showingDetail ? detailHeadingRef.current : showingNames ? nameHandleRef.current : sheetHandleRef.current)?.focus());
              }}
            >
              {showingDetail ? "重開鳥點詳情" : showingNames ? "顯示鳥點搜尋結果" : `顯示 ${observations.length} 筆結果`}
            </button>
          )}
        </div>
        {observations.length > 0 && (
        <aside ref={resultsSideRef} className="side" hidden={birdSpots.view.kind !== "results"} data-sheet-state={sheetState} aria-label="搜尋結果">
          <div className="bottom-sheet-controls">
            <span className="bottom-sheet-result-summary">
              {observations.length} 筆結果
              {comparisonPresentation.compactText && (
                <span className={`comparison-summary ${comparisonPresentation.compactTone}`}>
                  {" · "}{comparisonPresentation.compactText}
                </span>
              )}
            </span>
            <button
              className="sheet-handle"
              type="button"
              ref={sheetHandleRef}
              aria-pressed={sheetState === "expanded"}
              onClick={() => setSheetState((state) => state === "expanded" ? "half" : "expanded")}
            >
              {sheetState === "expanded" ? "縮小結果清單" : "展開結果清單"}
            </button>
            <button
              className="sheet-collapse-button"
              type="button"
              aria-label="收合結果清單"
              onClick={() => {
                setSheetState("collapsed");
                window.requestAnimationFrame(() => reopenResultsRef.current?.focus());
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <ul className="observation-list" ref={resultListRef}>
            {observations.map((observation, index) => {
              const selected = activeIndex === index;
              return (
                <li
                  className={`observation-card${selected ? " active" : ""}`}
                  key={`${observation.subId}-${observation.obsDt}`}
                  ref={(node) => { listItemsRef.current[index] = node; }}
                >
                  {selected && <div className="observation-location-row">
                    <button className="observation-spot-name" aria-label={`查看鳥點 ${observation.locName}`} onClick={() => navigation.openObservation(observation, species)}>{observation.locName} <span aria-hidden="true">›</span></button>
                    <button className="spot-icon-button" aria-label={`${birdSpots.saved(observation.locId ?? "") ? "取消收藏" : "收藏"} ${observation.locName}`} aria-pressed={Boolean(birdSpots.saved(observation.locId ?? ""))} disabled={!birdSpots.available || birdSpots.pending.has(observation.locId ?? "")} onClick={() => birdSpots.toggleObservation(observation)}>{birdSpots.saved(observation.locId ?? "") ? "★" : "☆"}</button>
                  </div>}
                  <button
                    className="observation-select"
                    type="button"
                    aria-label={`選取 ${observation.locName}`}
                    aria-pressed={selected}
                    onClick={() => activate(index, true)}
                  >
                    <span className="observation-title">
                      {!selected && <span className="observation-loc-name">{observation.locName}</span>}
                      <span className="observation-count">{observation.howMany ?? "數量未知"}</span>
                    </span>
                    <span className="observation-meta">
                      <span>{observation.obsDt}</span>
                      <span>{observation.locationPrivate ? "自訂地點" : "公開熱點或公開地點"}</span>
                      <span>Checklist {observation.subId}</span>
                    </span>
                    {discoveryIds.has(createChecklistIdentity(observation.speciesCode, observation.subId)) && <span className="search-discovery-tag">新增</span>}
                  </button>
                  <div className="observation-actions" role="group" aria-label={`${observation.locName} 的外部操作`}>
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
                </li>
              );
            })}
          </ul>
        </aside>
        )}
        <SearchSpotResults directory={directory} model={birdSpots} sheet={sheetState} hidden={!showingNames} handleRef={nameHandleRef} listRef={navigation.nameList}
          onOpen={spot => navigation.open(spot, { kind: "spot-results" })} onToggleSheet={toggleSheet} onCollapse={collapse} />
        <SearchBirdSpotDetail model={birdSpots} editor={editor} sheetState={sheetState} headingRef={detailHeadingRef} listRef={navigation.detailList}
          onBack={navigation.back} onToggleSheet={toggleSheet} onCollapse={collapse} />
      </section>
    </main>
    {mobile && formPanel}
    <SearchNavigationOverlay overlay={overlay} onClose={closeOverlay} onDestination={chooseDestination}
      onConfirmRemoval={confirmingRemoval => setOverlay({ kind: "settings", confirmingRemoval })} onForgetKey={onForgetKey} />
    <SpotLeaveDialog editor={editor} error={birdSpots.actionError} />
  </>);
}
