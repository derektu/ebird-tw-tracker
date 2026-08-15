import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { fetchObservations, resolveSpecies, searchSpecies } from "../../api/search-app-client.mjs";
import { readBrowserApiKey } from "../../storage/browser-api-key";
import type { Observation, Species } from "../../types/domain";
import type { SearchWorkflowEvent } from "../../features/search/types";
import { createSearchAppRuntime } from "./search-app-runtime.mjs";
import { createSearchWorkflow } from "../../features/search/search-workflow.mjs";

export function SearchWorkspace() {
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(3);
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);
  const [suggestions, setSuggestions] = useState<Species[]>([]);
  const [busy, setBusy] = useState(false);
  const [species, setSpecies] = useState<Species | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [searched, setSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fieldRef = useRef<HTMLLabelElement>(null);
  const workflowRef = useRef<ReturnType<typeof createSearchWorkflow> | null>(null);

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
          setSearched(true);
          setSuggestions([]);
          return;
        }
        setErrorMessage(event.error.message);
      },
    });
  }
  const workflow = workflowRef.current;

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
    if (!suggestions.length) return;
    const close = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || fieldRef.current?.contains(event.target)) return;
      setSuggestions([]);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [suggestions.length]);

  const chooseSpecies = useCallback((chosen: Species) => {
    setSelectedSpecies(chosen);
    setQuery(chosen.comName);
    setSuggestions([]);
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
      </section>

      <section className="search-results" aria-label="觀察紀錄結果">
        {species && (
          <p className="search-results-summary">
            {species.comName}（{species.speciesCode}）最近 {days} 天：{observations.length} 筆有座標紀錄
          </p>
        )}
        {searched && observations.length === 0 && (
          <p className="search-results-empty">這個條件沒有找到有座標的公開紀錄。</p>
        )}
        {observations.length > 0 && (
          <ul className="observation-list">
            {observations.map((observation) => (
              <li className="observation-card" key={`${observation.subId}-${observation.obsDt}`}>
                <div className="observation-title">
                  <span className="observation-loc-name">{observation.locName}</span>
                  <span className="observation-count">{observation.howMany ?? "數量未知"}</span>
                </div>
                <div className="observation-meta">
                  <span>{observation.obsDt}</span>
                  <span>{observation.locationPrivate ? "自訂地點" : "公開熱點或公開地點"}</span>
                  <span>Checklist {observation.subId}</span>
                </div>
                <div className="observation-actions">
                  <a
                    className="search-app-secondary"
                    href={`https://ebird.org/checklist/${encodeURIComponent(observation.subId)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Checklist
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
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
