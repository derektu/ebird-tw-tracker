const defaultTimeoutMs = 10_000;

export class SearchApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "SearchApiError";
    this.status = status;
    this.code = code;
  }
}

async function requestJson(path, { apiKey, request = fetch, timeoutMs = defaultTimeoutMs } = {}) {
  if (!apiKey) throw new SearchApiError(0, "missing_api_key", "請先輸入 eBird API key");

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response;
  try {
    response = await request(path, {
      method: "GET",
      headers: { "X-eBird-Api-Key": apiKey },
      signal: controller.signal,
    });
  } catch {
    throw new SearchApiError(0, "network_unavailable", timedOut
      ? "查詢逾時，請稍後再試"
      : "目前無法連線，請確認網路後再試");
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SearchApiError(response.status, payload?.code ?? "request_failed", payload?.error ?? "查詢失敗，請稍後再試");
  }
  return payload;
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
