export function createDesktopSavedBirdSpotStore({ request }) {
  const json = (method, body) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const base = "/api/bird-spots/saved";
  return {
    async list({ sort = "pinned" } = {}) { return (await request(`${base}?sort=${encodeURIComponent(sort)}`)).spots; },
    async save(spot) { return (await request(base, json("POST", { spot }))).spot; },
    async update(locId, changes) { return (await request(`${base}/${encodeURIComponent(locId)}`, json("PATCH", changes))).spot; },
    async remove(locId) { return (await request(`${base}/${encodeURIComponent(locId)}`, { method: "DELETE" })).removed; },
    async restore(spot) { return (await request(`${base}/restore`, json("POST", { spot }))).spot; },
  };
}
