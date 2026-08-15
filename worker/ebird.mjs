import { error } from "./responses.mjs";

const upstreamBase = "https://api.ebird.org/v2";

/**
 * Call one fixed eBird endpoint with an allowlisted pathname and query,
 * forwarding the caller's key only as the upstream auth header. Maps every
 * upstream failure to a bounded, key-free error response so route handlers
 * never see or relay upstream bodies.
 */
export async function callEbird(upstreamFetch, apiKey, pathname, query = {}) {
  const url = new URL(`${upstreamBase}${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  let upstreamResponse;
  try {
    upstreamResponse = await upstreamFetch(new Request(url, { headers: { "x-ebirdapitoken": apiKey } }));
  } catch {
    return { ok: false, response: error(503, "network_unavailable", "目前無法連線至 eBird，請稍後再試") };
  }

  if (upstreamResponse.status === 401 || upstreamResponse.status === 403) {
    return { ok: false, response: error(upstreamResponse.status, "invalid_api_key", "API key 無效或沒有權限") };
  }
  if (upstreamResponse.status === 429) {
    return { ok: false, response: error(429, "rate_limited", "eBird 暫時無法處理請求，請稍後再試") };
  }
  if (!upstreamResponse.ok) {
    return { ok: false, response: error(503, "upstream_unavailable", "目前無法取得 eBird 資料，請稍後再試") };
  }

  let data;
  try {
    data = await upstreamResponse.json();
  } catch {
    return { ok: false, response: error(502, "malformed_upstream_response", "eBird 回傳的資料無法解析") };
  }
  return { ok: true, data };
}
