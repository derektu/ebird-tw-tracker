import { expect, test } from "@playwright/test";

const iconPaths = [
  "/icons/search-apple-touch-icon.png",
  "/icons/search-icon.svg",
  "/icons/search-icon-32.png",
  "/icons/search-icon-192.png",
  "/icons/search-icon-512.png",
];

test("Search App publishes its home-screen metadata and icon assets", async ({ page, request }) => {
  await page.goto("/");

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/search.webmanifest");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/search-apple-touch-icon.png");
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute("href", "/icons/search-icon.svg");
  await expect(page.locator('link[rel="icon"][type="image/png"]')).toHaveAttribute("href", "/icons/search-icon-32.png");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "eBird Taiwan Search");

  const manifestResponse = await request.get("/search.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  expect(new URL(manifestResponse.url()).pathname).toBe("/search.webmanifest");
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
  await expect(manifestResponse.json()).resolves.toMatchObject({
    name: "eBird Taiwan Search",
    short_name: "eBird Taiwan Search",
    start_url: "/",
    display: "standalone",
    theme_color: "#123d2c",
    background_color: "#123d2c",
    icons: [
      { src: "/icons/search-icon-192.png", purpose: "any maskable" },
      { src: "/icons/search-icon-512.png", purpose: "any maskable" },
    ],
  });

  const iconResponses = await Promise.all(iconPaths.map((path) => request.get(path)));
  for (const [index, response] of iconResponses.entries()) {
    expect(response.ok(), `${iconPaths[index]} must resolve`).toBeTruthy();
    expect(new URL(response.url()).pathname).toBe(iconPaths[index]);
  }
});
