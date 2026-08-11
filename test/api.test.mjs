import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApplication } from "../server/application.mjs";

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
  const saveSnapshot = await fetch(`${address.url}/api/search-snapshots`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope, snapshot }),
  });
  assert.equal(saveSnapshot.status, 200);
  const loadedSnapshot = await fetch(`${address.url}/api/search-snapshots?speciesCode=GRPSNI1&days=3`);
  assert.deepEqual(await loadedSnapshot.json(), { snapshot });
});
