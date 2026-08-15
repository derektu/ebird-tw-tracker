import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

const outputDirectory = resolve("dist-search");

async function readOutputFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? readOutputFiles(path) : [path];
  }));
  return files.flat();
}

test("Search production bundle stays independent from Desktop-only runtime code", async () => {
  const outputFiles = await readOutputFiles(outputDirectory);
  const assets = await Promise.all(outputFiles.map(async (path) => ({ path, body: await readFile(path, "utf8") })));
  const bundle = assets.map(({ body }) => body).join("\n");

  assert.ok(assets.some(({ path }) => path.endsWith("search.html")));
  assert.ok(assets.some(({ path }) => path.endsWith(".js")));
  assert.ok(assets.some(({ path }) => path.endsWith(".css")));
  for (const desktopOnlyReference of [
    "TrackerManager",
    "NotificationCenter",
    "SettingsFeature",
    "electron/main",
    "server/application",
  ]) {
    assert.ok(!bundle.includes(desktopOnlyReference), `${desktopOnlyReference} must not enter the Search bundle`);
  }
  assert.ok(!bundle.includes("sourceMappingURL="), "production Search assets must not publish source maps");
});
