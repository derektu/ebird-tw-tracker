import { expect, test } from "@playwright/test";

const species = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };
const observations = {
  speciesCode: species.speciesCode,
  days: 3,
  generatedAt: "2026-08-16T00:00:00.000Z",
  observations: [{
    speciesCode: species.speciesCode,
    comName: species.comName,
    sciName: species.sciName,
    obsDt: "2026-08-15 07:30",
    locName: "桌面測試地點",
    howMany: 2,
    subId: "S1",
    lat: 24.6,
    lng: 121.7,
    locationPrivate: false,
    obsValid: true,
    obsReviewed: false,
  }],
};

async function stubDesktopSearch(page) {
  let observationRequests = 0;
  let baselineWrites = 0;
  await page.route("**/api/species/saved", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "[]",
  }));
  await page.route("**/api/species/resolve*", (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(query === species.comName ? { species, candidates: [species] } : { species: null, candidates: [] }),
    });
  });
  await page.route("**/api/observations*", (route) => {
    observationRequests += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(observations) });
  });
  await page.route("**/api/search-snapshot-sessions", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "{}",
  }));
  await page.route("**/api/search-snapshots*", (route) => {
    if (route.request().method() === "PUT") baselineWrites += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: route.request().method() === "PUT" ? '{"committed":true}' : '{"snapshot":null}',
    });
  });
  await page.route("**/api/events?since=0", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"events":[],"unreadCount":0}',
  }));
  return {
    observationRequests: () => observationRequests,
    baselineWrites: () => baselineWrites,
  };
}

test("a failed explicit Desktop species resolution clears its preceding result presentation without replacing the Search Baseline", async ({ page }) => {
  const calls = await stubDesktopSearch(page);
  await page.goto("/");

  await expect(page.locator(".side .current").getByText(species.comName)).toBeVisible();
  await expect.poll(calls.observationRequests).toBe(1);

  await page.getByRole("button", { name: "搜尋" }).click();
  await expect.poll(calls.observationRequests).toBe(2);
  await expect(page.locator(".side .summary .metric").first()).toHaveText("1紀錄");
  await expect(page.locator(".side .item.active")).toHaveCount(1);
  await expect(page.locator(".bird-marker")).toHaveCount(1);
  await expect(page.getByText("已建立搜尋比較基準")).toBeVisible();
  const writesBeforeFailure = calls.baselineWrites();

  const searchField = page.getByPlaceholder("輸入中文名、英文名或 species code");
  await searchField.fill("不存在的鳥種");
  await page.getByRole("button", { name: "搜尋" }).click();

  await expect(page.locator(".brand-subtitle.error")).toHaveText("找不到 eBird 鳥種：不存在的鳥種");
  await expect(searchField).toHaveValue("不存在的鳥種");
  await expect(page.getByRole("button", { name: "搜尋" })).toBeEnabled();
  await expect(page.locator(".side")).toHaveCount(0);
  await expect(page.locator(".side .summary")).toHaveCount(0);
  await expect(page.locator(".side .current")).toHaveCount(0);
  await expect(page.locator(".side .item")).toHaveCount(0);
  await expect(page.locator(".side .item.active")).toHaveCount(0);
  await expect(page.locator(".side .comparison")).toHaveCount(0);
  await expect(page.locator(".bird-marker")).toHaveCount(0);
  await expect(page.getByText("桌面測試地點")).toHaveCount(0);
  await expect(page.getByText("已建立搜尋比較基準")).toHaveCount(0);
  await expect(page.locator(".workspace .empty")).toHaveCount(0);
  expect(calls.baselineWrites()).toBe(writesBeforeFailure);
});
