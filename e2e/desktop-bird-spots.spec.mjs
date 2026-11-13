import { expect, test } from "./fixtures/test.mjs";

const species = { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis" };
const record = { ...species, locId: "L123", locName: "桌面鳥點測試－高美", obsDt: "2026-11-11 07:30", howMany: 2, subId: "S123", lat: 24.31, lng: 120.55, locationPrivate: false, obsValid: true, obsReviewed: false };
const spot = { locId: record.locId, locName: record.locName, lat: record.lat, lng: record.lng, locationType: "hotspot" };
const favorite = { ...spot, alias: "", note: "保留的筆記", pinned: false, savedAt: "2026-11-11T01:00:00.000Z", updatedAt: "2026-11-11T01:00:00.000Z" };
const recent = (locId, days = 3) => ({ locId, days, generatedAt: "2026-11-11T02:30:00.000Z", observations: [
  { ...record, locId, locationType: "hotspot" },
  { ...record, locId, speciesCode: "litegr", comName: "小白鷺", subId: "S124", howMany: 8 },
] });
async function install(page, { records = [record, { ...record, subId: "S125" }], saved = [], onRecent, onSearch, saveFailure = false } = {}) {
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
  await page.route("**/api/bird-spots/search*", r => onSearch ? onSearch(r) : r.fulfill({ json: { status: "fresh", updatedAt: "2026-11-11T02:00:00.000Z", error: null, spots: [{ ...spot, subnational1Code: "TW-TXG", saved: false }, { ...spot, locId: "L456", subnational1Code: "TW-TPE", saved: false }] } }));
  await page.route("**/api/bird-spots/observations*", r => onRecent ? onRecent(r) : r.fulfill({ json: recent(new URL(r.request().url()).searchParams.get("locId"), Number(new URL(r.request().url()).searchParams.get("days"))) }));
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
  await expect(detail.getByLabel('鳥點最近天數')).toHaveValue('3');
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
  await page.getByRole('dialog').getByRole('button', { name: '查看近期鳥種', exact: true }).click();
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
  await page.getByRole('dialog').getByRole('button', { name: '查看近期鳥種', exact: true }).click();
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
  await page.getByRole('button', { name: '捨棄修改' }).click();
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
  await page.getByRole('button', { name: /我的鳥點/ }).click();
  await expect(page.getByRole('dialog', { name: '尚未儲存的修改' })).toBeVisible();
  await page.getByRole('button', { name: '繼續編輯' }).click();
  await expect(editor).toHaveValue('保留未儲存草稿');
  const requests = calls.speciesRequests();
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await page.getByRole('button', { name: '繼續編輯' }).click();
  await expect(editor).toHaveValue('保留未儲存草稿'); expect(calls.speciesRequests()).toBe(requests);
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
  await leaveDialog(page).getByRole('button', { name: '捨棄修改' }).click();
  await expect(page.getByRole('complementary', { name: '鳥點詳情' })).toHaveCount(0);
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  await page.getByRole('button', { name: '編輯筆記' }).click();
  const secondEditor = page.getByRole('textbox', { name: '鳥點筆記' }); await secondEditor.fill('B還沒儲存的草稿');
  release(); await expect(page.getByRole('status')).toHaveText('已儲存筆記');
  await expect(secondEditor).toHaveValue('B還沒儲存的草稿');
  await expect(page.locator('.bird-spot-panel h2')).toHaveText('另一個鳥點');
});

test("notification selection can be cancelled while retaining the current location draft", async ({ page }) => {
  await install(page, { saved: [favorite] });
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  await page.getByRole('button', { name: '編輯筆記' }).click();
  await page.getByRole('textbox', { name: '鳥點筆記' }).fill('通知不能丟掉的草稿');
  await page.evaluate(({ species, observation }) => window.dispatchEvent(new CustomEvent('notification:selected', { detail: { id: 3, type: 'new-observation', createdAt: '2026-11-11T02:00:00.000Z', read: false, species, observation } })), { species, observation: { ...record, subId: 'S125' } });
  await leaveDialog(page).getByRole('button', { name: '繼續編輯' }).click();
  await expect(page.getByRole('textbox', { name: '鳥點筆記' })).toHaveValue('通知不能丟掉的草稿');
  await expect(page.locator('.bird-spot-panel')).toBeVisible();
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
  await page.getByRole('button', { name: '捨棄修改' }).click();
  await page.getByRole('button', { name: '編輯筆記' }).click();
  const reopened = page.getByRole('textbox', { name: '鳥點筆記' }); await reopened.fill('新工作階段的草稿');
  release(); await expect(page.getByRole('status')).toHaveText('已儲存筆記');
  await expect(reopened).toHaveValue('新工作階段的草稿');
});

test("bird-spot entry requests3days from popup, card and favorites and resets manual ranges", async ({ page }) => {
  const requestedDays = [];
  await install(page, { saved: [favorite], onRecent: route => {
    const query = new URL(route.request().url()).searchParams;
    const days = Number(query.get('days'));
    requestedDays.push(days);
    return route.fulfill({ json: recent(query.get('locId'), days) });
  } });
  const detail = page.getByRole('complementary', { name: '鳥點詳情' });
  const daysInput = detail.getByLabel('鳥點最近天數');
  await page.locator('.bird-marker').last().click();
  await page.locator('.leaflet-popup').getByRole('button', { name: '查看鳥點' }).click();
  await expect(daysInput).toHaveValue('3');
  await expect.poll(() => requestedDays.at(-1)).toBe(3);
  await daysInput.fill('30');
  await expect.poll(() => requestedDays.at(-1)).toBe(30);
  await detail.getByRole('button', { name: '返回搜尋結果' }).click();
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  await expect(daysInput).toHaveValue('3');
  await expect.poll(() => requestedDays.at(-1)).toBe(3);
  await daysInput.fill('1');
  await expect.poll(() => requestedDays.at(-1)).toBe(1);
  await detail.getByRole('button', { name: '返回搜尋結果' }).click();
  await page.getByRole('button', { name: /我的鳥點/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /桌面鳥點測試/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: '查看近期鳥種', exact: true }).click();
  await expect(daysInput).toHaveValue('3');
  await expect.poll(() => requestedDays.at(-1)).toBe(3);
  await daysInput.fill('14');
  await expect.poll(() => requestedDays.at(-1)).toBe(14);
  await detail.getByRole('button', { name: '返回我的鳥點' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /桌面鳥點測試/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: '查看近期鳥種', exact: true }).click();
  await expect(daysInput).toHaveValue('3');
  await expect.poll(() => requestedDays).toEqual([3, 30, 3, 1, 3, 14, 3]);
});

test("each bird name links to its eBird species page with name fallbacks and keeps checklist links", async ({ page }) => {
  const rows = [
    { ...record, locationType: 'hotspot' },
    { ...record, speciesCode: 'litegr', comName: null, sciName: 'Egretta garzetta', subId: 'S124', locationType: 'hotspot' },
    { ...record, speciesCode: 'test/code', comName: null, sciName: null, subId: 'S125', locationType: 'hotspot' },
  ];
  await install(page, { onRecent: route => route.fulfill({ json: { ...recent('L123'), observations: rows } }) });
  await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
  const detail = page.getByRole('complementary', { name: '鳥點詳情' });
  const links = detail.locator('.bird-spot-observation strong a');
  await expect(links).toHaveText(['彩鷸 ↗', 'Egretta garzetta ↗', 'test/code ↗']);
  for (const [index, code] of ['grpsni1', 'litegr', 'test%2Fcode'].entries()) {
    await expect(links.nth(index)).toHaveAttribute('href', `https://ebird.org/species/${code}`);
    await expect(links.nth(index)).toHaveAttribute('target', '_blank');
    await expect(links.nth(index)).toHaveAttribute('rel', 'noreferrer');
  }
  const checklists = detail.getByRole('link', { name: 'Checklist ↗', exact: true });
  await expect(checklists).toHaveCount(3);
  await expect(checklists.first()).toHaveAttribute('href', 'https://ebird.org/checklist/S123');
});

const manager = page => page.getByRole('dialog', { name: '我的鳥點', exact: true });
const leaveDialog = page => page.getByRole('dialog', { name: '尚未儲存的修改', exact: true });
const otherFavorite = { ...favorite, locId: 'L456', locName: '另一個鳥點', alias: '另一處', note: '另一份筆記', savedAt: '2026-11-11T03:00:00.000Z' };
async function openManager(page) { await page.getByRole('button', { name: /我的鳥點/ }).click(); await expect(manager(page)).toBeVisible(); }

test('bird spot mode retains each query and species days, q-only name search preserves same-name IDs and detail return', async ({ page }) => {
  const searches = [];
  const calls = await install(page, { onSearch: route => {
    searches.push(new URL(route.request().url()).searchParams.toString());
    return route.fulfill({ json: { status: 'fresh', updatedAt: '2026-11-11T02:00:00.000Z', error: null, spots: [{ ...spot, subnational1Code: 'TW-TXG', englishName: 'Gaomei' }, { ...spot, locId: 'L456', subnational1Code: 'TW-TPE' }] } });
  } });
  const before = { writes: calls.baselineWrites(), requests: calls.speciesRequests() };
  await page.getByPlaceholder('輸入中文名、英文名或 species code').fill('保留鳥種條件');
  await page.locator('.days-field input').fill('7');
  await page.getByLabel('搜尋模式').selectOption('spots');
  await expect(page.locator('.days-field')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '加入追蹤' })).toHaveCount(0);
  const query = page.getByPlaceholder('輸入鳥點名稱、別名或地區代碼');
  await query.fill('高美'); await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.locator('.bird-spot-search-item')).toHaveCount(2);
  await expect(page.locator('.bird-spot-search-panel')).toContainText('TW-TXG');
  await expect(page.locator('.bird-spot-search-panel')).toContainText('TW-TPE');
  await expect(page.getByText('Gaomei', { exact: true })).toBeVisible();
  expect(searches).toEqual(['q=%E9%AB%98%E7%BE%8E']);
  await page.locator('.bird-spot-search-item').first().getByRole('button', { name: '☆ 收藏鳥點' }).click();
  await expect(page.locator('.bird-spot-search-item').first().getByRole('button', { name: '★ 已收藏' })).toBeVisible();
  await page.locator('.bird-spot-search-item').last().getByRole('button', { name: '查看近期鳥種' }).click();
  await expect(page.locator('.bird-spot-panel')).toContainText('L456');
  await page.getByRole('button', { name: '返回搜尋結果' }).click();
  await expect(query).toHaveValue('高美'); await expect(page.locator('.bird-spot-search-item')).toHaveCount(2);
  await page.getByLabel('搜尋模式').selectOption('species');
  await expect(page.getByPlaceholder('輸入中文名、英文名或 species code')).toHaveValue('保留鳥種條件');
  await expect(page.locator('.days-field input')).toHaveValue('7');
  await page.getByLabel('搜尋模式').selectOption('spots'); await expect(query).toHaveValue('高美');
  expect(calls.baselineWrites()).toBe(before.writes); expect(calls.speciesRequests()).toBe(before.requests);
});

test('directory stale and unavailable states retain honest timestamps and private favorites, total failure falls back locally', async ({ page }) => {
  let status = 'stale';
  await install(page, { saved: [{ ...favorite, locationType: 'personal', alias: '私人的點' }], onSearch: route => status === 'offline' ? route.abort() : route.fulfill({ json: { status, updatedAt: status === 'stale' ? '2026-11-10T02:00:00.000Z' : null, error: { code: 'directory_unavailable', message: '公共目錄離線' }, spots: [{ ...favorite, locationType: 'personal', alias: '私人的點' }] } }) });
  await page.getByLabel('搜尋模式').selectOption('spots');
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  const panel = page.getByRole('complementary', { name: '鳥點搜尋結果' });
  await expect(panel).toContainText('公共目錄使用舊資料'); await expect(panel).toContainText('取得於');
  await expect(panel.getByRole('alert')).toContainText('公共目錄離線');
  await expect(panel).toContainText('私人的點');
  status = 'unavailable'; await panel.getByRole('button', { name: '重試搜尋鳥點' }).click();
  await expect(panel).toContainText('尚無公共目錄取得時間');
  status = 'offline'; await panel.getByRole('button', { name: '重試搜尋鳥點' }).click();
  await expect(panel.getByRole('alert')).toContainText('以下顯示這台電腦的收藏');
  await expect(panel).toContainText('私人的點');
  await page.getByPlaceholder('輸入鳥點名稱、別名或地區代碼').fill('不符合');
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(panel).toContainText('沒有符合條件的鳥點');
});

test('a later name query owns the results when an older response arrives last', async ({ page }) => {
  let release, firstRequested = false;
  const held = new Promise(resolve => { release = resolve; });
  await install(page, { onSearch: async route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    if (query === '舊查詢') { firstRequested = true; await held; }
    try { await route.fulfill({ json: { status: 'fresh', updatedAt: '2026-11-11T02:00:00.000Z', error: null, spots: [{ ...spot, locName: query }] } }); } catch {}
  } });
  await page.getByLabel('搜尋模式').selectOption('spots');
  const query = page.getByPlaceholder('輸入鳥點名稱、別名或地區代碼');
  await query.fill('舊查詢'); await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect.poll(() => firstRequested).toBe(true);
  await query.fill('新查詢'); await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.locator('.bird-spot-search-item h3')).toHaveText('新查詢');
  release(); await expect(page.locator('.bird-spot-search-item h3')).toHaveText('新查詢');
});

for (const intent of ['close', 'select', 'detail', 'remove', 'cancel']) {
  for (const choice of ['save', 'discard', 'continue']) {
    test(`manager dirty ${intent} resolves with ${choice}`, async ({ page }) => {
      const calls = await install(page, { saved: [favorite, otherFavorite] });
      await openManager(page);
      await manager(page).getByRole('button', { name: /桌面鳥點測試/ }).click();
      await manager(page).getByLabel('我的別名', { exact: true }).fill('修改後別名');
      const destination = {
        close: () => manager(page).getByRole('button', { name: '關閉', exact: true }).click(),
        select: () => manager(page).getByRole('button', { name: /另一處/ }).click(),
        detail: () => manager(page).getByRole('button', { name: '查看近期鳥種', exact: true }).click(),
        remove: () => manager(page).getByRole('button', { name: '取消收藏', exact: true }).click(),
        cancel: () => manager(page).getByRole('button', { name: '取消編輯', exact: true }).click(),
      };
      await destination[intent]();
      await expect(leaveDialog(page)).toBeVisible();
      await leaveDialog(page).getByRole('button', { name: { save: '儲存並繼續', discard: '捨棄修改', continue: '繼續編輯' }[choice] }).click();
      await expect(leaveDialog(page)).toHaveCount(0);
      if (choice === 'continue') {
        await expect(manager(page).getByLabel('我的別名', { exact: true })).toHaveValue('修改後別名');
        expect(calls.saved().find(s => s.locId === 'L123').alias).toBe('');
      } else {
        if (intent === 'close') await expect(manager(page)).toHaveCount(0);
        if (intent === 'select') await expect(manager(page).getByLabel('我的別名', { exact: true })).toHaveValue('另一處');
        if (intent === 'detail') await expect(page.locator('.bird-spot-panel')).toBeVisible();
        if (intent === 'remove') { expect(calls.saved().some(s => s.locId === 'L123')).toBe(false); await page.getByRole('button', { name: '復原收藏' }).click(); }
        const persisted = calls.saved().find(s => s.locId === 'L123');
        expect(persisted.alias).toBe(choice === 'save' ? '修改後別名' : '');
        if (intent === 'cancel') await expect(manager(page).getByLabel('我的別名', { exact: true })).toHaveValue(choice === 'save' ? '修改後別名' : '');
      }
    });
  }
}

test('manager failed save retains the draft and original selection destination until retry succeeds', async ({ page }) => {
  const calls = await install(page, { saved: [favorite, otherFavorite] });
  let failed = true;
  await page.route('**/api/bird-spots/saved/L123', async (route) => {
    if (failed) return route.fulfill({ status: 503, json: { error: '測試保存失敗' } });
    return route.fallback();
  });
  await openManager(page);
  await manager(page).getByRole('button', { name: /桌面鳥點測試/ }).click();
  await manager(page).getByLabel('我的別名', { exact: true }).fill('失敗不能丟失');
  await manager(page).getByLabel('我的筆記', { exact: true }).fill('連同筆記保留');
  await manager(page).getByRole('button', { name: /另一處/ }).click();
  await leaveDialog(page).getByRole('button', { name: '儲存並繼續' }).click();
  await expect(leaveDialog(page).getByRole('alert')).toHaveText('測試保存失敗');
  failed = false; await leaveDialog(page).getByRole('button', { name: '儲存並繼續' }).click();
  await expect(leaveDialog(page)).toHaveCount(0);
  await expect(manager(page).getByLabel('我的別名', { exact: true })).toHaveValue('另一處');
  expect(calls.saved().find(s => s.locId === 'L123')).toMatchObject({ alias: '失敗不能丟失', note: '連同筆記保留' });
});

test('initial manager selection remains stable through filtering and sorting while dirty', async ({ page }) => {
  await install(page, { saved: [favorite, otherFavorite] });
  await openManager(page);
  const original = await manager(page).getByLabel('eBird 原始名稱（唯讀）').inputValue();
  await manager(page).getByLabel('我的別名', { exact: true }).fill('不能切換的草稿');
  await manager(page).getByLabel('搜尋收藏', { exact: true }).fill(original === favorite.locName ? '另一處' : '桌面鳥點');
  await manager(page).getByLabel('排序', { exact: true }).selectOption('recent');
  await expect(manager(page).getByLabel('eBird 原始名稱（唯讀）')).toHaveValue(original);
  await expect(manager(page).getByLabel('我的別名', { exact: true })).toHaveValue('不能切換的草稿');
});

test('manager typing during a guarded save stays open until latest fields are saved', async ({ page }) => {
  const calls = await install(page, { saved: [favorite] });
  let release, submitted;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/api/bird-spots/saved/L123', async route => { submitted = route.request().postDataJSON(); await held; return route.fallback(); });
  await openManager(page);
  const alias = manager(page).getByLabel('我的別名', { exact: true });
  await alias.fill('第一版'); await manager(page).getByRole('button', { name: '儲存修改' }).click();
  await expect.poll(() => submitted?.alias).toBe('第一版');
  await alias.fill('後續輸入'); await manager(page).getByRole('button', { name: '關閉', exact: true }).click();
  await leaveDialog(page).getByRole('button', { name: '儲存並繼續' }).click();
  await expect(leaveDialog(page)).toBeVisible();
  release(); await expect(page.locator('.bird-spot-toast [role="status"]')).toHaveText('已儲存筆記');
  await leaveDialog(page).getByRole('button', { name: '繼續編輯' }).click();
  await expect(alias).toHaveValue('後續輸入');
  await manager(page).getByRole('button', { name: '關閉', exact: true }).click();
  await leaveDialog(page).getByRole('button', { name: '儲存並繼續' }).click();
  await expect(manager(page)).toHaveCount(0); expect(calls.saved()[0].alias).toBe('後續輸入');
});

test('manager roundtrip retains filter, selected item and scroll, close restores original workspace', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 650 });
  const saved = Array.from({ length: 35 }, (_, i) => ({ ...favorite, locId: `L${1000 + i}`, locName: `收藏 ${String(i).padStart(2, '0')}` }));
  await install(page, { saved }); await openManager(page);
  await manager(page).getByLabel('搜尋收藏', { exact: true }).fill('收藏');
  await manager(page).getByLabel('排序', { exact: true }).selectOption('name');
  await manager(page).getByRole('button', { name: /收藏 24/ }).click();
  const fieldsBody = manager(page).locator('.bird-spots-manager-fields');
  await fieldsBody.evaluate(node => { node.scrollTop = node.scrollHeight; });
  const fieldsScroll = await fieldsBody.evaluate(node => node.scrollTop);
  expect(fieldsScroll).toBeGreaterThan(0);
  const listScroll = await manager(page).locator('.bird-spots-saved-list').evaluate(node => node.scrollTop);
  await manager(page).getByRole('button', { name: '查看近期鳥種' }).click();
  const mapBox = await page.locator('.map-shell').boundingBox();
  const detailBox = await page.getByRole('complementary', { name: '鳥點詳情' }).boundingBox();
  expect(mapBox.y + mapBox.height).toBeLessThanOrEqual(detailBox.y);
  await page.getByRole('button', { name: '返回我的鳥點' }).click();
  await expect(manager(page).getByLabel('搜尋收藏', { exact: true })).toHaveValue('收藏');
  await expect(manager(page).getByLabel('排序', { exact: true })).toHaveValue('name');
  await expect(manager(page).getByLabel('eBird 原始名稱（唯讀）')).toHaveValue('收藏 24');
  await expect.poll(() => manager(page).locator('.bird-spots-saved-list').evaluate(node => node.scrollTop)).toBe(listScroll);
  await expect.poll(() => fieldsBody.evaluate(node => node.scrollTop)).toBe(fieldsScroll);
  await manager(page).getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '鳥種搜尋結果' })).toBeVisible();
});

test('metadata stays durable through reload and all sort orders use persisted alias, pin and savedAt', async ({ page }) => {
  const calls = await install(page, { saved: [favorite, { ...otherFavorite, alias: 'A' }] });
  await openManager(page); await manager(page).getByRole('button', { name: /桌面鳥點測試/ }).click();
  await manager(page).getByLabel('我的別名', { exact: true }).fill('Z');
  await manager(page).getByLabel('我的筆記', { exact: true }).fill('永久筆記');
  await manager(page).getByLabel('釘選此鳥點').check();
  await manager(page).getByRole('button', { name: '儲存修改' }).click();
  await expect(manager(page).getByRole('button', { name: '儲存修改' })).toBeDisabled();
  expect(calls.saved().find(s => s.locId === 'L123')).toMatchObject({ alias: 'Z', note: '永久筆記', pinned: true });
  await page.reload(); await expect(page.locator('.item')).toHaveCount(2); await openManager(page);
  await expect(manager(page).locator('.bird-spots-saved-item strong').first()).toHaveText('📌 Z');
  await manager(page).getByLabel('排序', { exact: true }).selectOption('recent');
  await expect(manager(page).locator('.bird-spots-saved-item strong').first()).toHaveText('A');
  await manager(page).getByLabel('排序', { exact: true }).selectOption('name');
  await expect(manager(page).locator('.bird-spots-saved-item strong').first()).toHaveText('A');
  await manager(page).getByRole('button', { name: /📌 Z/ }).click();
  await expect(manager(page).getByLabel('我的筆記', { exact: true })).toHaveValue('永久筆記');
  await expect(manager(page).getByLabel('釘選此鳥點')).toBeChecked();
});

test('manager keyboard trap includes fields, Escape and backdrop request the same dirty guard', async ({ page }) => {
  await install(page, { saved: [favorite] }); await openManager(page);
  const alias = manager(page).getByLabel('我的別名', { exact: true }); await alias.fill('待保存');
  await page.keyboard.press('Escape'); await expect(leaveDialog(page)).toBeVisible();
  await page.keyboard.press('Escape'); await expect(leaveDialog(page)).toHaveCount(0); await expect(alias).toBeFocused();
  await manager(page).getByRole('button', { name: '關閉', exact: true }).focus(); await page.keyboard.press('Shift+Tab');
  await expect(manager(page).getByRole('button', { name: '取消收藏', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(manager(page).getByRole('button', { name: '關閉', exact: true })).toBeFocused();
  await page.locator('.bird-spots-manager').click({ position: { x: 2, y: 2 } }); await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole('button', { name: '捨棄修改' }).click(); await expect(manager(page)).toHaveCount(0);
});

test('switching to name search invalidates a pending species search before it can replace the workspace or baseline', async ({ page }) => {
  const calls = await install(page);
  let release, requested = false;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/api/observations*', async route => { requested = true; await held; try { return await route.fulfill({ json: { speciesCode: species.speciesCode, days: 3, generatedAt: '2026-11-11T02:00:00.000Z', observations: [record] } }); } catch {} });
  const writes = calls.baselineWrites();
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByLabel('搜尋模式').selectOption('spots');
  await page.getByPlaceholder('輸入鳥點名稱、別名或地區代碼').fill('高美');
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.locator('.bird-spot-search-item')).toHaveCount(2);
  release();
  await expect(page.getByLabel('搜尋模式')).toHaveValue('spots');
  await expect(page.getByRole('complementary', { name: '鳥點搜尋結果' })).toBeVisible();
  expect(calls.baselineWrites()).toBe(writes);
});

test('a notification cannot replace a guarded save destination already in flight', async ({ page }) => {
  await install(page, { saved: [favorite] });
  let release, submitted;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/api/bird-spots/saved/L123', async route => { submitted = route.request().postDataJSON(); await held; return route.fallback(); });
  await openManager(page);
  await manager(page).getByLabel('我的別名', { exact: true }).fill('通知前的別名');
  await manager(page).getByRole('button', { name: '關閉', exact: true }).click();
  await leaveDialog(page).getByRole('button', { name: '儲存並繼續' }).click();
  await expect.poll(() => submitted?.alias).toBe('通知前的別名');
  await page.evaluate(({ species, observation }) => window.dispatchEvent(new CustomEvent('notification:selected', { detail: { id: 3, type: 'new-observation', createdAt: '2026-11-11T02:00:00.000Z', read: false, species, observation } })), { species, observation: { ...record, subId: 'S125' } });
  await expect(leaveDialog(page)).toBeVisible();
  release(); await expect(manager(page)).toHaveCount(0); await expect(leaveDialog(page)).toHaveCount(0);
  await expect(page.locator('.item.active')).toContainText('S123');
  await openManager(page); await expect(manager(page).getByLabel('我的別名', { exact: true })).toHaveValue('通知前的別名');
});

for (const surface of ['detail', 'manager']) {
  for (const choice of ['save', 'discard', 'continue']) {
    test(`${surface} notification navigation resolves dirty changes with ${choice}`, async ({ page }) => {
      const calls = await install(page, { saved: [favorite] });
      const writes = calls.baselineWrites();
      if (surface === 'detail') {
        await page.locator('.item').first().getByRole('button', { name: '查看鳥點' }).click();
        await page.getByRole('button', { name: '編輯筆記' }).click();
        await page.getByRole('textbox', { name: '鳥點筆記' }).fill('通知前的修改');
      } else {
        await openManager(page);
        await manager(page).getByLabel('我的筆記', { exact: true }).fill('通知前的修改');
      }
      await page.evaluate(({ species, observation }) => window.dispatchEvent(new CustomEvent('notification:selected', { detail: { id: 4, type: 'new-observation', createdAt: '2026-11-11T02:00:00.000Z', read: false, species, observation } })), { species, observation: { ...record, subId: 'S125' } });
      await expect(leaveDialog(page)).toBeVisible();
      await leaveDialog(page).getByRole('button', { name: { save: '儲存並繼續', discard: '捨棄修改', continue: '繼續編輯' }[choice] }).click();
      await expect(leaveDialog(page)).toHaveCount(0);
      if (choice === 'continue') {
        const field = surface === 'detail' ? page.getByRole('textbox', { name: '鳥點筆記' }) : manager(page).getByLabel('我的筆記', { exact: true });
        await expect(field).toHaveValue('通知前的修改');
      } else {
        await expect(manager(page)).toHaveCount(0); await expect(page.locator('.bird-spot-panel')).toHaveCount(0);
        await expect(page.locator('.item.active')).toContainText('S125');
      }
      expect(calls.saved()[0].note).toBe(choice === 'save' ? '通知前的修改' : '保留的筆記');
      expect(calls.baselineWrites()).toBe(writes);
    });
  }
}

test('offline favorite search uses the shared trimmed Chinese-normalized query', async ({ page }) => {
  await install(page, { saved: [{ ...favorite, locName: '臺北鳥點' }], onSearch: route => route.abort() });
  await page.getByLabel('搜尋模式').selectOption('spots');
  await page.getByPlaceholder('輸入鳥點名稱、別名或地區代碼').fill(' 台北 ');
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.locator('.bird-spot-search-item h3')).toHaveText('臺北鳥點');
});

test('clearing and removing a favorite alias updates existing name results without stale personal text', async ({ page }) => {
  await install(page, { saved: [{ ...favorite, alias: '舊別名' }], onSearch: route => route.fulfill({ json: { status: 'fresh', updatedAt: '2026-11-11T02:00:00.000Z', error: null, spots: [{ ...favorite, alias: '舊別名', saved: true }] } }) });
  await page.getByLabel('搜尋模式').selectOption('spots');
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.locator('.bird-spot-search-item h3')).toHaveText('舊別名');
  await openManager(page); await manager(page).getByLabel('我的別名', { exact: true }).fill('');
  await manager(page).getByRole('button', { name: '儲存修改' }).click();
  await expect(manager(page).getByRole('button', { name: '儲存修改' })).toBeDisabled();
  await manager(page).getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.locator('.bird-spot-search-item h3')).toHaveText(spot.locName);
  await openManager(page); await manager(page).getByLabel('我的別名', { exact: true }).fill('新的別名');
  await manager(page).getByRole('button', { name: '儲存修改' }).click();
  await expect(manager(page).getByRole('button', { name: '儲存修改' })).toBeDisabled();
  await manager(page).getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.locator('.bird-spot-search-item h3')).toHaveText('新的別名');
  await page.locator('.bird-spot-search-item').getByRole('button', { name: '★ 已收藏' }).click();
  await expect(page.locator('.bird-spot-search-item h3')).toHaveText(spot.locName);
});

test('opening the collection manager preserves map and result panel geometry in both search modes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await install(page, { saved: [favorite] });
  for (const mode of ['species', 'spots']) {
    if (mode === 'spots') {
      await page.getByLabel('搜尋模式').selectOption('spots');
      await page.getByRole('button', { name: '搜尋', exact: true }).click();
      await expect(page.locator('.bird-spot-search-item')).toHaveCount(2);
    }
    const map = page.locator('.map-shell');
    const panel = page.getByRole('complementary', { name: mode === 'species' ? '鳥種搜尋結果' : '鳥點搜尋結果' });
    const before = { map: await map.boundingBox(), panel: await panel.boundingBox() };
    expect(before.map.x).toBeLessThan(before.panel.x);
    await openManager(page);
    expect(await map.boundingBox()).toEqual(before.map);
    expect(await panel.boundingBox()).toEqual(before.panel);
    await manager(page).getByRole('button', { name: '關閉', exact: true }).click();
    expect(await map.boundingBox()).toEqual(before.map);
    expect(await panel.boundingBox()).toEqual(before.panel);
  }
});

test('manager lists scroll independently and editor actions stay visible at supported window sizes', async ({ page }) => {
  const saved = Array.from({ length: 80 }, (_, index) => ({ ...favorite, locId: `L${1000 + index}`, locName: `收藏 ${String(index).padStart(2, '0')} 台北金山清水濕地`, note: '長筆記內容\n'.repeat(500) }));
  await page.setViewportSize({ width: 1440, height: 950 });
  await install(page, { saved }); await openManager(page);
  await manager(page).getByLabel('排序', { exact: true }).selectOption('name');
  for (const viewport of [{ width: 1440, height: 950 }, { width: 1280, height: 820 }, { width: 900, height: 650 }]) {
    await page.setViewportSize(viewport);
    const list = manager(page).locator('.bird-spots-saved-list');
    const filters = manager(page).locator('.bird-spots-manager-filters');
    const fixedFilters = await filters.boundingBox();
    const listMetrics = await list.evaluate(node => ({ height: node.clientHeight, content: node.scrollHeight }));
    expect(listMetrics.content).toBeGreaterThan(listMetrics.height);
    await list.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await expect(manager(page).getByRole('button', { name: /收藏 79/ })).toBeInViewport();
    expect(await filters.boundingBox()).toEqual(fixedFilters);
    await manager(page).getByRole('button', { name: /收藏 79/ }).click();
    const editor = manager(page).locator('.bird-spots-manager-editor');
    const fields = manager(page).locator('.bird-spots-manager-fields');
    const note = manager(page).getByLabel('我的筆記', { exact: true });
    expect(await note.evaluate(node => node.scrollHeight)).toBeGreaterThan(await note.evaluate(node => node.clientHeight));
    const editorBox = await editor.boundingBox();
    const assertActionsVisible = async () => {
      for (const label of ['儲存修改', '取消編輯', '查看近期鳥種', '取消收藏']) {
        const button = manager(page).getByRole('button', { name: label, exact: true });
        await expect(button).toBeInViewport();
        const box = await button.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(editorBox.x);
        expect(box.y).toBeGreaterThanOrEqual(editorBox.y);
        expect(box.x + box.width).toBeLessThanOrEqual(editorBox.x + editorBox.width);
        expect(box.y + box.height).toBeLessThanOrEqual(editorBox.y + editorBox.height);
      }
    };
    await assertActionsVisible();
    await fields.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await note.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await assertActionsVisible();
    const editorMetrics = await editor.evaluate(node => ({ height: node.clientHeight, content: node.scrollHeight }));
    expect(editorMetrics.content).toBeLessThanOrEqual(editorMetrics.height);
    if (viewport.width === 1440) {
      const fieldsMetrics = await fields.evaluate(node => ({ height: node.clientHeight, content: node.scrollHeight }));
      expect(fieldsMetrics.content).toBeLessThanOrEqual(fieldsMetrics.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  }
});

const mixedScopeNotice = "eBird 對此鳥點的查詢回傳了其他地點的紀錄；以下標示實際觀察地點。";
test("Desktop mixed source details retain provenance and scope when filtering", async ({ page }) => {
  const other = { ...record, locId: "L456", locName: "北岸 <img src=x onerror=alert(1)>", speciesCode: "comsan", comName: "磯鷸", subId: "S456", locationType: "hotspot" };
  await install(page, { onRecent: route => route.fulfill({ json: { ...recent("L123"), observations: [other, { ...record, locationType: "hotspot" }] } }) });
  await page.locator(".item").first().getByRole("button", { name: "查看鳥點", exact: true }).click();
  const detail = page.getByRole("complementary", { name: "鳥點詳情", exact: true });
  await expect(detail.getByText(mixedScopeNotice, { exact: true })).toBeVisible();
  await expect(detail.locator(".bird-spot-source")).toHaveCount(2);
  await expect(detail.locator(".bird-spot-source").first()).toContainText(other.locName);
  await expect(detail.locator(".bird-spot-source img")).toHaveCount(0);
  await expect(detail.getByRole("link", { name: "Checklist ↗" }).first()).toHaveAttribute("href", "https://ebird.org/checklist/S456");
  await detail.getByRole("button", { name: "只看彩鷸", exact: true }).click();
  await expect(detail.locator(".bird-spot-observation")).toHaveCount(1);
  await expect(detail.getByText(mixedScopeNotice, { exact: true })).toBeVisible();
});

test("Desktop other-only sources cannot relocate or rewrite a saved query spot", async ({ page }) => {
  const parent = { ...favorite, locName: null, lat: null, lng: null, locationType: "unknown", alias: "全區收藏", pinned: true };
  const other = { ...record, locId: "L456", locName: "北岸觀察點", lat: 25, lng: 121, locationType: "hotspot" };
  const calls = await install(page, { saved: [parent], onRecent: route => route.fulfill({ json: { ...recent("L123"), observations: [other] } }) });
  await page.getByRole("button", { name: /我的鳥點/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /全區收藏/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "查看近期鳥種", exact: true }).click();
  const detail = page.getByRole("complementary", { name: "鳥點詳情", exact: true });
  await expect(detail.getByText(mixedScopeNotice, { exact: true })).toBeVisible();
  await expect(detail.locator(".bird-spot-source")).toContainText("北岸觀察點 · L456");
  await expect(page.locator(".bird-spot-marker")).toHaveCount(0);
  await expect(page.getByText("此鳥點沒有可用座標；未建立位置標記", { exact: true })).toBeVisible();
  await expect(detail.getByRole("link", { name: "Google Maps ↗", exact: true })).toHaveCount(0);
  await detail.getByRole("button", { name: "編輯筆記", exact: true }).click();
  await detail.getByRole("textbox", { name: "鳥點筆記", exact: true }).fill("更新全區筆記");
  await detail.getByRole("button", { name: "儲存筆記", exact: true }).click();
  await expect(detail.getByText("更新全區筆記", { exact: true })).toBeVisible();
  expect(calls.saved()).toMatchObject([{ ...parent, note: "更新全區筆記" }]);
});
