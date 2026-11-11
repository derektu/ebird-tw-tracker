import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { createFileSavedBirdSpotStore } from "../server/storage/saved-bird-spot-store.mjs";
import { createIndexedDbSavedBirdSpotStore } from "../src/apps/search/browser-saved-bird-spots.mjs";

const first = { locId: "L123", locName: "相同名稱", lat: 24, lng: 121, locationType: "hotspot" };
const second = { ...first, locId: "L456", locationType: "personal" };
async function fixture(kind, context) {
  let clock = 0;
  const now = () => new Date(Date.UTC(2026, 10, 11, 0, 0, clock++)).toISOString();
  if (kind === "IndexedDB") {
    const indexedDB = new IDBFactory();
    const options = { indexedDB, databaseName: "favorites", now };
    return { store: createIndexedDbSavedBirdSpotStore(options), reopen: () => createIndexedDbSavedBirdSpotStore(options) };
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "saved-birds-"));
  context.after(() => fs.rm(dir, { recursive: true, force: true }));
  const options = { filePath: path.join(dir, "saved-bird-spots.json"), now };
  return { store: createFileSavedBirdSpotStore(options), reopen: () => createFileSavedBirdSpotStore(options), ...options };
}
for (const kind of ["Node", "IndexedDB"]) {
  test(`${kind} keeps unique IDs, notes and timestamps through metadata refresh and reopening`, async context => {
    const { store, reopen } = await fixture(kind, context);
    assert.deepEqual(await store.list(), []);
    const saved = await store.save({ ...first, apiKey: "must-not-persist" });
    await store.update(first.locId, { alias: "北堤", note: "停車後步行", pinned: true });
    const updated = await store.save({ ...first, locName: "上游新地名" });
    await store.save(second);
    assert.equal(updated.savedAt, saved.savedAt);
    assert.equal(updated.locName, "上游新地名");
    assert.equal(updated.alias, "北堤");
    assert.equal(updated.note, "停車後步行");
    assert.equal(updated.pinned, true);
    assert.ok(updated.updatedAt > saved.updatedAt);
    const list = await reopen().list();
    assert.deepEqual(list.map(s => s.locId), ["L123", "L456"]);
    assert.ok(!JSON.stringify(list).includes("must-not-persist"));
  });
  test(`${kind} concurrent mutations from separate adapters preserve every saved location`, async context => {
    const { store, reopen } = await fixture(kind, context);
    const other = reopen();
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? other : store).save({ ...first, locId: `L${1000 + i}` })));
    assert.equal((await store.list()).length, 12);
    await Promise.all([store.update("L1000", { note: "筆記" }), other.update("L1000", { alias: "別名" })]);
    const saved = (await store.list()).find(s => s.locId === "L1000");
    assert.equal(saved.note, "筆記"); assert.equal(saved.alias, "別名");
  });
  test(`${kind} supports removal, restoration and deterministic name/recent/pinned ordering`, async context => {
    const { store } = await fixture(kind, context);
    await store.save(first); await store.save(second);
    await store.update("L123", { alias: "A", pinned: true });
    await store.update("L456", { alias: "B" });
    assert.deepEqual((await store.list({ sort: "recent" })).map(s => s.locId), ["L456", "L123"]);
    assert.deepEqual((await store.list({ sort: "name" })).map(s => s.locId), ["L123", "L456"]);
    const removed = await store.remove("L123");
    assert.equal((await store.list()).length, 1);
    await store.restore(removed);
    assert.equal((await store.list())[0].note, removed.note);
    assert.equal((await store.list())[0].savedAt, removed.savedAt);
    await store.update("L123", { note: "復原後的新筆記" });
    await store.restore(removed);
    assert.equal((await store.list())[0].note, "復原後的新筆記");
    assert.equal(await store.remove("L999"), null);
  });
  test(`${kind} rejects invalid mutations without touching existing favorites`, async context => {
    const { store } = await fixture(kind, context);
    await store.save(first);
    const before = await store.list();
    await assert.rejects(store.save({ ...first, locId: "bad" }));
    await assert.rejects(store.save({ ...first, lat: 24, lng: null }));
    await assert.rejects(store.update("L123", { pinned: "yes" }));
    await assert.rejects(store.update("L123", { locName: "not-editable" }));
    await assert.rejects(store.update("L999", { note: "missing" }));
    await assert.rejects(store.restore({ ...before[0], savedAt: "invalid" }));
    assert.deepEqual(await store.list(), before);
  });
}
test("Node corrupt storage is not reset, interrupted replacement preserves last committed file and permissions are private", async context => {
  const { store, filePath, now } = await fixture("Node", context);
  await store.save(first);
  assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
  const before = await fs.readFile(filePath, "utf8");
  const failing = createFileSavedBirdSpotStore({ filePath, now, replaceFile: async () => { throw new Error("disk failure"); } });
  await assert.rejects(failing.save(second), e => e.code === "storage_unavailable");
  assert.equal(await fs.readFile(filePath, "utf8"), before);
  await fs.writeFile(filePath, '{"version":1,"spots":[{"locId":"L123"}]}');
  const corrupt = await fs.readFile(filePath, "utf8");
  await assert.rejects(store.list(), e => e.code === "storage_corrupt");
  await assert.rejects(store.save(second), e => e.code === "storage_corrupt");
  assert.equal(await fs.readFile(filePath, "utf8"), corrupt);
  await fs.writeFile(filePath, "not JSON");
  await assert.rejects(store.list(), e => e.code === "storage_corrupt");
});
test("IndexedDB unavailable storage rejects rather than pretending the user has no favorites", async () => {
  const store = createIndexedDbSavedBirdSpotStore({ indexedDB: null });
  await assert.rejects(store.list(), e => e.code === "storage_unavailable");
  await assert.rejects(store.save(first), e => e.code === "storage_unavailable");
});

test("IndexedDB aborted writes preserve committed favorites and corrupt data is never silently reset", async () => {
  const indexedDB = new IDBFactory();
  const store = createIndexedDbSavedBirdSpotStore({ indexedDB, databaseName: "failure" });
  await store.save(first);
  const before = await store.list();
  const failingIndexedDb = {
    open(...args) {
      const request = indexedDB.open(...args);
      request.addEventListener("success", () => {
        const database = request.result;
        const originalTransaction = database.transaction.bind(database);
        database.transaction = (...transactionArgs) => {
          const transaction = originalTransaction(...transactionArgs);
          const originalStore = transaction.objectStore.bind(transaction);
          transaction.objectStore = name => {
            const objectStore = originalStore(name);
            objectStore.put = () => { throw new DOMException("quota exhausted", "QuotaExceededError"); };
            return objectStore;
          };
          return transaction;
        };
      });
      return request;
    },
  };
  const failing = createIndexedDbSavedBirdSpotStore({ indexedDB: failingIndexedDb, databaseName: "failure" });
  await assert.rejects(failing.save(second), e => e.code === "storage_unavailable");
  assert.deepEqual(await store.list(), before);
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("failure", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const transaction = database.transaction("saved-bird-spots", "readwrite");
    transaction.objectStore("saved-bird-spots").put({ version: 1, spots: [{ locId: "L123" }] }, "collection");
    transaction.oncomplete = resolve;
    transaction.onerror = reject;
  });
  database.close();
  await assert.rejects(store.list(), e => e.code === "storage_corrupt");
  await assert.rejects(store.save(second), e => e.code === "storage_corrupt");
});
