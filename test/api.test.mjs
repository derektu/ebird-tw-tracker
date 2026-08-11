import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApplication } from "../server/application.mjs";
import { createSearchSnapshotStore } from "../server/services/search-snapshot-store.mjs";
import { writeJson } from "../server/storage/json-store.mjs";
import { createDesktopSearchSnapshotStore } from "../src/features/search/desktop-search-snapshot-store.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("local API exposes service state without returning an API key", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ebird-api-test-"));
  const dataDir = path.join(root, "data");
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const application = await createApplication({
    root,
    dataDir,
    distDir: path.join(root, "dist"),
    port: 0,
    isProduction: true,
    env: {},
    logger: { error() {} },
  });
  context.after(() => application.close());
  const address = await application.listen();

  const settingsResponse = await fetch(`${address.url}/api/settings/api-key`);
  assert.equal(settingsResponse.status, 200);
  assert.deepEqual(await settingsResponse.json(), { configured: false, source: "none", editable: true });

  const trackingResponse = await fetch(`${address.url}/api/tracking`);
  assert.deepEqual(await trackingResponse.json(), { trackers: [] });

  const saveResponse = await fetch(`${address.url}/api/species/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" }),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await (await fetch(`${address.url}/api/species/saved`)).json();
  assert.equal(saved[0].speciesCode, "grpsni1");

  const invalidKeyResponse = await fetch(`${address.url}/api/settings/api-key`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey: "bad key" }),
  });
  assert.equal(invalidKeyResponse.status, 400);
  assert.deepEqual(await invalidKeyResponse.json(), { error: "請輸入有效的 eBird API key" });

  const scope = { speciesCode: "grpsni1", days: 3, key: "grpsni1:3" };
  const snapshot = { scope, recordedAt: "2026-08-11T00:00:00.000Z", identityIds: ["grpsni1:S1"] };
  const commitToken = { sessionId: "api-test", generation: 1 };
  const advanceSnapshot = await fetch(`${address.url}/api/search-snapshot-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ commitToken }),
  });
  assert.deepEqual(await advanceSnapshot.json(), { advanced: true });
  const saveSnapshot = await fetch(`${address.url}/api/search-snapshots`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope, snapshot, commitToken }),
  });
  assert.deepEqual(await saveSnapshot.json(), { snapshot, committed: true });
  const loadedSnapshot = await fetch(`${address.url}/api/search-snapshots?speciesCode=GRPSNI1&days=3`);
  assert.deepEqual(await loadedSnapshot.json(), { snapshot });
});

test("Desktop snapshot commits cannot let an older accepted request overwrite a newer baseline", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ebird-snapshot-race-test-"));
  const dataDir = path.join(root, "data");
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const oldWriteEntered = deferred();
  const releaseOldWrite = deferred();
  const store = createSearchSnapshotStore({
    filePath: path.join(dataDir, "search-snapshots.json"),
    async beforeWrite(_scope, _snapshot, token) {
      if (token.generation === 1) {
        oldWriteEntered.resolve();
        await releaseOldWrite.promise;
      }
    },
  });
  const application = await createApplication({
    root,
    dataDir,
    distDir: path.join(root, "dist"),
    port: 0,
    isProduction: true,
    env: {},
    logger: { error() {} },
    searchSnapshotStore: store,
  });
  context.after(() => application.close());
  const address = await application.listen();
  const request = async (pathname, options) => {
    const response = await fetch(`${address.url}${pathname}`, options);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    return payload;
  };
  const snapshots = createDesktopSearchSnapshotStore({ request });
  const scope = { speciesCode: "grpsni1", days: 3, key: "grpsni1:3" };
  const oldToken = { isCurrent: () => true, commitToken: { sessionId: "desktop", generation: 1 } };
  const newToken = { isCurrent: () => true, commitToken: { sessionId: "desktop", generation: 2 } };
  const oldSnapshot = { scope, recordedAt: "2026-08-11T00:00:00.000Z", identityIds: ["grpsni1:S1"] };
  const newSnapshot = { scope, recordedAt: "2026-08-11T00:01:00.000Z", identityIds: ["grpsni1:S2"] };

  await snapshots.advance(oldToken);
  const oldCommit = snapshots.commit(scope, oldSnapshot, oldToken);
  await oldWriteEntered.promise;
  await snapshots.advance(newToken);
  await snapshots.commit(scope, newSnapshot, newToken);
  releaseOldWrite.resolve();

  assert.equal(await oldCommit, false);
  assert.deepEqual(await snapshots.read(scope), newSnapshot);
});

test("Desktop notification freshness prevents an already-persisting older snapshot from becoming visible", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ebird-snapshot-persist-race-test-"));
  const dataDir = path.join(root, "data");
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const oldPersistenceEntered = deferred();
  const releaseOldPersistence = deferred();
  const oldIdentity = "grpsni1:OLD";
  const store = createSearchSnapshotStore({
    filePath: path.join(dataDir, "search-snapshots.json"),
    async writeSnapshot(filePath, value) {
      if (value.snapshots["grpsni1:3"]?.identityIds.includes(oldIdentity)) {
        oldPersistenceEntered.resolve();
        await releaseOldPersistence.promise;
      }
      await writeJson(filePath, value);
    },
  });
  const application = await createApplication({
    root,
    dataDir,
    distDir: path.join(root, "dist"),
    port: 0,
    isProduction: true,
    env: {},
    logger: { error() {} },
    searchSnapshotStore: store,
  });
  context.after(() => application.close());
  const address = await application.listen();
  const request = async (pathname, options) => {
    const response = await fetch(`${address.url}${pathname}`, options);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    return payload;
  };
  const snapshots = createDesktopSearchSnapshotStore({ request });
  const scope = { speciesCode: "grpsni1", days: 3, key: "grpsni1:3" };
  const baseline = { scope, recordedAt: "2026-08-11T00:00:00.000Z", identityIds: ["grpsni1:BASE"] };
  const oldSnapshot = { scope, recordedAt: "2026-08-11T00:01:00.000Z", identityIds: [oldIdentity] };
  const baselineToken = { isCurrent: () => true, commitToken: { sessionId: "seed", generation: 1 } };
  const oldToken = { isCurrent: () => true, commitToken: { sessionId: "desktop", generation: 1 } };
  const notificationToken = { isCurrent: () => true, commitToken: { sessionId: "desktop", generation: 2 } };

  await snapshots.advance(baselineToken);
  await snapshots.commit(scope, baseline, baselineToken);
  await snapshots.advance(oldToken);
  const oldCommit = snapshots.commit(scope, oldSnapshot, oldToken);
  await oldPersistenceEntered.promise;
  await snapshots.advance(notificationToken);
  releaseOldPersistence.resolve();

  assert.equal(await oldCommit, false);
  assert.deepEqual(await snapshots.read(scope), baseline);
});
