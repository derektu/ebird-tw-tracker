/**
 * Supplies Search-App-specific species resolution to the runtime-neutral
 * search workflow. The Search App has no saved-species list or startup
 * source; every request resolves an explicit species or query.
 */
export function createSearchAppRuntime({ resolveSpecies, fetchObservations }) {
  return {
    async resolveSpecies(intent) {
      if (intent.species) return intent.species;

      const query = intent.query?.trim() ?? "";
      if (!query) throw new Error("請輸入鳥種名稱、英文名或 species code");
      const resolved = await resolveSpecies(query);
      if (!resolved) throw new Error(`找不到 eBird 鳥種：${query}`);
      return resolved;
    },
    fetchObservations,
  };
}
