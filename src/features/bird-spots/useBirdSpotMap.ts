import L, { type Map as LeafletMap, type Marker } from "leaflet";
import { useEffect, useRef, type RefObject } from "react";
import type { DesktopBirdSpots } from "./useDesktopBirdSpots";

export function useBirdSpotMap({ model, mapRef, entriesRef, listRef }: {
  model: DesktopBirdSpots;
  mapRef: RefObject<LeafletMap | null>;
  entriesRef: RefObject<{ marker: Marker }[]>;
  listRef: RefObject<HTMLDivElement | null>;
}) {
  const snapshot = useRef<{ center: L.LatLng; zoom: number; scrollTop: number } | null>(null);
  const marker = useRef<Marker | null>(null);
  model.beforeDetailOpen.current = () => {
    const map = mapRef.current;
    if (map) snapshot.current ??= { center: map.getCenter(), zoom: map.getZoom(), scrollTop: listRef.current?.scrollTop ?? 0 };
  };
  model.beforeResultsReplace.current = () => {
    const map = mapRef.current;
    marker.current?.remove(); marker.current = null;
    if (map && snapshot.current) {
      entriesRef.current.forEach(entry => entry.marker.addTo(map));
      map.setView(snapshot.current.center, snapshot.current.zoom, { animate: false });
    }
    snapshot.current = null;
  };
  const { workspaceView: view, recent } = model;
  const spot = model.detailSpot;
  const metadata = recent.kind === "ready" && recent.response.locId === spot?.locId ? recent.response.observations.find(o => o.lat !== null && o.lng !== null) : null;
  const lat = spot?.lat ?? metadata?.lat ?? null;
  const lng = spot?.lng ?? metadata?.lng ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    marker.current?.remove(); marker.current = null;
    if (view.kind === "detail") {
      snapshot.current ??= { center: map.getCenter(), zoom: map.getZoom(), scrollTop: listRef.current?.scrollTop ?? 0 };
      entriesRef.current.forEach(entry => map.removeLayer(entry.marker));
      map.closePopup();
      if (lat !== null && lng !== null) {
        const icon = L.divIcon({ className: "bird-spot-marker", html: "●", iconSize: [34, 34], iconAnchor: [17, 17] });
        marker.current = L.marker([lat, lng], { icon }).addTo(map);
        map.setView([lat, lng], 13, { animate: false });
      }
    } else if (snapshot.current) {
      entriesRef.current.forEach(entry => entry.marker.addTo(map));
      map.setView(snapshot.current.center, snapshot.current.zoom, { animate: false });
      const scrollTop = snapshot.current.scrollTop;
      window.requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = scrollTop; });
      snapshot.current = null;
    }
    if (view.kind === "spot-results") entriesRef.current.forEach(entry => map.removeLayer(entry.marker));
    else if (view.kind === "results") entriesRef.current.forEach(entry => entry.marker.addTo(map));
  }, [view, lat, lng, mapRef, entriesRef, listRef]);
  useEffect(() => () => { marker.current?.remove(); }, []);
  return { hasCoordinates: lat !== null && lng !== null };
}
