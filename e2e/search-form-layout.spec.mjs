import { devices } from "@playwright/test";
import { expect, test } from "./fixtures/test.mjs";
import { chooseDestination } from "./fixtures/search-navigation.mjs";

const species = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };

test.use({ ...devices["iPhone 13"] });

async function textLines(button) {
  return button.evaluate(element => {
    const text = element.firstChild;
    const tops = [...text.textContent].map((_, index) => {
      const range = document.createRange();
      range.setStart(text, index);
      range.setEnd(text, index + 1);
      return range.getBoundingClientRect().top;
    });
    return new Set(tops).size;
  });
}

for (const width of [320, 375, 390, 402, 430]) {
  test(`mobile search submit stays on one line at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/api/key/validate", route => route.fulfill({ json: { valid: true } }));
    await page.route("**/api/species/search*", route => route.fulfill({ json: { results: [species] } }));
    await page.route("**/api/species/resolve*", route => route.fulfill({ json: { species, candidates: [species] } }));
    await page.route("**/api/observations*", route => route.fulfill({ json: { speciesCode: species.speciesCode, days: 3, generatedAt: "2026-11-14T00:00:00.000Z", observations: [] } }));
    await page.route("**/api/bird-spots/directory*", route => route.fulfill({ json: { status: "fresh", updatedAt: "2026-11-14T00:00:00.000Z", spots: [] } }));
    await page.goto("/");
    await page.getByRole("textbox", { name: "eBird API key", exact: true }).fill("layout-demo-key");
    await page.getByRole("button", { name: "驗證 API key", exact: true }).click();

    for (const mode of ["搜尋鳥種", "搜尋鳥點"]) {
      await chooseDestination(page, mode);
      const input = page.getByRole("textbox", { name: mode === "搜尋鳥種" ? "鳥種" : "鳥點名稱", exact: true });
      await input.fill(mode === "搜尋鳥種" ? "彩鷸" : "清水濕地");
      const submit = page.locator(".search-form").getByRole("button", { name: "搜尋", exact: true });
      await expect.poll(() => textLines(submit)).toBe(1);
      const box = await submit.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      if (width === 402 && mode === "搜尋鳥點") {
        await page.evaluate(() => {
          Object.defineProperty(visualViewport, "height", { configurable: true, value: 310 });
          Object.defineProperty(visualViewport, "offsetTop", { configurable: true, value: 36 });
          visualViewport.dispatchEvent(new Event("resize"));
        });
        await expect.poll(async () => {
          const bounds = await submit.boundingBox();
          return bounds.y >= 36 && bounds.y + bounds.height <= 346;
        }).toBe(true);
        expect(await textLines(submit)).toBe(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }

      await submit.click();
      await expect(page.locator(".search-form")).toHaveCount(0);
    }
  });
}
