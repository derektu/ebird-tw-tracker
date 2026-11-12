import { expect, test } from "./fixtures/test.mjs";

const now = "2026-11-11T00:00:00.000Z";
const directory = Array.from({ length: 30 }, (_, i) => ({
  locId: `L${i + 100}`, locName: i < 2 ? "同名濕地" : `公共濕地 ${i}`,
  lat: 24 + i / 100, lng: 121, locationType: "hotspot", countryCode: "TW", subnational1Code: "TW-ILA", subnational2Code: null,
}));
const favorites = directory.map((spot, i) => ({
  ...spot, alias: `地點 ${String(i).padStart(2, "0")}`, note: i === 0 ? "私人筆記" : "", pinned: i === 0,
  savedAt: new Date(Date.parse(now) + i * 1000).toISOString(), updatedAt: now,
}));
const button = (root, name) => root.getByRole("button", { name, exact: true });
const manager = page => page.getByRole("region", { name: "收藏管理", exact: true });
const names = page => page.getByRole("complementary", { name: "鳥點搜尋結果", exact: true });
const detail = page => page.getByRole("complementary", { name: "鳥點詳情", exact: true });
const dialog = page => page.getByRole("dialog");
const rows = page => manager(page).locator(".spot-list-row");
const nameRows = page => names(page).locator(".spot-list-row");
const field = (page, name) => manager(page).getByRole("textbox", { name, exact: true });

async function db(page, operation, spots = []) {
  return page.evaluate(({ operation, spots }) => new Promise((resolve, reject) => {
    const request = indexedDB.open("ebird-saved-bird-spots", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("saved-bird-spots");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const tx = database.transaction("saved-bird-spots", operation === "read" ? "readonly" : "readwrite");
      const store = tx.objectStore("saved-bird-spots");
      const record = operation === "read" ? store.get("collection") : store.put({ version: 1, spots }, "collection");
      tx.oncomplete = () => { database.close(); resolve(record.result?.spots ?? []); };
      tx.onabort = () => { database.close(); reject(tx.error); };
    };
  }), { operation, spots });
}
async function signIn(page) {
  await page.getByRole("textbox", { name: "eBird API key" }).fill("isolated-demo-key");
  await button(page, "驗證 API key").click();
  await expect(page.locator(".search-workspace")).toBeVisible();
}
async function setup(page, { width = 390, height = 844, spots = favorites, response } = {}) {
  await page.setViewportSize({ width, height });
  await page.route("**/api/key/validate", r => r.fulfill({ json: { valid: true } }));
  await page.route("**/api/bird-spots/directory*", response ?? (r => r.fulfill({ json: { status: "fresh", updatedAt: now, spots: directory } })));
  await page.route("**/api/bird-spots/observations*", r => r.fulfill({ json: { locId: new URL(r.request().url()).searchParams.get("locId"), days: 3, generatedAt: now, observations: [] } }));
  await page.route("**/api/species/search*", r => r.fulfill({ json: { results: [] } }));
  await page.goto("/");
  await db(page, "write", spots);
  await signIn(page);
}
async function conditions(page) {
  const b = page.getByRole("button", { name: /^(展開搜尋條件|修改搜尋)$/ });
  if (await b.isVisible()) await b.click();
}
async function openManager(page) {
  await conditions(page);
  await button(page, "我的鳥點").click();
  await expect(manager(page)).toBeVisible();
}
async function spotSearch(page, query) {
  await conditions(page);
  await button(page, "鳥點").click();
  await page.getByRole("textbox", { name: "鳥點名稱" }).fill(query);
  await button(page, "搜尋").click();
  await expect(names(page)).toBeVisible();
}
async function holdNextOpen(page) {
  await page.evaluate(() => {
    delete window.releaseHeldSave;
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      const request = open(...args);
      if (args[0] !== "ebird-saved-bird-spots") return request;
      indexedDB.open = open;
      let onSuccess;
      Object.defineProperty(request, "onsuccess", { set(fn) { onSuccess = fn; } });
      request.addEventListener("success", e => { window.releaseHeldSave = () => onSuccess(e); });
      return request;
    };
  });
}
async function failNextWrite(page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.transaction.db.name !== "ebird-saved-bird-spots") return put.apply(this, args);
      IDBObjectStore.prototype.put = put;
      this.transaction.abort();
      throw new DOMException("fixture quota failure", "QuotaExceededError");
    };
  });
}

for (const width of [320, 390, 402, 1440]) {
  test(`manager and directory retain compact controls, keyboard focus and accessible actions at ${width}px`, async ({ page }) => {
    await setup(page, { width });
    if (width < 720) {
      await expect(button(page, "我的鳥點")).toBeHidden();
      expect(await page.locator(".search-form-card").evaluate(n => n.getBoundingClientRect().height)).toBe(70);
    }
    await spotSearch(page, "同名");
    await expect(nameRows(page)).toHaveCount(2);
    await expect(nameRows(page).nth(1)).toContainText("L101");
    await expect(nameRows(page).first()).toContainText("TW-ILA");
    const opener = nameRows(page).first().locator(".spot-row-name");
    await opener.press("Enter");
    await expect(detail(page).getByRole("combobox")).toHaveCount(0);
    await button(detail(page), "返回搜尋結果").press("Enter");
    await expect(opener).toBeFocused();
    await openManager(page);
    await expect(button(manager(page), "返回工作區")).toBeFocused();
    await manager(page).getByRole("combobox", { name: "收藏排序" }).selectOption("name");
    await manager(page).getByRole("searchbox").fill("地點");
    const target = rows(page).nth(20);
    const recent = target.locator(".spot-row-name");
    await recent.scrollIntoViewIfNeeded();
    const scroll = await manager(page).locator(".spot-manager-rows").evaluate(n => n.scrollTop);
    await recent.press("Enter");
    await button(detail(page), "返回我的鳥點").press("Enter");
    await expect(recent).toBeFocused();
    expect(await manager(page).locator(".spot-manager-rows").evaluate(n => n.scrollTop)).toBe(scroll);
    const edit = button(target, "編輯 地點 20");
    await edit.press("Enter");
    await expect(field(page, "別名")).toBeFocused();
    await expect(field(page, "原始地名")).toHaveAttribute("readonly", "");
    await page.setViewportSize({ width, height: width < 720 ? 380 : 440 });
    await field(page, "筆記").fill("鍵盤高度測試");
    const geometry = () => manager(page).evaluate(n => {
      const fields = n.querySelector(".spot-editor-fields"), footer = n.querySelector(".spot-editor-actions");
      const targets = [...n.querySelectorAll("button, select, input:not([type=checkbox]), textarea, .spot-pin")].filter(el => el.getBoundingClientRect().width);
      return { overflow: document.documentElement.scrollWidth > innerWidth, fixed: fields.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 1,
        visible: [...footer.querySelectorAll("button")].every(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && el.contains(document.elementFromPoint(r.x + 8, r.y + 8)); }),
        touch: targets.every(el => el.offsetHeight >= 44 && el.offsetWidth >= 44),
        font: [...n.querySelectorAll("input:not([type=checkbox]), select, textarea")].every(el => parseFloat(getComputedStyle(el).fontSize) >= 16) };
    });
    await expect.poll(geometry).toEqual({ overflow: false, fixed: true, visible: true, touch: true, font: true });
    await button(manager(page), "取消").click();
    await button(dialog(page), "繼續編輯").click();
    await expect(field(page, "筆記")).toHaveValue("鍵盤高度測試");
    await button(manager(page), "取消").click();
    await button(dialog(page), "捨棄").click();
    await expect(edit).toBeFocused();
    await button(manager(page), "返回工作區").click();
    await expect(button(page, "我的鳥點")).toBeFocused();
    await expect(names(page)).toHaveAttribute("data-sheet-state", "half");
    await expect(page.getByRole("textbox", { name: "鳥點名稱" })).toHaveValue("同名");
  });
}

test("a single private directory GET merges local aliases and notes, including when offline or stale", async ({ page }) => {
  const requests = [];
  let status = "stale";
  page.on("request", req => { if (new URL(req.url()).pathname.startsWith("/api/")) requests.push({ url: req.url(), body: req.postData(), method: req.method() }); });
  await setup(page, { response: r => status === "offline" ? r.abort() : r.fulfill({ json: { status, updatedAt: status === "stale" ? now : null, spots: status === "stale" ? directory : [] } }) });
  await spotSearch(page, "私人筆記");
  await expect(nameRows(page)).toHaveCount(1);
  await expect(names(page)).toContainText("上次目錄");
  await expect(names(page).locator("time")).toHaveAttribute("datetime", now);
  for (status of ["offline", "unavailable"]) {
    await spotSearch(page, "地點 02");
    await expect(names(page)).toContainText("目前只搜尋本機收藏");
    await expect(nameRows(page)).toHaveCount(1);
    await expect(nameRows(page)).toContainText("L102");
    await expect(names(page).locator("time")).toHaveCount(0);
  }
  const publicReads = requests.filter(r => r.url.includes("bird-spots/directory"));
  expect(publicReads).toHaveLength(3);
  expect(publicReads.every(r => new URL(r.url).search === "" && r.method === "GET" && r.body === null)).toBe(true);
  expect(decodeURIComponent(JSON.stringify(requests))).not.toMatch(/私人筆記|地點 02/);
});

test("each mode retains its conditions and an obsolete species or directory request cannot replace current results", async ({ page }) => {
  let observation;
  const held = [];
  await setup(page, { response: r => { held.push(r); } });
  await page.route("**/api/species/resolve*", r => r.fulfill({ json: { species: { comName: "彩鷸", speciesCode: "grpsni1", sciName: "Rostratula benghalensis" } } }));
  await page.route("**/api/observations*", r => { observation = r; });
  await conditions(page);
  await page.getByPlaceholder("輸入中文名、英文名或 species code").fill("彩鷸");
  await page.getByRole("spinbutton", { name: "最近天數" }).fill("9");
  await expect(page.getByRole("spinbutton", { name: "最近天數" })).toHaveValue("9");
  await button(page, "搜尋").click();
  await expect.poll(() => observation && new URL(observation.request().url()).searchParams.get("days")).toBe("9");
  await spotSearch(page, "地點 11");
  await expect(nameRows(page)).toContainText("L111");
  await observation.fulfill({ json: { observations: [], days: 9, generatedAt: now } }).catch(() => {});
  await openManager(page);
  await button(manager(page), "返回工作區").click();
  await button(page, "鳥種").click();
  await expect(page.getByRole("spinbutton", { name: "最近天數" })).toHaveValue("9");
  await expect(page.getByPlaceholder("輸入中文名、英文名或 species code")).toHaveValue("彩鷸");
  await button(page, "鳥點").click();
  await expect(page.getByRole("spinbutton", { name: "最近天數" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "鳥點名稱" })).toHaveValue("地點 11");
  await spotSearch(page, "L129");
  await expect.poll(() => held.length).toBe(2);
  await held[1].fulfill({ json: { spots: directory, status: "fresh", updatedAt: now } });
  await held[0].abort().catch(() => {});
  await expect(nameRows(page)).toHaveCount(1);
  await expect(nameRows(page)).toContainText("L129");
  await expect(names(page)).toContainText("公共熱點與本機收藏");
});

test("save failure retains its destination and all fields; reloading, sorting and forgetting the key retain metadata", async ({ page }) => {
  await setup(page, { width: 1440 });
  await openManager(page);
  await button(manager(page), "保存位置說明").click();
  await expect(manager(page)).toContainText("不會自動同步");
  await button(manager(page), "保存位置說明").click();
  await button(manager(page), "編輯 地點 02").click();
  await field(page, "別名").fill("ABC");
  await field(page, "筆記").fill("使用西入口");
  await manager(page).getByRole("checkbox", { name: "釘選" }).check();
  await failNextWrite(page);
  await button(manager(page), "編輯 地點 03").click();
  await button(dialog(page), "儲存").click();
  await expect(dialog(page).getByRole("alert")).toContainText("無法讀寫");
  expect((await db(page, "read")).find(s => s.locId === "L102")).toMatchObject({ alias: "地點 02", pinned: false });
  await button(dialog(page), "繼續編輯").click();
  await expect(field(page, "別名")).toHaveValue("ABC");
  await expect(field(page, "筆記")).toHaveValue("使用西入口");
  await button(manager(page), "編輯 地點 03").click();
  await button(dialog(page), "儲存").click();
  await expect(field(page, "別名")).toHaveValue("地點 03");
  await page.reload();
  await openManager(page);
  await expect(rows(page).first()).toContainText("ABC");
  await manager(page).getByRole("combobox").selectOption("recent");
  await expect(rows(page).first()).toContainText("地點 29");
  await manager(page).getByRole("combobox").selectOption("name");
  const actual = await rows(page).locator("strong").allTextContents();
  expect(actual).toEqual([...actual].sort((a,b) => a.localeCompare(b, "zh-Hant")));
  await button(manager(page), "返回工作區").click();
  await button(page, "忘記 API key").click();
  await signIn(page);
  await openManager(page);
  await button(manager(page), "編輯 ABC").click();
  await expect(field(page, "筆記")).toHaveValue("使用西入口");
  await expect(manager(page).getByRole("checkbox")).toBeChecked();
});

test("in-flight commits preserve later typing and never close another or reopened editor", async ({ page }) => {
  await setup(page, { width: 1440 });
  await openManager(page);
  await button(manager(page), "編輯 地點 02").click();
  await field(page, "筆記").fill("first");
  await holdNextOpen(page);
  await button(manager(page), "儲存").click();
  await field(page, "筆記").fill("second");
  await page.waitForFunction(() => typeof window.releaseHeldSave === "function");
  await page.evaluate(() => window.releaseHeldSave());
  await expect(button(manager(page), "儲存")).toBeEnabled();
  await expect(field(page, "筆記")).toHaveValue("second");
  expect((await db(page, "read")).find(s => s.locId === "L102").note).toBe("first");
  await holdNextOpen(page);
  await button(manager(page), "儲存").click();
  await button(manager(page), "編輯 地點 03").click();
  await button(dialog(page), "捨棄").click();
  await expect(field(page, "別名")).toHaveValue("地點 03");
  await button(manager(page), "編輯 地點 02").click();
  await field(page, "筆記").fill("third");
  await page.waitForFunction(() => typeof window.releaseHeldSave === "function");
  await page.evaluate(() => window.releaseHeldSave());
  await expect(button(manager(page), "儲存")).toBeEnabled();
  await expect(field(page, "筆記")).toHaveValue("third");
  await button(manager(page), "儲存").click();
  await expect(field(page, "筆記")).toHaveCount(0);
  expect((await db(page, "read")).find(s => s.locId === "L102").note).toBe("third");
});

test("save-and-remove uses latest metadata; undo retains a newer favorite from another tab", async ({ page, context }) => {
  await setup(page);
  await openManager(page);
  await button(manager(page), "編輯 地點 00").click();
  await field(page, "筆記").fill("移除前的筆記");
  await button(manager(page), "取消收藏").click();
  await button(dialog(page), "儲存").click();
  await button(page, "復原收藏").click();
  let saved = (await db(page, "read")).find(s => s.locId === "L100");
  expect(saved).toMatchObject({ alias: "地點 00", pinned: true, note: "移除前的筆記", savedAt: favorites[0].savedAt });
  await button(manager(page), "編輯 地點 00").click();
  await button(manager(page), "取消收藏").click();
  await expect(button(page, "復原收藏")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  const latest = { ...saved, note: "另一分頁重建", updatedAt: new Date().toISOString() };
  await db(other, "write", [...await db(other, "read"), latest]);
  await button(page, "復原收藏").click();
  await button(manager(page), "編輯 地點 00").click();
  await expect(field(page, "筆記")).toHaveValue("另一分頁重建");
  expect((await db(page, "read")).find(s => s.locId === "L100")).toEqual(latest);
});

test("the manager fits a shorter visual viewport while the layout viewport stays tall", async ({ page }) => {
  await setup(page);
  await openManager(page);
  await button(manager(page), "編輯 地點 02").click();
  await field(page, "筆記").focus();
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, "height", { configurable: true, value: 352 });
    Object.defineProperty(visualViewport, "offsetTop", { configurable: true, value: 30 });
    visualViewport.dispatchEvent(new Event("resize"));
  });
  const bounds = await manager(page).evaluate(n => {
    const footer = n.querySelector(".spot-editor-actions").getBoundingClientRect();
    const fields = n.querySelector(".spot-editor-fields");
    return { layout: innerHeight, top: n.getBoundingClientRect().top, bottom: footer.bottom, fieldsScroll: fields.scrollHeight > fields.clientHeight };
  });
  expect(bounds.layout).toBe(844);
  expect(bounds.top).toBeGreaterThanOrEqual(30);
  expect(bounds.bottom).toBeLessThanOrEqual(382);
  expect(bounds.fieldsScroll).toBe(true);
  await field(page, "筆記").fill("可用高度");
  await button(manager(page), "儲存").click();
  await expect(rows(page)).toHaveCount(30);
  expect((await db(page, "read")).find(s => s.locId === "L102").note).toBe("可用高度");
});

test("nested manager detail returns to its editor and the previous detail keeps its map, days, scroll and source", async ({ page }) => {
  await setup(page, { width: 1440, height: 650 });
  let calls = 0;
  await page.route("**/api/bird-spots/observations*", r => {
    calls++;
    const params = new URL(r.request().url()).searchParams;
    const locId = params.get("locId");
    return r.fulfill({ json: { locId, days: Number(params.get("days")), generatedAt: now, observations: Array.from({ length: 35 }, (_, i) => ({
      ...directory[0], locId, comName: String(i), speciesCode: `b${i}`, subId: `S${i}`, howMany: i, obsDt: now,
    })) } });
  });
  await spotSearch(page, "L105");
  const source = nameRows(page).first().locator(".spot-row-name");
  await source.click();
  await detail(page).getByRole("spinbutton").fill("15");
  await expect(detail(page).locator(".search-spot-row")).toHaveCount(35);
  await expect(page.locator(".leaflet-pan-anim")).toHaveCount(0);
  const original = await page.evaluate(() => {
    const list = document.querySelector(".search-spot-scroll");
    list.scrollTop = 380;
    return { scroll: list.scrollTop, marker: document.querySelector(".leaflet-marker-icon").getBoundingClientRect().toJSON() };
  });
  await openManager(page);
  await button(manager(page), "編輯 地點 02").click();
  await field(page, "筆記").fill("未保存");
  const other = rows(page).filter({ hasText: "L104" }).locator(".spot-row-name");
  await other.click();
  await button(dialog(page), "捨棄").click();
  await expect(detail(page).locator(".search-spot-row")).toHaveCount(35);
  await button(detail(page), "返回我的鳥點").click();
  await expect(field(page, "別名")).toHaveValue("地點 02");
  await expect(manager(page).locator('.spot-list-row[data-selected="true"]')).toContainText("L102");
  await expect(other).toBeFocused();
  const before = calls;
  await button(manager(page), "返回工作區").click();
  await expect(detail(page).getByRole("spinbutton")).toHaveValue("15");
  await expect.poll(() => detail(page).locator(".search-spot-scroll").evaluate(n => n.scrollTop)).toBe(original.scroll);
  await expect.poll(() => page.locator(".leaflet-marker-icon").evaluate(n => n.getBoundingClientRect().toJSON())).toEqual(original.marker);
  expect(calls).toBe(before);
  await button(detail(page), "返回搜尋結果").click();
  await expect(source).toBeFocused();
});

test("detail notes guard mode changes, search, favorite removal and forgetting the key", async ({ page }) => {
  await setup(page, { width: 1440 });
  await spotSearch(page, "L102");
  await nameRows(page).first().locator(".spot-row-name").click();
  const editNote = async text => {
    await button(detail(page), "編輯筆記").click();
    await detail(page).getByRole("textbox", { name: "鳥點筆記" }).fill(text);
  };
  await editNote("pending");
  await button(page, "鳥種").click();
  await button(dialog(page), "繼續編輯").click();
  await expect(button(page, "鳥點")).toHaveAttribute("aria-pressed", "true");
  await button(page, "搜尋").click();
  await button(dialog(page), "繼續編輯").click();
  await expect(detail(page)).toBeVisible();
  await button(detail(page), "取消收藏鳥點").click();
  await button(dialog(page), "繼續編輯").click();
  await expect(button(detail(page), "取消收藏鳥點")).toHaveAttribute("aria-pressed", "true");
  await button(page, "忘記 API key").click();
  await failNextWrite(page);
  await button(dialog(page), "儲存").click();
  await expect(dialog(page).getByRole("alert")).toContainText("無法讀寫");
  // A second intent arriving before the original is resolved cannot replace the key-gate destination.
  await page.locator(".spot-search-nav button").first().dispatchEvent("click");
  await button(dialog(page), "儲存").click();
  await expect(button(page, "驗證 API key")).toBeVisible();
  expect((await db(page, "read")).find(s => s.locId === "L102").note).toBe("pending");
});
