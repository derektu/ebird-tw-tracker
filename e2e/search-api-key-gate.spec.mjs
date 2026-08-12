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

test("invalid saved keys are cleared for both authentication statuses at startup", async ({ page }) => {
  for (const status of [401, 403]) {
    await page.unroute("**/api/key/validate");
    await page.route("**/api/key/validate", (route) => route.fulfill({
      status,
      contentType: "application/json",
      body: '{"error":"API key 無效"}',
    }));
    await page.addInitScript((key) => localStorage.setItem("ebird-search-api-key", key), apiKey);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "輸入你的 eBird API key" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("ebird-search-api-key"))).toBeNull();
  }
});

test("invalid replacement keys clear a retained saved key for both authentication statuses", async ({ page }) => {
  for (const status of [401, 403]) {
    let requestCount = 0;
    await page.unroute("**/api/key/validate");
    await page.route("**/api/key/validate", async (route) => {
      requestCount += 1;
      await route.fulfill({
        status: requestCount === 1 ? 503 : status,
        contentType: "application/json",
        body: requestCount === 1 ? '{"error":"暫時無法驗證"}' : '{"error":"API key 無效"}',
      });
    });
    await page.addInitScript((key) => localStorage.setItem("ebird-search-api-key", key), apiKey);
    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText("暫時無法驗證");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("ebird-search-api-key"))).toBe(apiKey);

    await page.getByRole("textbox", { name: "eBird API key" }).fill(`replacement-${status}`);
    await page.getByRole("button", { name: "驗證 API key" }).click();
    await expect(page.getByRole("heading", { name: "輸入你的 eBird API key" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("ebird-search-api-key"))).toBeNull();
    await page.evaluate(() => localStorage.clear());
  }
});

test("temporary validation failures retain a saved key and return to the visible gate", async ({ page }) => {
  for (const failure of [
    { status: 429, body: '{"error":"請稍後再試"}' },
    { status: 503, body: '{"error":"暫時無法驗證"}' },
    { abort: "failed" },
    { timeout: true },
  ]) {
    await page.unroute("**/api/key/validate");
    await page.route("**/api/key/validate", async (route) => {
      if (failure.abort) return route.abort(failure.abort);
      if (failure.timeout) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        return route.fulfill({ status: 200, contentType: "application/json", body: '{"valid":true}' });
      }
      return route.fulfill({ status: failure.status, contentType: "application/json", body: failure.body });
    });
    await page.addInitScript((key) => localStorage.setItem("ebird-search-api-key", key), apiKey);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "輸入你的 eBird API key" })).toBeVisible();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("ebird-search-api-key"))).toBe(apiKey);
    await page.evaluate(() => localStorage.clear());
  }
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
