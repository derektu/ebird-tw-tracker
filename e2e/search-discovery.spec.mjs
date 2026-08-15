import { expect, test } from "@playwright/test";

const apiKey = "browser-owned-key";
const species = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };

function observations(entries) {
  return {
    speciesCode: species.speciesCode,
    days: 3,
    generatedAt: "2026-08-15T00:00:00.000Z",
    observations: entries,
  };
}

const firstObservation = {
  speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis",
  obsDt: "2026-08-14 07:30", locName: "基準地點", howMany: 2, subId: "S1",
  lat: 24.6, lng: 121.7, locationPrivate: false, obsValid: true, obsReviewed: false,
};
const discoveryObservation = {
  ...firstObservation,
  obsDt: "2026-08-15 07:30", locName: "新增自訂地點", howMany: 5, subId: "S2", locationPrivate: true,
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

async function stubSearches(page, responses) {
  await page.route("**/api/species/resolve*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ species, candidates: [species] }),
  }));
  await page.route("**/api/observations*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(responses.shift()),
  }));
}

async function search(page) {
  await page.getByPlaceholder("輸入中文名、英文名或 species code").fill("彩鷸");
  await page.getByRole("button", { name: "搜尋" }).click();
}

async function failIndexedDbOpen(page, callNumber) {
  await page.addInitScript((failAt) => {
    const browserIndexedDb = window.indexedDB;
    let calls = 0;
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: {
        open(...args) {
          calls += 1;
          if (calls === failAt) throw new DOMException("storage unavailable", "InvalidStateError");
          return browserIndexedDb.open(...args);
        },
      },
    });
  }, callNumber);
}

test("a first Search App search creates a baseline without marking existing results as discoveries", async ({ page }) => {
  await signIn(page);
  await stubSearches(page, [observations([firstObservation])]);

  await search(page);

  await expect(page.getByText("已建立搜尋比較基準")).toBeVisible();
  await expect(page.getByText("新增", { exact: true })).toHaveCount(0);
});

test("a later Search App search shares one discovery result between list badges and Pin halos", async ({ page }) => {
  await signIn(page);
  await stubSearches(page, [observations([firstObservation]), observations([discoveryObservation, firstObservation])]);

  await search(page);
  await expect(page.getByText("已建立搜尋比較基準")).toBeVisible();
  await search(page);

  await expect(page.getByText("新增 1 筆紀錄")).toBeVisible();
  await expect(page.getByText("新增", { exact: true })).toBeVisible();
  const discoveryMarker = page.locator(".bird-marker").filter({ hasText: "5" });
  await expect(discoveryMarker).toHaveClass(/discovery/);
  await expect(discoveryMarker).toHaveClass(/private/);
  await expect(discoveryMarker).toHaveClass(/active/);
});

test("clearing browser site data makes the next successful Search App search establish a new baseline", async ({ page }) => {
  await signIn(page);
  await stubSearches(page, [observations([firstObservation]), observations([discoveryObservation, firstObservation])]);

  await search(page);
  await expect(page.getByText("已建立搜尋比較基準")).toBeVisible();
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("ebird-search-snapshots");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }));
  await search(page);

  await expect(page.getByText("已建立搜尋比較基準")).toBeVisible();
  await expect(page.getByText("新增", { exact: true })).toHaveCount(0);
});

test("a stale browser search cannot replace the latest Search App result or baseline", async ({ page }) => {
  const newerSpecies = { speciesCode: "yebgre1", comName: "小白鷺", sciName: "Egretta garzetta" };
  const newerObservation = { ...discoveryObservation, speciesCode: newerSpecies.speciesCode, comName: newerSpecies.comName, locName: "最新結果", subId: "NEW" };
  let releaseOlderResponse;
  let olderObservationRequested;
  const olderRequested = new Promise((resolve) => { olderObservationRequested = resolve; });

  await signIn(page);
  await page.route("**/api/species/resolve*", (route) => {
    const query = new URL(route.request().url()).searchParams.get("query");
    const resolved = query === "小白鷺" ? newerSpecies : species;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ species: resolved, candidates: [resolved] }) });
  });
  await page.route("**/api/observations*", async (route) => {
    if (!releaseOlderResponse) {
      olderObservationRequested();
      await new Promise((resolve) => { releaseOlderResponse = resolve; });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(observations([firstObservation])) }).catch(() => {});
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...observations([newerObservation]), speciesCode: newerSpecies.speciesCode }),
    });
  });

  await search(page);
  await olderRequested;
  await page.getByPlaceholder("輸入中文名、英文名或 species code").evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "小白鷺");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(0);
  await page.getByPlaceholder("輸入中文名、英文名或 species code").evaluate((input) => {
    input.closest("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  await expect(page.getByText("最新結果")).toBeVisible();
  releaseOlderResponse();
  await expect(page.getByText("基準地點")).toHaveCount(0);
  await expect(page.getByText("已建立搜尋比較基準")).toBeVisible();
});

test("Search App visibly distinguishes no discoveries, save warning, and unavailable comparison", async ({ browser }) => {
  const cases = [
    { failureAt: undefined, expected: "沒有新增紀錄", responses: [observations([firstObservation]), observations([firstObservation])] },
    { failureAt: 4, expected: "新增 1 筆紀錄；基準未更新", responses: [observations([firstObservation]), observations([discoveryObservation, firstObservation])] },
    { failureAt: 1, expected: "搜尋比較暫時無法使用", responses: [observations([firstObservation])] },
  ];

  for (const scenario of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    if (scenario.failureAt) await failIndexedDbOpen(page, scenario.failureAt);
    await signIn(page);
    await stubSearches(page, scenario.responses);
    await search(page);
    if (scenario.responses.length) await search(page);
    await expect(page.getByText(scenario.expected)).toBeVisible();
    if (scenario.failureAt === 4) await expect(page.getByText("新增", { exact: true })).toBeVisible();
    if (scenario.failureAt === 1) await expect(page.getByText("新增", { exact: true })).toHaveCount(0);
    await context.close();
  }
});
