import assert from "node:assert/strict";
import test from "node:test";
import { createIndexedDbSearchSnapshotStore } from "../src/apps/search/browser-search-snapshot-store.mjs";

function createFakeIndexedDb({ failTransaction = false } = {}) {
  const records = new Map();
  let createdStore = false;
  let upgradeCount = 0;

  function database() {
    return {
      close() {},
      objectStoreNames: { contains: () => createdStore },
      createObjectStore() {
        createdStore = true;
        upgradeCount += 1;
      },
      transaction() {
        if (failTransaction) throw new Error("transaction failed");
        const transaction = {
          error: null,
          abort() {
            queueMicrotask(() => transaction.onabort?.());
          },
          objectStore() {
            return {
              get(key) {
                const request = {};
                queueMicrotask(() => {
                  request.result = records.get(key);
                  request.onsuccess?.();
                  transaction.oncomplete?.();
                });
                return request;
              },
              put(value, key) {
                queueMicrotask(() => {
                  records.set(key, value);
                  transaction.oncomplete?.();
                });
                return {};
              },
            };
          },
        };
        return transaction;
      },
    };
  }

  return {
    indexedDB: {
      open() {
        const request = {};
        queueMicrotask(() => {
          request.result = database();
          if (!createdStore) request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      },
    },
    get upgradeCount() { return upgradeCount; },
  };
}

test("IndexedDB upgrades once and keeps only the latest Search Snapshot for each Search Scope", async () => {
  const fake = createFakeIndexedDb();
  const store = createIndexedDbSearchSnapshotStore({ indexedDB: fake.indexedDB });
  const grpsni = { speciesCode: "grpsni1", days: 3, key: "grpsni1:3" };
  const yebgre = { speciesCode: "yebgre1", days: 3, key: "yebgre1:3" };

  await store.commit(grpsni, {
    scope: grpsni,
    recordedAt: "2026-08-15T00:00:00.000Z",
    identityIds: ["grpsni1:S1", "grpsni1:S1"],
    observations: [{ apiKey: "must-not-persist" }],
  });
  assert.deepEqual(await store.read(grpsni), {
    scope: grpsni,
    recordedAt: "2026-08-15T00:00:00.000Z",
    identityIds: ["grpsni1:S1"],
  });
  await store.commit(grpsni, {
    scope: grpsni,
    recordedAt: "2026-08-15T00:01:00.000Z",
    identityIds: ["grpsni1:S2"],
  });
  await store.commit(yebgre, {
    scope: yebgre,
    recordedAt: "2026-08-15T00:02:00.000Z",
    identityIds: ["yebgre1:S3"],
  });

  assert.equal(fake.upgradeCount, 1);
  assert.deepEqual(await store.read(grpsni), {
    scope: grpsni,
    recordedAt: "2026-08-15T00:01:00.000Z",
    identityIds: ["grpsni1:S2"],
  });
  assert.deepEqual(await store.read(yebgre), {
    scope: yebgre,
    recordedAt: "2026-08-15T00:02:00.000Z",
    identityIds: ["yebgre1:S3"],
  });
  assert.equal(await store.read({ speciesCode: "grpsni1", days: 7, key: "grpsni1:7" }), null);
});

test("IndexedDB transaction failures reject without a localStorage fallback", async () => {
  const fake = createFakeIndexedDb({ failTransaction: true });
  const store = createIndexedDbSearchSnapshotStore({ indexedDB: fake.indexedDB });
  const scope = { speciesCode: "grpsni1", days: 3, key: "grpsni1:3" };

  await assert.rejects(store.read(scope), /瀏覽器無法保存搜尋比較基準/);
  await assert.rejects(
    store.commit(scope, { scope, recordedAt: "2026-08-15T00:00:00.000Z", identityIds: [] }),
    /瀏覽器無法保存搜尋比較基準/,
  );
});
