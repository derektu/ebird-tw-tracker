import assert from "node:assert/strict";
import test from "node:test";
import { MAX_RECENT_SPECIES, readRecentSpecies, recordRecentSpecies } from "../src/apps/search/recent-species-store.mjs";

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
    raw: data,
  };
}

const grpsni1 = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };
const yebgre1 = { speciesCode: "yebgre1", comName: "小白鷺", sciName: "Egretta garzetta" };

test("an empty or missing store reads as an empty list", () => {
  assert.deepEqual(readRecentSpecies(fakeStorage()), []);
  assert.deepEqual(readRecentSpecies(null), []);
});

test("a corrupt stored value reads as an empty list instead of throwing", () => {
  const storage = fakeStorage({ "search-recent-species": "{not json" });
  assert.deepEqual(readRecentSpecies(storage), []);
});

test("recording a species places it first and persists it for later reads", () => {
  const storage = fakeStorage();
  const next = recordRecentSpecies(grpsni1, storage);

  assert.deepEqual(next, [grpsni1]);
  assert.deepEqual(readRecentSpecies(storage), [grpsni1]);
});

test("recording an already-recorded species code moves it to the front without duplicating it", () => {
  const storage = fakeStorage();
  recordRecentSpecies(grpsni1, storage);
  recordRecentSpecies(yebgre1, storage);
  const next = recordRecentSpecies(grpsni1, storage);

  assert.deepEqual(
    next.map((species) => species.speciesCode),
    ["grpsni1", "yebgre1"],
  );
});

test("the list is capped at the maximum recent species count", () => {
  const storage = fakeStorage();
  for (let index = 0; index < MAX_RECENT_SPECIES + 3; index += 1) {
    recordRecentSpecies({ speciesCode: `sp${index}`, comName: `Species ${index}`, sciName: `Species ${index}` }, storage);
  }

  const stored = readRecentSpecies(storage);
  assert.equal(stored.length, MAX_RECENT_SPECIES);
  assert.equal(stored[0].speciesCode, `sp${MAX_RECENT_SPECIES + 2}`);
  assert.equal(stored.at(-1).speciesCode, "sp3");
});

test("a storage write failure still returns the updated in-memory list", () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("storage unavailable");
    },
  };

  assert.deepEqual(recordRecentSpecies(grpsni1, storage), [grpsni1]);
});
