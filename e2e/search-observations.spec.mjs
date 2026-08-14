import { expect, test } from "@playwright/test";

const apiKey = "browser-owned-key";

const taxonomyResponse = {
  results: [{ speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" }],
};

const resolveResponse = {
  species: { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" },
  candidates: taxonomyResponse.results,
};

const observationsResponse = {
  speciesCode: "grpsni1",
  days: 3,
  generatedAt: "2026-08-14T00:00:00.000Z",
  observations: [
    {
      speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis",
      obsDt: "2026-08-13 07:30", locName: "宜蘭雙連埤", howMany: 2, subId: "S379420319",
      lat: 24.6, lng: 121.7, locationPrivate: false, obsValid: true, obsReviewed: false,
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

test("a successful search shows observation details with Checklist and Google Maps actions", async ({ page }) => {
  await signIn(page);
  const observationRequests = [];
  await page.route("**/api/species/resolve*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(resolveResponse),
  }));
  await page.route("**/api/observations*", async (route) => {
    observationRequests.push(route.request());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(observationsResponse) });
  });

  await page.getByPlaceholder("輸入中文名、英文名或 species code").fill("彩鷸");
  await page.getByRole("button", { name: "搜尋" }).click();

  await expect(page.getByText("宜蘭雙連埤")).toBeVisible();
  await expect(page.getByText("2026-08-13 07:30")).toBeVisible();
  await expect(page.getByText("公開熱點或公開地點")).toBeVisible();
  await expect(page.getByText("Checklist S379420319")).toBeVisible();

  const checklistLink = page.getByRole("link", { name: "Checklist" });
  await expect(checklistLink).toHaveAttribute("href", "https://ebird.org/checklist/S379420319");
  await expect(checklistLink).toHaveAttribute("target", "_blank");

  const mapsLink = page.getByRole("link", { name: "Google Maps" });
  await expect(mapsLink).toHaveAttribute("href", "https://www.google.com/maps?q=24.6,121.7");
  await expect(mapsLink).toHaveAttribute("target", "_blank");

  expect(observationRequests).toHaveLength(1);
  expect(observationRequests[0].headers()["x-ebird-api-key"]).toBe(apiKey);
  expect(observationRequests[0].url()).toContain("speciesCode=grpsni1");
});

test("a search with no coordinate-bearing observations shows an empty-results message", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/species/resolve*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(resolveResponse),
  }));
  await page.route("**/api/observations*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ...observationsResponse, observations: [] }),
  }));

  await page.getByPlaceholder("輸入中文名、英文名或 species code").fill("彩鷸");
  await page.getByRole("button", { name: "搜尋" }).click();

  await expect(page.getByText("這個條件沒有找到有座標的公開紀錄。")).toBeVisible();
});

test("submitting a blank species query shows a validation error without a network call", async ({ page }) => {
  await signIn(page);
  let called = false;
  await page.route("**/api/species/resolve*", (route) => { called = true; return route.abort(); });

  await page.getByRole("button", { name: "搜尋" }).click();

  await expect(page.getByRole("alert")).toHaveText("請輸入鳥種名稱、英文名或 species code");
  expect(called).toBe(false);
});

test("an unresolvable species query shows a bounded not-found error", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/species/resolve*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"species":null,"candidates":[]}',
  }));

  await page.getByPlaceholder("輸入中文名、英文名或 species code").fill("不存在的鳥種");
  await page.getByRole("button", { name: "搜尋" }).click();

  await expect(page.getByRole("alert")).toHaveText("找不到 eBird 鳥種：不存在的鳥種");
});
