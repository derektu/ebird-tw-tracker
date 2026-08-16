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

test("Search production build emits resolvable home-screen metadata and icon assets", async () => {
  const outputFiles = await readOutputFiles(outputDirectory);
  const outputPaths = new Set(outputFiles.map((path) => relative(outputDirectory, path).replaceAll("\\", "/")));
  const html = await readFile(join(outputDirectory, "search.html"), "utf8");
  const manifest = JSON.parse(await readFile(join(outputDirectory, "search.webmanifest"), "utf8"));

  assert.match(html, /<link rel="manifest" href="\/search\.webmanifest"/);
  assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="\/icons\/search-apple-touch-icon\.png"/);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/icons\/search-icon\.svg"/);
  assert.match(html, /<link rel="icon" type="image\/png" sizes="32x32" href="\/icons\/search-icon-32\.png"/);
  assert.deepEqual(
    manifest,
    {
      id: "/",
      name: "eBird Taiwan Search",
      short_name: "eBird Taiwan Search",
      start_url: "/",
      display: "standalone",
      theme_color: "#123d2c",
      background_color: "#123d2c",
      icons: [
        {
          src: "/icons/search-icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any maskable",
        },
        {
          src: "/icons/search-icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    },
  );

  for (const iconPath of [
    "icons/search-apple-touch-icon.png",
    "icons/search-icon.svg",
    "icons/search-icon-32.png",
    "icons/search-icon-192.png",
    "icons/search-icon-512.png",
  ]) {
    assert.ok(outputPaths.has(iconPath), `production build is missing ${iconPath}`);
  }

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const iconPath of [
    "icons/search-apple-touch-icon.png",
    "icons/search-icon-32.png",
    "icons/search-icon-192.png",
    "icons/search-icon-512.png",
  ]) {
    const icon = await readFile(join(outputDirectory, iconPath));
    assert.deepEqual(icon.subarray(0, pngSignature.length), pngSignature, `${iconPath} must be a PNG`);
  }
  assert.match(await readFile(join(outputDirectory, "icons/search-icon.svg"), "utf8"), /<svg\b/);
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
