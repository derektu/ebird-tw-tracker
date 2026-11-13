import assert from "node:assert/strict";
import test from "node:test";
import * as domain from "../src/domain/bird-spots.mjs";

const spot = { locId: "L123", locName: null, lat: null, lng: null, locationType: "unknown" };
const source = { locId: "L456", locName: "其他觀察點", lat: 25, lng: 121, locationType: "personal", speciesCode: "comsan", obsDt: "2026-11-13 08:00", subId: "S12" };
const response = observations => ({ locId: "L123", days: 1, generatedAt: "2026-11-13T00:00:00.000Z", observations });

test("detail keeps all source observations but enriches only from the requested identity", () => {
  const matching = { ...source, locId: "L123", locName: "原查詢地點", lat: 24, lng: 120, locationType: "hotspot" };
  const input = response([source, matching]);
  const before = structuredClone(input);
  const detail = domain.getBirdSpotRecentDetail(spot, input);
  assert.deepEqual(detail.spot, { ...spot, locName: matching.locName, lat: 24, lng: 120, locationType: "hotspot" });
  assert.deepEqual(detail.observations, [source, matching]);
  assert.equal(detail.hasOtherLocations, true);
  assert.deepEqual(input, before);
  assert.deepEqual(spot, { locId: "L123", locName: null, lat: null, lng: null, locationType: "unknown" });
});

test("other-only results never donate metadata or coordinates to the requested spot", () => {
  const detail = domain.getBirdSpotRecentDetail(spot, response([source]));
  assert.deepEqual(detail.spot, spot);
  assert.deepEqual(detail.observations, [source]);
  assert.equal(detail.hasOtherLocations, true);
});

test("known selected metadata survives and matching source metadata remains nullable", () => {
  const known = { ...spot, locName: "我的原始地點", lat: 23, lng: 119, locationType: "hotspot" };
  const matching = { ...source, locId: "L123", locName: null, lat: null, lng: null, locationType: "unknown" };
  const detail = domain.getBirdSpotRecentDetail(known, response([matching]));
  assert.deepEqual(detail.spot, known);
  assert.equal(detail.hasOtherLocations, false);
  assert.deepEqual(domain.getBirdSpotRecentDetail(spot, response([matching])).spot, spot);
});

test("absent or different request envelopes contribute neither rows nor metadata", () => {
  for (const input of [null, { ...response([source]), locId: "L789" }]) {
    assert.deepEqual(domain.getBirdSpotRecentDetail(spot, input), { spot, observations: [], hasOtherLocations: false });
  }
  assert.deepEqual(domain.getBirdSpotRecentDetail(spot, response([])), { spot, observations: [], hasOtherLocations: false });
});
