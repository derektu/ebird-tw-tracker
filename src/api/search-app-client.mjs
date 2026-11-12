const defaultTimeoutMs = 10_000;

export class SearchApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "SearchApiError";
    this.status = status;
    this.code = code;
  }
}

async function requestJson(path, { apiKey, request = fetch, timeoutMs = defaultTimeoutMs, signal } = {}) {
  if (!apiKey) throw new SearchApiError(0, "missing_api_key", "請先輸入 eBird API key");
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await request(path, {
      method: "GET", headers: { "X-eBird-Api-Key": apiKey }, signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (timedOut) throw new SearchApiError(0, "network_unavailable", "查詢逾時，請稍後再試");
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    if (!response.ok) {
      throw new SearchApiError(response.status, payload?.code ?? "request_failed", payload?.error ?? "查詢失敗，請稍後再試");
    }
    if (!payload || typeof payload !== "object") throw new SearchApiError(0, "invalid_response", "查詢回應不正確，請稍後再試");
    return payload;
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    if (error instanceof SearchApiError) throw error;
    throw new SearchApiError(0, "network_unavailable", timedOut ? "查詢逾時，請稍後再試" : "目前無法連線，請確認網路後再試");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export async function searchSpecies(query, options) {
  const payload = await requestJson(`/api/species/search?q=${encodeURIComponent(query)}`, options);
  return payload.results;
}

export async function resolveSpecies(query, options) {
  const payload = await requestJson(`/api/species/resolve?q=${encodeURIComponent(query)}`, options);
  return payload.species;
}

export function fetchObservations({ speciesCode, days }, options) {
  return requestJson(`/api/observations?speciesCode=${encodeURIComponent(speciesCode)}&days=${days}`, options);
}

export function fetchBirdSpotRecent({ locId, days }, options) {
  return requestJson(`/api/bird-spots/observations?locId=${encodeURIComponent(locId)}&days=${days}`, options);
}
