import { expect, test } from "./fixtures/test.mjs";
import { chooseDestination, openSearch, forgetKey } from "./fixtures/search-navigation.mjs";
const species = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };
async function setup(page) {
  await page.route("**/api/key/validate", route => route.fulfill({json: {valid: true}}));
  await page.route("**/api/species/search*", route => route.fulfill({json: {results: [species]}}));
  await page.route("**/api/species/resolve*", route => route.fulfill({json: {species, candidates: [species]}}));
  await page.route("**/api/observations*", route => route.fulfill({json: {speciesCode: "grpsni1", days: 3, generatedAt: "2026-11-23T00:00:00Z", observations: []}}));
  await page.route("**/api/bird-spots/directory*", route => route.fulfill({json: {status: "fresh", updatedAt: "2026-11-23T00:00:00Z", spots: []}}));
  await page.goto("/");
  await page.getByRole("textbox", {name: "eBird API key", exact: true}).fill("history-fixture-key");
  await page.getByRole("button", {name: "驗證 API key", exact: true}).click();
  await expect(page.locator(".search-navigation")).toBeVisible();
}
const submit = page => page.locator(".search-form").getByRole("button", {name: "搜尋", exact: true}).click();
for (const mobile of [false, true]) {
  test(`query history preserves submitted strings and independent modes on ${mobile ? "mobile" : "desktop"}`, async ({page}) => {
    if (mobile) await page.setViewportSize({width: 375, height: 812});
    await setup(page);
    await openSearch(page);
    const input = page.getByRole("textbox", {name: "鳥種", exact: true});
    await input.click();
    await input.press("Escape");
    await expect(page.locator(".search-form")).toHaveCount(0);
    await openSearch(page);
    await input.fill(" Greater Painted-Snipe ");
    await submit(page);
    await expect(page.locator(".search-form")).toHaveCount(0);
    await openSearch(page);
    await expect(input).toHaveValue("彩鷸");
    await input.click();
    const history = page.getByLabel("最近搜尋鳥種", {exact: true});
    await expect(history.getByRole("button", {name: "Greater Painted-Snipe", exact: true})).toBeVisible();
    await input.press("Escape");
    await expect(history).toHaveCount(0);
    await expect(input).toHaveValue("彩鷸");
    await input.click();
    await input.press("ArrowDown");
    await expect(history.getByRole("button")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(input).toHaveValue("Greater Painted-Snipe");
    await expect(input).toBeFocused();
    await expect(page.locator(".search-form")).toBeVisible();
    await input.fill("draft only");
    await expect(page.locator(".suggestions").getByRole("button", {name: /彩鷸/})).toBeVisible();
    await input.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(input).toHaveValue("彩鷸");
    await expect(input).toBeFocused();
    await expect(page.locator(".search-form")).toBeVisible();
    await input.fill("draft only");
    await expect(page.locator(".suggestions")).toBeVisible();
    await input.press("Escape");
    await expect(input).toHaveValue("draft only");
    await expect(page.locator(".suggestions")).toHaveCount(0);
    await chooseDestination(page, "搜尋鳥點");
    const spot = page.getByRole("textbox", {name: "鳥點名稱", exact: true});
    await spot.fill("清水濕地"); await submit(page);
    await expect(page.locator(".search-form")).toHaveCount(0);
    await openSearch(page); await spot.click();
    const spots = page.getByLabel("最近搜尋鳥點", {exact: true});
    await expect(spots.getByRole("button", {name: "清水濕地", exact: true})).toBeVisible();
    await expect(spots).not.toContainText("Painted");
    await spots.getByRole("button", {name: "清水濕地", exact: true}).click();
    await expect(spot).toHaveValue("清水濕地");
    await expect(spots).toHaveCount(0);
    await expect(page.locator(".search-form")).toBeVisible();
    await page.reload(); await chooseDestination(page, "搜尋鳥點"); await spot.click();
    await expect(spots.getByRole("button", {name: "清水濕地", exact: true})).toBeVisible();
    await forgetKey(page);
    await expect(page.getByRole("textbox", {name: "eBird API key", exact: true})).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("search-recent-queries-spots")))).toEqual(["清水濕地"]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("search-recent-queries-species")))).toEqual(["Greater Painted-Snipe"]);
  });
}
test("legacy and malformed data, long history, outside click and keyboard viewport", async ({page}) => {
  await page.setViewportSize({width: 320, height: 650});
  await page.addInitScript(() => localStorage.setItem("search-recent-species", JSON.stringify([null, {comName: "彩鷸"}, {comName: "Very long previous species search text ".repeat(5)}])));
  await setup(page); await openSearch(page);
  const input = page.getByRole("textbox", {name: "鳥種", exact: true});
  await input.click();
  const history = page.getByLabel("最近搜尋鳥種", {exact: true});
  await expect(history.getByRole("button")).toHaveCount(2);
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, "height", {configurable: true, value: 310});
    visualViewport.dispatchEvent(new Event("resize"));
  });
  const last = history.getByRole("button").last();
  await last.focus();
  await expect(last).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("spinbutton", {name: "最近天數"}).click();
  await expect(history).toHaveCount(0);
  await input.click(); await history.getByRole("button", {name: "彩鷸", exact: true}).click();
  await submit(page); await expect(page.locator(".search-form")).toHaveCount(0);
});
test("storage failures preserve in-memory history without blocking search", async ({page}) => {
  await setup(page);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("blocked"); }; Storage.prototype.getItem = () => { throw new Error("blocked"); }; });
  await chooseDestination(page, "搜尋鳥點");
  const input = page.getByRole("textbox", {name: "鳥點名稱", exact: true});
  for (const value of ["第一鳥點", "第二鳥點"]) {
    await input.fill(value); await submit(page); await expect(page.locator(".search-form")).toHaveCount(0); await openSearch(page);
  }
  await input.click();
  await expect(page.getByLabel("最近搜尋鳥點").getByRole("button")).toHaveText(["第二鳥點", "第一鳥點"]);
});
