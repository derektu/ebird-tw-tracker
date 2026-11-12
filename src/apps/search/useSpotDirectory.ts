import { useEffect, useRef, useState } from "react";
import { fetchBirdSpotDirectory, type BirdSpotDirectoryResponse } from "../../api/search-app-client.mjs";
import { readBrowserApiKey } from "../../storage/browser-api-key";

type Result = { kind: "idle" } | { kind: "loading"; query: string } | { kind: "ready"; query: string; directory: BirdSpotDirectoryResponse };

export function useSpotDirectory() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const active = useRef<AbortController | null>(null);
  const cancel = () => active.current?.abort();
  useEffect(() => cancel, []);
  const search = async () => {
    cancel();
    const controller = new AbortController();
    active.current = controller;
    setResult({ kind: "loading", query });
    let directory: BirdSpotDirectoryResponse;
    try {
      directory = await fetchBirdSpotDirectory({ apiKey: readBrowserApiKey() ?? "", signal: controller.signal });
    } catch {
      directory = { status: "unavailable", updatedAt: null, spots: [] };
    }
    if (!controller.signal.aborted) setResult({ kind: "ready", directory, query });
  };
  return { query, setQuery, result, search, cancel };
}
export type SpotDirectory = ReturnType<typeof useSpotDirectory>;
