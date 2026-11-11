import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createSavedBirdSpotStore, parseSavedBirdSpotDocument, SavedBirdSpotError, storageError } from "../../src/domain/saved-bird-spots.mjs";

const queues = new Map();
function serialized(filePath, action) {
  const pending = (queues.get(filePath) ?? Promise.resolve()).then(action);
  const settled = pending.catch(() => {});
  queues.set(filePath, settled);
  void settled.then(() => { if (queues.get(filePath) === settled) queues.delete(filePath); });
  return pending;
}
async function read(filePath) {
  let raw;
  try { raw = await fs.readFile(filePath, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return { version: 1, spots: [] }; throw error; }
  try { return parseSavedBirdSpotDocument(JSON.parse(raw)); }
  catch { throw storageError("storage_corrupt"); }
}
async function write(filePath, document, replaceFile) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.pending-${randomUUID()}`;
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    try { await handle.writeFile(`${JSON.stringify(document, null, 2)}\n`, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
    await replaceFile(temporary, filePath);
  } finally { await fs.rm(temporary, { force: true }); }
}
export function createFileSavedBirdSpotStore({ filePath, now, replaceFile = fs.rename }) {
  const resolved = path.resolve(filePath);
  return createSavedBirdSpotStore((operation, writable = true) => serialized(resolved, async () => {
    try {
      const { spots } = await read(resolved);
      const change = operation(spots);
      if (writable) await write(resolved, { version: 1, spots: change.spots }, replaceFile);
      return change.result;
    } catch (error) {
      if (error instanceof SavedBirdSpotError) throw error;
      throw storageError();
    }
  }), now);
}
