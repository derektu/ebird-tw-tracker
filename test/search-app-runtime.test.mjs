import assert from "node:assert/strict";
import test from "node:test";
import { createSearchAppRuntime } from "../src/apps/search/search-app-runtime.mjs";

const species = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };

test("resolveSpecies passes an already-selected species straight through", async () => {
  let called = false;
  const runtime = createSearchAppRuntime({
    resolveSpecies: async () => { called = true; return species; },
    fetchObservations: async () => ({ observations: [] }),
  });

  const resolved = await runtime.resolveSpecies({ species, query: "unused", days: 3 });
  assert.deepEqual(resolved, species);
  assert.equal(called, false);
});

test("resolveSpecies rejects a blank query without calling the resolver", async () => {
  let called = false;
  const runtime = createSearchAppRuntime({
    resolveSpecies: async () => { called = true; return species; },
    fetchObservations: async () => ({ observations: [] }),
  });

  await assert.rejects(runtime.resolveSpecies({ query: "   ", days: 3 }), /請輸入鳥種名稱/);
  assert.equal(called, false);
});

test("resolveSpecies surfaces a not-found error naming the query", async () => {
  const runtime = createSearchAppRuntime({
    resolveSpecies: async () => null,
    fetchObservations: async () => ({ observations: [] }),
  });

  await assert.rejects(runtime.resolveSpecies({ query: "不存在的鳥", days: 3 }), /找不到 eBird 鳥種：不存在的鳥/);
});

test("resolveSpecies resolves an explicit query through the injected resolver", async () => {
  const runtime = createSearchAppRuntime({
    resolveSpecies: async (query) => (query === "彩鷸" ? species : null),
    fetchObservations: async () => ({ observations: [] }),
  });

  const resolved = await runtime.resolveSpecies({ query: "彩鷸", days: 3 });
  assert.deepEqual(resolved, species);
});
