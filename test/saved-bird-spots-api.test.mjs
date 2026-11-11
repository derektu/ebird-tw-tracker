import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApplication } from "../server/application.mjs";
import { createDesktopSavedBirdSpotStore } from "../src/features/map/desktop-saved-bird-spots.mjs";
import { createFileSavedBirdSpotStore } from "../server/storage/saved-bird-spot-store.mjs";

const spot = { locId: "L123", locName: "測試地點", lat: null, lng: null, locationType: "unknown" };
async function environment(context, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "saved-spots-api-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const applications = [];
  context.after(async () => { for (const application of applications) await application.close(); });
  async function start(extra = {}) {
    const application = await createApplication({ root, port: 0, isProduction: true, env: {}, logger: { error() {} }, ...options, ...extra });
    applications.push(application);
    const { url } = await application.listen();
    const request = async (pathname, init) => {
      const response = await fetch(url + pathname, init);
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status, code: data.code });
      return data;
    };
    return { application, url, request, store: createDesktopSavedBirdSpotStore({ request }) };
  }
  return { root, start };
}
test("Desktop favorites survive service restart on a new port and API-key removal", async context => {
  const { root, start } = await environment(context);
  const first = await start();
  await first.store.save(spot);
  await first.store.update("L123", { alias: "別名", note: "自己的筆記", pinned: true });
  const before = await first.store.list();
  await fs.writeFile(path.join(root, "data/settings.json"), JSON.stringify({ apiKey: "test-key-do-not-return" }));
  await first.request("/api/settings/api-key", { method: "DELETE" });
  await first.application.close();
  const restarted = await start();
  assert.notEqual(first.url, restarted.url);
  assert.deepEqual(await restarted.store.list(), before);
  const removed = await restarted.store.remove("L123");
  assert.deepEqual(await restarted.store.list(), []);
  await restarted.store.restore(removed);
  assert.deepEqual((await restarted.store.list()).map(s => s.note), ["自己的筆記"]);
});
test("Desktop API rejects malformed changes and reports unavailable/corrupt storage without false success", async context => {
  const { root, start } = await environment(context);
  const { store, request } = await start();
  await store.save(spot);
  await assert.rejects(store.update("L123", { pinned: "yes" }), e => e.status === 400);
  await assert.rejects(request("/api/bird-spots/saved", { method: "POST", body: "{" }), e => e.code === "invalid_json");
  await assert.rejects(request("/api/bird-spots/saved?sort=recent&sort=name"), e => e.status === 400);
  await assert.rejects(request("/api/bird-spots/saved", { method: "PUT" }), e => e.status === 405);
  const filePath = path.join(root, "data/saved-bird-spots.json");
  const failing = await start({ savedBirdSpotStore: createFileSavedBirdSpotStore({ filePath, replaceFile: async () => { throw new Error("private disk path must not leak"); } }) });
  await assert.rejects(failing.store.save({ ...spot, locId: "L456" }), e => e.status === 503 && e.code === "storage_unavailable" && !e.message.includes("private disk"));
  assert.equal((await store.list()).length, 1);
  await fs.writeFile(filePath, "broken data");
  await assert.rejects(store.list(), e => e.status === 503 && e.code === "storage_corrupt");
  await assert.rejects(store.save(spot), e => e.code === "storage_corrupt");
  assert.equal(await fs.readFile(filePath, "utf8"), "broken data");
});
