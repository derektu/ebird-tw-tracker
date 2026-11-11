import { expect, test } from "@playwright/test";

const species = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };
const record = { ...species, locId: "L123", locName: "桌面鳥點測試－高美", obsDt: "2026-11-11 07:30", howMany: 2, subId: "S123", lat: 24.31, lng: 120.55, locationPrivate: false, obsValid: true, obsReviewed: false };
const spot = { locId: record.locId, locName: record.locName, lat: record.lat, lng: record.lng, locationType: "hotspot" };
const favorite = { ...spot, alias: "", note: "保留的筆記", pinned: false, savedAt: "2026-11-11T01:00:00.000Z", updatedAt: "2026-11-11T01:00:00.000Z" };
const recent = locId => ({ locId, days: 14, generatedAt: "2026-11-11T02:30:00.000Z", observations: [
  { ...record, locId, locationType: "hotspot" },
  { ...record, locId, speciesCode: "litegr", comName: "小白鷺", subId: "S124", howMany: 8 },
] });
async function install(page, { records = [record, { ...record, subId: "S125" }], saved = [], onRecent, saveFailure = false } = {}) {
  let baselineWrites = 0, speciesRequests = 0, savedSpots = structuredClone(saved);
  await page.route("**/api/settings/api-key", r => r.fulfill({ json: { configured: true, editable: false, source: "environment" } }));
  await page.route("**/api/species/saved", r => r.fulfill({ json: [] }));
  await page.route("**/api/species/search*", r => r.fulfill({ json: { results: [species] } }));
  await page.route("**/api/species/resolve*", r => r.fulfill({ json: { species, candidates: [species] } }));
  await page.route("**/api/observations*", r => { speciesRequests++; return r.fulfill({ json: { speciesCode: species.speciesCode, days: 3, generatedAt: "2026-11-11T01:00:00.000Z", observations: records } }); });
  await page.route("**/api/checklists/*", r => r.fulfill({ json: { userDisplayName: "測試觀察者" } }));
  await page.route("**/api/events?since=0", r => r.fulfill({ json: { events: [], unreadCount: 0 } }));
  await page.route("**/api/search-snapshot-sessions", r => r.fulfill({ json: {} }));
  await page.route("**/api/search-snapshots*", r => { if (r.request().method() === "PUT") baselineWrites++; return r.fulfill({ json: r.request().method() === "PUT" ? { committed: true } : { snapshot: null } }); });
  await page.route("**/api/bird-spots/observations*", r => onRecent ? onRecent(r) : r.fulfill({ json: recent(new URL(r.request().url()).searchParams.get("locId")) }));
  await page.route("**/api/bird-spots/saved**", r => {
    const req = r.request(), resource = new URL(req.url()).pathname.split("/saved")[1];
    if (req.method() === "GET") return r.fulfill({ json: { spots: savedSpots } });
    if (saveFailure) return r.fulfill({ status: 503, json: { code: "storage_unavailable", error: "目前無法讀寫鳥點收藏，請稍後重試" } });
    if (req.method() === "POST") {
      const incoming = req.postDataJSON().spot;
      const existing = savedSpots.find(s => s.locId === incoming.locId);
      const value = existing || { ...favorite, ...incoming };
      savedSpots = [...savedSpots.filter(s => s.locId !== value.locId), value];
      return r.fulfill({ json: { spot: value } });
    }
    const locId = resource.slice(1), previous = savedSpots.find(s => s.locId === locId);
    if (req.method() === "DELETE") { savedSpots = savedSpots.filter(s => s.locId !== locId); return r.fulfill({ json: { removed: previous || null } }); }
    if (req.method() === "PATCH") { const value = { ...previous, ...req.postDataJSON() }; savedSpots = savedSpots.map(s => s.locId === locId ? value : s); return r.fulfill({ json: { spot: value } }); }
    return r.abort();
  });
  await page.goto("/");
  await expect(page.locator('.side[aria-label="鳥種搜尋結果"]')).toBeVisible();
  await expect(page.locator('.item')).toHaveCount(records.length);
  return { baselineWrites: () => baselineWrites, speciesRequests: () => speciesRequests, saved: () => savedSpots };
}

test("Desktop card and popup favorites stay in sync, detail returns without refetch or baseline writes, favorites can reopen and undo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  const calls = await install(page);
  await page.locator('.bird-marker').last().click();
  const popup = page.locator('.leaflet-popup');
  await popup.getByRole('button', { name: '☆ 收藏鳥點' }).click();
  await expect(popup.getByRole('button', { name: '★ 已收藏' })).toBeVisible();
  await expect(page.locator('.bird-spot-card-actions').getByRole('button', { name: '★ 已收藏' })).toHaveCount(2);
  const requests = calls.speciesRequests(), writes = calls.baselineWrites();
  await popup.getByRole('button', { name: '查看鳥點' }).click();
  const detail = page.getByRole('complementary', { name: '鳥點詳情' });
  await expect(detail.getByRole('heading', { name: record.locName })).toBeVisible();
  await expect(detail.locator('.bird-spot-observation')).toHaveCount(2);
  await expect(page.locator('.bird-spot-marker')).toHaveCount(1);
  await expect(page.locator('.bird-marker')).toHaveCount(0);
  await expect(detail.getByLabel('鳥點最近天數')).toHaveValue('14');
  await detail.getByRole('button', { name: '只看彩鷸' }).click();
  await expect(detail.locator('.bird-spot-observation')).toHaveCount(1);
  await detail.getByRole('button', { name: '編輯筆記' }).click();
  await detail.getByRole('textbox', { name: '鳥點筆記' }).fill('下次從北側觀察');
  await detail.getByRole('button', { name: '儲存筆記', exact: true }).click();
  await expect(detail.getByText('下次從北側觀察', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: '返回搜尋結果' }).click();
  await expect(page.locator('.item.active')).toHaveCount(1);
  expect(calls.speciesRequests()).toBe(requests); expect(calls.baselineWrites()).toBe(writes);
  await page.getByRole('button', { name: /我的鳥點/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /桌面鳥點測試/ }).click();
  await expect(detail.getByRole('button', { name: '返回我的鳥點' })).toBeVisible();
  await detail.getByRole('button', { name: '★ 已收藏' }).click();
  await page.getByRole('button', { name: '復原收藏' }).click();
  await expect(detail.getByRole('button', { name: '★ 已收藏' })).toBeVisible();
  expect(calls.saved()[0].note).toBe('下次從北側觀察');
  await page.screenshot({ path: test.info().outputPath('desktop-bird-spot-detail.png') });
});

test("return preserves scrolled list, selected observation and map viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await install(page, { records: Array.from({ length: 20 }, (_, i) => ({ ...record, subId: `S${1000 + i}`, locId: `L${1000 + i}`, locName: `鳥點 ${i}`, lat: 23 + i * .05 })) });
  const item = page.locator('.item').nth(10);
  await item.locator('.item-select').click();
  await expect(item).toHaveClass(/active/);
  const mapBox = await page.locator('#map').boundingBox();
  await expect.poll(async () => { const box = await page.locator('.bird-marker.active').boundingBox(); return Math.abs(box.x + box.width / 2 - (mapBox.x + mapBox.width / 2)); }).toBeLessThan(5);
  const before = await page.locator('.side .list').evaluate(e => e.scrollTop);
  const marker = await page.locator('.bird-marker.active').boundingBox();
  await item.getByRole('button', { name: '查看鳥點' }).click();
  await page.getByRole('button', { name: '返回搜尋結果' }).click();
  await expect(item).toHaveClass(/active/);
  await expect.poll(() => page.locator('.side .list').evaluate(e => e.scrollTop)).toBe(before);
  const restored = await page.locator('.bird-marker.active').boundingBox();
  expect(Math.abs(marker.x - restored.x)).toBeLessThan(2); expect(Math.abs(marker.y - restored.y)).toBeLessThan(2);
});

test("legacy missing IDs show re-search guidance and failed saves never show success", async ({ page }) => {
  await install(page, { records: [{ ...record, locId: null }], saveFailure: true });
  await page.locator('.item').getByRole('button', { name: '查看鳥點' }).click();
  await expect(page.getByRole('alert')).toContainText('請重新搜尋鳥種');
  await expect(page.getByRole('complementary', { name: '鳥點詳情' })).toHaveCount(0);
  await page.getByRole('button', { name: '關閉訊息' }).click();
  await page.locator('.item').getByRole('button', { name: '☆ 收藏鳥點' }).click();
  await expect(page.getByRole('alert')).toContainText('沒有鳥點 ID');
});

test("storage failure keeps favorite state and exposes a retryable message", async ({ page }) => {
  await install(page, { saveFailure: true });
  await page.locator('.item').first().getByRole('button', { name: '☆ 收藏鳥點' }).click();
  await expect(page.getByRole('alert')).toContainText('目前無法讀寫鳥點收藏');
  await expect(page.locator('.item').getByRole('button', { name: '★ 已收藏' })).toHaveCount(0);
  await expect(page.locator('.item').first().getByRole('button', { name: '☆ 收藏鳥點' })).toBeEnabled();
});

test("a late detail response cannot overwrite another location and no-coordinate favorites never invent a marker", async ({ page }) => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  await install(page, { saved: [{ ...favorite, locId: 'L456', locName: '沒有座標的鳥點', lat: null, lng: null }], onRecent: async r => {
    const id = new URL(r.request().url()).searchParams.get('locId');
    if (id === 'L123') { await delayed; try { await r.fulfill({ json: recent(id) }); } catch {} }
    else await r.fulfill({ json: { ...recent(id), observations: [{ ...recent(id).observations[0], locName: null, lat: null, lng: null }] } });
  } });
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  await page.getByRole('button', { name: /我的鳥點/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /沒有座標的鳥點/ }).click();
  await expect(page.getByRole('complementary', { name: '鳥點詳情' }).getByRole('heading', { name: '沒有座標的鳥點' })).toBeVisible();
  release();
  await expect(page.locator('.bird-spot-marker')).toHaveCount(0);
  await expect(page.getByText('此鳥點沒有可用座標；未建立位置標記')).toBeVisible();
  await expect(page.locator('.bird-spot-panel h2')).toHaveText('沒有座標的鳥點');
});

test("empty data and explicit upstream failures have distinct retryable presentations", async ({ page }) => {
  let failure = false;
  await install(page, { onRecent: r => failure ? r.fulfill({ status: 410, json: { code: 'location_unavailable', error: '目前無法取得此鳥點資料' } }) : r.fulfill({ json: { ...recent('L123'), observations: [] } }) });
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  await expect(page.locator('.bird-spot-panel .empty')).toContainText('沒有可取得的公開紀錄');
  failure = true;
  await page.locator('.bird-spot-panel').getByRole('button', { name: '更新', exact: true }).click();
  await expect(page.locator('.bird-spot-panel').getByRole('alert')).toContainText('目前無法取得此鳥點資料');
  await expect(page.getByRole('button', { name: '重試查詢' })).toBeVisible();
});


test("failed note writes retain the draft and cancel restores the saved note", async ({ page }) => {
  await install(page, { saved: [favorite], saveFailure: true });
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  const detail = page.getByRole('complementary', { name: '鳥點詳情' });
  await detail.getByRole('button', { name: '編輯筆記' }).click();
  await detail.getByRole('textbox', { name: '鳥點筆記' }).fill('不能遺失的草稿');
  await detail.getByRole('button', { name: '儲存筆記', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('目前無法讀寫鳥點收藏');
  await expect(detail.getByRole('textbox', { name: '鳥點筆記' })).toHaveValue('不能遺失的草稿');
  await detail.getByRole('button', { name: '取消編輯' }).click();
  await expect(detail.getByText('保留的筆記', { exact: true })).toBeVisible();
});

test("new species searches and notification selections leave detail without restoring stale results", async ({ page }) => {
  const calls = await install(page);
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '鳥點詳情' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: '鳥種搜尋結果' })).toBeVisible();
  expect(calls.speciesRequests()).toBe(2);
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  const writes = calls.baselineWrites();
  await page.evaluate(({ species, observation }) => window.dispatchEvent(new CustomEvent('notification:selected', { detail: { id: 1, type: 'new-observation', createdAt: '2026-11-11T02:00:00.000Z', read: false, species, observation } })), { species, observation: { ...record, subId: 'S125' } });
  await expect(page.getByRole('complementary', { name: '鳥點詳情' })).toHaveCount(0);
  await expect(page.locator('.item.active')).toContainText('S125');
  expect(calls.baselineWrites()).toBe(writes);
});

test("editing a note in a long result scrolls and focuses it, and repeated Edit preserves the draft", async ({ page }) => {
  await install(page, { onRecent: r => r.fulfill({ json: { ...recent('L123'), observations: Array.from({ length: 46 }, (_, i) => ({ ...record, speciesCode: `species${i}`, comName: `測試鳥種${i}`, subId: `S${2000 + i}`, locationType: 'hotspot' })) } }) });
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  const detail = page.getByRole('complementary', { name: '鳥點詳情' });
  await expect(detail.locator('.bird-spot-observation')).toHaveCount(46);
  await detail.getByRole('button', { name: '編輯筆記' }).click();
  const editor = detail.getByRole('textbox', { name: '鳥點筆記' });
  await expect(editor).toBeFocused(); await expect(editor).toBeInViewport();
  await editor.fill('重複點擊不能清除');
  await detail.getByRole('button', { name: '編輯筆記' }).click();
  await expect(editor).toHaveValue('重複點擊不能清除'); await expect(editor).toBeFocused();
});

test("explicit favorites and search navigation can be cancelled without losing a dirty note", async ({ page }) => {
  const calls = await install(page, { saved: [favorite] });
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  await page.getByRole('button', { name: '編輯筆記' }).click();
  const editor = page.getByRole('textbox', { name: '鳥點筆記' }); await editor.fill('保留未儲存草稿');
  let prompts = 0;
  page.on('dialog', async d => { prompts++; await d.dismiss(); });
  await page.getByRole('button', { name: /我的鳥點/ }).click();
  await expect(editor).toHaveValue('保留未儲存草稿'); await expect(page.getByRole('dialog')).toHaveCount(0);
  const requests = calls.speciesRequests();
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(editor).toHaveValue('保留未儲存草稿'); expect(calls.speciesRequests()).toBe(requests); expect(prompts).toBe(2);
});

test("typing after Save survives the earlier save completion", async ({ page }) => {
  await install(page, { saved: [favorite] });
  let submit, release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/api/bird-spots/saved/L123', async r => {
    submit = r.request().postDataJSON(); await held;
    await r.fulfill({ json: { spot: { ...favorite, ...submit } } });
  });
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  await page.getByRole('button', { name: '編輯筆記' }).click();
  const editor = page.getByRole('textbox', { name: '鳥點筆記' }); await editor.fill('已提交版本');
  await page.getByRole('button', { name: '儲存筆記', exact: true }).click();
  await expect.poll(() => submit?.note).toBe('已提交版本');
  await editor.fill('後續輸入還沒儲存'); release();
  await expect(page.getByRole('status')).toHaveText('已儲存筆記');
  await expect(editor).toHaveValue('後續輸入還沒儲存');
});

test("a previous location save cannot close another location draft after notification navigation", async ({ page }) => {
  const second = { ...favorite, locId: 'L456', locName: '另一個鳥點' };
  await install(page, { saved: [favorite, second] });
  let release, submitted;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/api/bird-spots/saved/L123', async r => {
    submitted = r.request().postDataJSON(); await held;
    await r.fulfill({ json: { spot: { ...favorite, ...submitted } } });
  });
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  await page.getByRole('button', { name: '編輯筆記' }).click();
  await page.getByRole('textbox', { name: '鳥點筆記' }).fill('A的儲存');
  await page.getByRole('button', { name: '儲存筆記', exact: true }).click();
  await expect.poll(() => submitted?.note).toBe('A的儲存');
  await page.evaluate(({ species, observation }) => window.dispatchEvent(new CustomEvent('notification:selected', { detail: { id: 2, type: 'new-observation', createdAt: '2026-11-11T02:00:00.000Z', read: false, species, observation } })), { species, observation: { ...record, locId: 'L456', locName: '另一個鳥點', subId: 'S456' } });
  await expect(page.getByRole('complementary', { name: '鳥點詳情' })).toHaveCount(0);
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  await page.getByRole('button', { name: '編輯筆記' }).click();
  const secondEditor = page.getByRole('textbox', { name: '鳥點筆記' }); await secondEditor.fill('B還沒儲存的草稿');
  release(); await expect(page.getByRole('status')).toHaveText('已儲存筆記');
  await expect(secondEditor).toHaveValue('B還沒儲存的草稿');
  await expect(page.locator('.bird-spot-panel h2')).toHaveText('另一個鳥點');
});

test("forced notification delivery preserves an unsaved location draft for reopening", async ({ page }) => {
  await install(page, { saved: [favorite] });
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  await page.getByRole('button', { name: '編輯筆記' }).click();
  await page.getByRole('textbox', { name: '鳥點筆記' }).fill('通知不能丟掉的草稿');
  let prompts = 0; page.on('dialog', async d => { prompts++; await d.dismiss(); });
  await page.evaluate(({ species, observation }) => window.dispatchEvent(new CustomEvent('notification:selected', { detail: { id: 3, type: 'new-observation', createdAt: '2026-11-11T02:00:00.000Z', read: false, species, observation } })), { species, observation: { ...record, subId: 'S125' } });
  await expect(page.getByRole('complementary', { name: '鳥點詳情' })).toHaveCount(0);
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  await expect(page.getByRole('textbox', { name: '鳥點筆記' })).toHaveValue('通知不能丟掉的草稿');
  expect(prompts).toBe(0);
});


test("supported900px Desktop keeps its responsive toolbar and wide-screen actions align with search", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await install(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(900);
  const narrow = await page.locator('.top-actions > div > button').evaluateAll(buttons => buttons.map(b => b.getBoundingClientRect().bottom));
  expect(Math.max(...narrow) - Math.min(...narrow)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: /我的鳥點/ })).toBeInViewport();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.locator('.settings-drawer')).toBeInViewport();
  await page.locator('.settings-drawer').getByRole('button', { name: '關閉設定' }).click();
  const searchField = page.getByPlaceholder('輸入中文名、英文名或 species code');
  await searchField.fill('彩');
  await expect(page.locator('.suggestions')).toBeInViewport();
  await page.locator('.suggestions').getByRole('button').first().click();
  await page.getByRole('button', { name: /我的鳥點/ }).click();
  await expect(page.getByRole('dialog')).toBeInViewport();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await page.setViewportSize({ width: 900, height: 600 });
  await page.mouse.move(880, 20);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 1440, height: 950 });
  const wide = await page.locator('.top-actions > div > button, .search input, .search > button').evaluateAll(items => items.map(e => e.getBoundingClientRect().bottom));
  expect(Math.max(...wide) - Math.min(...wide)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
});


test("a cancelled and reopened same-location note session cannot be closed by its earlier save", async ({ page }) => {
  await install(page, { saved: [favorite] });
  let release, submitted;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/api/bird-spots/saved/L123', async r => { submitted = r.request().postDataJSON(); await held; await r.fulfill({ json: { spot: { ...favorite, ...submitted } } }); });
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  await page.getByRole('button', { name: '編輯筆記' }).click();
  await page.getByRole('textbox', { name: '鳥點筆記' }).fill('舊工作階段的儲存');
  await page.getByRole('button', { name: '儲存筆記', exact: true }).click();
  await expect.poll(() => submitted?.note).toBe('舊工作階段的儲存');
  await page.getByRole('button', { name: '取消編輯' }).click();
  await page.getByRole('button', { name: '編輯筆記' }).click();
  const reopened = page.getByRole('textbox', { name: '鳥點筆記' }); await reopened.fill('新工作階段的草稿');
  release(); await expect(page.getByRole('status')).toHaveText('已儲存筆記');
  await expect(reopened).toHaveValue('新工作階段的草稿');
});
