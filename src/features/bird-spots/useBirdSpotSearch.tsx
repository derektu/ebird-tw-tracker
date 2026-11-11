import { useEffect, useRef, useState } from "react";
import { searchBirdSpots } from "../../domain/bird-spot-directory.mjs";
import { fetchJson } from "../../api/client";
import type { BirdSpot } from "../../types/domain";
import type { DesktopBirdSpots } from "./useDesktopBirdSpots";

export interface BirdSpotSearchItem extends BirdSpot {
  alias?: string;
  englishName?: string | null;
  countryCode?: string | null;
  subnational1Code?: string | null;
  subnational2Code?: string | null;
}
interface DirectoryResult {
  status: "fresh" | "stale" | "unavailable";
  spots: BirdSpotSearchItem[];
  updatedAt: string | null;
  error: { code: string; message: string } | null;
}
type SearchState =
  | { kind: "idle" | "loading" }
  | { kind: "ready"; result: DirectoryResult; query: string }
  | { kind: "error"; message: string; query: string };
export function useBirdSpotSearch() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const sequence = useRef(0),
    controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const search = async () => {
    const token = ++sequence.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setState({ kind: "loading" });
    try {
      const result = await fetchJson<DirectoryResult>(
        `/api/bird-spots/search?q=${encodeURIComponent(query.trim())}`,
        { signal: request.signal },
      );
      if (token === sequence.current)
        setState({ kind: "ready", result, query });
    } catch (error) {
      if (token === sequence.current && !request.signal.aborted)
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "鳥點搜尋失敗",
          query,
        });
    }
  };
  return { query, setQuery, state, search };
}
export type BirdSpotSearch = ReturnType<typeof useBirdSpotSearch>;

export function matchingFavorites(model: DesktopBirdSpots, query: string) {
  return searchBirdSpots([], model.spots, query);
}
