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

async function abortIndexedDbWrite(page, writeNumber) {
  await page.addInitScript((failAt) => {
    const browserIndexedDb = window.indexedDB;
    let writes = 0;
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: {
        open(...args) {
          const request = browserIndexedDb.open.call(browserIndexedDb, ...args);
          let wrappedDatabase;
          return new Proxy(request, {
            get(target, property) {
              if (property !== "result") {
                const value = Reflect.get(target, property, target);
                return typeof value === "function" ? value.bind(target) : value;
              }
              const database = target.result;
              if (!database) return database;
              if (!wrappedDatabase) {
                wrappedDatabase = new Proxy(database, {
                  get(databaseTarget, databaseProperty) {
                    if (databaseProperty === "transaction") {
                      return (...transactionArgs) => {
                        const transaction = databaseTarget.transaction(...transactionArgs);
                        if (transactionArgs[1] === "readwrite" && ++writes === failAt) {
                          queueMicrotask(() => transaction.abort());
                        }
                        return transaction;
                      };
                    }
                    const value = Reflect.get(databaseTarget, databaseProperty, databaseTarget);
                    return typeof value === "function" ? value.bind(databaseTarget) : value;
                  },
                });
              }
              return wrappedDatabase;
            },
          });
        },
      },
    });
  }, writeNumber);
}

async function readIndexedDbSnapshot(page, key) {
  return page.evaluate((snapshotKey) => new Promise((resolve, reject) => {
    const openRequest = indexedDB.open("ebird-search-snapshots");
    openRequest.onerror = () => reject(openRequest.error);
    openRequest.onsuccess = () => {
      const database = openRequest.result;
      const transaction = database.transaction("search-snapshots", "readonly");
      const readRequest = transaction.objectStore("search-snapshots").get(snapshotKey);
      readRequest.onsuccess = () => resolve(readRequest.result ?? null);
      readRequest.onerror = () => reject(readRequest.error);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => reject(transaction.error);
    };
  }), key);
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

test("two browser Search Scopes retain independent IndexedDB baselines", async ({ page }) => {
  const sevenDayObservation = { ...discoveryObservation, subId: "S7" };
  await signIn(page);
  await stubSearches(page, [observations([firstObservation]), observations([sevenDayObservation])]);

  await search(page);
  await expect(page.getByText("已建立搜尋比較基準")).toBeVisible();
  expect(await readIndexedDbSnapshot(page, "grpsni1:3")).toMatchObject({ identityIds: ["grpsni1:S1"] });
  await page.locator('input[type="number"]').fill("7");
  await search(page);
  await expect.poll(() => readIndexedDbSnapshot(page, "grpsni1:7")).toMatchObject({ identityIds: ["grpsni1:S7"] });

  await expect.poll(() => readIndexedDbSnapshot(page, "grpsni1:3")).toMatchObject({ identityIds: ["grpsni1:S1"] });
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

test("an IndexedDB transaction failure shows ordinary results without a fallback baseline", async ({ page }) => {
  await abortIndexedDbWrite(page, 1);
  await signIn(page);
  await stubSearches(page, [observations([firstObservation])]);

  await search(page);

  await expect(page.getByText("搜尋比較暫時無法使用")).toBeVisible();
  await expect(page.getByText("基準地點")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes("snapshot")))).toEqual([]);
});

test("a stale browser search cannot replace the latest Search App result or baseline", async ({ page }) => {
  const newerObservation = { ...discoveryObservation, locName: "最新結果", subId: "NEW" };
  let releaseOlderResponse;
  let olderObservationRequested;
  let observationCalls = 0;
  const olderRequested = new Promise((resolve) => { olderObservationRequested = resolve; });

  await signIn(page);
  await page.route("**/api/species/resolve*", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ species, candidates: [species] }),
  }));
  await page.route("**/api/observations*", async (route) => {
    const call = observationCalls++;
    if (call === 0) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(observations([firstObservation])) });
      return;
    }
    if (call === 1) {
      olderObservationRequested();
      await new Promise((resolve) => { releaseOlderResponse = resolve; });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(observations([discoveryObservation])) }).catch(() => {});
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(observations([newerObservation])),
    });
  });

  await search(page);
  await expect(page.getByText("已建立搜尋比較基準")).toBeVisible();
  expect(await readIndexedDbSnapshot(page, "grpsni1:3")).toMatchObject({ identityIds: ["grpsni1:S1"] });
  await search(page);
  await olderRequested;
  const daysField = page.locator('input[type="number"]');
  await daysField.evaluate((input) => { input.disabled = false; });
  await daysField.fill("7");
  await page.waitForTimeout(0);
  await page.getByPlaceholder("輸入中文名、英文名或 species code").evaluate((input) => {
    input.closest("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  await expect(page.getByText("最新結果")).toBeVisible();
  await expect.poll(() => readIndexedDbSnapshot(page, "grpsni1:7")).toMatchObject({ identityIds: ["grpsni1:NEW"] });
  releaseOlderResponse();
  await expect(page.getByText("基準地點")).toHaveCount(0);
  await expect.poll(() => readIndexedDbSnapshot(page, "grpsni1:3")).toMatchObject({ identityIds: ["grpsni1:S1"] });
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

test("compact mobile controls retain the zero-coordinate result explanation", async ({ page }) => {
  await page.setViewportSize({ width: 483, height: 852 });
  await signIn(page);
  await stubSearches(page, [observations([])]);

  await search(page);
  await expect(page.getByRole("button", { name: "修改搜尋" })).toBeVisible();
  await expect(page.getByText("這個條件沒有找到有座標的公開紀錄。")).toBeVisible();
});

test("compact mobile controls retain unavailable Search Discovery status", async ({ page }) => {
  await page.setViewportSize({ width: 483, height: 852 });
  await failIndexedDbOpen(page, 1);
  await signIn(page);
  await stubSearches(page, [observations([firstObservation])]);

  await search(page);
  await expect(page.getByRole("button", { name: "修改搜尋" })).toBeVisible();
  await expect(page.getByText("搜尋比較暫時無法使用")).toBeVisible();
});
