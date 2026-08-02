export async function fetchEbirdWithKey(apiKey, pathname, query = {}) {
  const url = new URL(`https://api.ebird.org/v2${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { "x-ebirdapitoken": apiKey } });
  const text = await response.text();
  if (!response.ok) {
    throw Object.assign(new Error(`eBird API failed with ${response.status}: ${text.slice(0, 300)}`), {
      statusCode: response.status,
    });
  }
  return JSON.parse(text);
}

export async function validateApiKey(apiKey) {
  await fetchEbirdWithKey(apiKey, "/data/obs/TW/recent", { back: 1, maxResults: 1 });
}

export function createEbirdClient({ getApiKey }) {
  async function request(pathname, query = {}) {
    return fetchEbirdWithKey(await getApiKey(), pathname, query);
  }
  return { request };
}
