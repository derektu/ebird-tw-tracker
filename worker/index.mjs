const validationPath = "/api/key/validate";
const taxonomyValidationUrl = "https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&locale=zh";

function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function error(status, code, message) {
  return json(status, { code, error: message });
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
    upstreamResponse = await upstreamFetch(new Request(taxonomyValidationUrl, {
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

export function createSearchWorker({ fetch: upstreamFetch = fetch, assets } = {}) {
  return {
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === validationPath) {
        return validateKey(request, upstreamFetch);
      }

      if (url.pathname.startsWith("/api/")) {
        return invalidRequest(url);
      }

      if (assets) {
        if (url.pathname === "/") {
          return assets.fetch(new Request(new URL("/search.html", request.url), request));
        }
        return assets.fetch(request);
      }
      return invalidRequest(url);
    },
  };
}

export default {
  fetch(request, environment) {
    return createSearchWorker({ assets: environment.ASSETS }).fetch(request);
  },
};
