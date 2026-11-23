const MAX_RECENT_QUERIES = 10;
const keyFor = mode => `search-recent-queries-${mode}`;
function browserStorage() {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
function read(storage, key) {
  try { return JSON.parse(storage?.getItem(key) ?? "null"); } catch { return null; }
}
function sanitize(values) {
  return [...new Set(values.filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean))].slice(0, MAX_RECENT_QUERIES);
}
export function readRecentQueries(mode, storage = browserStorage()) {
  const current = read(storage, keyFor(mode));
  if (Array.isArray(current)) return sanitize(current);
  const legacy = mode === "species" ? read(storage, "search-recent-species") : null;
  return Array.isArray(legacy) ? sanitize(legacy.map(entry => entry?.comName)) : [];
}
export function recordRecentQuery(mode, query, storage = browserStorage(), previous = readRecentQueries(mode, storage)) {
  const next = sanitize([query, ...previous]);
  try { storage?.setItem(keyFor(mode), JSON.stringify(next)); } catch { /* History must not block searching. */ }
  return next;
}
