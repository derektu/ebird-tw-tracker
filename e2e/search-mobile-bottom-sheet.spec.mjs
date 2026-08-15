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

const overflowingObservations = {
  ...observations,
  observations: Array.from({ length: 16 }, (_, index) => ({
    speciesCode: "grpsni1",
    comName: "彩鷸",
    sciName: "Rostratula benghalensis",
    obsDt: `2026-08-${String(13 - index).padStart(2, "0")} 07:30`,
    locName: `溢出觀察點 ${index + 1}`,
    howMany: index + 1,
    subId: `S379420${String(index).padStart(3, "0")}`,
    lat: 22.1 + (index % 4) * 0.8,
    lng: 120.1 + Math.floor(index / 4) * 0.7,
    locationPrivate: false,
    obsValid: true,
    obsReviewed: false,
  })),
};

const compressedObservations = {
  ...overflowingObservations,
  observations: overflowingObservations.observations.slice(0, 10),
};

async function signInAndSearch(page, observationResponse = observations) {
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
    body: JSON.stringify(observationResponse),
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

  await items.nth(1).getByRole("button").click();
  await expect(items.nth(1)).toHaveClass(/active/);
  await expect(markers.nth(1)).toHaveClass(/active/);

  await page.getByRole("button", { name: "收合結果清單" }).click();
  await expect(sheet).toHaveAttribute("data-sheet-state", "collapsed");
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: "顯示 2 筆結果" })).toBeVisible();

  await page.getByRole("button", { name: "顯示 2 筆結果" }).click();
  await expect(sheet).toHaveAttribute("data-sheet-state", "half");
  await expect(sheet).toBeVisible();
  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toHaveClass(/active/);

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

async function expectVisibleInside(page, containerSelector, item) {
  const index = await item.evaluate((node) => Array.from(node.parentElement.children).indexOf(node));
  await expect.poll(() => page.evaluate(({ containerSelector, index }) => {
    const container = document.querySelector(containerSelector);
    const item = document.querySelectorAll(".observation-card")[index];
    if (!container || !item) return false;
    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    return itemRect.top >= containerRect.top && itemRect.bottom <= containerRect.bottom;
  }, { containerSelector, index })).toBe(true);
}

test("Pin selection scrolls an overflowing desktop result sidebar to its row", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await signInAndSearch(page, overflowingObservations);

  const items = page.locator(".observation-card");
  const markers = page.locator(".bird-marker");
  const target = items.nth(10);
  await expect(items).toHaveCount(16);
  await markers.nth(10).click({ force: true });
  await expect(target).toHaveClass(/active/);
  await expectVisibleInside(page, ".side", target);
});

test("Pin selection scrolls an overflowing mobile half Sheet to its row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAndSearch(page, overflowingObservations);

  const items = page.locator(".observation-card");
  const markers = page.locator(".bird-marker");
  const target = items.nth(8);
  await expect(items).toHaveCount(16);
  await markers.nth(8).dispatchEvent("click");
  await expect(target).toHaveClass(/active/);
  await expectVisibleInside(page, ".observation-list", target);
});

test("keyboard collapse and reopen retain a nearby focus target", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAndSearch(page);
  await expect(page.locator(".observation-card")).toHaveCount(2);

  const collapse = page.getByRole("button", { name: "收合結果清單" });
  const reopen = page.getByRole("button", { name: "顯示 2 筆結果" });
  const handle = page.getByRole("button", { name: "展開結果清單" });
  await collapse.press("Enter");
  await expect(reopen).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(handle).toBeFocused();
});

async function expectReadableSheetRows(page, observationResponse, count) {
  await page.setViewportSize({ width: 483, height: 766 });
  await signInAndSearch(page, observationResponse);

  await expect(page.locator(".observation-card")).toHaveCount(count);
  const geometry = await page.evaluate(() => {
    const list = document.querySelector(".observation-list");
    const cards = Array.from(document.querySelectorAll(".observation-card"));
    const cardHeights = cards.map((card) => card.getBoundingClientRect().height);
    const rowsDoNotOverlap = cards.every((card, index) => index === 0 || card.getBoundingClientRect().top >= cards[index - 1].getBoundingClientRect().bottom);
    return {
      cardHeights,
      rowsDoNotOverlap,
      scrolls: list.scrollHeight > list.clientHeight,
    };
  });

  expect(geometry.scrolls).toBe(true);
  expect(geometry.rowsDoNotOverlap).toBe(true);
  expect(Math.min(...geometry.cardHeights)).toBeGreaterThanOrEqual(60);
}

test("reproduces readable intrinsic rows in an overflowing 483px mobile Sheet", async ({ page }) => {
  await expectReadableSheetRows(page, compressedObservations, 10);
});

test("keeps the original sixteen-result mobile Sheet readable", async ({ page }) => {
  await expectReadableSheetRows(page, overflowingObservations, 16);
});
