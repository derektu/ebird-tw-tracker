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
