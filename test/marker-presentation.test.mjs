import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { createMarkerClassName } from "../src/features/map/marker-presentation.mjs";

test("an active private discovery marker retains every independent visual signal", async () => {
  assert.equal(
    createMarkerClassName({ locationPrivate: true, discovery: true, active: true }),
    "bird-marker private discovery active",
  );

  const styles = await fs.readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.bird-marker\s*\{[\s\S]*--marker-fill: var\(--accent\);[\s\S]*box-shadow: var\(--discovery-halo\), var\(--marker-shadow\);/);
  assert.match(styles, /\.bird-marker\.private\s*\{\s*--marker-fill: var\(--private\);\s*\}/);
  assert.match(styles, /\.bird-marker\.discovery\s*\{\s*--discovery-halo: 0 0 0 4px #f4bf4f;\s*\}/);
  assert.match(styles, /\.bird-marker\.active\s*\{[\s\S]*border-width: 3px;[\s\S]*--marker-shadow: 0 3px 12px rgba\(0, 0, 0, \.38\);/);
});
