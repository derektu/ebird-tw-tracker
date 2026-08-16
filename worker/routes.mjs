import { resolveTaxonomyMatch, searchTaxonomy } from "../server/domain/species.mjs";
import { mapObservations } from "../server/domain/observations.mjs";
import { callEbird } from "./ebird.mjs";
import { loadTaxonomy } from "./taxonomy.mjs";
import { error, json } from "./responses.mjs";

const speciesCodePattern = /^[A-Za-z0-9]{2,20}$/;
const maxQueryLength = 100;

function requireGet(request) {
  if (request.method !== "GET") return error(405, "method_not_allowed", "此 API 僅接受 GET");
  return null;
}

function requireApiKey(request) {
  const apiKey = request.headers.get("X-eBird-Api-Key")?.trim();
  if (!apiKey) return { error: error(400, "missing_api_key", "請輸入有效的 eBird API key") };
  return { apiKey };
}

function requireAllowedQuery(url, allowedKeys) {
  for (const key of url.searchParams.keys()) {
    if (!allowedKeys.includes(key)) return error(400, "unexpected_query", `不支援的 query parameter：${key}`);
  }
  return null;
}

function readSpeciesQuery(url) {
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!q) return { error: error(400, "missing_query", "請輸入鳥種名稱、英文名或 species code") };
  if (q.length > maxQueryLength) return { error: error(400, "query_too_long", "查詢字串過長") };
  return { q };
}

function readObservationQuery(url) {
  const speciesCode = url.searchParams.get("speciesCode")?.trim() ?? "";
  if (!speciesCodePattern.test(speciesCode)) {
    return { error: error(400, "invalid_species_code", "speciesCode 格式不正確") };
  }
  const daysRaw = url.searchParams.get("days")?.trim() ?? "";
  if (!/^\d{1,2}$/.test(daysRaw)) {
    return { error: error(400, "invalid_days", "days 必須是 1 到 30 之間的整數") };
  }
  const days = Number.parseInt(daysRaw, 10);
  if (days < 1 || days > 30) {
    return { error: error(400, "invalid_days", "days 必須是 1 到 30 之間的整數") };
  }
  return { speciesCode, days };
}

export async function handleSpeciesSearch(request, url, { upstreamFetch, cache }) {
  const methodError = requireGet(request);
  if (methodError) return methodError;
  const queryError = requireAllowedQuery(url, ["q"]);
  if (queryError) return queryError;
  const { apiKey, error: keyError } = requireApiKey(request);
  if (keyError) return keyError;
  const { q, error: queryValueError } = readSpeciesQuery(url);
  if (queryValueError) return queryValueError;

  const taxonomyResult = await loadTaxonomy({ upstreamFetch, apiKey, cache });
  if (!taxonomyResult.ok) return taxonomyResult.response;

  return json(200, { results: searchTaxonomy(taxonomyResult.data, q) });
}

export async function handleSpeciesResolve(request, url, { upstreamFetch, cache }) {
  const methodError = requireGet(request);
  if (methodError) return methodError;
  const queryError = requireAllowedQuery(url, ["q"]);
  if (queryError) return queryError;
  const { apiKey, error: keyError } = requireApiKey(request);
  if (keyError) return keyError;
  const { q, error: queryValueError } = readSpeciesQuery(url);
  if (queryValueError) return queryValueError;

  const taxonomyResult = await loadTaxonomy({ upstreamFetch, apiKey, cache });
  if (!taxonomyResult.ok) return taxonomyResult.response;

  const { species, candidates } = resolveTaxonomyMatch(taxonomyResult.data, q);
  return json(200, { species, candidates });
}

export async function handleObservations(request, url, { upstreamFetch }) {
  const methodError = requireGet(request);
  if (methodError) return methodError;
  const queryError = requireAllowedQuery(url, ["speciesCode", "days"]);
  if (queryError) return queryError;
  const { apiKey, error: keyError } = requireApiKey(request);
  if (keyError) return keyError;
  const { speciesCode, days, error: queryValueError } = readObservationQuery(url);
  if (queryValueError) return queryValueError;

  const result = await callEbird(upstreamFetch, apiKey, `/data/obs/TW/recent/${encodeURIComponent(speciesCode)}`, {
    back: days,
    includeProvisional: "true",
    sppLocale: "zh",
  });
  if (!result.ok) return result.response;
  if (!Array.isArray(result.data)) {
    return error(502, "malformed_upstream_response", "eBird 回傳的資料無法解析");
  }

  return json(200, {
    speciesCode,
    days,
    generatedAt: new Date().toISOString(),
    observations: mapObservations(result.data),
  });
}
