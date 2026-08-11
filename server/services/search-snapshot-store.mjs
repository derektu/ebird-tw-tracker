import { readJson, writeJson } from "../storage/json-store.mjs";

const EMPTY_STORE = { snapshots: {} };

export function createSearchSnapshotStore({ filePath }) {
  async function readAll() {
    const stored = await readJson(filePath, EMPTY_STORE);
    return { snapshots: stored.snapshots ?? {} };
  }

  return {
    async read(scope) {
      const stored = await readAll();
      return stored.snapshots[scope.key] ?? null;
    },
    async commit(scope, snapshot, token) {
      const stored = await readAll();
      if (token && !token.isCurrent()) return false;
      stored.snapshots[scope.key] = snapshot;
      if (token && !token.isCurrent()) return false;
      await writeJson(filePath, stored);
    },
  };
}
