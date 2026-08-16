import assert from "node:assert/strict";
import test from "node:test";
import { createSearchWorker } from "../worker/index.mjs";

const apiKey = "browser-owned-key";

const taxonomy = [
  { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis", category: "species", taxonOrder: 100 },
  { speciesCode: "y00934", comName: "彩鷸雜交種", sciName: "Rostratula sp.", category: "hybrid", taxonOrder: 101 },
  { speciesCode: "comsan", comName: "磯鷸", sciName: "Actitis hypoleucos", category: "species", taxonOrder: 200 },
];

const observations = [
  {
    speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis",
    obsDt: "2026-08-10 07:00", locName: "宜蘭雙連埤", howMany: 2, subId: "S111",
    lat: 24.1, lng: 121.1, locationPrivate: false, obsValid: true, obsReviewed: false,
  },
  {
    speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis",
    obsDt: "2026-08-12 06:30", locName: "自訂地點", howMany: null, subId: "S222",
    lat: 24.2, lng: 121.2, locationPrivate: true, obsValid: true, obsReviewed: true,
  },
  {
    speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis",
    obsDt: "2026-08-11 08:00", locName: "無座標紀錄", howMany: 1, subId: "S333",
    lat: null, lng: null, locationPrivate: false, obsValid: true, obsReviewed: false,
  },
];

function createRequest(pathname = "/api/key/validate", options = {}) {
  return new Request(`https://search.example.test${pathname}`, {
    method: "POST",
    headers: { "X-eBird-Api-Key": apiKey, ...options.headers },
    ...options,
  });
}

function getRequest(pathname, options = {}) {
  return new Request(`https://search.example.test${pathname}`, {
    method: "GET",
    headers: { "X-eBird-Api-Key": apiKey, ...options.headers },
    ...options,
  });
}

function createMemoryCache() {
  const store = new Map();
  return {
    async match(request) {
      const stored = store.get(request.url);
      return stored ? stored.clone() : undefined;
    },
    async put(request, response) {
      store.set(request.url, response.clone());
    },
    size() {
      return store.size;
    },
  };
}

function taxonomyUpstream() {
  return async (request) => {
    if (request.url.startsWith("https://api.ebird.org/v2/ref/taxonomy/ebird")) {
      return new Response(JSON.stringify(taxonomy), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (request.url.startsWith("https://api.ebird.org/v2/data/obs/TW/recent/")) {
      return new Response(JSON.stringify(observations), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected upstream request: ${request.url}`);
  };
}

test("validation route only accepts a non-empty browser key on its fixed POST route", async () => {
  let calls = 0;
  const worker = createSearchWorker({ fetch: async () => { calls += 1; return new Response("[]"); } });

  for (const request of [
    createRequest("/api/key/validate", { headers: { "X-eBird-Api-Key": " " } }),
    createRequest("/api/key/validate", { method: "GET" }),
    createRequest("/api/key/validate?apiKey=must-not-be-accepted"),
    createRequest("/api/not-a-route"),
  ]) {
    const response = await worker.fetch(request);
    assert.ok(response.status >= 400);
  }

  assert.equal(calls, 0);
});

test("validation forwards a browser key only to the fixed eBird endpoint and never echoes it", async () => {
  let upstreamRequest;
  const worker = createSearchWorker({
    fetch: async (request) => {
      upstreamRequest = request;
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const response = await worker.fetch(createRequest());
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(body, '{"valid":true}');
  assert.equal(upstreamRequest.url, "https://api.ebird.org/v2/data/obs/TW/recent?back=1&maxResults=1");
  assert.equal(upstreamRequest.headers.get("x-ebirdapitoken"), apiKey);
  assert.equal(upstreamRequest.headers.get("x-ebird-api-key"), null);
  assert.ok(!upstreamRequest.url.includes(apiKey));
  assert.ok(!body.includes(apiKey));
});

test("Worker responses apply a restrictive same-origin CSP and security headers without exposing the browser key", async () => {
  const assets = {
    async fetch() {
      return new Response("<!doctype html><title>Search</title>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  };
  const worker = createSearchWorker({
    assets,
    fetch: async () => new Response("[]", { headers: { "content-type": "application/json" } }),
  });

  for (const request of [
    new Request("https://search.example.test/"),
    createRequest("/api/key/validate"),
  ]) {
    const response = await worker.fetch(request);
    const csp = response.headers.get("content-security-policy");

    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /style-src 'self' 'unsafe-inline'/);
    assert.match(csp, /connect-src 'self'/);
    assert.match(csp, /img-src 'self' data: https:\/\/\*\.tile\.openstreetmap\.org/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.ok(![...response.headers.entries()].some(([name, value]) => name.includes("key") || value.includes(apiKey)));
  }
});

test("validation maps invalid and temporary upstream failures without exposing upstream bodies", async () => {
  for (const [upstreamStatus, expectedStatus, expectedCode] of [
    [401, 401, "invalid_api_key"],
    [403, 403, "invalid_api_key"],
    [429, 429, "rate_limited"],
    [503, 503, "upstream_unavailable"],
  ]) {
    const worker = createSearchWorker({
      fetch: async () => new Response(`sensitive upstream body: ${apiKey}`, { status: upstreamStatus }),
    });

    const response = await worker.fetch(createRequest());
    const body = await response.text();

    assert.equal(response.status, expectedStatus);
    assert.equal(JSON.parse(body).code, expectedCode);
    assert.ok(!body.includes(apiKey));
    assert.ok(!body.includes("sensitive upstream body"));
  }
});

test("species search resolves by Chinese name, English name, or species code from the fixed taxonomy", async () => {
  const worker = createSearchWorker({ fetch: taxonomyUpstream(), cache: createMemoryCache() });

  for (const q of ["彩鷸", "Rostratula benghalensis", "grpsni1"]) {
    const response = await worker.fetch(getRequest(`/api/species/search?q=${encodeURIComponent(q)}`));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.results[0].speciesCode, "grpsni1");
  }
});

test("species search excludes non-species taxonomy categories such as hybrids", async () => {
  const worker = createSearchWorker({ fetch: taxonomyUpstream(), cache: createMemoryCache() });
  const response = await worker.fetch(getRequest("/api/species/search?q=彩鷸"));
  const payload = await response.json();
  assert.ok(!payload.results.some((species) => species.speciesCode === "y00934"));
});

test("species resolve returns the best match and full candidate list", async () => {
  const worker = createSearchWorker({ fetch: taxonomyUpstream(), cache: createMemoryCache() });
  const response = await worker.fetch(getRequest("/api/species/resolve?q=comsan"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.species.speciesCode, "comsan");
  assert.equal(payload.candidates.length, 1);
});

test("species resolve returns a null species for an unmatched query without failing", async () => {
  const worker = createSearchWorker({ fetch: taxonomyUpstream(), cache: createMemoryCache() });
  const response = await worker.fetch(getRequest("/api/species/resolve?q=doesnotexist"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { species: null, candidates: [] });
});

test("species resolve does not silently pick a substring-only match", async () => {
  const worker = createSearchWorker({ fetch: taxonomyUpstream(), cache: createMemoryCache() });
  const response = await worker.fetch(getRequest("/api/species/resolve?q=鷸"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.species, null);
  assert.deepEqual(
    payload.candidates.map((species) => species.speciesCode).sort(),
    ["comsan", "grpsni1"],
  );
});

test("taxonomy is cached at the edge under a fixed key that never embeds the caller's API key", async () => {
  let upstreamCalls = 0;
  const fetchSpy = async (request) => {
    upstreamCalls += 1;
    return taxonomyUpstream()(request);
  };
  const cache = createMemoryCache();
  const worker = createSearchWorker({ fetch: fetchSpy, cache });

  await worker.fetch(getRequest("/api/species/search?q=彩鷸"));
  await worker.fetch(getRequest("/api/species/search?q=磯鷸", { headers: { "X-eBird-Api-Key": "a-different-browser-key" } }));

  assert.equal(upstreamCalls, 1, "second lookup should be served from the edge cache");
  assert.equal(cache.size(), 1);
});

test("species routes reject unexpected query parameters, wrong methods, and a missing API key", async () => {
  const worker = createSearchWorker({ fetch: taxonomyUpstream(), cache: createMemoryCache() });

  const wrongMethod = await worker.fetch(new Request("https://search.example.test/api/species/search?q=x", {
    method: "POST",
    headers: { "X-eBird-Api-Key": apiKey },
  }));
  assert.equal(wrongMethod.status, 405);

  const extraParam = await worker.fetch(getRequest("/api/species/search?q=彩鷸&hostname=evil.example"));
  assert.equal(extraParam.status, 400);
  assert.equal((await extraParam.json()).code, "unexpected_query");

  const missingKey = await worker.fetch(new Request("https://search.example.test/api/species/search?q=彩鷸"));
  assert.equal(missingKey.status, 400);
  assert.equal((await missingKey.json()).code, "missing_api_key");

  const emptyQuery = await worker.fetch(getRequest("/api/species/search?q=" + encodeURIComponent("   ")));
  assert.equal(emptyQuery.status, 400);
  assert.equal((await emptyQuery.json()).code, "missing_query");
});

test("observations returns only records with valid coordinates, newest first, with no-store caching", async () => {
  const worker = createSearchWorker({ fetch: taxonomyUpstream() });
  const response = await worker.fetch(getRequest("/api/observations?speciesCode=grpsni1&days=7"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const payload = await response.json();
  assert.equal(payload.speciesCode, "grpsni1");
  assert.equal(payload.days, 7);
  assert.deepEqual(payload.observations.map((observation) => observation.subId), ["S222", "S111"]);
});

test("observations forwards the normalized speciesCode and days to the fixed upstream path", async () => {
  let upstreamRequest;
  const worker = createSearchWorker({
    fetch: async (request) => {
      upstreamRequest = request;
      return new Response(JSON.stringify(observations), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  await worker.fetch(getRequest("/api/observations?speciesCode=grpsni1&days=5"));

  assert.equal(
    upstreamRequest.url,
    "https://api.ebird.org/v2/data/obs/TW/recent/grpsni1?back=5&includeProvisional=true&sppLocale=zh",
  );
  assert.equal(upstreamRequest.headers.get("x-ebirdapitoken"), apiKey);
});

test("observations rejects a malformed speciesCode or an out-of-range or non-integer days value", async () => {
  const worker = createSearchWorker({ fetch: taxonomyUpstream() });

  for (const query of [
    "speciesCode=../../etc/passwd&days=3",
    "speciesCode=grpsni1&days=0",
    "speciesCode=grpsni1&days=31",
    "speciesCode=grpsni1&days=abc",
    "speciesCode=grpsni1&days=3.5",
  ]) {
    const response = await worker.fetch(getRequest(`/api/observations?${query}`));
    assert.equal(response.status, 400, query);
  }
});

test("observations rejects a caller-supplied hostname, pathname, or extra query parameter", async () => {
  const worker = createSearchWorker({ fetch: taxonomyUpstream() });
  const response = await worker.fetch(
    getRequest("/api/observations?speciesCode=grpsni1&days=3&url=https://evil.example"),
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "unexpected_query");
});

test("observations maps upstream authentication, rate-limit, and malformed-body failures to bounded errors", async () => {
  for (const [upstreamStatus, expectedStatus, expectedCode] of [
    [401, 401, "invalid_api_key"],
    [429, 429, "rate_limited"],
    [500, 503, "upstream_unavailable"],
  ]) {
    const worker = createSearchWorker({
      fetch: async () => new Response(`sensitive: ${apiKey}`, { status: upstreamStatus }),
    });
    const response = await worker.fetch(getRequest("/api/observations?speciesCode=grpsni1&days=3"));
    const body = await response.text();
    assert.equal(response.status, expectedStatus);
    assert.equal(JSON.parse(body).code, expectedCode);
    assert.ok(!body.includes(apiKey));
  }

  const malformedBodyWorker = createSearchWorker({
    fetch: async () => new Response("not json", { status: 200, headers: { "content-type": "application/json" } }),
  });
  const malformedResponse = await malformedBodyWorker.fetch(getRequest("/api/observations?speciesCode=grpsni1&days=3"));
  assert.equal(malformedResponse.status, 502);
  assert.equal((await malformedResponse.json()).code, "malformed_upstream_response");
});
