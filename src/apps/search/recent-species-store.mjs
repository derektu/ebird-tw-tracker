const STORAGE_KEY = "search-recent-species";
const MAX_RECENT_SPECIES = 10;

function safeLocalStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readList(storage) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Read the browser-local most-recently-used species list, most recent first.
 * Missing, corrupt, or unavailable storage all resolve to an empty list.
 */
export function readRecentSpecies(storage = safeLocalStorage()) {
  return readList(storage);
}

/**
 * Record a successful search's species at the front of the MRU list,
 * deduplicated by species code and capped at `MAX_RECENT_SPECIES` entries.
 * Returns the updated list; storage failures leave the caller's in-memory
 * view consistent without throwing.
 */
export function recordRecentSpecies(species, storage = safeLocalStorage()) {
  const next = [species, ...readList(storage).filter((entry) => entry.speciesCode !== species.speciesCode)].slice(
    0,
    MAX_RECENT_SPECIES,
  );
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Recent species is a convenience list; a storage failure should not block search.
  }
  return next;
}

export { MAX_RECENT_SPECIES };
