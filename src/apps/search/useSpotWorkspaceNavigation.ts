import { useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { BirdSpot, Observation, Species } from "../../types/domain";
import type { ManagerView, SearchBirdSpots } from "./useSearchBirdSpots";
import type { SpotEditor } from "./useSpotEditor";
import type { SheetState } from "./SearchBirdSpotDetail";

export function useSpotWorkspaceNavigation({ model, editor, map, sheet, setSheet, expanded, setExpanded, cancelSpecies }: {
  model: SearchBirdSpots;
  editor: SpotEditor;
  map: React.RefObject<LeafletMap | null>;
  sheet: SheetState;
  setSheet(value: SheetState): void;
  expanded: boolean;
  setExpanded(value: boolean): void;
  cancelSpecies(): void;
}) {
  const resultList = useRef<HTMLUListElement>(null);
  const resultsSide = useRef<HTMLElement>(null);
  const nameList = useRef<HTMLDivElement>(null);
  const detailList = useRef<HTMLDivElement>(null);
  const detailHeading = useRef<HTMLButtonElement>(null);
  const managerHeader = useRef<HTMLButtonElement>(null);
  const restoring = useRef(false);
  const capture = (focus: Element | null = document.activeElement) => ({
    center: map.current?.getCenter(), zoom: map.current?.getZoom(), sheet, expanded,
    resultTop: resultList.current?.scrollTop ?? 0, sideTop: resultsSide.current?.scrollTop ?? 0,
    nameTop: nameList.current?.scrollTop ?? 0, detailTop: detailList.current?.scrollTop ?? 0, focus,
  });
  type Snapshot = ReturnType<typeof capture>;
  const restore = (snapshot: Snapshot, visibleMap = true) => {
    restoring.current = true;
    setSheet(snapshot.sheet);
    setExpanded(snapshot.expanded);
    requestAnimationFrame(() => {
      if (visibleMap) {
        map.current?.invalidateSize();
        if (snapshot.center && snapshot.zoom !== undefined) map.current?.setView(snapshot.center, snapshot.zoom, { animate: false });
      }
      if (resultList.current) resultList.current.scrollTop = snapshot.resultTop;
      if (resultsSide.current) resultsSide.current.scrollTop = snapshot.sideTop;
      if (nameList.current) nameList.current.scrollTop = snapshot.nameTop;
      if (detailList.current) detailList.current.scrollTop = snapshot.detailTop;
      const focus = snapshot.focus instanceof HTMLElement && snapshot.focus.isConnected ? snapshot.focus : managerHeader.current ?? detailHeading.current;
      focus?.focus({ preventScroll: true });
      restoring.current = false;
    });
  };
  const detailReturn = useRef<Snapshot | null>(null);
  const background = useRef<{ snapshot: Snapshot; resume(): void; detailReturn: Snapshot | null } | null>(null);
  const view = model.view;
  const source = view.kind === "detail" ? view.origin : view;
  const manager = source.kind === "saved-edit" || source.kind === "saved-list" ? source : null;
  const managerVisible = manager !== null && view.kind !== "detail";
  const showDetail = () => {
    setSheet("half");
    setExpanded(false);
    requestAnimationFrame(() => detailHeading.current?.focus({ preventScroll: true }));
  };
  const openObservation = (observation: Observation, species: Species | null) => {
    const snapshot = capture();
    if (!model.openObservation(observation, species)) return;
    detailReturn.current = snapshot;
    showDetail();
  };
  const open = (spot: BirdSpot, origin: ManagerView | { kind: "spot-results" }, opener?: HTMLElement) => {
    detailReturn.current = capture(opener);
    model.open(spot, origin);
    showDetail();
  };
  const openManager = (opener: HTMLElement) => editor.request("open-manager", () => {
    cancelSpecies();
    background.current = { resume: model.resumeView, snapshot: capture(opener), detailReturn: detailReturn.current };
    model.navigate({ kind: "saved-list" });
    requestAnimationFrame(() => managerHeader.current?.focus({ preventScroll: true }));
  });
  const closeManager = () => {
    const previous = background.current;
    if (!previous) return;
    background.current = null;
    detailReturn.current = previous.detailReturn;
    previous.resume();
    restore(previous.snapshot);
  };
  const back = () => editor.request("back", () => {
    if (view.kind !== "detail") return;
    let origin = view.origin;
    if (origin.kind === "saved-edit") {
      const saved = model.saved(origin.locId);
      if (saved) editor.begin("metadata", saved);
      else origin = { kind: "saved-list" };
    }
    model.navigate(origin);
    if (detailReturn.current) restore(detailReturn.current, !manager);
    detailReturn.current = null;
  });
  const search = (kind: "results" | "spot-results") => {
    background.current = null;
    detailReturn.current = null;
    model.navigate({ kind });
  };
  return { manager, managerVisible, resultList, resultsSide, nameList, detailList, detailHeading, managerHeader, restoring, openObservation, open, openManager, closeManager, back, search };
}
