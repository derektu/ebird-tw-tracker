import { expect } from "./test.mjs";

export async function openSearch(page) {
  const form = page.locator(".search-form");
  await expect.poll(() => form.getByRole("button", { name: "搜尋", exact: true }).evaluateAll(buttons => buttons.every(button => !button.disabled))).toBe(true);
  if (await form.isVisible()) return;
  await page.locator(".search-navigation").getByRole("button", { name: /^(搜尋|修改搜尋)$/ }).click();
  await expect(page.locator(".search-form")).toBeVisible();
}

export async function chooseDestination(page, name) {
  await expect(page.locator(".search-navigation")).toBeVisible();
  const wide = page.getByRole("navigation", { name: "主要功能", exact: true });
  if (await wide.isVisible()) {
    await wide.getByRole("button", { name, exact: true }).click();
  } else {
    const cancel = page.getByRole("button", { name: "取消搜尋", exact: true });
    if (await cancel.isVisible()) await cancel.click();
    await page.getByRole("button", { name: "開啟主選單", exact: true }).click();
    await page.getByRole("navigation", { name: "主選單", exact: true }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
  }
}

export async function forgetKey(page) {
  await chooseDestination(page, "設定與說明");
  await page.getByRole("button", { name: "移除 API key", exact: true }).click();
  await page.getByRole("button", { name: "確認移除", exact: true }).click();
}
