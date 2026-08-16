import { error, json } from "./responses.mjs";
import { handleObservations, handleSpeciesResolve, handleSpeciesSearch } from "./routes.mjs";

const validationPath = "/api/key/validate";
const speciesSearchPath = "/api/species/search";
const speciesResolvePath = "/api/species/resolve";
const observationsPath = "/api/observations";
const validationProbeUrl = "https://api.ebird.org/v2/data/obs/TW/recent?back=1&maxResults=1";

// Leaflet assigns positioning styles in the DOM, so its self-hosted stylesheet
// needs this narrowly documented inline-style exception. Scripts, network
// requests, frames, and every other asset remain restricted to this origin
// except for the OpenStreetMap tiles needed to render the map.
const securityHeaders = {
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self' data: https://*.tile.openstreetmap.org",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; "),
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function invalidRequest(url) {
  return error(404, "not_found", `找不到 ${url.pathname}`);
}

async function validateKey(request, upstreamFetch) {
  if (new URL(request.url).search) {
    return error(400, "unexpected_query", "此 API 不接受 query parameter");
  }

  if (request.method !== "POST") {
    return error(405, "method_not_allowed", "此 API 僅接受 POST");
  }

  const apiKey = request.headers.get("X-eBird-Api-Key")?.trim();
  if (!apiKey) {
    return error(400, "missing_api_key", "請輸入有效的 eBird API key");
  }

  let upstreamResponse;
  try {
    upstreamResponse = await upstreamFetch(new Request(validationProbeUrl, {
      method: "GET",
      headers: { "x-ebirdapitoken": apiKey },
    }));
  } catch {
    return error(503, "network_unavailable", "目前無法驗證 API key，請稍後再試");
  }

  if (upstreamResponse.status === 401 || upstreamResponse.status === 403) {
    return error(upstreamResponse.status, "invalid_api_key", "API key 無效或沒有權限");
  }

  if (upstreamResponse.status === 429) {
    return error(429, "rate_limited", "eBird 暫時無法處理驗證，請稍後再試");
  }

  if (!upstreamResponse.ok) {
    return error(503, "upstream_unavailable", "目前無法驗證 API key，請稍後再試");
  }

  return json(200, { valid: true });
}

export function createSearchWorker({ fetch: upstreamFetch = fetch, assets, cache } = {}) {
  const deps = { upstreamFetch, cache };
  return {
    async fetch(request) {
      const url = new URL(request.url);
      let response;

      if (url.pathname === validationPath) {
        response = await validateKey(request, upstreamFetch);
      } else if (url.pathname === speciesSearchPath) {
        response = await handleSpeciesSearch(request, url, deps);
      } else if (url.pathname === speciesResolvePath) {
        response = await handleSpeciesResolve(request, url, deps);
      } else if (url.pathname === observationsPath) {
        response = await handleObservations(request, url, deps);
      } else if (url.pathname.startsWith("/api/")) {
        response = invalidRequest(url);
      } else if (assets) {
        if (url.pathname === "/") {
          response = await assets.fetch(new Request(new URL("/search.html", request.url), request));
        } else {
          response = await assets.fetch(request);
        }
      } else {
        response = invalidRequest(url);
      }

      return withSecurityHeaders(response);
    },
  };
}

export default {
  fetch(request, environment) {
    return createSearchWorker({ assets: environment.ASSETS, cache: caches.default }).fetch(request);
  },
};
