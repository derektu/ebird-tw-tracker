import { expect, test } from "@playwright/test";

const species = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };
const source = { ...species, locId: "L123", locName: "宜蘭雙連埤", lat: 24.6, lng: 121.7, obsDt: "2026-11-11 07:30", subId: "S123", howMany: 4, locationPrivate: false, obsValid: true, obsReviewed: false };
const observations = Array.from({ length: 12 }, (_, index) => ({ ...source, locId: `L${123 + index}`, subId: `S${123 + index}`, locName: index ? `觀察點 ${index + 1}` : source.locName, lat: 22.2 + index * .23, lng: 120.3 + index * .08 }));
const recent = (locId = "L123") => ({ locId, days: 3, generatedAt: "2026-11-12T00:00:00.000Z", observations: Array.from({ length: 8 }, (_, index) => ({ ...source, locId, speciesCode: index ? `bird/${index}` : species.speciesCode, comName: index ? `鳥種 ${index + 1}` : species.comName, locationType: "hotspot", subId: `S/${index}`, lat: null, lng: null })) });
const detail = page => page.getByRole("complementary", { name: "鳥點詳情", exact: true });
const results = page => page.getByRole("complementary", { name: "搜尋結果", exact: true });
async function setup(page, { recentHandler } = {}) {
  await page.route("**/api/key/validate", route => route.fulfill({ json: { valid: true } }));
  await page.route("**/api/species/search*", route => route.fulfill({ json: { results: [species] } }));
  await page.route("**/api/species/resolve*", route => route.fulfill({ json: { species } }));
  await page.route("**/api/observations*", route => route.fulfill({ json: { ...species, days: 3, generatedAt: "2026-11-12T00:00:00.000Z", observations } }));
  await page.route("**/api/bird-spots/observations*", recentHandler || (route => route.fulfill({ json: recent(new URL(route.request().url()).searchParams.get("locId")) })));
  await page.goto("/");
  await page.getByRole("textbox", { name: "eBird API key" }).fill("fixture-browser-key");
  await page.getByRole("button", { name: "驗證 API key" }).click();
  await expect(page.locator(".search-workspace")).toBeVisible();
}
async function search(page) {
  const expand = page.getByRole("button", { name: "展開搜尋條件" });
  if (await expand.isVisible()) await expand.click();
  await page.getByPlaceholder("輸入中文名、英文名或 species code").fill("彩鷸");
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  await expect(page.locator(".observation-card")).toHaveCount(12);
}
async function open(page) {
  await page.getByRole("button", { name: `查看鳥點 ${source.locName}`, exact: true }).click();
  await expect(detail(page)).toBeVisible();
  await expect(detail(page).locator(".search-spot-row")).toHaveCount(8);
}
async function readDatabase(page, name, store) {
  return page.evaluate(({ name, store }) => new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(store, "readonly");
      const read = transaction.objectStore(store).getAll();
      read.onsuccess = () => resolve(read.result);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  }), { name, store });
}
const favorites = page => readDatabase(page, "ebird-saved-bird-spots", "saved-bird-spots");
const baseline = page => readDatabase(page, "ebird-search-snapshots", "search-snapshots");

for (const width of [320, 390, 402, 1440]) {
  test(`bird-spot detail preserves the compact search layout and accessible controls at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await setup(page);
    if (width < 720) {
      await expect(page.getByRole("button", { name: "展開搜尋條件" })).toBeVisible();
      expect(await page.locator(".search-form-card").evaluate(node => node.getBoundingClientRect().height)).toBe(70);
    }
    await expect(results(page)).toHaveCount(0);
    await search(page);
    const snapshot = await baseline(page);
    await open(page);
    await expect(detail(page)).toHaveAttribute("data-sheet-state", "half");
    if (width < 720) {
      await expect(detail(page).getByRole("button", { name: "展開鳥點詳情" })).toBeVisible();
      await expect(detail(page).getByRole("button", { name: "收合鳥點詳情" })).toBeVisible();
    } else {
      await expect(detail(page).getByRole("button", { name: "展開鳥點詳情" })).toHaveCount(0);
      await expect(detail(page).getByRole("button", { name: "收合鳥點詳情" })).toHaveCount(0);
    }
    await expect(detail(page).getByRole("spinbutton", { name: "鳥點最近天數" })).toHaveValue("3");
    await expect(detail(page).getByRole("link", { name: /鳥種 2 ↗/ })).toHaveAttribute("href", "https://ebird.org/species/bird%2F1");
    await expect(detail(page).getByRole("link", { name: "Checklist ↗" }).first()).toHaveAttribute("href", "https://ebird.org/checklist/S%2F0");
    const dimensions = await detail(page).evaluate(node => {
      const scroll = node.querySelector(".search-spot-scroll").getBoundingClientRect();
      const visibleBirds = [...node.querySelectorAll(".search-spot-row")].filter(row => row.getBoundingClientRect().bottom <= scroll.bottom).length;
      const buttons = [...node.querySelectorAll(".search-spot-heading button, .search-spot-query button, .search-spot-query input, .search-spot-query select, .search-spot-row a")];
      return { visibleBirds, touch: buttons.filter(button => button.getBoundingClientRect().width > 0).map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })), overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(dimensions.overflow).toBe(false);
    expect(dimensions.visibleBirds).toBeGreaterThanOrEqual(2);
    expect(dimensions.touch.every(size => size.width >= 44 && size.height >= 44)).toBe(true);
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`headless-fixture-detail-${width}.png`) });
    await detail(page).getByRole("combobox", { name: "鳥點鳥種篩選" }).selectOption("original");
    await expect(detail(page).locator(".search-spot-row")).toHaveCount(1);
    await detail(page).getByRole("button", { name: "返回搜尋結果" }).click();
    await expect(results(page)).toBeVisible();
    expect(await baseline(page)).toEqual(snapshot);
  });
}

test("detail uses the same half, expanded, collapsed, reopen and marker states with keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page); await search(page); await open(page);
  await expect(detail(page).getByRole("button", { name: "返回搜尋結果" })).toBeFocused();
  await detail(page).getByRole("button", { name: "展開鳥點詳情" }).press("Enter");
  await expect(detail(page)).toHaveAttribute("data-sheet-state", "expanded");
  await detail(page).getByRole("button", { name: "縮小鳥點詳情" }).click();
  await expect(detail(page)).toHaveAttribute("data-sheet-state", "half");
  await detail(page).getByRole("button", { name: "收合鳥點詳情" }).press("Enter");
  const reopen = page.getByRole("button", { name: "重開鳥點詳情" });
  await expect(reopen).toBeFocused();
  await reopen.press("Enter");
  await expect(detail(page).getByRole("button", { name: "返回搜尋結果" })).toBeFocused();
  await detail(page).getByRole("button", { name: "收合鳥點詳情" }).click();
  await page.getByRole("button", { name: "開啟鳥點詳情", exact: true }).dispatchEvent("click");
  await expect(detail(page)).toHaveAttribute("data-sheet-state", "half");
});

test("return restores selection, result scroll, expanded sheet and map positions without replacing the baseline", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page); await search(page);
  await page.getByRole("button", { name: "展開結果清單" }).click();
  await page.locator(".observation-card").nth(5).locator(".observation-select").click();
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => ({
    scroll: document.querySelector(".observation-list").scrollTop,
    markers: [...document.querySelectorAll(".leaflet-marker-icon")].map(node => node.style.transform),
  }));
  const originalBaseline = await baseline(page);
  await page.getByRole("button", { name: "查看鳥點 觀察點 6", exact: true }).click();
  await expect(detail(page).locator(".search-spot-row")).toHaveCount(8);
  await detail(page).getByRole("button", { name: "返回搜尋結果" }).click();
  await expect(results(page)).toHaveAttribute("data-sheet-state", "expanded");
  await expect(page.locator(".observation-card").nth(5)).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "查看鳥點 觀察點 6", exact: true })).toBeFocused();
  await expect.poll(() => page.locator(".observation-list").evaluate(node => node.scrollTop)).toBe(before.scroll);
  await expect.poll(() => page.locator(".leaflet-marker-icon").evaluateAll(nodes => nodes.map(node => node.style.transform))).toEqual(before.markers);
  expect(await baseline(page)).toEqual(originalBaseline);
});

test("favorites commit to IndexedDB, preserve notes on undo, survive forget-key and retry failed writes", async ({ page }) => {
  await setup(page); await search(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    let fail = true;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.transaction.db.name === 'ebird-saved-bird-spots' && fail) { fail = false; this.transaction.abort(); throw new DOMException('write failed', 'QuotaExceededError'); }
      return original.apply(this, args);
    };
  });
  const star = page.getByRole("button", { name: `收藏 ${source.locName}`, exact: true });
  await star.click();
  await expect(page.getByRole("alert")).toContainText("無法讀寫");
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "關閉訊息" }).click();
  await star.dblclick();
  await expect(page.getByRole("button", { name: `取消收藏 ${source.locName}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  expect((await favorites(page))[0].spots).toHaveLength(1);
  await open(page);
  await detail(page).getByRole("button", { name: "編輯筆記" }).click();
  await detail(page).getByRole("textbox", { name: "鳥點筆記" }).fill("下次從北側進入");
  await detail(page).getByRole("button", { name: "儲存筆記", exact: true }).click();
  await expect(detail(page).getByText("下次從北側進入", { exact: true })).toBeVisible();
  await detail(page).getByRole("button", { name: "取消收藏鳥點", exact: true }).click();
  await page.getByRole("button", { name: "復原收藏" }).click();
  await expect(detail(page).getByText("下次從北側進入", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "忘記 API key" }).click();
  await expect(page.getByRole("button", { name: "驗證 API key" })).toBeVisible();
  expect((await favorites(page))[0].spots).toMatchObject([{ locId: "L123", note: "下次從北側進入" }]);
  expect(JSON.stringify(await favorites(page))).not.toContain("fixture-browser-key");
  await page.reload();
  expect((await favorites(page))[0].spots[0].note).toBe("下次從北側進入");
});

test("storage initialization failure is explicit and retryable instead of an empty collection", async ({ page }) => {
  await page.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB);
    let fail = true;
    indexedDB.open = (...args) => { if (args[0] === "ebird-saved-bird-spots" && fail) { fail = false; throw new DOMException("unavailable", "InvalidStateError"); } return open(...args); };
  });
  await setup(page); await search(page);
  await expect(page.getByRole("button", { name: `收藏 ${source.locName}`, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "重試讀取收藏" }).click();
  await expect(page.getByRole("button", { name: `收藏 ${source.locName}`, exact: true })).toBeEnabled();
});

test("empty, unavailable and network failures stay distinct and days are bounded and explicit", async ({ page }) => {
  const requests = [];
  const replies = [{ observations: [] }, { code: "location_unavailable", error: "這個鳥點目前無法取得公開紀錄" }, "network", recent()];
  await setup(page, { recentHandler: async route => {
    requests.push(new URL(route.request().url()).searchParams.get("days"));
    const next = replies.shift();
    if (next === "network") return route.abort();
    return route.fulfill({ status: next.code ? 404 : 200, json: { ...recent(), ...next } });
  } });
  await search(page);
  await page.getByRole("button", { name: `查看鳥點 ${source.locName}`, exact: true }).click();
  await expect(detail(page).getByText(/沒有可取得的公開紀錄/)).toBeVisible();
  await detail(page).getByRole("spinbutton", { name: "鳥點最近天數" }).fill("30");
  await expect(detail(page).getByRole("alert")).toContainText("無法取得公開紀錄");
  await detail(page).getByRole("button", { name: "重試查詢" }).click();
  await expect(detail(page).getByRole("alert")).toContainText("無法連線");
  await detail(page).getByRole("button", { name: "重試查詢" }).click();
  await expect(detail(page).locator(".search-spot-row")).toHaveCount(8);
  expect(requests).toEqual(["3", "30", "30", "30"]);
  await detail(page).getByRole("spinbutton", { name: "鳥點最近天數" }).fill("31");
  await expect(detail(page).getByRole("spinbutton", { name: "鳥點最近天數" })).toHaveValue("30");
});

test("obsolete detail responses and failures cannot replace a newer location or explicit search", async ({ page }) => {
  const held = [];
  let calls = 0;
  await setup(page, { recentHandler: route => { calls++; if (calls <= 2) held.push(route); else return route.fulfill({ json: recent(new URL(route.request().url()).searchParams.get("locId")) }); } });
  await search(page);
  await page.getByRole("button", { name: `查看鳥點 ${source.locName}`, exact: true }).click();
  await expect.poll(() => held.length).toBe(1);
  await detail(page).getByRole("button", { name: "返回搜尋結果" }).click();
  await page.locator(".observation-card").nth(1).locator(".observation-select").click();
  await page.getByRole("button", { name: "查看鳥點 觀察點 2", exact: true }).click();
  await expect.poll(() => held.length).toBe(2);
  await detail(page).getByRole("button", { name: "更新", exact: true }).click();
  await expect(detail(page).locator(".search-spot-row")).toHaveCount(8);
  await held[0].fulfill({ status: 503, json: { code: "upstream_error", error: "過時錯誤" } }).catch(() => {});
  await held[1].fulfill({ json: { ...recent("L124"), observations: [{ ...recent("L124").observations[0], comName: "過時結果" }] } }).catch(() => {});
  await expect(detail(page)).not.toContainText("過時");
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  await expect(detail(page)).toHaveCount(0);
  await expect(results(page)).toBeVisible();
});

test("a failed note save retains its draft when continuing to edit, and undo expires after eight seconds", async ({ page }) => {
  await setup(page); await search(page); await open(page);
  await detail(page).getByRole("button", { name: "編輯筆記" }).click();
  const note = detail(page).getByRole("textbox", { name: "鳥點筆記" });
  await note.fill("保留這份未儲存的筆記");
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let fail = true;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.transaction.db.name === "ebird-saved-bird-spots" && fail) { fail = false; this.transaction.abort(); throw new DOMException("write failed", "QuotaExceededError"); }
      return put.apply(this, args);
    };
  });
  await detail(page).getByRole("button", { name: "儲存筆記並收藏", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("無法讀寫");
  await expect(note).toHaveValue("保留這份未儲存的筆記");
  await detail(page).getByRole("button", { name: "返回搜尋結果" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "繼續編輯" }).click();
  await expect(note).toHaveValue("保留這份未儲存的筆記");
  await detail(page).getByRole("button", { name: "儲存筆記並收藏", exact: true }).click();
  await expect(detail(page).getByText("保留這份未儲存的筆記", { exact: true })).toBeVisible();
  await page.clock.install();
  await detail(page).getByRole("button", { name: "取消收藏鳥點", exact: true }).click();
  await expect(page.getByRole("button", { name: "復原收藏" })).toBeVisible();
  await page.clock.fastForward(8001);
  await expect(page.getByRole("button", { name: "復原收藏" })).toHaveCount(0);
  await expect(detail(page).getByRole("button", { name: "收藏鳥點", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect((await favorites(page))[0].spots).toHaveLength(0);
});

test("a short mobile viewport shows multiple recent birds without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 650 });
  await setup(page); await search(page); await open(page);
  const visible = await detail(page).evaluate(node => {
    const bottom = node.querySelector(".search-spot-scroll").getBoundingClientRect().bottom;
    return [...node.querySelectorAll(".search-spot-row")].filter(row => row.getBoundingClientRect().bottom <= bottom).length;
  });
  expect(visible).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("species and checklist touch targets do not overlap and resizing a collapsed detail to wide restores its sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page); await search(page); await open(page);
  const hit = await detail(page).locator(".search-spot-row").first().evaluate(row => {
    const species = row.querySelector(".search-spot-species-link");
    const checklist = row.querySelector(".search-spot-checklist-link");
    const a = species.getBoundingClientRect(), b = checklist.getBoundingClientRect();
    return { overlap: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom,
      speciesAtEdge: document.elementFromPoint(a.right - 2, a.bottom - 2)?.closest("a") === species };
  });
  expect(hit).toEqual({ overlap: false, speciesAtEdge: true });
  await detail(page).getByRole("button", { name: "收合鳥點詳情" }).click();
  await expect(detail(page)).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 844 });
  await expect(detail(page)).toBeVisible();
  await expect(detail(page)).toHaveAttribute("data-sheet-state", "half");
  await expect(detail(page).getByRole("button", { name: "展開鳥點詳情" })).toHaveCount(0);
  await expect(detail(page).getByRole("button", { name: "收合鳥點詳情" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(detail(page)).toBeVisible();
});

test("saving notes and undoing removal preserve metadata committed by another tab", async ({ page, context }) => {
  await setup(page); await search(page); await open(page);
  await detail(page).getByRole("button", { name: "收藏鳥點", exact: true }).click();
  await expect(detail(page).getByRole("button", { name: "取消收藏鳥點", exact: true })).toHaveAttribute("aria-pressed", "true");
  await detail(page).getByRole("button", { name: "編輯筆記" }).click();
  await detail(page).getByRole("textbox", { name: "鳥點筆記" }).fill("這個分頁的新筆記");
  const second = await context.newPage();
  await second.goto("/");
  const editOtherTab = changes => second.evaluate(changes => new Promise((resolve, reject) => {
    const request = indexedDB.open("ebird-saved-bird-spots");
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("saved-bird-spots", "readwrite");
      const store = transaction.objectStore("saved-bird-spots");
      const read = store.get("collection");
      read.onsuccess = () => { const document = read.result; document.spots[0] = { ...document.spots[0], ...changes }; store.put(document, "collection"); };
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }), changes);
  await editOtherTab({ alias: "另一分頁的別名", pinned: true });
  await detail(page).getByRole("button", { name: "儲存筆記", exact: true }).click();
  await expect(detail(page).getByRole("textbox", { name: "鳥點筆記" })).toHaveCount(0);
  await expect(detail(page).getByText("這個分頁的新筆記", { exact: true })).toBeVisible();
  expect((await favorites(page))[0].spots[0]).toMatchObject({ alias: "另一分頁的別名", pinned: true, note: "這個分頁的新筆記" });
  await editOtherTab({ note: "移除前另一分頁的新筆記" });
  await detail(page).getByRole("button", { name: "取消收藏鳥點", exact: true }).click();
  await page.getByRole("button", { name: "復原收藏" }).click();
  await expect(detail(page).getByText("移除前另一分頁的新筆記", { exact: true })).toBeVisible();
  expect((await favorites(page))[0].spots[0]).toMatchObject({ alias: "另一分頁的別名", pinned: true, note: "移除前另一分頁的新筆記" });
});
