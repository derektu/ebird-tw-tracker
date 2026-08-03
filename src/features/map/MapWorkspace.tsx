import L, { type Map as LeafletMap, type Marker } from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Observation, ObservationEvent, Species } from "../../types/domain";
import type { SearchRequest, SearchResult } from "../search/types";
import type { Tracker } from "../tracking/types";

const TAIWAN_BOUNDS = L.latLngBounds([21.75, 119.25], [25.45, 122.35]);
const MAP_LIMITS = L.latLngBounds([20.9, 118.2], [26.4, 123.4]);
const SHOW_SELECTED_CHECKLIST_CARD = false;

interface MapEntry {
  marker: Marker;
  observation: Observation;
}

function publishStatus(message: string, isError = false) {
  window.dispatchEvent(new CustomEvent("app:status", { detail: { message, isError } }));
}

function createMarkerIcon(observation: Observation, active = false) {
  const size = active ? 34 : 28;
  const marker = document.createElement("div");
  marker.className = ["bird-marker", observation.locationPrivate ? "private" : "", active ? "active" : ""]
    .filter(Boolean)
    .join(" ");
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

function requestSpeciesSearch(species: Species, days: number, requestId: string) {
  return new Promise<SearchResult>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("鳥種搜尋逾時"));
    }, 30_000);
    const completed = (event: Event) => {
      const result = (event as CustomEvent<SearchResult>).detail;
      if (result.requestId !== requestId) return;
      cleanup();
      resolve(result);
    };
    const failed = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId: string; message: string }>).detail;
      if (detail.requestId !== requestId) return;
      cleanup();
      reject(new Error(detail.message));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("search:completed", completed);
      window.removeEventListener("search:failed", failed);
    };
    window.addEventListener("search:completed", completed);
    window.addEventListener("search:failed", failed);
    const request: SearchRequest = { requestId, species, days };
    window.dispatchEvent(new CustomEvent("search:request", { detail: request }));
  });
}

export function MapWorkspace() {
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const entriesRef = useRef<MapEntry[]>([]);
  const listItemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const observationsRef = useRef<Observation[]>([]);
  const speciesRef = useRef<Species | null>(null);
  const searchDaysRef = useRef(3);
  const trackersRef = useRef<Tracker[]>([]);
  const pendingNotificationRef = useRef<ObservationEvent | null>(null);
  const requestSequence = useRef(0);
  const [species, setSpecies] = useState<Species | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const activate = useCallback((index: number, zoomToPoint = false, openPopup = true) => {
    const entries = entriesRef.current;
    if (index < 0 || index >= entries.length) return;
    entries.forEach((entry, entryIndex) => entry.marker.setIcon(createMarkerIcon(entry.observation, entryIndex === index)));
    setActiveIndex(index);
    listItemsRef.current[index]?.scrollIntoView({ block: "nearest" });
    const entry = entries[index];
    if (zoomToPoint) mapRef.current?.setView([entry.observation.lat, entry.observation.lng], 13, { animate: true });
    if (openPopup) entry.marker.openPopup();
  }, []);

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

  useEffect(() => {
    const handleResults = (event: Event) => {
      const result = (event as CustomEvent<SearchResult>).detail;
      speciesRef.current = result.species;
      searchDaysRef.current = result.days;
      observationsRef.current = result.payload.observations;
      setSpecies(result.species);
      setObservations(result.payload.observations);
      setActiveIndex(result.payload.observations.length ? 0 : -1);
    };
    const handleTrackers = (event: Event) => {
      trackersRef.current = (event as CustomEvent<{ trackers: Tracker[] }>).detail.trackers;
    };
    const handleNotification = async (event: Event) => {
      const selected = (event as CustomEvent<ObservationEvent>).detail;
      try {
        if (speciesRef.current?.speciesCode !== selected.species.speciesCode) {
          pendingNotificationRef.current = selected;
          const tracker = trackersRef.current.find(
            (candidate) => candidate.species.speciesCode === selected.species.speciesCode,
          );
          const requestId = `map-${++requestSequence.current}`;
          await requestSpeciesSearch(selected.species, tracker?.days ?? searchDaysRef.current, requestId);
          return;
        }
        const index = observationsRef.current.findIndex(
          (observation) =>
            observation.subId === selected.observation.subId && observation.obsDt === selected.observation.obsDt,
        );
        if (index >= 0) {
          activate(index, true);
        } else {
          mapRef.current?.setView([selected.observation.lat, selected.observation.lng], 13, { animate: true });
          publishStatus(`${selected.species.comName} 新紀錄：${selected.observation.locName}`);
        }
      } catch (error) {
        pendingNotificationRef.current = null;
        publishStatus(error instanceof Error ? error.message : "通知定位失敗", true);
      }
    };
    window.addEventListener("search:results", handleResults);
    window.addEventListener("tracking:updated", handleTrackers);
    window.addEventListener("notification:selected", handleNotification);
    return () => {
      window.removeEventListener("search:results", handleResults);
      window.removeEventListener("tracking:updated", handleTrackers);
      window.removeEventListener("notification:selected", handleNotification);
    };
  }, [activate]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    entriesRef.current.forEach(({ marker }) => marker.remove());
    entriesRef.current = observations.map((observation, index) => {
      const marker = L.marker([observation.lat, observation.lng], { icon: createMarkerIcon(observation, index === 0) })
        .addTo(map)
        .bindPopup(createPopup(observation));
      marker.on("click", () => activate(index));
      return { marker, observation };
    });
    listItemsRef.current = [];
    map.fitBounds(TAIWAN_BOUNDS, { padding: [18, 18] });
    map.closePopup();

    const pending = pendingNotificationRef.current;
    if (pending) {
      pendingNotificationRef.current = null;
      const index = observations.findIndex(
        (observation) =>
          observation.subId === pending.observation.subId && observation.obsDt === pending.observation.obsDt,
      );
      if (index >= 0) {
        activate(index, true);
      } else {
        map.setView([pending.observation.lat, pending.observation.lng], 13, { animate: true });
        publishStatus(`${pending.species.comName} 新紀錄：${pending.observation.locName}`);
      }
    }
  }, [activate, observations]);

  const activeObservation = activeIndex >= 0 ? observations[activeIndex] : null;
  const birdCount = useMemo(
    () => observations.reduce((sum, observation) => sum + (observation.howMany ?? 0), 0),
    [observations],
  );
  const privateCount = useMemo(
    () => observations.filter((observation) => observation.locationPrivate).length,
    [observations],
  );

  return (
    <main className="workspace">
      <section className="map-shell">
        <div ref={mapNodeRef} id="map" aria-label="鳥種觀察位置地圖" />
        <button
          className="map-button"
          type="button"
          onClick={() => mapRef.current?.fitBounds(TAIWAN_BOUNDS, { padding: [18, 18] })}
        >
          顯示全台
        </button>
        {SHOW_SELECTED_CHECKLIST_CARD && (
          <section className="selected-card">
            <div>
              <strong>
                {activeObservation
                  ? `${activeObservation.comName || species?.comName || "鳥種"} · ${activeObservation.locName}`
                  : observations.length
                    ? "尚未選擇紀錄"
                    : "沒有找到紀錄"}
              </strong>
              <span>
                {activeObservation
                  ? `${activeObservation.obsDt} / ${activeObservation.howMany ?? "?"} 隻 / ${activeObservation.subId}`
                  : observations.length
                    ? "請點選地圖 marker 或右側列表。"
                    : "請調整鳥種或日期範圍。"}
              </span>
            </div>
            {activeObservation && (
              <a
                className="selected-link"
                href={`https://ebird.org/checklist/${encodeURIComponent(activeObservation.subId)}`}
                target="_blank"
                rel="noreferrer"
              >
                Checklist
              </a>
            )}
          </section>
        )}
      </section>

      <aside className="side">
        <section className="summary">
          <div className="metric"><strong>{observations.length}</strong><span>紀錄</span></div>
          <div className="metric"><strong>{birdCount}</strong><span>隻數合計</span></div>
          <div className="metric"><strong>{privateCount}</strong><span>自訂地點</span></div>
        </section>
        <section className="current">
          <strong>{species?.comName ?? "鳥種"}</strong>
          <span>{species?.speciesCode ?? ""}</span>
        </section>
        <div className="list">
          {observations.length ? observations.map((observation, index) => (
            <button
              className={`item${activeIndex === index ? " active" : ""}`}
              type="button"
              key={`${observation.subId}-${observation.obsDt}-${index}`}
              ref={(node) => { listItemsRef.current[index] = node; }}
              onClick={() => activate(index, true)}
            >
              <div className="item-title"><span>{observation.locName}</span><span>{observation.howMany ?? "?"}</span></div>
              <div className="item-meta">{observation.obsDt} / {observation.subId}</div>
              {observation.locationPrivate && <div className="tag">自訂地點</div>}
            </button>
          )) : (
            <div className="empty">這個條件沒有找到有座標的公開紀錄。</div>
          )}
        </div>
      </aside>
    </main>
  );
}
