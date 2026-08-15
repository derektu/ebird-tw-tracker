import { expect, test } from "@playwright/test";

const apiKey = "browser-owned-key";

const grpsni1 = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };
const yebgre1 = { speciesCode: "yebgre1", comName: "小白鷺", sciName: "Egretta garzetta" };

const grpsni1Observations = {
  speciesCode: "grpsni1",
  days: 3,
  generatedAt: "2026-08-14T00:00:00.000Z",
  observations: [
    {
      speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis",
      obsDt: "2026-08-13 07:30", locName: "宜蘭雙連埤", howMany: 4, subId: "S379420319",
      lat: 24.6, lng: 121.7, locationPrivate: false, obsValid: true, obsReviewed: false,
    },
    {
      speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis",
      obsDt: "2026-08-12 06:10", locName: "自訂觀察點", howMany: 9, subId: "S379395954",
      lat: 25.05, lng: 121.55, locationPrivate: true, obsValid: true, obsReviewed: false,
    },
  ],
};

async function signIn(page) {
  await page.route("**/api/key/validate", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"valid":true}',
  }));
  await page.goto("/");
  await page.getByRole("textbox", { name: "eBird API key" }).fill(apiKey);
  await page.getByRole("button", { name: "驗證 API key" }).click();
  await expect(page.getByRole("heading", { name: "搜尋台灣鳥種觀察紀錄" })).toBeVisible();
}

async function stubSpecies(page, species) {
  await page.route("**/api/species/resolve*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ species, candidates: [species] }),
  }));
}

async function search(page, term) {
  await page.getByPlaceholder("輸入中文名、英文名或 species code").fill(term);
  await page.getByRole("button", { name: "搜尋" }).click();
}

test("selecting a list item activates its Pin, and selecting a Pin activates its list item", async ({ page }) => {
  await signIn(page);
  await stubSpecies(page, grpsni1);
  await page.route("**/api/observations*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(grpsni1Observations),
  }));

  await search(page, "彩鷸");
  await expect(page.getByText("宜蘭雙連埤")).toBeVisible();

  const items = page.locator(".observation-card");
  const markers = page.locator(".bird-marker");
  await expect(items).toHaveCount(2);
  await expect(markers).toHaveCount(2);
  await expect(items.nth(0)).toHaveClass(/active/);

  // Selecting the second Pin (while both are still on screen) activates its list
  // item without removing either item from the list.
  await markers.nth(1).click();
  await expect(items.nth(1)).toHaveClass(/active/);
  await expect(items.nth(0)).not.toHaveClass(/active/);
  await expect(items).toHaveCount(2);
  await expect(markers.nth(1)).toHaveClass(/active/);

  // Selecting the first list item activates its Pin.
  await items.nth(0).click();
  await expect(items.nth(0)).toHaveClass(/active/);
  await expect(items.nth(1)).not.toHaveClass(/active/);
  await expect(items).toHaveCount(2);
});

test("each Pin's number is its own observation's bird count, and private locations render distinctly", async ({ page }) => {
  await signIn(page);
  await stubSpecies(page, grpsni1);
  await page.route("**/api/observations*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(grpsni1Observations),
  }));

  await search(page, "彩鷸");
  const markers = page.locator(".bird-marker");
  await expect(markers).toHaveCount(2);

  const counts = await markers.evaluateAll((nodes) => nodes.map((node) => node.textContent));
  expect(counts.sort()).toEqual(["4", "9"]);

  const publicMarker = markers.filter({ hasText: "4" });
  const privateMarker = markers.filter({ hasText: "9" });
  await expect(publicMarker).not.toHaveClass(/private/);
  await expect(privateMarker).toHaveClass(/private/);
});

test("checklist and Google Maps actions stay available on the selected observation", async ({ page }) => {
  await signIn(page);
  await stubSpecies(page, grpsni1);
  await page.route("**/api/observations*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(grpsni1Observations),
  }));

  await search(page, "彩鷸");
  const items = page.locator(".observation-card");
  await items.nth(1).click();
  await expect(items.nth(1)).toHaveClass(/active/);

  const checklistLink = items.nth(1).getByRole("link", { name: "Checklist" });
  await expect(checklistLink).toHaveAttribute("href", "https://ebird.org/checklist/S379395954");
  const mapsLink = items.nth(1).getByRole("link", { name: "Google Maps" });
  await expect(mapsLink).toHaveAttribute("href", "https://www.google.com/maps?q=25.05,121.55");
});

test("only a successful observation search updates recent species, exposed on field focus", async ({ page }) => {
  await signIn(page);

  // A search that fails to resolve a species must not update recent species.
  await page.route("**/api/species/resolve*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"species":null,"candidates":[]}',
  }));
  await search(page, "不存在的鳥種");
  await expect(page.getByRole("alert")).toBeVisible();

  const field = page.getByPlaceholder("輸入中文名、英文名或 species code");
  await field.fill("");
  await field.focus();
  await expect(page.getByRole("button", { name: /彩鷸/ })).toHaveCount(0);

  // A successful search records its species as a recent choice.
  await page.unroute("**/api/species/resolve*");
  await stubSpecies(page, grpsni1);
  await page.route("**/api/observations*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(grpsni1Observations),
  }));
  await search(page, "彩鷸");
  await expect(page.getByText("宜蘭雙連埤")).toBeVisible();

  await field.fill("");
  await field.focus();
  await expect(page.getByRole("button", { name: /彩鷸/ })).toBeVisible();

  await expect.poll(() => page.evaluate(() => localStorage.getItem("search-recent-species"))).toContain("grpsni1");
});

test("forgetting the API key leaves the recent species MRU unchanged", async ({ page }) => {
  await signIn(page);
  await stubSpecies(page, grpsni1);
  await page.route("**/api/observations*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(grpsni1Observations),
  }));
  await search(page, "彩鷸");
  await expect(page.getByText("宜蘭雙連埤")).toBeVisible();

  const stored = await page.evaluate(() => localStorage.getItem("search-recent-species"));
  expect(stored).toContain("grpsni1");

  await page.getByRole("button", { name: "忘記 API key" }).click();
  await expect(page.getByRole("heading", { name: "輸入你的 eBird API key" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("search-recent-species"))).toBe(stored);
});

test("recent species are deduplicated by species code and kept as a 10-item MRU", async ({ page }) => {
  await page.addInitScript((species) => {
    localStorage.setItem("search-recent-species", JSON.stringify(species));
  }, Array.from({ length: 10 }, (_, index) => ({
    speciesCode: `sp${index}`,
    comName: `Species ${index}`,
    sciName: `Species ${index}`,
  })));
  await signIn(page);
  await stubSpecies(page, yebgre1);
  await page.route("**/api/observations*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ...grpsni1Observations, speciesCode: "yebgre1", observations: [] }),
  }));

  await search(page, "小白鷺");
  await expect(page.getByText("這個條件沒有找到有座標的公開紀錄。")).toBeVisible();

  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem("search-recent-species")));
  expect(stored).toHaveLength(10);
  expect(stored[0].speciesCode).toBe("yebgre1");
  expect(stored.map((species) => species.speciesCode)).not.toContain("sp9");
});
