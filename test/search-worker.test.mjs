import assert from "node:assert/strict";
import test from "node:test";
import { createSearchWorker } from "../worker/index.mjs";

const apiKey = "browser-owned-key";

function createRequest(pathname = "/api/key/validate", options = {}) {
  return new Request(`https://search.example.test${pathname}`, {
    method: "POST",
    headers: { "X-eBird-Api-Key": apiKey, ...options.headers },
    ...options,
  });
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
