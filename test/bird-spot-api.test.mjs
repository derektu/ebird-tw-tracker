import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApplication } from "../server/application.mjs";
import { createSearchWorker } from "../worker/index.mjs";
import { mapObservations } from "../server/domain/observations.mjs";
import { normalizeBirdSpot } from "../src/domain/bird-spots.mjs";

const apiKey = "bird-spot-test-key";
const records = [
  { locId: "L123", locName: "同名地點", lat: 24.1234567, lng: 121.1234567, locationPrivate: false, speciesCode: "comsan", comName: "磯鷸", sciName: "Actitis hypoleucos", obsDt: "2026-11-10 08:00", subId: "S12", howMany: 2 },
  { locId: "L123", locName: null, lat: null, lng: null, speciesCode: "grpsni1", obsDt: "2026-11-11 08:00", subId: "S13" },
];

async function runtime(kind, upstreamFetch, context, key = apiKey) {
  if (kind === "Worker") {
    const worker = createSearchWorker({ fetch: upstreamFetch });
    return (pathname, method = "GET") => worker.fetch(new Request(`https://bird.test${pathname}`, {
      method, headers: key ? { "X-eBird-Api-Key": key } : {},
    }));
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bird-spot-api-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const application = await createApplication({ root, port: 0, isProduction: true, env: key ? { EBIRD_API_KEY: key } : {}, birdSpotFetch: upstreamFetch, logger: { error() {} } });
  context.after(() => application.close());
  const { url } = await application.listen();
  return (pathname, method = "GET") => fetch(url + pathname, { method });
}

for (const kind of ["Node", "Worker"]) {
  test(`${kind} bird-spot query preserves missing metadata and only calls the exact location endpoint`, async (context) => {
    const requests = [];
    const request = await runtime(kind, async (upstream) => {
      requests.push(upstream);
      return Response.json(records);
    }, context);
    for (const days of [undefined, 1, 14, 30]) {
      const response = await request(`/api/bird-spots/observations?locId=L123${days ? `&days=${days}` : ""}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body = await response.json();
      assert.equal(body.locId, "L123");
      assert.equal(body.days, days ?? 14);
      assert.ok(Number.isFinite(Date.parse(body.generatedAt)));
      assert.deepEqual(body.observations.map((x) => x.subId), ["S13", "S12"]);
      assert.equal(body.observations[0].locName, null);
      assert.equal(body.observations[0].lat, null);
      assert.equal(body.observations[0].locationType, "unknown");
      assert.equal(body.observations[0].comName, null);
      assert.equal(body.observations[1].lat, 24.123457);
      assert.equal(body.observations[1].locationType, "hotspot");
      assert.ok(!JSON.stringify(body).includes(apiKey));
      const upstream = requests.at(-1);
      assert.equal(upstream.url, `https://api.ebird.org/v2/data/obs/L123/recent?back=${days ?? 14}&includeProvisional=true&sppLocale=zh`);
      assert.equal(upstream.headers.get("x-ebirdapitoken"), apiKey);
      assert.ok(!upstream.url.includes(apiKey));
    }
  });

  test(`${kind} preserves mixed and other-only observation sources within the requested envelope`, async (context) => {
    let payload = [records[0], { ...records[1], locId: "L456", locName: "北岸觀察點", lat: 25, lng: 121, locationPrivate: true }];
    const requests = [];
    const request = await runtime(kind, async (upstream) => { requests.push(upstream.url); return Response.json(payload); }, context);
    for (const onlyOther of [false, true]) {
      if (onlyOther) payload = [payload[1]];
      const response = await request("/api/bird-spots/observations?locId=L123&days=1");
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.locId, "L123");
      assert.equal(body.days, 1);
      assert.equal(body.observations.length, payload.length);
      assert.deepEqual(body.observations.map(row => row.locId), onlyOther ? ["L456"] : ["L456", "L123"]);
      assert.equal(body.observations[0].locName, "北岸觀察點");
      assert.equal(body.observations[0].lat, 25);
      assert.equal(body.observations[0].subId, records[1].subId);
      assert.equal(body.observations[0].locationType, "personal");
    }
    assert.ok(requests.every(url => url === "https://api.ebird.org/v2/data/obs/L123/recent?back=1&includeProvisional=true&sppLocale=zh"));
  });

  test(`${kind} validates IDs, days, method and query allowlist before an upstream request`, async (context) => {
    let calls = 0;
    const request = await runtime(kind, async () => { calls++; return Response.json([]); }, context);
    for (const query of ["", "locId=TW", "locId=L", "locId=https://bad.test", "locId=L123&days=0", "locId=L123&days=31", "locId=L123&days=1.5", "locId=L123&days=", "locId=L123&days=14x", "locId=L123&url=https://bad.test", "locId=L123&locId=L456", "locId=L123&days=1&days=30"]) {
      const response = await request(`/api/bird-spots/observations?${query}`);
      assert.equal(response.status, 400, query);
    }
    assert.equal((await request("/api/bird-spots/observations?locId=L123", "POST")).status, 405);
    assert.equal(calls, 0);
  });

  test(`${kind} distinguishes empty results, unavailable location, rate limit, auth and network errors`, async (context) => {
    let outcome = 200;
    const request = await runtime(kind, async () => {
      if (outcome === "network") throw new Error(`sensitive ${apiKey}`);
      return new Response(outcome === 200 ? "[]" : `upstream detail ${apiKey}`, { status: outcome });
    }, context);
    assert.deepEqual((await (await request("/api/bird-spots/observations?locId=L123")).json()).observations, []);
    for (const [upstreamStatus, status, code] of [[404, 410, "location_unavailable"], [410, 410, "location_unavailable"], [401, 401, "invalid_api_key"], [403, 403, "invalid_api_key"], [429, 429, "rate_limited"], [500, 503, "upstream_unavailable"], ["network", 503, "network_unavailable"]]) {
      outcome = upstreamStatus;
      const response = await request("/api/bird-spots/observations?locId=L123");
      assert.equal(response.status, status);
      const body = await response.json();
      assert.equal(body.code, code);
      assert.ok(!JSON.stringify(body).includes(apiKey));
    }
  });

  test(`${kind} rejects malformed IDs and non-observation payloads rather than a false empty success`, async (context) => {
    let payload;
    const request = await runtime(kind, async () => new Response(payload), context);
    for (const value of ["not-json", {}, [null], [{...records[0], locId: "invalid"}], [{...records[0], locId: null}], [records[0], {...records[1], locId: "invalid"}], [{...records[0], speciesCode: null}], [{...records[0], obsDt: null}], [{...records[0], subId: "invalid"}]]) {
      payload = typeof value === "string" ? value : JSON.stringify(value);
      const response = await request("/api/bird-spots/observations?locId=L123");
      assert.equal(response.status, 502);
      assert.equal((await response.json()).code, "malformed_upstream_response");
    }
  });

  test(`${kind} reports body-read disconnects and aborts as network failures after successful headers`, async (context) => {
    let bodyError;
    const request = await runtime(kind, async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('[{"partial":'));
        controller.error(bodyError);
      },
    }), { status: 200 }), context);
    for (const failure of [new TypeError(`terminated ${apiKey}`), new DOMException(`aborted ${apiKey}`, "AbortError"), new DOMException(`timeout ${apiKey}`, "TimeoutError")]) {
      bodyError = failure;
      const response = await request("/api/bird-spots/observations?locId=L123");
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.code, "network_unavailable");
      assert.ok(!JSON.stringify(body).includes(apiKey));
    }
  });

  test(`${kind} refuses missing API keys without accessing eBird`, async (context) => {
    let calls = 0;
    const request = await runtime(kind, async () => { calls++; return Response.json([]); }, context, "");
    const response = await request("/api/bird-spots/observations?locId=L123");
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "missing_api_key");
    assert.equal(calls, 0);
  });
}

test("legacy species mapper retains nullable locId and its existing coordinate filter", () => {
  const mapped = mapObservations([...records, {...records[0], locId: "invalid", subId: "S14"}]);
  assert.deepEqual(mapped.map((x) => x.locId), ["L123", null]);
  assert.equal(mapped.length, 2);
  const first = normalizeBirdSpot(records[0]);
  const second = normalizeBirdSpot({...records[0], locId: "L456", locationPrivate: true});
  assert.notEqual(first.locId, second.locId);
  assert.equal(second.locationType, "personal");
  assert.deepEqual(normalizeBirdSpot({...records[0], lat: 99, locationPrivate: undefined}), {...first, lat: null, lng: null, locationType: "unknown"});
});
