import assert from "node:assert/strict";
import test from "node:test";
import { fetchObservations, resolveSpecies, searchSpecies, SearchApiError } from "../src/api/search-app-client.mjs";

const apiKey = "browser-owned-key";

test("every call attaches the given key as a same-origin header and never in the URL", async () => {
  const requests = [];
  const request = async (path, options) => {
    requests.push({ path, options });
    return new Response(JSON.stringify({ results: [] }), { headers: { "content-type": "application/json" } });
  };

  await searchSpecies("彩鷸", { apiKey, request });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.headers["X-eBird-Api-Key"], apiKey);
  assert.ok(!requests[0].path.includes(apiKey));
});

test("resolveSpecies and fetchObservations unwrap their typed payloads", async () => {
  const species = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };

  const resolved = await resolveSpecies("彩鷸", {
    apiKey,
    request: async () => new Response(JSON.stringify({ species, candidates: [species] }), {
      headers: { "content-type": "application/json" },
    }),
  });
  assert.deepEqual(resolved, species);

  const payload = { speciesCode: "grpsni1", days: 3, generatedAt: "2026-08-14T00:00:00.000Z", observations: [] };
  const observationsResult = await fetchObservations({ speciesCode: "grpsni1", days: 3 }, {
    apiKey,
    request: async () => new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } }),
  });
  assert.deepEqual(observationsResult, payload);
});

test("a missing key fails locally without making a network call", async () => {
  let called = false;
  await assert.rejects(
    searchSpecies("彩鷸", { apiKey: "", request: async () => { called = true; return new Response("{}"); } }),
    (error) => error instanceof SearchApiError && error.code === "missing_api_key",
  );
  assert.equal(called, false);
});

test("a bounded upstream error surfaces the server's code and message without throwing raw bodies", async () => {
  await assert.rejects(
    fetchObservations({ speciesCode: "grpsni1", days: 3 }, {
      apiKey,
      request: async () => new Response(JSON.stringify({ code: "rate_limited", error: "請稍後再試" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    }),
    (error) => error instanceof SearchApiError && error.status === 429 && error.code === "rate_limited" && error.message === "請稍後再試",
  );
});

test("bird-spot recent queries encode identity, explicitly send three days, and keep the key in its header", async () => {
  const { fetchBirdSpotRecent } = await import("../src/api/search-app-client.mjs");
  let recorded;
  const response = { locId: "L123", days: 3, generatedAt: "2026-11-12T00:00:00.000Z", observations: [] };
  assert.deepEqual(await fetchBirdSpotRecent({ locId: "L123/?", days: 3 }, {
    apiKey, request: async (path, options) => { recorded = { path, options }; return Response.json(response); },
  }), response);
  assert.equal(recorded.path, "/api/bird-spots/observations?locId=L123%2F%3F&days=3");
  assert.equal(recorded.options.headers["X-eBird-Api-Key"], apiKey);
  assert.ok(!recorded.path.includes(apiKey));
});

test("caller cancellation composes with the timeout and cancels body reads without exposing the key", async () => {
  const { fetchBirdSpotRecent } = await import("../src/api/search-app-client.mjs");
  const caller = new AbortController();
  let bodyStarted;
  const reading = new Promise(resolve => { bodyStarted = resolve; });
  const pending = fetchBirdSpotRecent({ locId: "L123", days: 3 }, {
    apiKey, signal: caller.signal,
    request: async (_path, { signal }) => ({ ok: true, json: () => new Promise((_resolve, reject) => {
      bodyStarted();
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }) }),
  });
  await reading;
  caller.abort();
  await assert.rejects(pending, error => error.name === "AbortError" && !error.message.includes(apiKey));
});

test("timeouts include the response body and malformed successful JSON fails with a bounded error", async () => {
  const { fetchBirdSpotRecent } = await import("../src/api/search-app-client.mjs");
  await assert.rejects(fetchBirdSpotRecent({ locId: "L123", days: 3 }, {
    apiKey, timeoutMs: 5,
    request: async (_path, { signal }) => ({ ok: true, json: () => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }) }),
  }), error => error instanceof SearchApiError && error.code === "network_unavailable" && error.message.includes("逾時"));
  await assert.rejects(fetchBirdSpotRecent({ locId: "L123", days: 3 }, {
    apiKey, request: async () => new Response("not JSON"),
  }), error => error instanceof SearchApiError && error.code === "invalid_response");
});
