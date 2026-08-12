import { expect, test } from "@playwright/test";

const apiKey = "browser-owned-key";

async function stubValidation(page, respond) {
  const requests = [];
  await page.route("**/api/key/validate", async (route) => {
    requests.push(route.request());
    await route.fulfill(respond);
  });
  return requests;
}

test("a first-time visitor sees the API key gate instead of search controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "輸入你的 eBird API key" })).toBeVisible();
  await expect(page.getByRole("button", { name: "驗證 API key" })).toBeVisible();
  await expect(page.getByRole("button", { name: "搜尋" })).toHaveCount(0);
});

test("a valid key is sent in a same-origin header, stored, and revalidated on return", async ({ page }) => {
  const requests = await stubValidation(page, { status: 200, contentType: "application/json", body: '{"valid":true}' });

  await page.goto("/");
  await page.getByRole("textbox", { name: "eBird API key" }).fill(apiKey);
  await page.getByRole("button", { name: "驗證 API key" }).click();
  await expect(page.getByRole("heading", { name: "Search App 已準備完成" })).toBeVisible();

  expect(requests).toHaveLength(1);
  expect(requests[0].url()).not.toContain(apiKey);
  expect(requests[0].headers()["x-ebird-api-key"]).toBe(apiKey);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("ebird-search-api-key"))).toBe(apiKey);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Search App 已準備完成" })).toBeVisible();
  expect(requests).toHaveLength(2);
});

test("an invalid saved key is cleared, while a temporary validation failure is retained", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem("ebird-search-api-key", key), apiKey);
  await stubValidation(page, { status: 401, contentType: "application/json", body: '{"code":"invalid_api_key","error":"API key 無效"}' });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "輸入你的 eBird API key" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("ebird-search-api-key"))).toBeNull();

  await page.unroute("**/api/key/validate");
  await page.evaluate((key) => localStorage.setItem("ebird-search-api-key", key), apiKey);
  await stubValidation(page, { status: 503, contentType: "application/json", body: '{"code":"upstream_unavailable","error":"暫時無法驗證"}' });
  await page.reload();
  await expect(page.getByRole("heading", { name: "輸入你的 eBird API key" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("暫時無法驗證");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("ebird-search-api-key"))).toBe(apiKey);
});

test("forgetting a validated key leaves other browser-local product data intact", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("search-recent-species", '[{"speciesCode":"grpsni1"}]'));
  await stubValidation(page, { status: 200, contentType: "application/json", body: '{"valid":true}' });

  await page.goto("/");
  await page.getByRole("textbox", { name: "eBird API key" }).fill(apiKey);
  await page.getByRole("button", { name: "驗證 API key" }).click();
  await page.getByRole("button", { name: "忘記 API key" }).click();

  await expect(page.getByRole("heading", { name: "輸入你的 eBird API key" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("ebird-search-api-key"))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("search-recent-species"))).toBe('[{"speciesCode":"grpsni1"}]');
});
