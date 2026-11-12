import { test as base, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

export const tileUrlPattern = /^https:\/\/(?:[a-z0-9-]+\.)?tile\.openstreetmap\.org\//;
export const tileFixture = {
  contentType: "image/png",
  path: fileURLToPath(new URL("./tile.png", import.meta.url)),
};

export const test = base.extend({
  localMapTiles: [async ({ context }, use) => {
    await context.route(tileUrlPattern, route => route.fulfill(tileFixture));
    await use();
  }, { auto: true }],
});

export { expect };
