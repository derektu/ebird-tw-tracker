import { expect, test } from "./fixtures/test.mjs";

const species = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };
const saved = { locId: "L100", locName: "台北關渡自然公園", lat: 25.12, lng: 121.46, locationType: "hotspot", alias: "關渡晨間觀察", note: "入口筆記", pinned: true, savedAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" };
const button = (root, name) => root.getByRole("button", { name, exact: true });
async function destination(page, name) {
  const menu = button(page, "開啟主選單");
  if (page.viewportSize().width <= 720) {
    await menu.click();
    await page.getByRole("navigation", { name: "主選單", exact: true }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
  } else await page.getByRole("navigation", { name: "主要功能" }).getByRole("button", { name, exact: true }).click();
}
async function seed(page) {
  await page.evaluate(spot => new Promise((resolve, reject) => {
    const request = indexedDB.open("ebird-saved-bird-spots", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("saved-bird-spots");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("saved-bird-spots", "readwrite");
      tx.objectStore("saved-bird-spots").put({ version: 1, spots: [spot] }, "collection");
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }), saved);
}
async function setup(page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.route("**/api/key/validate", route => route.fulfill({ json: { valid: true } }));
  await page.route("**/api/species/search*", route => route.fulfill({ json: { results: [species] } }));
  await page.route("**/api/species/resolve*", route => route.fulfill({ json: { species, candidates: [species] } }));
  await page.route("**/api/observations*", route => route.fulfill({ json: { speciesCode: species.speciesCode, days: Number(new URL(route.request().url()).searchParams.get("days")), generatedAt: "2026-11-13T00:00:00.000Z", observations: [] } }));
  await page.route("**/api/bird-spots/directory*", route => route.fulfill({ json: { status: "fresh", updatedAt: "2026-11-13T00:00:00.000Z", spots: [saved] } }));
  await page.goto("/");
  await seed(page);
  await page.getByRole("textbox", { name: "eBird API key" }).fill("navigation-demo-key");
  await button(page, "驗證 API key").click();
  await expect(page.locator(".search-workspace")).toBeVisible();
}

for (const width of [320, 390, 402, 1440]) {
  test(`A navigation preserves map space and compact saved actions at ${width}px`, async ({ page }, testInfo) => {
    await setup(page, width);
    await expect(page.locator("#map")).toBeVisible();
    await expect(page.getByRole("complementary")).toHaveCount(0);
    await expect(button(page, "忘記 API key")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "鳥種", exact: true })).toHaveCount(0);
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: testInfo.outputPath("initial.png") });
      if (width === 390) {
        await button(page, "開啟主選單").click();
        await page.screenshot({ path: testInfo.outputPath("menu.png") });
        await button(page, "關閉主選單").click();
      }
      await destination(page, "搜尋鳥種");
      await page.screenshot({ path: testInfo.outputPath("form.png") });
      await button(page, "取消搜尋").click();
    }
    await destination(page, "我的鳥點");
    const row = page.locator(".spot-manager .spot-list-row");
    await expect(row).toContainText("關渡晨間觀察");
    await expect(row).not.toContainText("2026-11");
    await expect(row).not.toContainText("入口筆記");
    const boxes = await row.locator("button").evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { y: r.y, h: r.height, w: r.width }; }));
    expect(new Set(boxes.map(box => box.y)).size).toBe(1);
    expect(boxes.every(box => box.h >= 44 && box.w >= 44)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath("saved.png") });
    await button(row, "編輯 關渡晨間觀察").click();
    if (width === 390) await page.screenshot({ path: testInfo.outputPath("editor.png") });
    await page.getByRole("textbox", { name: "別名", exact: true }).fill("改名待確認");
    await expect(page.getByRole("navigation", { name: "主要功能" })).toHaveCount(0);
    await button(page, "返回收藏清單").click();
    await expect(page.getByRole("dialog", { name: "儲存變更？" })).toBeVisible();
    await button(page.getByRole("dialog"), "繼續編輯").click();
    await expect(page.getByRole("textbox", { name: "別名", exact: true })).toHaveValue("改名待確認");
    await button(page, "取消").click();
    await button(page.getByRole("dialog"), "捨棄").click();
    await expect(row).toContainText("關渡晨間觀察");
  });
}

test("per-mode committed conditions survive cancel and settings return", async ({ page }) => {
  await setup(page);
  await destination(page, "搜尋鳥種");
  await page.getByRole("textbox", { name: "鳥種", exact: true }).fill("彩鷸");
  await page.getByRole("spinbutton", { name: "最近天數" }).fill("12");
  await button(page.getByRole("dialog"), "搜尋").click();
  await expect(button(page, "修改搜尋")).toBeVisible();
  await destination(page, "搜尋鳥點");
  await page.getByRole("textbox", { name: "鳥點名稱" }).fill("關渡");
  await button(page.getByRole("dialog"), "搜尋").click();
  await expect(page.getByRole("complementary", { name: "鳥點搜尋結果", exact: true })).toBeVisible();
  await destination(page, "搜尋鳥種");
  await expect(page.getByRole("textbox", { name: "鳥種", exact: true })).toHaveValue("彩鷸");
  await expect(page.getByRole("spinbutton", { name: "最近天數" })).toHaveValue("12");
  await page.getByRole("spinbutton", { name: "最近天數" }).fill("8");
  await button(page, "取消搜尋").click();
  await destination(page, "搜尋鳥種");
  await expect(page.getByRole("spinbutton", { name: "最近天數" })).toHaveValue("12");
  await page.keyboard.press("Escape");
  await destination(page, "設定與說明");
  await expect(button(page, "移除 API key")).toBeVisible();
  await button(page, "返回").click();
  await expect(page.getByRole("complementary", { name: "鳥點搜尋結果", exact: true })).toBeVisible();
  await destination(page, "搜尋鳥點");
  await expect(page.getByRole("textbox", { name: "鳥點名稱" })).toHaveValue("關渡");
});

test("removing and replacing a key preserves saved notes and browser history", async ({ page }, testInfo) => {
  await setup(page);
  await destination(page, "搜尋鳥種");
  await page.getByRole("textbox", { name: "鳥種", exact: true }).fill("彩鷸");
  await button(page.getByRole("dialog"), "搜尋").click();
  await expect(page.getByRole("status")).toContainText("已建立搜尋比較基準");
  const recent = await page.evaluate(() => localStorage.getItem("search-recent-species"));
  expect(JSON.parse(recent)).toEqual([species]);
  await destination(page, "我的鳥點");
  await destination(page, "設定與說明");
  await page.screenshot({ path: testInfo.outputPath("settings.png") });
  await button(page, "移除 API key").click();
  await expect(page.getByRole("dialog")).toContainText("收藏、筆記與搜尋紀錄會保留");
  await page.screenshot({ path: testInfo.outputPath("settings-confirm.png") });
  await button(page, "取消").click();
  await button(page, "移除 API key").click();
  await button(page, "確認移除").click();
  await expect(page.getByRole("textbox", { name: "eBird API key" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("search-recent-species"))).toBe(recent);
  await page.getByRole("textbox", { name: "eBird API key" }).fill("replacement-demo-key");
  await button(page, "驗證 API key").click();
  await expect(page.locator(".search-workspace")).toBeVisible();
  await destination(page, "搜尋鳥種");
  await page.getByRole("textbox", { name: "鳥種", exact: true }).blur();
  await page.getByRole("textbox", { name: "鳥種", exact: true }).focus();
  await expect(page.getByRole("button", { name: /彩鷸.*Rostratula/ })).toBeVisible();
  await page.getByRole("textbox", { name: "鳥種", exact: true }).fill("彩鷸");
  await button(page.getByRole("dialog"), "搜尋").click();
  await expect(page.getByRole("status")).toContainText("沒有新增");
  await destination(page, "我的鳥點");
  await button(page, "編輯 關渡晨間觀察").click();
  await expect(page.getByRole("textbox", { name: "筆記", exact: true })).toHaveValue("入口筆記");
});

test("late species responses cannot replace settings or move its focus", async ({ page }) => {
  await setup(page, 1440);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let arrived;
  const requested = new Promise(resolve => { arrived = resolve; });
  await page.route("**/api/observations*", async route => {
    arrived();
    await held;
    await route.fulfill({ json: { speciesCode: species.speciesCode, days: 3, generatedAt: "2026-11-13T00:00:00.000Z", observations: [] } }).catch(() => {});
  });
  await destination(page, "搜尋鳥種");
  await page.getByRole("textbox", { name: "鳥種", exact: true }).fill("彩鷸");
  await button(page.locator(".search-inline-form"), "搜尋").click();
  await requested;
  await destination(page, "設定與說明");
  await expect(button(page, "返回")).toBeFocused();
  release();
  await expect(page.getByRole("dialog", { name: "設定與說明" })).toBeVisible();
  await expect(button(page, "返回")).toBeFocused();
  await button(page, "返回").click();
  await expect(page.locator(".search-navigation-context")).not.toContainText("彩鷸");
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("cancelling a pending spot refresh restores the completed directory", async ({ page }) => {
  await setup(page);
  await destination(page, "搜尋鳥點");
  await page.getByRole("textbox", { name: "鳥點名稱" }).fill("關渡");
  await button(page.getByRole("dialog"), "搜尋").click();
  const results = page.getByRole("complementary", { name: "鳥點搜尋結果", exact: true });
  await expect(results.getByRole("status")).toContainText("搜尋範圍為公共熱點");
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let arrived;
  const requested = new Promise(resolve => { arrived = resolve; });
  await page.route("**/api/bird-spots/directory*", async route => {
    arrived();
    await held;
    await route.fulfill({ json: { status: "fresh", updatedAt: "2026-11-13T00:00:00.000Z", spots: [] } }).catch(() => {});
  });
  await destination(page, "搜尋鳥點");
  await page.getByRole("textbox", { name: "鳥點名稱" }).fill("新查詢");
  await button(page.getByRole("dialog"), "搜尋").click();
  await requested;
  await destination(page, "設定與說明");
  release();
  await expect(button(page, "返回")).toBeFocused();
  await button(page, "返回").click();
  await expect(results.getByRole("status")).toContainText("搜尋範圍為公共熱點");
  await expect(results).toContainText("關渡晨間觀察");
  await expect(results).not.toContainText("正在讀取");
  await destination(page, "搜尋鳥點");
  await expect(page.getByRole("textbox", { name: "鳥點名稱" })).toHaveValue("關渡");
});

test("mobile search fields stay above a resized and panned visual viewport", async ({ page }) => {
  await setup(page, 320);
  await destination(page, "搜尋鳥種");
  const days = page.getByRole("spinbutton", { name: "最近天數" });
  await days.focus();
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, "height", { configurable: true, value: 310 });
    Object.defineProperty(visualViewport, "offsetTop", { configurable: true, value: 36 });
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await expect.poll(async () => {
    const box = await days.boundingBox();
    return box.y >= 36 && box.y + box.height <= 346;
  }).toBe(true);
  await days.fill("");
  await days.fill("7");
  await expect(days).toHaveValue("7");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
