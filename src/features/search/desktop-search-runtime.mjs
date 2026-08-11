const DEFAULT_STARTUP_QUERY = "彩鷸";

/**
 * Supplies Desktop-specific species resolution to the runtime-neutral search
 * workflow. Startup resolution remains inside that workflow so it receives a
 * generation before any saved-species or default-species request begins.
 */
export function createDesktopSearchRuntime({
  fetchSavedSpecies,
  publishSavedSpecies,
  resolveSpecies,
  fetchObservations,
  rememberStartupSpecies,
}) {
  return {
    async resolveSpecies(intent, lifecycle) {
      if (intent.species) return intent.species;

      if (intent.source === "startup") {
        const saved = await fetchSavedSpecies();
        if (lifecycle.isCurrent()) publishSavedSpecies(saved);
        const initial = saved.find((species) => species.comName === DEFAULT_STARTUP_QUERY) ?? saved.at(0);
        if (initial) return initial;

        const resolved = await resolveSpecies(DEFAULT_STARTUP_QUERY);
        if (!resolved) throw new Error("請先輸入鳥種");
        if (lifecycle.isCurrent()) rememberStartupSpecies?.(resolved);
        return resolved;
      }

      const query = intent.query?.trim() ?? "";
      if (!query) throw new Error("請輸入鳥種名稱或 species code");
      const resolved = await resolveSpecies(query);
      if (!resolved) throw new Error(`找不到 eBird 鳥種：${query}`);
      const saved = await fetchSavedSpecies();
      if (lifecycle.isCurrent()) publishSavedSpecies(saved);
      return resolved;
    },
    fetchObservations,
  };
}
