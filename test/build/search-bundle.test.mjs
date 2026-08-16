import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { build } from "vite";

const repositoryRoot = resolve();
const outputDirectory = resolve("dist-search");
const forbiddenModuleBoundaries = {
  Tracker: ["src/features/tracking/"],
  events: ["src/features/events/"],
  settings: ["src/features/settings/"],
  Electron: ["electron/"],
  "local Node application": ["server/", "server.mjs"],
};

async function readOutputFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? readOutputFiles(path) : [path];
  }));
  return files.flat();
}

function moduleProvenance(moduleIds) {
  return moduleIds.flatMap((moduleId) => {
    const repositoryPath = relative(repositoryRoot, moduleId).replaceAll("\\", "/");
    return Object.entries(forbiddenModuleBoundaries)
      .filter(([, boundaries]) => boundaries.some((boundary) => repositoryPath === boundary || repositoryPath.startsWith(boundary)))
      .map(([category]) => ({ category, repositoryPath }));
  });
}

function assertSearchModuleBoundary(moduleIds) {
  const forbiddenModules = moduleProvenance(moduleIds);
  assert.deepEqual(
    forbiddenModules,
    [],
    `Search production module graph imports Desktop-only code: ${forbiddenModules.map(({ category, repositoryPath }) => `${category} (${repositoryPath})`).join(", ")}`,
  );
}

async function collectSearchProductionModuleIds() {
  const result = await build({
    configFile: resolve("vite.search.config.ts"),
    build: { write: false },
  });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.flatMap((output) => output.output
    .filter((file) => file.type === "chunk")
    .flatMap((file) => Object.keys(file.modules)));
}

test("Search production build excludes Desktop-only module provenance and source maps", async () => {
  const outputFiles = await readOutputFiles(outputDirectory);
  const assets = await Promise.all(outputFiles.map(async (path) => ({ path, body: await readFile(path, "utf8") })));
  const bundle = assets.map(({ body }) => body).join("\n");
  const moduleIds = await collectSearchProductionModuleIds();

  assert.ok(assets.some(({ path }) => path.endsWith("search.html")));
  assert.ok(assets.some(({ path }) => path.endsWith(".js")));
  assert.ok(assets.some(({ path }) => path.endsWith(".css")));
  assertSearchModuleBoundary(moduleIds);
  assert.ok(!assets.some(({ path }) => path.endsWith(".map")), "production Search assets must not publish source maps");
  assert.ok(!bundle.includes("sourceMappingURL="), "production Search assets must not publish source maps");
});

test("Search module provenance check rejects every forbidden runtime boundary", () => {
  for (const [category, boundaries] of Object.entries(forbiddenModuleBoundaries)) {
    for (const boundary of boundaries) {
      const moduleId = boundary.endsWith("/")
        ? resolve(repositoryRoot, boundary, "would-be-imported.mjs")
        : resolve(repositoryRoot, boundary);
      assert.throws(
        () => assertSearchModuleBoundary([moduleId]),
        new RegExp(`Search production module graph imports Desktop-only code: ${category}`),
      );
    }
  }
});

test("Search module provenance check rejects the root local Node entrypoint", () => {
  assert.throws(
    () => assertSearchModuleBoundary([resolve(repositoryRoot, "server.mjs")]),
    /Search production module graph imports Desktop-only code: local Node application/,
  );
});
