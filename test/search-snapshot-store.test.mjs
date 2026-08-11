import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSearchScope, createSearchSnapshot } from "../src/domain/search-discovery.mjs";
import { createSearchSnapshotStore } from "../server/services/search-snapshot-store.mjs";

test("Desktop Search Snapshots persist per Search Scope across store restart", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ebird-search-snapshots-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "search-snapshots.json");
  const threeDays = createSearchScope("grpsni1", 3);
  const sevenDays = createSearchScope("grpsni1", 7);
  const initial = createSearchSnapshot(threeDays, [{ subId: "S1" }], "2026-08-11T00:00:00.000Z");
  const replacement = createSearchSnapshot(threeDays, [], "2026-08-11T01:00:00.000Z");

  const store = createSearchSnapshotStore({ filePath });
  assert.equal(await store.read(threeDays), null);
  await store.commit(threeDays, initial);
  await store.commit(threeDays, replacement);

  const restarted = createSearchSnapshotStore({ filePath });
  assert.deepEqual(await restarted.read(threeDays), replacement);
  assert.equal(await restarted.read(sevenDays), null);
  assert.deepEqual(Object.keys(JSON.parse(await fs.readFile(filePath, "utf8")).snapshots), [threeDays.key]);
});
