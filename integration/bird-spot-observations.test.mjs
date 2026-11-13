import assert from "node:assert/strict";
import test from "node:test";
import { createSearchWorker } from "../worker/index.mjs";

const apiKey = process.env.EBIRD_API_KEY;
const required = process.env.EBIRD_INTEGRATION_REQUIRE_VALID_KEY === "1";

test("real eBird bird-spot queries support public hotspots and returned personal locations", { skip: !apiKey && !required }, async (context) => {
  assert.ok(apiKey, "EBIRD_API_KEY is required by test:integration:required");
  const source = await fetch("https://api.ebird.org/v2/data/obs/TW/recent?back=14&maxResults=1000", {
    headers: { "x-ebirdapitoken": apiKey }, signal: AbortSignal.timeout(15_000),
  });
  assert.equal(source.status, 200, `Taiwan discovery returned ${source.status}`);
  const data = await source.json();
  assert.ok(Array.isArray(data), "Taiwan discovery must return observations");
  let upstreamRows;
  const worker = createSearchWorker({ fetch: async request => {
    const response = await fetch(request);
    if (response.ok) upstreamRows = await response.clone().json();
    return response;
  } });
  for (const [type, isPrivate] of [["hotspot", false], ["personal", true]]) {
    const location = data.find((item) => item.locationPrivate === isPrivate && /^L\d+$/.test(item.locId));
    assert.ok(location, `no ${type} location was available to verify`);
    for (const days of [1, 14, 30]) {
      const response = await worker.fetch(new Request(`https://bird.test/api/bird-spots/observations?locId=${location.locId}&days=${days}`, {
        headers: { "X-eBird-Api-Key": apiKey },
      }));
      assert.equal(response.status, 200, `${type} ${location.locId} back=${days} returned ${response.status}`);
      const body = await response.json();
      assert.equal(body.locId, location.locId);
      assert.equal(body.days, days);
      assert.ok(body.observations.every((observation) => /^L\d+$/.test(observation.locId)));
      assert.deepEqual(body.observations.map(row => [row.speciesCode, row.locId, row.subId]).sort(), upstreamRows.map(row => [row.speciesCode, row.locId, row.subId]).sort());
      assert.equal(new Set(body.observations.map((observation) => observation.speciesCode)).size, body.observations.length);
      assert.ok(!JSON.stringify(body).includes(apiKey));
      context.diagnostic(JSON.stringify({ type, locId: location.locId, days, status: response.status, observations: body.observations.length, missingNames: body.observations.filter((o) => o.locName === null).length, missingCoordinates: body.observations.filter((o) => o.lat === null).length }));
    }
  }
});


test("real eBird L2236115 query retains each current upstream observation identity", { skip: !apiKey && !required }, async (context) => {
  assert.ok(apiKey, "EBIRD_API_KEY is required by test:integration:required");
  let upstreamRows;
  const worker = createSearchWorker({ fetch: async request => {
    const response = await fetch(request);
    if (response.ok) upstreamRows = await response.clone().json();
    return response;
  } });
  for (const days of [1, 3]) {
    const response = await worker.fetch(new Request(`https://bird.test/api/bird-spots/observations?locId=L2236115&days=${days}`, { headers: { "X-eBird-Api-Key": apiKey } }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.locId, "L2236115");
    assert.equal(body.days, days);
    assert.ok(body.observations.every(row => /^L\d+$/.test(row.locId)));
    assert.deepEqual(body.observations.map(row => [row.speciesCode, row.locId, row.subId]).sort(), upstreamRows.map(row => [row.speciesCode, row.locId, row.subId]).sort());
    assert.ok(!JSON.stringify(body).includes(apiKey));
    context.diagnostic(JSON.stringify({ locId: body.locId, days, observations: body.observations.length, distinctSourceLocations: new Set(body.observations.map(row => row.locId)).size }));
  }
});
