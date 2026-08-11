import fs from "node:fs";
import { readJson, writeJson } from "../storage/json-store.mjs";

const EMPTY_STORE = { snapshots: {} };

function isCommitToken(token) {
  return typeof token?.sessionId === "string" && token.sessionId.length > 0 && Number.isInteger(token.generation) && token.generation > 0;
}

export function createSearchSnapshotStore({ filePath, beforeWrite, writeSnapshot = writeJson } = {}) {
  const latestGenerationBySession = new Map();
  let temporaryFileSequence = 0;

  function isCurrent(token) {
    return !isCommitToken(token) || latestGenerationBySession.get(token.sessionId) === token.generation;
  }

  async function readAll() {
    const stored = await readJson(filePath, EMPTY_STORE);
    return { snapshots: stored.snapshots ?? {} };
  }

  return {
    advance(token) {
      if (!isCommitToken(token)) return false;
      const latest = latestGenerationBySession.get(token.sessionId) ?? 0;
      if (token.generation < latest) return false;
      latestGenerationBySession.set(token.sessionId, token.generation);
      return true;
    },
    async read(scope) {
      const stored = await readAll();
      return stored.snapshots[scope.key] ?? null;
    },
    async commit(scope, snapshot, token) {
      if (!isCurrent(token)) return false;
      const stored = await readAll();
      if (typeof token?.isCurrent === "function" && !token.isCurrent()) return false;
      if (!isCurrent(token)) return false;
      await beforeWrite?.(scope, snapshot, token);
      if (!isCurrent(token)) return false;
      stored.snapshots[scope.key] = snapshot;
      if (typeof token?.isCurrent === "function" && !token.isCurrent()) return false;
      const temporaryFilePath = `${filePath}.pending-${++temporaryFileSequence}`;
      await writeSnapshot(temporaryFilePath, stored);
      if (!isCurrent(token) || (typeof token?.isCurrent === "function" && !token.isCurrent())) {
        fs.rmSync(temporaryFilePath, { force: true });
        return false;
      }
      fs.renameSync(temporaryFilePath, filePath);
      return true;
    },
  };
}
