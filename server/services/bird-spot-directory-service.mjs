import { BirdSpotError } from "../../src/domain/bird-spots.mjs";
import { normalizeBirdSpotDirectory } from "../../src/domain/bird-spot-directory.mjs";

export const directoryTtlMs = 24 * 60 * 60 * 1000;
const unavailable = { code: "directory_unavailable", message: "公共鳥點目錄暫不可用，仍可搜尋自己的收藏" };

export async function fetchBirdSpotDirectory({ apiKey, upstreamFetch = fetch }) {
  try {
    const response = await upstreamFetch(new Request("https://api.ebird.org/v2/ref/hotspot/TW?fmt=json", {
      headers: { "x-ebirdapitoken": apiKey }, signal: AbortSignal.timeout(15_000),
    }));
    if (response.status === 401 || response.status === 403) throw new BirdSpotError(response.status, "invalid_api_key", "API key 無效或沒有權限");
    if (!response.ok) throw new BirdSpotError(503, "directory_unavailable", unavailable.message);
    return normalizeBirdSpotDirectory(await response.json());
  } catch (error) {
    if (error instanceof BirdSpotError) throw error;
    throw new BirdSpotError(503, "directory_unavailable", unavailable.message);
  }
}

export function createBirdSpotDirectoryService({ upstreamFetch = fetch, readCache, writeCache, now = Date.now } = {}) {
  let snapshot = null;
  let loaded = false;
  let loading;
  let refreshing;
  async function load() {
    if (loaded) return;
    loading ??= (async () => {
      try {
        const cached = await readCache?.();
        const fetchedAt = Date.parse(cached?.updatedAt);
        if (Number.isFinite(fetchedAt) && fetchedAt <= now()) {
          snapshot = { updatedAt: new Date(fetchedAt).toISOString(), spots: normalizeBirdSpotDirectory(cached.spots) };
        }
      } catch {}
      loaded = true;
    })();
    await loading;
  }
  function refresh(apiKey) {
    const task = { apiKey, promise: null };
    task.promise = (async () => {
      try {
        if (!apiKey) throw new BirdSpotError(400, "missing_api_key", "請設定 eBird API key");
        const spots = await fetchBirdSpotDirectory({ apiKey, upstreamFetch });
        snapshot = { spots, updatedAt: new Date(now()).toISOString() };
        try { await writeCache?.(snapshot); } catch {}
        return null;
      } catch (error) {
        return { code: error.code ?? unavailable.code, message: error.message ?? unavailable.message };
      }
    })().finally(() => { if (refreshing === task) refreshing = null; });
    refreshing = task;
    return task;
  }
  return {
    async directory(apiKey) {
      await load();
      if (snapshot && now() - Date.parse(snapshot.updatedAt) < directoryTtlMs) return { ...snapshot, status: "fresh", error: null };
      let task = refreshing ?? refresh(apiKey);
      let error = await task.promise;
      while (["invalid_api_key", "missing_api_key"].includes(error?.code) && task.apiKey !== apiKey) {
        task = refreshing ?? refresh(apiKey);
        error = await task.promise;
      }
      if (!error) return { ...snapshot, status: "fresh", error: null };
      return { spots: snapshot?.spots ?? [], updatedAt: snapshot?.updatedAt ?? null, status: snapshot ? "stale" : "unavailable", error };
    },
  };
}
