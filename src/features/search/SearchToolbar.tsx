import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../../api/client";
import type { Species } from "../../types/domain";
import type {
  ObservationsResponse,
  SearchRequest,
  SearchResult,
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
  const requestSequence = useRef(0);

  const nextRequestId = useCallback(() => `search-${++requestSequence.current}`, []);

  const loadSavedSpecies = useCallback(async () => {
    const saved = await fetchJson<Species[]>("/api/species/saved");
    setSavedSpecies(saved);
    return saved;
  }, []);

  const performSearch = useCallback(async (species: Species, requestedDays: number, requestId = nextRequestId()) => {
    const normalizedDays = Math.max(1, Math.min(requestedDays, 30));
    setBusy(true);
    setSelectedSpecies(species);
    setQuery(species.comName);
    setDays(normalizedDays);
    setSuggestions([]);
    publishStatus(`查詢 ${species.comName} / 最近 ${normalizedDays} 天...`);
    try {
      const payload = await fetchJson<ObservationsResponse>(
        `/api/observations?speciesCode=${encodeURIComponent(species.speciesCode)}&days=${normalizedDays}`,
      );
      const result: SearchResult = { requestId, species, days: normalizedDays, payload };
      window.dispatchEvent(new CustomEvent("search:results", { detail: result }));
      window.dispatchEvent(new CustomEvent("search:completed", { detail: result }));
      publishStatus(`${species.comName} 最近 ${normalizedDays} 天：${payload.observations.length} 筆有座標紀錄`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "鳥種查詢失敗";
      window.dispatchEvent(new CustomEvent("search:failed", { detail: { requestId, message } }));
      publishStatus(message, true);
    } finally {
      setBusy(false);
    }
  }, [nextRequestId]);

  const resolveCurrentSpecies = useCallback(async () => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) throw new Error("請輸入鳥種名稱或 species code");
    if (
      selectedSpecies &&
      (normalizedQuery === selectedSpecies.comName || normalizedQuery === selectedSpecies.speciesCode)
    ) {
      return selectedSpecies;
    }
    const payload = await fetchJson<SpeciesResolveResponse>(`/api/species/resolve?q=${encodeURIComponent(normalizedQuery)}`);
    if (!payload.species) throw new Error(`找不到 eBird 鳥種：${normalizedQuery}`);
    setSelectedSpecies(payload.species);
    setQuery(payload.species.comName);
    await loadSavedSpecies();
    return payload.species;
  }, [loadSavedSpecies, query, selectedSpecies]);

  useEffect(() => {
    const initialize = async () => {
      try {
        const saved = await loadSavedSpecies();
        let initial: Species | undefined = saved.find((species) => species.comName === "彩鷸") ?? saved.at(0);
        if (!initial) {
          const resolved = await fetchJson<SpeciesResolveResponse>("/api/species/resolve?q=%E5%BD%A9%E9%B7%B8");
          initial = resolved.species ?? undefined;
          if (initial) setSavedSpecies([initial]);
        }
        if (initial) {
          await performSearch(initial, 3);
        } else {
          publishStatus("請先輸入鳥種");
        }
      } catch (error) {
        publishStatus(error instanceof Error ? error.message : "初始資料讀取失敗", true);
      }
    };
    void initialize();
  }, [loadSavedSpecies, performSearch]);

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const request = (event as CustomEvent<SearchRequest>).detail;
      void performSearch(request.species, request.days, request.requestId);
    };
    window.addEventListener("search:request", handleRequest);
    return () => window.removeEventListener("search:request", handleRequest);
  }, [performSearch]);

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

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const species = await resolveCurrentSpecies();
      await performSearch(species, days);
    } catch (error) {
      publishStatus(error instanceof Error ? error.message : "鳥種查詢失敗", true);
    }
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
