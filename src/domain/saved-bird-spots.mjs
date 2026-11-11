import { normalizeLocationId } from "./bird-spots.mjs";

export class SavedBirdSpotError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}
function invalid() { return new SavedBirdSpotError("invalid_saved_bird_spot", "鳥點收藏資料不正確"); }
export function storageError(code = "storage_unavailable") {
  return new SavedBirdSpotError(code, code === "storage_corrupt" ? "鳥點收藏資料損壞，請先保留原始資料再處理" : "目前無法讀寫鳥點收藏，請稍後重試", 503);
}
function timestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function text(value) { return typeof value === "string"; }
function location(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const locId = normalizeLocationId(value.locId);
  if (!locId || (value.locName != null && !text(value.locName))) throw invalid();
  const lat = value.lat ?? null, lng = value.lng ?? null;
  const coordinatesValid = lat === null && lng === null || Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180;
  if (!coordinatesValid) throw invalid();
  const locationType = value.locationType ?? (value.locationPrivate === true ? "personal" : value.locationPrivate === false ? "hotspot" : "unknown");
  if (!["hotspot", "personal", "unknown"].includes(locationType)) throw invalid();
  return { locId, locName: value.locName?.trim() || null, lat, lng, locationType };
}
export function parseSavedBirdSpot(value) {
  const spot = location(value);
  if (!text(value.alias) || !text(value.note) || typeof value.pinned !== "boolean" || !timestamp(value.savedAt) || !timestamp(value.updatedAt)) throw invalid();
  return { ...spot, alias: value.alias, note: value.note, pinned: value.pinned, savedAt: value.savedAt, updatedAt: value.updatedAt };
}
export function parseSavedBirdSpotDocument(value) {
  try {
    if (!value || value.version !== 1 || !Array.isArray(value.spots)) throw invalid();
    const spots = value.spots.map(parseSavedBirdSpot);
    if (new Set(spots.map(s => s.locId)).size !== spots.length) throw invalid();
    return { version: 1, spots };
  } catch { throw storageError("storage_corrupt"); }
}
export function sortSavedBirdSpots(spots, sort = "pinned") {
  if (!["pinned", "recent", "name"].includes(sort)) throw invalid();
  return [...spots].sort((a, b) => {
    if (sort === "pinned" && a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
    if (sort !== "name") {
      const recent = b.savedAt.localeCompare(a.savedAt);
      if (recent) return recent;
    }
    return (a.alias || a.locName || a.locId).localeCompare(b.alias || b.locName || b.locId, "zh-Hant") || a.locId.localeCompare(b.locId);
  });
}
export function mutateSavedBirdSpots(spots, operation, now) {
  const locId = normalizeLocationId(operation.locId);
  const index = spots.findIndex(s => s.locId === locId);
  const previous = spots[index];
  if (operation.kind === "remove") {
    if (!locId) throw invalid();
    return { spots: spots.filter(s => s.locId !== locId), result: previous ?? null };
  }
  if (operation.kind === "restore") {
    const restored = parseSavedBirdSpot(operation.spot);
    const existing = spots.find(s => s.locId === restored.locId);
    if (existing) return { spots, result: existing };
    const result = { ...restored, updatedAt: now };
    return { spots: [...spots, result], result };
  }
  let result;
  if (operation.kind === "save") {
    const spot = location(operation.spot);
    const existing = spots.find(s => s.locId === spot.locId);
    result = existing ? {
      ...existing,
      locName: spot.locName ?? existing.locName,
      lat: spot.lat ?? existing.lat,
      lng: spot.lng ?? existing.lng,
      locationType: spot.locationType === "unknown" ? existing.locationType : spot.locationType,
      updatedAt: now,
    } : { ...spot, alias: "", note: "", pinned: false, savedAt: now, updatedAt: now };
    return { spots: [...spots.filter(s => s.locId !== spot.locId), result], result };
  }
  if (operation.kind !== "update" || !locId) throw invalid();
  if (!previous) throw new SavedBirdSpotError("saved_bird_spot_not_found", "找不到這個收藏鳥點", 404);
  const changes = operation.changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw invalid();
  for (const key of Object.keys(changes)) {
    if (!["alias", "note", "pinned"].includes(key) || (key === "pinned" ? typeof changes[key] !== "boolean" : !text(changes[key]))) throw invalid();
  }
  result = { ...previous, ...changes, updatedAt: now };
  return { spots: spots.map(s => s.locId === locId ? result : s), result };
}
export function createSavedBirdSpotStore(transact, now = () => new Date().toISOString()) {
  const mutate = operation => transact(spots => mutateSavedBirdSpots(spots, operation, now()));
  return {
    list: ({ sort = "pinned" } = {}) => transact(spots => ({ spots, result: sortSavedBirdSpots(spots, sort) }), false),
    save: spot => mutate({ kind: "save", spot }),
    update: (locId, changes) => mutate({ kind: "update", locId, changes }),
    remove: locId => mutate({ kind: "remove", locId }),
    restore: spot => mutate({ kind: "restore", spot }),
  };
}
