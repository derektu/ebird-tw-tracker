import assert from "node:assert/strict";
import test from "node:test";
import {
  compareSearchSnapshot,
  createSearchScope,
  createSearchSnapshot,
} from "../src/domain/search-discovery.mjs";

const speciesCode = "grpsni1";

function observation(subId, overrides = {}) {
  return {
    speciesCode,
    subId,
    obsDt: "2026-08-11 08:00",
    locName: subId,
    howMany: 1,
    ...overrides,
  };
}

test("Search Scope normalizes species code and clamps days", () => {
  assert.deepEqual(createSearchScope(" GRPSNI1 ", 45), {
    speciesCode,
    days: 30,
    key: "grpsni1:30",
  });
});

test("first successful Search Snapshot establishes a baseline without discoveries", () => {
  const scope = createSearchScope(speciesCode, 3);
  const comparison = compareSearchSnapshot(scope, [observation("S1"), observation("S2")], null);

  assert.equal(comparison.status, "baseline-created");
  assert.deepEqual(comparison.discoveryIds, []);
  assert.deepEqual(comparison.observations.map((item) => item.subId), ["S1", "S2"]);
});

test("Search Discovery only includes checklist identities absent from the prior baseline", () => {
  const scope = createSearchScope(speciesCode, 3);
  const baseline = createSearchSnapshot(scope, [observation("S1")], "2026-08-10T00:00:00.000Z");
  const comparison = compareSearchSnapshot(scope, [observation("S1", { howMany: 99 }), observation("S2")], baseline);

  assert.equal(comparison.status, "compared");
  assert.deepEqual(comparison.discoveryIds, ["grpsni1:S2"]);
  assert.deepEqual(comparison.observations.map((item) => item.subId), ["S2", "S1"]);
});

test("an empty snapshot replaces the baseline so a reappearing checklist is a discovery", () => {
  const scope = createSearchScope(speciesCode, 3);
  const original = createSearchSnapshot(scope, [observation("S1")], "2026-08-09T00:00:00.000Z");
  const empty = createSearchSnapshot(scope, [], "2026-08-10T00:00:00.000Z");
  const comparison = compareSearchSnapshot(scope, [observation("S1")], empty);

  assert.deepEqual(original.identityIds, ["grpsni1:S1"]);
  assert.deepEqual(empty.identityIds, []);
  assert.deepEqual(comparison.discoveryIds, ["grpsni1:S1"]);
});
