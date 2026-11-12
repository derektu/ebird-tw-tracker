import { expect, test } from "./fixtures/test.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const modulePrefix = "/__storage-test/";
const moduleFiles = new Set([
  "src/apps/search/browser-saved-bird-spots.mjs",
  "src/domain/saved-bird-spots.mjs",
  "src/domain/bird-spots.mjs",
]);
const source = { locId: "L123", locName: "測試公共鳥點", lat: 24, lng: 121, locationType: "hotspot" };
async function installModules(context) {
  await context.route(`**${modulePrefix}**`, async route => {
    const relative = new URL(route.request().url()).pathname.split(modulePrefix)[1];
    if (!moduleFiles.has(relative)) return route.abort();
    await route.fulfill({ contentType: "text/javascript", body: await fs.readFile(path.resolve(relative), "utf8") });
  });
  await context.route("**/api/key/validate", route => route.fulfill({ json: { valid: true } }));
}
async function storeInPage(page) {
  await page.evaluate(async () => {
    const { createIndexedDbSavedBirdSpotStore } = await import("/__storage-test/src/apps/search/browser-saved-bird-spots.mjs");
    window.testSavedBirdSpots = createIndexedDbSavedBirdSpotStore();
  });
}
test("real browser favorites survive reload, actual forget-key flow and offline reads", async ({ page, context }) => {
  await installModules(context);
  await page.goto("/");
  await page.getByRole("textbox", { name: "eBird API key" }).fill("storage-browser-test-key");
  await page.getByRole("button", { name: "驗證 API key" }).click();
  await storeInPage(page);
  await page.evaluate(async spot => {
    await window.testSavedBirdSpots.save(spot);
    await window.testSavedBirdSpots.update(spot.locId, { alias: "自己的鳥點", note: "自己的筆記", pinned: true });
  }, source);
  await page.reload();
  await expect(page.getByRole("button", { name: "忘記 API key" })).toBeVisible();
  await storeInPage(page);
  expect(await page.evaluate(() => window.testSavedBirdSpots.list())).toMatchObject([{ locId: "L123", alias: "自己的鳥點", note: "自己的筆記", pinned: true }]);
  await page.getByRole("button", { name: "忘記 API key" }).click();
  await expect(page.getByRole("button", { name: "驗證 API key" })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("ebird-search-api-key"))).toBeNull();
  await page.getByRole("textbox", { name: "eBird API key" }).fill("replacement-browser-test-key");
  await page.getByRole("button", { name: "驗證 API key" }).click();
  await context.setOffline(true);
  const saved = await page.evaluate(() => window.testSavedBirdSpots.list());
  expect(saved).toHaveLength(1);
  expect(saved[0].note).toBe("自己的筆記");
  expect(JSON.stringify(saved)).not.toContain("browser-test-key");
});
test("two real browser tabs commit concurrent favorites and metadata edits without lost updates", async ({ page, context }) => {
  await installModules(context);
  await page.goto("/");
  await storeInPage(page);
  const second = await context.newPage();
  await second.goto("/");
  await storeInPage(second);
  await Promise.all(Array.from({ length: 10 }, (_, index) => (index % 2 ? second : page).evaluate(
    spot => window.testSavedBirdSpots.save(spot), { ...source, locId: `L${1000 + index}` },
  )));
  await Promise.all([
    page.evaluate(() => window.testSavedBirdSpots.update("L1000", { alias: "新別名" })),
    second.evaluate(() => window.testSavedBirdSpots.update("L1000", { note: "新筆記" })),
  ]);
  const saved = await page.evaluate(() => window.testSavedBirdSpots.list());
  expect(saved).toHaveLength(10);
  expect(saved.find(s => s.locId === "L1000")).toMatchObject({ alias: "新別名", note: "新筆記" });
});
