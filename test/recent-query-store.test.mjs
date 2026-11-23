import assert from "node:assert/strict";
import test from "node:test";
import { readRecentQueries, recordRecentQuery } from "../src/apps/search/recent-query-store.mjs";
const storage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
test("submitted strings retain English and codes, trim and deduplicate separately by mode", () => {
  const store = storage();
  recordRecentQuery("species", " Greater Painted-Snipe ", store);
  recordRecentQuery("spots", "清水", store);
  recordRecentQuery("species", "grpsni1", store);
  recordRecentQuery("species", "Greater Painted-Snipe", store);
  recordRecentQuery("species", "  ", store);
  assert.deepEqual(readRecentQueries("species", store), ["Greater Painted-Snipe", "grpsni1"]);
  assert.deepEqual(readRecentQueries("spots", store), ["清水"]);
});
test("legacy species names survive malformed entries and subsequent writes", () => {
  const store = storage({ "search-recent-species": JSON.stringify([null, {comName: "彩鷸"}, 2, {comName: "小白鷺"}]) });
  assert.deepEqual(readRecentQueries("species", store), ["彩鷸", "小白鷺"]);
  recordRecentQuery("species", "grpsni1", store);
  assert.deepEqual(readRecentQueries("species", store), ["grpsni1", "彩鷸", "小白鷺"]);
  assert.deepEqual(readRecentQueries("spots", store), []);
});
test("external values are sanitized and bounded; corrupt or blocked storage never throws", () => {
  const store = storage({"search-recent-queries-species": JSON.stringify([null, " a ", {}, "a", "", ...Array.from({length: 20}, (_, i) => `s${i}`)])});
  assert.equal(readRecentQueries("species", store).length, 10);
  assert.deepEqual(readRecentQueries("species", storage({"search-recent-queries-species": "{"})), []);
  const blocked = {getItem() {throw Error();}, setItem() {throw Error();}};
  assert.deepEqual(readRecentQueries("species", blocked), []);
  assert.deepEqual(recordRecentQuery("spots", "新地點", blocked, ["舊地點"]), ["新地點", "舊地點"]);
});
