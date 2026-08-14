const storageKey = "ebird-search-api-key";

export function readBrowserApiKey() {
  try {
    return window.localStorage.getItem(storageKey)?.trim() || null;
  } catch {
    return null;
  }
}

export function saveBrowserApiKey(apiKey: string) {
  try {
    window.localStorage.setItem(storageKey, apiKey);
    return true;
  } catch {
    return false;
  }
}

export function forgetBrowserApiKey() {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // The gate remains usable when browser storage is unavailable.
  }
}
