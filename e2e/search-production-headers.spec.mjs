import { expect, test } from "@playwright/test";

const browserKey = "browser-owned-key";

function expectProductionSecurityHeaders(headers) {
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("script-src 'self'");
  expect(headers["content-security-policy"]).toContain("style-src 'self' 'unsafe-inline'");
  expect(headers["content-security-policy"]).toContain("connect-src 'self'");
  expect(headers["content-security-policy"]).toContain("img-src 'self' data: https://*.tile.openstreetmap.org");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("no-referrer");
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
