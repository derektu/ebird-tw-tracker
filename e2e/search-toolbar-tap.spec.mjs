import { devices } from "@playwright/test";
import { expect, test } from "./fixtures/test.mjs";

const species = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };
const spot = { locId: "L100", locName: "關渡自然公園", lat: 25.12, lng: 121.46, locationType: "hotspot", alias: "晨間鳥點", note: "保留筆記", pinned: true, savedAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" };
const button = (root, name) => root.getByRole("button", { name, exact: true });
const menu = page => page.getByRole("dialog", { name: "主選單", exact: true });
const toolbar = page => page.locator(".search-navigation");

async function setup(page) {
  await page.route("**/api/key/validate", route => route.fulfill({ json: { valid: true } }));
  await page.route("**/api/species/search*", route => route.fulfill({ json: { results: [species] } }));
  await page.route("**/api/species/resolve*", route => route.fulfill({ json: { species, candidates: [species] } }));
  await page.route("**/api/observations*", route => route.fulfill({ json: { speciesCode: species.speciesCode, days: 3, generatedAt: "2026-11-16T00:00:00.000Z", observations: [] } }));
  await page.goto("/");
  await page.evaluate(saved => new Promise((resolve, reject) => {
    const request = indexedDB.open("ebird-saved-bird-spots", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("saved-bird-spots");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("saved-bird-spots", "readwrite");
      tx.objectStore("saved-bird-spots").put({ version: 1, spots: [saved] }, "collection");
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }), spot);
  await page.getByRole("textbox", { name: "eBird API key", exact: true }).fill("toolbar-demo-key");
  await button(page, "驗證 API key").click();
  await expect(toolbar(page)).toBeVisible();
}

async function tapCenter(page, locator) {
  const box = await locator.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

async function expectMenuAndClose(page) {
  await expect(menu(page)).toBeVisible();
  await button(menu(page), "關閉主選單").tap();
  await expect(menu(page)).toHaveCount(0);
}

test.describe("mobile toolbar tap targets", () => {
  test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: devices["iPhone 13"].userAgent });
  for (const width of [320, 402]) {
    test(`title, blank area and padding open the menu at ${width}px without intercepting actions`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await setup(page);
      const context = toolbar(page).locator(".search-navigation-context");
      await tapCenter(page, context.locator("strong"));
      await expectMenuAndClose(page);
      await button(page, "開啟主選單").tap();
      await expectMenuAndClose(page);
      const bar = await toolbar(page).boundingBox();
      const title = await context.locator("strong").boundingBox();
      const action = await button(toolbar(page), "搜尋").boundingBox();
      await page.touchscreen.tap((title.x + title.width + action.x) / 2, bar.y + bar.height / 2);
      await expectMenuAndClose(page);
      await page.touchscreen.tap(bar.x + bar.width / 2, bar.y + 2);
      await expectMenuAndClose(page);
      expect(await page.evaluate(({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        return target && !target.closest(".search-navigation");
      }, { x: bar.x + bar.width / 2, y: bar.y + bar.height + 6 })).toBe(true);
      await page.touchscreen.tap(bar.x + bar.width / 2, bar.y + bar.height + 80);
      await expect(menu(page)).toHaveCount(0);
      expect(bar.height).toBeLessThanOrEqual(64);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      for (const key of ["Enter", "Space"]) {
        await button(page, "開啟主選單").focus();
        await expect(button(page, "開啟主選單")).toBeFocused();
        await page.keyboard.press(key);
        await expect(menu(page)).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(menu(page)).toHaveCount(0);
        await expect(button(toolbar(page), "搜尋")).toBeFocused();
      }

      await button(toolbar(page), "搜尋").tap();
      await expect(menu(page)).toHaveCount(0);
      await page.getByRole("textbox", { name: "鳥種", exact: true }).fill("彩鷸");
      await button(page.locator(".search-form"), "搜尋").tap();
      await expect(button(toolbar(page), "修改搜尋")).toBeVisible();
      await expect(context).toContainText("彩鷸");
      await tapCenter(page, context.locator("strong"));
      await expectMenuAndClose(page);
      await tapCenter(page, context.locator("small"));
      await expectMenuAndClose(page);
      await button(toolbar(page), "修改搜尋").tap();
      await expect(menu(page)).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: "鳥種", exact: true })).toHaveValue("彩鷸");
      await button(page, "取消搜尋").tap();

      await tapCenter(page, context.locator("strong"));
      await page.getByRole("navigation", { name: "主選單", exact: true }).getByRole("button", { name: /^我的鳥點/ }).tap();
      await expect(page.locator(".spot-list-row")).toContainText("晨間鳥點");
      await tapCenter(page, context.locator("strong"));
      await expectMenuAndClose(page);
      await button(toolbar(page), "地圖").tap();
      await expect(menu(page)).toHaveCount(0);
      await expect(page.locator("#map")).toBeVisible();
      await expect(context).toContainText("彩鷸");
    });
  }
});

test("wide toolbar retains its direct navigation and context is not a menu trigger", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await toolbar(page).locator(".search-navigation-context").click();
  await expect(menu(page)).toHaveCount(0);
  await expect(button(page, "開啟主選單")).toBeHidden();
  const nav = page.getByRole("navigation", { name: "主要功能", exact: true });
  await button(nav, "搜尋鳥種").click();
  await expect(page.getByRole("textbox", { name: "鳥種", exact: true })).toBeVisible();
  await expect(menu(page)).toHaveCount(0);
  await button(page, "取消搜尋").click();
  await button(nav, "我的鳥點").click();
  await expect(page.locator(".spot-list-row")).toContainText("晨間鳥點");
  await button(toolbar(page), "地圖").click();
  await expect(page.locator("#map")).toBeVisible();
  await expect(menu(page)).toHaveCount(0);
});
