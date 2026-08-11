import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../../api/client";
import type { Species } from "../../types/domain";
import { createDesktopSearchRuntime } from "./desktop-search-runtime.mjs";
import { createDesktopSearchSnapshotStore } from "./desktop-search-snapshot-store.mjs";
import { createSearchWorkflow } from "./search-workflow.mjs";
import type {
  ObservationsResponse,
  SearchRequest,
  SearchObservationRequest,
  SearchWorkflowEvent,
  SpeciesResolveResponse,
  SpeciesSearchResponse,
} from "./types";

function publishStatus(message: string, isError = false) {
  window.dispatchEvent(new CustomEvent("app:status", { detail: { message, isError } }));
}

export function SearchToolbar() {
  const [query, setQuery] = useState("彩鷸");
  const [days, setDays] = useState(3);
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);
  const [savedSpecies, setSavedSpecies] = useState<Species[]>([]);
  const [suggestions, setSuggestions] = useState<Species[]>([]);
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef<HTMLLabelElement>(null);
  const runtimeRef = useRef<ReturnType<typeof createDesktopSearchRuntime> | null>(null);
  const snapshotStoreRef = useRef<ReturnType<typeof createDesktopSearchSnapshotStore> | null>(null);
  const workflowRef = useRef<ReturnType<typeof createSearchWorkflow> | null>(null);

  const fetchSavedSpecies = useCallback(() => fetchJson<Species[]>("/api/species/saved"), []);

  if (!runtimeRef.current) {
    runtimeRef.current = createDesktopSearchRuntime({
        fetchSavedSpecies,
        publishSavedSpecies(species) {
          setSavedSpecies(species);
        },
        async resolveSpecies(query) {
          const payload = await fetchJson<SpeciesResolveResponse>(
            `/api/species/resolve?q=${encodeURIComponent(query)}`,
          );
          return payload.species;
        },
        fetchObservations({ species, days }: SearchObservationRequest) {
          return fetchJson<ObservationsResponse>(
            `/api/observations?speciesCode=${encodeURIComponent(species.speciesCode)}&days=${days}`,
          );
        },
        rememberStartupSpecies(species) {
          setSavedSpecies([species]);
        },
      });
  }
  const runtime = runtimeRef.current;

  if (!snapshotStoreRef.current) {
    snapshotStoreRef.current = createDesktopSearchSnapshotStore({ request: fetchJson });
  }

  if (!workflowRef.current) {
    workflowRef.current = createSearchWorkflow({
      runtime,
      snapshots: snapshotStoreRef.current,
      publish(event: SearchWorkflowEvent) {
        if (event.type === "busy") {
          setBusy(event.busy);
          if (!event.busy) return;
          setDays(event.days);
          setSuggestions([]);
          if (event.species) {
            setSelectedSpecies(event.species);
            setQuery(event.species.comName);
            publishStatus(`查詢 ${event.species.comName} / 最近 ${event.days} 天...`);
          } else {
            publishStatus("搜尋中...");
          }
          return;
        }

        if (event.type === "completed") {
          const { result } = event;
          setSelectedSpecies(result.species);
          setQuery(result.species.comName);
          setDays(result.days);
          setSuggestions([]);
          window.dispatchEvent(new CustomEvent("search:results", { detail: result }));
          window.dispatchEvent(new CustomEvent("search:completed", { detail: result }));
          publishStatus(
            `${result.species.comName} 最近 ${result.days} 天：${result.payload.observations.length} 筆有座標紀錄`,
          );
          return;
        }

        window.dispatchEvent(new CustomEvent("search:failed", { detail: event.error }));
        publishStatus(event.error.message, true);
      },
      onStale(request: { requestId: string; source: "startup" | "explicit" | "notification-focus" }) {
        window.dispatchEvent(new CustomEvent("search:stale", { detail: request }));
      },
      onCancelled() {
        publishStatus("準備查詢");
      },
    });
  }
  const workflow = workflowRef.current;

  const resolveCurrentSpecies = useCallback(async () => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) throw new Error("請輸入鳥種名稱或 species code");
    if (
      selectedSpecies &&
      (normalizedQuery === selectedSpecies.comName || normalizedQuery === selectedSpecies.speciesCode)
    ) {
      return selectedSpecies;
    }
    const species = await runtime.resolveSpecies(
      { source: "explicit", query: normalizedQuery, days },
      { isCurrent: () => true },
    );
    setSelectedSpecies(species);
    setQuery(species.comName);
    return species;
  }, [days, query, runtime, selectedSpecies]);

  useEffect(() => {
    const initialize = async () => {
      try {
        await workflow.run({ source: "startup", days: 3 });
      } catch (error) {
        publishStatus(error instanceof Error ? error.message : "初始資料讀取失敗", true);
      }
    };
    void initialize();
  }, [workflow]);

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const request = (event as CustomEvent<SearchRequest>).detail;
      void workflow.run(request);
    };
    window.addEventListener("search:request", handleRequest);
    return () => window.removeEventListener("search:request", handleRequest);
  }, [workflow]);

  useEffect(() => {
    const invalidate = () => workflow.invalidate();
    window.addEventListener("search:invalidate", invalidate);
    return () => window.removeEventListener("search:invalidate", invalidate);
  }, [workflow]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery === selectedSpecies?.comName) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const payload = await fetchJson<SpeciesSearchResponse>(`/api/species/search?q=${encodeURIComponent(normalizedQuery)}`);
        setSuggestions(payload.results);
      } catch (error) {
        publishStatus(error instanceof Error ? error.message : "鳥種搜尋失敗", true);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, selectedSpecies?.comName]);

  useEffect(() => {
    if (!suggestions.length) return;
    const close = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || fieldRef.current?.contains(event.target)) return;
      setSuggestions([]);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [suggestions.length]);

  function chooseSpecies(species: Species) {
    setSelectedSpecies(species);
    setQuery(species.comName);
    setSuggestions([]);
    publishStatus(`已辨識 ${species.comName} / ${species.speciesCode}`);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = query.trim();
    const species = selectedSpecies &&
      (normalizedQuery === selectedSpecies.comName || normalizedQuery === selectedSpecies.speciesCode)
      ? selectedSpecies
      : undefined;
    void workflow.run({ source: "explicit", species, query: species ? undefined : normalizedQuery, days });
  }

  async function addTracking() {
    try {
      const species = await resolveCurrentSpecies();
      window.dispatchEvent(new CustomEvent("tracking:add-current", { detail: { species, days } }));
    } catch (error) {
      publishStatus(error instanceof Error ? error.message : "鳥種辨識失敗", true);
    }
  }

  return (
    <form className="search" onSubmit={submitSearch}>
      <label className="field species-field" ref={fieldRef}>
        <span>鳥種</span>
        <input
          type="text"
          value={query}
          autoComplete="off"
          placeholder="輸入中文名、英文名或 species code"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedSpecies(null);
          }}
          onFocus={() => setSuggestions(savedSpecies)}
          onClick={() => setSuggestions(savedSpecies)}
        />
        {suggestions.length > 0 && (
          <div className="suggestions">
            {suggestions.map((species) => (
              <button className="suggestion" type="button" key={species.speciesCode} onClick={() => chooseSpecies(species)}>
                <strong>{species.comName}</strong>
                <span>{species.sciName} / {species.speciesCode}</span>
              </button>
            ))}
          </div>
        )}
      </label>
      <label className="field days-field">
        <span>最近天數</span>
        <input type="number" min="1" max="30" value={days} onChange={(event) => setDays(Number(event.target.value))} />
      </label>
      <button className="primary" type="submit" disabled={busy}>搜尋</button>
      <button className="secondary" type="button" disabled={busy} onClick={() => void addTracking()}>加入追蹤</button>
    </form>
  );
}
