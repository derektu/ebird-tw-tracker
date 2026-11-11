import { BirdSpotError, mapBirdSpotObservations } from "../../src/domain/bird-spots.mjs";

export async function fetchBirdSpotRecent({ apiKey, locId, days, upstreamFetch = fetch }) {
  const url = new URL(`https://api.ebird.org/v2/data/obs/${encodeURIComponent(locId)}/recent`);
  url.searchParams.set("back", String(days));
  url.searchParams.set("includeProvisional", "true");
  url.searchParams.set("sppLocale", "zh");
  let response;
  try {
    response = await upstreamFetch(new Request(url, {
      headers: { "x-ebirdapitoken": apiKey },
      signal: AbortSignal.timeout(15_000),
    }));
  } catch {
    throw new BirdSpotError(503, "network_unavailable", "目前無法連線至 eBird，請稍後再試");
  }
  if (response.status === 401 || response.status === 403) {
    throw new BirdSpotError(response.status, "invalid_api_key", "API key 無效或沒有權限");
  }
  if (response.status === 404 || response.status === 410) {
    throw new BirdSpotError(410, "location_unavailable", "目前無法取得此鳥點資料");
  }
  if (response.status === 429) {
    throw new BirdSpotError(429, "rate_limited", "eBird 暫時無法處理請求，請稍後再試");
  }
  if (!response.ok) {
    throw new BirdSpotError(503, "upstream_unavailable", "目前無法取得 eBird 資料，請稍後再試");
  }
  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new BirdSpotError(502, "malformed_upstream_response", "eBird 回傳的資料無法解析");
    }
    throw new BirdSpotError(503, "network_unavailable", "目前無法連線至 eBird，請稍後再試");
  }
  return { locId, days, generatedAt: new Date().toISOString(), observations: mapBirdSpotObservations(data, locId) };
}

export function createBirdSpotService({ getApiKey, upstreamFetch = fetch }) {
  return {
    async recent(locId, days) {
      let apiKey;
      try {
        apiKey = await getApiKey();
      } catch {
        throw new BirdSpotError(400, "missing_api_key", "請設定 eBird API key");
      }
      return fetchBirdSpotRecent({ apiKey, locId, days, upstreamFetch });
    },
  };
}
