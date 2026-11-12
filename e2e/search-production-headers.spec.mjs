import { expect, test, tileFixture, tileUrlPattern } from "./fixtures/test.mjs";

const browserKey = "browser-owned-key";

function expectProductionSecurityHeaders(headers) {
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("script-src 'self'");
  expect(headers["content-security-policy"]).toContain("style-src 'self' 'unsafe-inline'");
  expect(headers["content-security-policy"]).toContain("connect-src 'self'");
  expect(headers["content-security-policy"].split("; ").find(directive => directive.startsWith("img-src "))).toBe("img-src 'self' data: https://tile.openstreetmap.org");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
}

test("Wrangler local preview applies production headers to static assets and key-free API errors", async ({ request }) => {
  const root = await request.get("/");
  const rootBody = await root.text();
  const html = await request.get("/search.html");
  const scriptPath = rootBody.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
  const stylePath = rootBody.match(/<link[^>]+href="([^"]+\.css)"/)?.[1];

  expect(scriptPath).toBeTruthy();
  expect(stylePath).toBeTruthy();

  const [script, style, api] = await Promise.all([
    request.get(scriptPath),
    request.get(stylePath),
    request.get("/api/key/validate", { headers: { "X-eBird-Api-Key": browserKey } }),
  ]);

  expect(root.ok()).toBeTruthy();
  expect(html.ok()).toBeTruthy();
  expect(script.ok()).toBeTruthy();
  expect(style.ok()).toBeTruthy();
  expect(api.status()).toBe(405);

  for (const response of [root, html, script, style, api]) {
    expectProductionSecurityHeaders(response.headers());
    expect(JSON.stringify(response.headers())).not.toContain(browserKey);
    expect(await response.text()).not.toContain(browserKey);
  }
});

test("map tiles use the canonical host and disclose only the browser origin under Worker headers", async ({ page }) => {
  const tileRequests = [];
  await page.route(tileUrlPattern, async route => {
    tileRequests.push({ url: route.request().url(), headers: await route.request().allHeaders() });
    await route.fulfill(tileFixture);
  });
  await page.route("**/api/key/validate", route => route.fulfill({ json: { valid: true } }));
  await page.addInitScript(key => localStorage.setItem("ebird-search-api-key", key), browserKey);

  const response = await page.goto("/search.html?private=fixture-private-query");
  await expect(page.locator(".search-workspace")).toBeVisible();
  await expect.poll(() => tileRequests.length).toBeGreaterThan(0);
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();

  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  const origin = new URL(page.url()).origin + "/";
  expect([...new Set(tileRequests.map(request => new URL(request.url).origin))]).toEqual(["https://tile.openstreetmap.org"]);
  expect([...new Set(tileRequests.map(request => request.headers.referer))]).toEqual([origin]);
  for (const request of tileRequests) {
    expect(JSON.stringify(request)).not.toContain("fixture-private-query");
    expect(JSON.stringify(request)).not.toContain(browserKey);
    expect(request.headers["x-ebird-api-key"]).toBeUndefined();
  }
});
