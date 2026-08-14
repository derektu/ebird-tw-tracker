import { callEbird } from "./ebird.mjs";

// A synthetic, fixed cache key with no query string and no caller key, so
// the edge cache entry can never embed or vary on a browser-owned API key.
const cacheKeyRequest = new Request("https://ebird-tw-search-cache.internal/taxonomy/zh-v1");
const maxAgeSeconds = 7 * 24 * 60 * 60;

/**
 * Load the fixed Chinese eBird taxonomy, preferring a same-shape edge cache
 * entry over an upstream call. The cache entry never carries the caller's
 * API key; the key is used only to authorize an upstream fetch on a miss.
 */
export async function loadTaxonomy({ upstreamFetch, apiKey, cache }) {
  if (cache) {
    const cached = await cache.match(cacheKeyRequest.clone());
    if (cached) return { ok: true, data: await cached.json() };
  }

  const result = await callEbird(upstreamFetch, apiKey, "/ref/taxonomy/ebird", { locale: "zh", fmt: "json" });
  if (!result.ok) return result;

  if (cache && Array.isArray(result.data)) {
    const cacheable = new Response(JSON.stringify(result.data), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": `public, max-age=${maxAgeSeconds}`,
      },
    });
    await cache.put(cacheKeyRequest.clone(), cacheable);
  }
  return result;
}
