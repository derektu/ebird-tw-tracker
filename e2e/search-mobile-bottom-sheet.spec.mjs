import { expect, test } from "@playwright/test";

const apiKey = "browser-owned-key";
const species = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };
const observations = {
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

async function signInAndSearch(page) {
  await page.route("**/api/key/validate", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"valid":true}',
  }));
  await page.route("**/api/species/resolve*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ species, candidates: [species] }),
  }));
  await page.route("**/api/observations*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(observations),
  }));

  await page.goto("/");
  await page.getByRole("textbox", { name: "eBird API key" }).fill(apiKey);
  await page.getByRole("button", { name: "驗證 API key" }).click();
  await page.getByPlaceholder("輸入中文名、英文名或 species code").fill("彩鷸");
  await page.getByRole("button", { name: "搜尋" }).click();
}

test("mobile Bottom Sheet preserves the full selected result collection through every sheet state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAndSearch(page);

  const sheet = page.getByRole("complementary", { name: "搜尋結果" });
  const items = page.locator(".observation-card");
  const markers = page.locator(".bird-marker");

  await expect(sheet).toHaveAttribute("data-sheet-state", "half");
  await expect(items).toHaveCount(2);
  await expect(markers).toHaveCount(2);
  await expect(page.getByPlaceholder("輸入中文名、英文名或 species code")).toHaveCSS("font-size", "16px");
  await expect(items.nth(0)).toHaveClass(/active/);
  await expect(items.nth(0).getByText("宜蘭雙連埤")).toBeVisible();
  await expect(items.nth(0).getByRole("link", { name: "開啟 Checklist" })).toHaveAttribute(
    "href",
    "https://ebird.org/checklist/S379420319",
  );
  await expect(items.nth(0).getByRole("link", { name: "Google Maps" })).toHaveAttribute(
    "href",
    "https://www.google.com/maps?q=24.6,121.7",
  );

  await page.getByRole("button", { name: "展開結果清單" }).click();
  await expect(sheet).toHaveAttribute("data-sheet-state", "expanded");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveClass(/active/);

  await page.getByRole("button", { name: "縮小結果清單" }).click();
  await expect(sheet).toHaveAttribute("data-sheet-state", "half");

  await page.getByRole("button", { name: "收合結果清單" }).click();
  await expect(sheet).toHaveAttribute("data-sheet-state", "collapsed");
  await expect(page.getByRole("button", { name: "顯示 2 筆結果" })).toBeVisible();

  await page.getByRole("button", { name: "顯示 2 筆結果" }).click();
  await expect(sheet).toHaveAttribute("data-sheet-state", "half");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveClass(/active/);

  await page.getByRole("button", { name: "收合結果清單" }).click();
  await markers.nth(1).click();
  await expect(sheet).toHaveAttribute("data-sheet-state", "half");
  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toHaveClass(/active/);
  await expect(markers.nth(1)).toHaveClass(/active/);
  await expect(items.nth(1).getByRole("link", { name: "開啟 Checklist" })).toBeVisible();
  await expect(items.nth(1).getByRole("link", { name: "Google Maps" })).toBeVisible();
  await expect(items.nth(1).getByRole("link", { name: "開啟 Checklist" })).toHaveAttribute(
    "href",
    "https://ebird.org/checklist/S379395954",
  );
  await expect(items.nth(1).getByRole("link", { name: "Google Maps" })).toHaveAttribute(
    "href",
    "https://www.google.com/maps?q=25.05,121.55",
  );
});
